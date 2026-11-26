import assert from "node:assert/strict";
import { test } from "node:test";
import { createBodyMeasure } from "../../static/tracker/js/body-measure.js";
import { PRACTICE_HINTS } from "../../static/tracker/js/catalog.js";
import {
  ERROR_HOLD_SECONDS,
  MEASURE_FRAMES,
  PLANK,
  REFERENCE_ELBOW_LIMIT,
  REFERENCE_TORSO_LIMIT,
  SQUAT,
  STAGE_WARN_MARGIN,
} from "../../static/tracker/js/config.js";
import { createMatchGlow, createReferenceFollow } from "../../static/tracker/js/follow.js";
import { MODES, pickPracticeHint } from "../../static/tracker/js/modes.js";
import { referenceWarnParts, STAGE_COLORS, userPartColors } from "../../static/tracker/js/overlay.js";
import { createReferenceGuide, elbowGapOf, headGapOf, torsoGapOf } from "../../static/tracker/js/reference-guide.js";
import { createSession } from "../../static/tracker/js/session.js";
import { fakeLandmarks, HEIGHT, PLANK_BODY, proneBody, squatBody, WIDTH } from "./fake-landmarks.js";

// F4 측정값 모양의 체형 (px). 표준은 fake-landmarks.js squatBody의 길이와 같다
const STANDARD = { lengths: { shank: 180, thigh: 180, torso: 220, head: 50, foot: 80 }, facing: 1, heelOffset: -25, heelDrop: 15 };
const LONG_LEGS = { lengths: { shank: 210, thigh: 210, torso: 200, head: 50, foot: 85 }, facing: 1, heelOffset: -25, heelDrop: 15 };
const FOLLOW = createReferenceFollow("squat", STANDARD);
const HOLD = ERROR_HOLD_SECONDS * 1000;
const HEAD_LIMIT = 180 - PLANK.NECK_MIN; // 푸시업 고개 기준: 플랭크 목 정렬 판정과 같다

// 판정 중인 프레임 (스쿼트 상체 비교가 쓰는 값만). torso는 정답 자세보다 gap(°)만큼 더 숙인 상체
const judging = (thigh, gap = 0, follow = FOLLOW) => ({
  points: {},
  angles: { thigh, torso: follow.angles(Math.min(thigh, follow.thetaMax)).torso + gap },
  indicators: [{ key: "torsoShin", value: 0, margin: 20, stage: "good", errorKey: "torsoLean" }],
});
const guideOf = (view, key = "referenceTorso") => view.indicators.find((item) => item.key === key);
const close = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);

// F4로 잰 몸 길이로 만든 맞춰 보기 (연습 모드가 하는 그대로)
function measuredFollow(exercise, body) {
  const measure = createBodyMeasure(exercise);
  let step = null;
  for (let i = 0; i < MEASURE_FRAMES; i += 1) step = measure.add(fakeLandmarks(body), null, WIDTH, HEIGHT);
  return createReferenceFollow(exercise, step.result);
}

// 실제 판정 흐름: 같은 자세를 frames장 넣으며 마네킹 대비 안내를 붙인다 (33ms 간격). 마지막 결과와 세션을 돌려준다
function play(exercise, body, follow, frames) {
  const session = createSession(exercise, 0, 0);
  const guide = createReferenceGuide(exercise, follow);
  const views = [];
  for (let i = 0; i < frames; i += 1) {
    const t = i * 33;
    views.push(guide.apply(session.processFrame(fakeLandmarks(body), WIDTH, HEIGHT, t), t, true));
  }
  return { session, views, last: views.at(-1) };
}

