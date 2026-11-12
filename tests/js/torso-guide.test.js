import assert from "node:assert/strict";
import { test } from "node:test";
import { PRACTICE_HINTS } from "../../static/tracker/js/catalog.js";
import { ERROR_HOLD_SECONDS, REFERENCE_TORSO_LIMIT, SQUAT, STAGE_WARN_MARGIN } from "../../static/tracker/js/config.js";
import { createMatchGlow, createReferenceFollow } from "../../static/tracker/js/follow.js";
import { MODES, pickPracticeHint } from "../../static/tracker/js/modes.js";
import { referenceWarnParts, STAGE_COLORS, userPartColors } from "../../static/tracker/js/overlay.js";
import { createSession } from "../../static/tracker/js/session.js";
import { createTorsoGuide, torsoGapOf } from "../../static/tracker/js/torso-guide.js";
import { fakeLandmarks, HEIGHT, squatBody, WIDTH } from "./fake-landmarks.js";

// F4 측정값 모양의 체형 (px). 표준은 fake-landmarks.js squatBody의 길이와 같다
const STANDARD = { lengths: { shank: 180, thigh: 180, torso: 220, head: 50, foot: 80 }, facing: 1, heelOffset: -25, heelDrop: 15 };
const LONG_LEGS = { lengths: { shank: 210, thigh: 210, torso: 200, head: 50, foot: 85 }, facing: 1, heelOffset: -25, heelDrop: 15 };
const FOLLOW = createReferenceFollow("squat", STANDARD);
const HOLD = ERROR_HOLD_SECONDS * 1000;

// 판정 중인 프레임 (torso-guide.js가 쓰는 값만). torso는 정답 자세보다 gap(°)만큼 더 숙인 상체
const judging = (thigh, gap = 0, follow = FOLLOW) => ({
  points: {},
  angles: { thigh, torso: follow.angles(Math.min(thigh, follow.thetaMax)).torso + gap },
  indicators: [{ key: "torsoShin", value: 0, margin: 20, stage: "good", errorKey: "torsoLean" }],
});
const guideOf = (view) => view.indicators.find((item) => item.key === "referenceTorso");

test("상체 차는 사용자 상체 기울기에서 같은 깊이 정답 자세의 상체 기울기를 뺀 값이다 (음수면 마네킹보다 세움)", () => {
  assert.ok(Math.abs(torsoGapOf(judging(50, -18), FOLLOW) - -18) < 1e-9);
  assert.ok(Math.abs(torsoGapOf(judging(70, 12), FOLLOW) - 12) < 1e-9);
});

test("반복 구간(35° 초과)이 아니거나, 정답 자세가 갈 수 없는 깊이(thetaMax 초과)거나, 판정 밖이면 재지 않는다", () => {
  assert.equal(torsoGapOf(judging(SQUAT.ATTEMPT_MIN, -30), FOLLOW), null);
  const longLegs = createReferenceFollow("squat", LONG_LEGS);
  assert.ok(longLegs.thetaMax < 90);
  assert.equal(torsoGapOf(judging(longLegs.thetaMax + 1, -30, longLegs), longLegs), null);
  assert.notEqual(torsoGapOf(judging(longLegs.thetaMax, -30, longLegs), longLegs), null);
  assert.equal(torsoGapOf({ points: null, angles: null, indicators: [] }, FOLLOW), null);
});

test("단계는 판정 지표와 같다: 기준 15°를 넘으면 수정, 기준까지 5° 안이면 주의, 그보다 가까우면 정상", () => {
  assert.equal(REFERENCE_TORSO_LIMIT, 15);
  const stageAt = (gap) => guideOf(createTorsoGuide(FOLLOW).apply(judging(50, gap), 0, true)).stage;
  assert.equal(stageAt(0), "good");
  assert.equal(stageAt(-(REFERENCE_TORSO_LIMIT - STAGE_WARN_MARGIN - 1)), "good");
  assert.equal(stageAt(-(REFERENCE_TORSO_LIMIT - 2)), "warn");
  assert.equal(stageAt(REFERENCE_TORSO_LIMIT + 1), "bad");
});

test("기준을 0.4초 넘게 넘어야 힌트 키가 붙고, 방향에 따라 세움·숙임 키가 다르다", () => {
  const guide = createTorsoGuide(FOLLOW);
  const upright = judging(50, -20);
  assert.equal(guideOf(guide.apply(upright, 0, true)).errorKey, null);
  assert.equal(guideOf(guide.apply(upright, HOLD - 1, true)).errorKey, null);
  assert.equal(guideOf(guide.apply(upright, HOLD, true)).errorKey, "torsoUpright");
  // 기준 안으로 돌아오면 다시 처음부터 잰다
  assert.equal(guideOf(guide.apply(judging(50, -5), HOLD + 10, true)).errorKey, null);
  const forward = judging(50, 20);
  assert.equal(guideOf(guide.apply(forward, 2 * HOLD, true)).errorKey, null);
  assert.equal(guideOf(guide.apply(forward, 3 * HOLD, true)).errorKey, "torsoForward");
});