// 플랭크 자세에서 위팔만 어깨를 축으로 degrees(°)만큼 머리 쪽(+)이나 발 쪽(−)으로 기울인다. 아래팔은 그대로 따라간다
function plankElbow(degrees) {
  const px = (p) => ({ x: p.x * WIDTH, y: p.y * HEIGHT });
  const [shoulder, elbow, wrist] = [px(PLANK_BODY.shoulder), px(PLANK_BODY.elbow), px(PLANK_BODY.wrist)];
  const upper = Math.hypot(elbow.x - shoulder.x, elbow.y - shoulder.y);
  const headward = Math.sign(shoulder.x - px(PLANK_BODY.hip).x); // PLANK_BODY는 머리가 왼쪽(−x)이다
  const radians = (degrees * Math.PI) / 180;
  const moved = { x: shoulder.x + headward * upper * Math.sin(radians), y: shoulder.y + upper * Math.cos(radians) };
  const shift = { x: moved.x - elbow.x, y: moved.y - elbow.y };
  const normalized = (p) => ({ x: p.x / WIDTH, y: p.y / HEIGHT });
  return {
    ...PLANK_BODY,
    elbow: normalized(moved),
    wrist: normalized({ x: wrist.x + shift.x, y: wrist.y + shift.y }),
  };
}

test("스쿼트 상체 차는 사용자 상체 기울기에서 같은 깊이 정답 자세의 상체 기울기를 뺀 값이다 (음수면 마네킹보다 세움)", () => {
  assert.ok(Math.abs(torsoGapOf(judging(50, -18), FOLLOW) - -18) < 1e-9);
  assert.ok(Math.abs(torsoGapOf(judging(70, 12), FOLLOW) - 12) < 1e-9);
});

test("스쿼트: 반복 구간(35° 초과)이 아니거나, 정답 자세가 갈 수 없는 깊이(thetaMax 초과)거나, 판정 밖이면 재지 않는다", () => {
  assert.equal(torsoGapOf(judging(SQUAT.ATTEMPT_MIN, -30), FOLLOW), null);
  const longLegs = createReferenceFollow("squat", LONG_LEGS);
  assert.ok(longLegs.thetaMax < 90);
  assert.equal(torsoGapOf(judging(longLegs.thetaMax + 1, -30, longLegs), longLegs), null);
  assert.notEqual(torsoGapOf(judging(longLegs.thetaMax, -30, longLegs), longLegs), null);
  assert.equal(torsoGapOf({ points: null, angles: null, indicators: [] }, FOLLOW), null);
});

test("단계는 판정 지표와 같다: 기준 15°를 넘으면 수정, 기준까지 5° 안이면 주의, 그보다 가까우면 정상", () => {
  assert.equal(REFERENCE_TORSO_LIMIT, 15);
  const stageAt = (gap) => guideOf(createReferenceGuide("squat", FOLLOW).apply(judging(50, gap), 0, true)).stage;
  assert.equal(stageAt(0), "good");
  assert.equal(stageAt(-(REFERENCE_TORSO_LIMIT - STAGE_WARN_MARGIN - 1)), "good");
  assert.equal(stageAt(-(REFERENCE_TORSO_LIMIT - 2)), "warn");
  assert.equal(stageAt(REFERENCE_TORSO_LIMIT + 1), "bad");
});