test("맞춰 보기가 아니면 지표를 더하지 않고 시간도 다시 잰다. 원래 판정 결과는 바꾸지 않는다", () => {
  const guide = createTorsoGuide(FOLLOW);
  const view = judging(50, -20);
  guide.apply(view, 0, true);
  assert.equal(guide.apply(view, HOLD, false), view); // 다른 보기: 그대로 돌려준다
  assert.equal(guideOf(guide.apply(view, HOLD + 1, true)).errorKey, null); // 다시 0.4초를 잰다
  const applied = guide.apply(view, 2 * HOLD + 1, true);
  assert.notEqual(applied, view);
  assert.equal(view.indicators.length, 1); // 원래 결과의 지표 목록은 그대로다
  assert.deepEqual(applied.indicators[0], view.indicators[0]);
});

test("실제 판정 결과: 상체를 세우고 앉으면 판정(상체–정강이 차)은 정상인데, 마네킹 대비 상체는 0.4초 뒤 안내한다", () => {
  const session = createSession("squat", 0, 0);
  const guide = createTorsoGuide(FOLLOW);
  const poses = [...Array(10).fill(squatBody(10, { torso: 10, shin: 5 })), ...Array(30).fill(squatBody(60, { torso: 8, shin: 20 }))];
  const views = poses.map((body, i) => {
    const t = i * 33;
    return { t, view: guide.apply(session.processFrame(fakeLandmarks(body), WIDTH, HEIGHT, t), t, true) };
  });
  const last = views.at(-1).view;
  assert.equal(last.indicators.find((item) => item.key === "torsoShin").stage, "good"); // 판정은 정상 (차이 −12°)
  const guideNow = guideOf(last);
  assert.ok(guideNow.value < -REFERENCE_TORSO_LIMIT, `상체 차 ${guideNow.value}`);
  assert.equal(guideNow.errorKey, "torsoUpright");
  // 처음 기준을 넘은 프레임에서는 아직 키가 없다
  const firstOver = views.find(({ view }) => guideOf(view)?.stage === "bad");
  assert.equal(guideOf(firstOver.view).errorKey, null);
  assert.equal(session.stats.errors.squat.torsoLean + session.stats.errors.squat.shinLean, 0); // 기록되는 오답은 없다
});

test("힌트는 근거 있는 판정 힌트(뒤꿈치·상체·정강이) 다음, 범위 미달 앞에 보이고, 키가 없는 지표는 무시한다", () => {
  const keys = PRACTICE_HINTS.squat.map((hint) => hint.keys[0]);
  assert.deepEqual(keys, ["heelLift", "torsoLean", "shinLean", "torsoUpright", "torsoForward", "partialRep"]);
  assert.equal(pickPracticeHint("squat", ["partialRep", "torsoUpright"]), "상체를 마네킹처럼 조금 더 숙여 볼까요?");
  assert.equal(pickPracticeHint("squat", ["torsoForward"]), "가슴을 마네킹만큼 세워 볼까요?");
  assert.equal(pickPracticeHint("squat", ["torsoUpright", "shinLean"]), "엉덩이를 조금 뒤로 빼 볼까요?");
  assert.equal(pickPracticeHint("squat", [null]), null);
});

test("연습 모드만 쓴다. 정답 마네킹의 몸통만 주황으로 칠하고, 사용자 뼈대 색과 맞았을 때의 밝아짐에도 반영된다", () => {
  assert.equal(MODES.practice.referenceTorso, true);
  assert.equal(MODES.record.referenceTorso, false);
  const off = createTorsoGuide(FOLLOW).apply(judging(50, -13), 0, true); // 주의 단계
  assert.deepEqual(referenceWarnParts(off.indicators), ["torso"]);
  assert.deepEqual(referenceWarnParts(createTorsoGuide(FOLLOW).apply(judging(50, 0), 0, true).indicators), []);
  assert.equal(userPartColors("squat", off, MODES.practice)("torso"), STAGE_COLORS.good); // 사용자 몸통은 판정 색 그대로
  const glow = createMatchGlow("squat");
  assert.equal(glow.update(off, 0) || glow.update(off, 2 * HOLD + 1000), false); // 마네킹과 어긋나면 밝아지지 않는다
});