test("기준을 0.4초 넘게 넘어야 힌트 키가 붙고, 방향에 따라 세움·숙임 키가 다르다", () => {
  const guide = createReferenceGuide("squat", FOLLOW);
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
  const guide = createReferenceGuide("squat", FOLLOW);
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
  const guide = createReferenceGuide("squat", FOLLOW);
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

test("푸시업 고개 차: 몸통 선 연장에서 귀가 벗어난 각에서 정답 마네킹의 같은 각을 뺀다 (귀가 아래면 음수)", () => {
  const follow = measuredFollow("pushup", proneBody());
  const straight = play("pushup", proneBody(), follow, 12).last;
  close(headGapOf(straight, follow), 0, 1e-3); // 마네킹 고개는 몸과 일직선이다
  const dropped = play("pushup", proneBody({ headDrop: 40 }), follow, 12).last;
  close(headGapOf(dropped, follow), -(180 - dropped.angles.neck), 1e-6); // 플랭크 목 정렬 판정과 같은 각도
  assert.ok(headGapOf(dropped, follow) < 0);
  assert.ok(headGapOf(play("pushup", proneBody({ headDrop: -40 }), follow, 12).last, follow) > 0);
  assert.equal(headGapOf({ points: null, angles: null, indicators: [] }, follow), null);
});

test("마네킹 대비는 정답 마네킹의 자세에서 잰다: 마네킹 고개가 꺾여 있으면 그만큼 빼고 비교한다", () => {
  const follow = measuredFollow("pushup", proneBody());
  const user = play("pushup", proneBody(), follow, 12).last; // 사용자는 고개가 몸과 일직선
  const tilted = {
    pose(view) {
      const pose = follow.pose(view);
      return { ...pose, ear: { x: pose.ear.x, y: pose.ear.y - 20 } }; // 마네킹 귀를 위로 올린다
    },
  };
  assert.ok(headGapOf(user, tilted) < -10); // 사용자가 마네킹보다 고개를 숙인 것이 된다
});

test("푸시업: 고개를 떨군 채 0.4초가 지나면 '고개를 들어 볼까요?' 힌트, 판정 지표와 기록은 그대로다", () => {
  assert.equal(HEAD_LIMIT, 35);
  const follow = measuredFollow("pushup", proneBody());
  const { session, views, last } = play("pushup", proneBody({ headDrop: 60 }), follow, 30);
  const head = guideOf(last, "referenceHead");
  assert.ok(head.value < -HEAD_LIMIT, `고개 차 ${head.value}`);
  assert.equal(head.stage, "bad");
  assert.equal(head.errorKey, "headDrop");
  assert.equal(guideOf(views.find((view) => guideOf(view, "referenceHead")?.stage === "bad"), "referenceHead").errorKey, null);
  assert.deepEqual(last.indicators.slice(0, -1).map((item) => item.key), ["bodyLine", "armLean"]); // 판정 지표는 그대로
  assert.equal(pickPracticeHint("pushup", [head.errorKey]), "고개를 마네킹만큼 들어 몸과 일직선으로 맞춰 볼까요?");
  assert.equal(Object.values(session.stats.errors.pushup).reduce((a, b) => a + b, 0), 0); // 기록되는 오답은 없다
  // 고개를 든 경우는 반대 키 (몸이 머리 쪽으로 올라가 있어서, 같은 각도를 만들려면 더 많이 들어야 한다)
  const raised = play("pushup", proneBody({ headDrop: -100 }), follow, 30).last;
  assert.equal(guideOf(raised, "referenceHead").errorKey, "headHigh");
});

test("플랭크 팔꿈치 차: 위팔 기울기에서 정답 마네킹(어깨 바로 아래)의 위팔 기울기를 뺀다 (팔꿈치가 머리 쪽이면 양수)", () => {
  const follow = measuredFollow("plank", PLANK_BODY);
  close(elbowGapOf(play("plank", PLANK_BODY, follow, 12).last, follow), 0, 1e-6);
  close(elbowGapOf(play("plank", plankElbow(20), follow, 12).last, follow), 20, 1e-3);
  close(elbowGapOf(play("plank", plankElbow(-20), follow, 12).last, follow), -20, 1e-3);
  assert.equal(elbowGapOf({ points: null, angles: null, indicators: [] }, follow), null);
});

test("플랭크: 팔꿈치가 마네킹보다 15° 넘게 앞이나 뒤에 0.4초 있으면 어깨를 옮기라고 안내한다. 판정과 유지 시간은 그대로다", () => {
  assert.equal(REFERENCE_ELBOW_LIMIT, 15);
  const follow = measuredFollow("plank", PLANK_BODY);
  const ahead = play("plank", plankElbow(REFERENCE_ELBOW_LIMIT + 5), follow, 30);
  const elbow = guideOf(ahead.last, "referenceElbow");
  assert.equal(elbow.stage, "bad");
  assert.equal(elbow.errorKey, "elbowAhead");
  assert.equal(pickPracticeHint("plank", ["elbowAhead"]), "어깨를 조금 앞으로 보내 마네킹처럼 팔꿈치 바로 위에 둬 볼까요?");
  assert.equal(guideOf(play("plank", plankElbow(-(REFERENCE_ELBOW_LIMIT + 5)), follow, 30).last, "referenceElbow").errorKey, "elbowBehind");
  // 기준 근처면 주의, 어깨 바로 아래면 정상
  assert.equal(guideOf(play("plank", plankElbow(REFERENCE_ELBOW_LIMIT - 2), follow, 12).last, "referenceElbow").stage, "warn");
  assert.equal(guideOf(play("plank", PLANK_BODY, follow, 12).last, "referenceElbow").stage, "good");
  // 판정 지표·기록은 마네킹 대비 안내가 없을 때와 같다
  const plain = createSession("plank", 0, 0);
  for (let i = 0; i < 30; i += 1) plain.processFrame(fakeLandmarks(plankElbow(REFERENCE_ELBOW_LIMIT + 5)), WIDTH, HEIGHT, i * 33);
  assert.deepEqual(ahead.session.stats, plain.stats);
});

test("힌트는 근거 있는 판정 힌트 다음에 보이고, 키가 없는 지표는 무시한다", () => {
  const firstKeys = (exercise) => PRACTICE_HINTS[exercise].map((hint) => hint.keys[0]);
  assert.deepEqual(firstKeys("squat"), ["heelLift", "torsoLean", "shinLean", "torsoUpright", "torsoForward", "partialRep"]);
  assert.deepEqual(firstKeys("pushup"), ["coreDrop", "handForward", "headDrop", "headHigh", "partialRepShallow", "partialRepLockout"]);
  assert.deepEqual(firstKeys("plank"), ["hipDrop", "neckDrop", "elbowAhead", "elbowBehind"]);
  assert.equal(pickPracticeHint("squat", ["partialRep", "torsoUpright"]), "상체를 마네킹처럼 조금 더 숙여 볼까요?");
  assert.equal(pickPracticeHint("squat", ["torsoForward"]), "가슴을 마네킹만큼 세워 볼까요?");
  assert.equal(pickPracticeHint("squat", ["torsoUpright", "shinLean"]), "엉덩이를 조금 뒤로 빼 볼까요?");
  assert.equal(pickPracticeHint("pushup", ["headHigh", "coreDrop"]), "배에 힘을 주고 몸을 일직선으로 만들어 볼까요?");
  assert.equal(pickPracticeHint("plank", ["elbowBehind", "neckDrop"]), "시선을 바닥 조금 앞쪽에 두어 볼까요?");
  assert.equal(pickPracticeHint("squat", [null]), null);
});

test("연습 모드만 쓴다. 종목마다 정답 마네킹의 그 부위만 주황으로 칠하고, 사용자 뼈대 색과 맞았을 때의 밝아짐에도 반영된다", () => {
  assert.equal(MODES.practice.referenceGuide, true);
  assert.equal(MODES.record.referenceGuide, false);
  const off = createReferenceGuide("squat", FOLLOW).apply(judging(50, -13), 0, true); // 주의 단계
  assert.deepEqual(referenceWarnParts(off.indicators), ["torso"]);
  assert.deepEqual(referenceWarnParts(createReferenceGuide("squat", FOLLOW).apply(judging(50, 0), 0, true).indicators), []);
  assert.equal(userPartColors("squat", off, MODES.practice)("torso"), STAGE_COLORS.good); // 사용자 몸통은 판정 색 그대로
  const glow = createMatchGlow("squat");
  assert.equal(glow.update(off, 0) || glow.update(off, 2 * HOLD + 1000), false); // 마네킹과 어긋나면 밝아지지 않는다

  const pushup = play("pushup", proneBody({ headDrop: 60 }), measuredFollow("pushup", proneBody()), 30).last;
  assert.deepEqual(referenceWarnParts(pushup.indicators), ["head"]);
  assert.equal(userPartColors("pushup", pushup, MODES.practice)("head"), "#e2e8f0"); // 사용자 머리는 중립색 그대로
  const plank = play("plank", plankElbow(20), measuredFollow("plank", PLANK_BODY), 12).last;
  assert.deepEqual(referenceWarnParts(plank.indicators), ["upperArm"]);
});
