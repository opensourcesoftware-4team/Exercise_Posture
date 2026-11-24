import assert from "node:assert/strict";
import { test } from "node:test";
import { computeAccuracy, createSession } from "../../static/tracker/js/session.js";
import { fakeLandmarks, HEIGHT, squatBody, WIDTH } from "./fake-landmarks.js";

// 선 자세(0°)에서 peak까지 앉았다가 다시 서는 허벅지 각 목록. 앞뒤로 선 자세를 5프레임씩 둔다.
// peak가 90이면 앉은 구간(70° 이상)은 9프레임이고, 그 가운데 3프레임(15~17번)이 가장 깊다.
function repThighs(peak, steps = 10) {
  const down = Array.from({ length: steps }, (_, i) => (peak * (i + 1)) / steps);
  return [0, 0, 0, 0, 0, ...down, peak, peak, peak, ...[...down].reverse(), 0, 0, 0, 0, 0];
}

// 반복들을 25fps(40ms 간격)로 세션에 넣고 프레임마다의 결과를 돌려준다.
// heelRaise(thigh, i): i번째 프레임에서 뒤꿈치를 든 높이(px)
function playSquats(session, reps) {
  const views = [];
  let at = 0;
  for (const { peak, torso, shin, heelRaise = () => 0, hidden } of reps) {
    repThighs(peak).forEach((thigh, i) => {
      const body = squatBody(thigh, { torso, shin, heelRaise: heelRaise(thigh, i) });
      views.push(session.processFrame(fakeLandmarks(body, { hidden }), WIDTH, HEIGHT, at));
      at += 40;
    });
  }
  return views;
}

const allCues = (views) => views.flatMap((view) => view.cues);
const GOOD = { peak: 90, torso: 30, shin: 25 }; // 몸통-정강이 각 +5°
const RAISED_WHEN_SEATED = (thigh) => (thigh >= 60 ? 30 : 0); // 앉은 구간 내내 약 21° 들림

test("70° 이상 앉았다가 다시 서면 1회, 오답이 없으면 올바른 반복이고 효과음을 낸다", () => {
  const session = createSession("squat", 0, 0);
  const views = playSquats(session, [GOOD]);
  assert.equal(session.stats.reps, 1);
  assert.equal(session.stats.correctReps, 1);
  assert.deepEqual(allCues(views), []);
  assert.ok(views.some((view) => view.success));
});

test("35°를 넘었지만 70°에 못 미치고 돌아오면 세지 않고 범위 미달로 안내한다", () => {
  const session = createSession("squat", 0, 0);
  const views = playSquats(session, [{ ...GOOD, peak: 55 }]);
  assert.equal(session.stats.reps, 0);
  assert.equal(session.stats.errors.squat.partialRep, 1);
  assert.deepEqual(allCues(views), ["partialRep"]);
});

test("35° 이하의 작은 움직임은 반복 시도로 보지 않는다", () => {
  const session = createSession("squat", 0, 0);
  playSquats(session, [{ ...GOOD, peak: 33 }]);
  assert.equal(session.stats.reps, 0);
  assert.equal(session.stats.errors.squat.partialRep, 0);
});

test("앉은 구간에서 몸통이 정강이보다 25° 넘게 더 기울면 torsoLean", () => {
  const session = createSession("squat", 0, 0);
  const views = playSquats(session, [{ peak: 90, torso: 60, shin: 25 }]);
  assert.equal(session.stats.reps, 1);
  assert.equal(session.stats.correctReps, 0);
  assert.equal(session.stats.errors.squat.torsoLean, 1);
  assert.deepEqual(allCues(views), ["torsoLean"]);
});

test("앉은 구간에서 정강이가 몸통보다 25° 넘게 더 기울면 shinLean", () => {
  const session = createSession("squat", 0, 0);
  const views = playSquats(session, [{ peak: 90, torso: 10, shin: 45 }]);
  assert.equal(session.stats.errors.squat.shinLean, 1);
  assert.deepEqual(allCues(views), ["shinLean"]);
});

test("몸통-정강이 각이 ±25° 안이면 오답이 아니다 (측정 여유 포함)", () => {
  const session = createSession("squat", 0, 0);
  playSquats(session, [
    { peak: 90, torso: 49, shin: 25 },
    { peak: 90, torso: 1, shin: 25 },
  ]);
  assert.equal(session.stats.reps, 2);
  assert.equal(session.stats.correctReps, 2);
});

test("앉은 구간 내내 발 각도가 선 자세보다 15° 넘게 크면 heelLift", () => {
  const session = createSession("squat", 0, 0);
  const views = playSquats(session, [{ ...GOOD, heelRaise: RAISED_WHEN_SEATED }]);
  assert.equal(session.stats.errors.squat.heelLift, 1);
  assert.deepEqual(allCues(views), ["heelLift"]);
});

test("점이 몇 프레임만 튀는 것은 heelLift로 보지 않는다", () => {
  const session = createSession("squat", 0, 0);
  // 가장 깊은 4프레임에서만 뒤꿈치 점이 40px(약 27°) 튄다. 7프레임 중앙값도 통과하는 길이다.
  const spike = (thigh, i) => (i >= 14 && i <= 17 ? 40 : 0);
  playSquats(session, [{ ...GOOD, heelRaise: spike }]);
  assert.equal(session.stats.errors.squat.heelLift, 0);
  assert.equal(session.stats.correctReps, 1);
});

test("발이 가려진 반복은 heelLift를 판정하지 않는다", () => {
  const session = createSession("squat", 0, 0);
  playSquats(session, [{ ...GOOD, heelRaise: RAISED_WHEN_SEATED, hidden: ["heel", "toe"] }]);
  assert.equal(session.stats.errors.squat.heelLift, 0);
  assert.equal(session.stats.correctReps, 1);
});

test("한 반복에 오답이 둘이면 둘 다 기록하고 둘 다 안내한다", () => {
  const session = createSession("squat", 0, 0);
  const views = playSquats(session, [{ peak: 90, torso: 60, shin: 25, heelRaise: RAISED_WHEN_SEATED }]);
  assert.equal(session.stats.errors.squat.torsoLean, 1);
  assert.equal(session.stats.errors.squat.heelLift, 1);
  assert.deepEqual(allCues(views), ["torsoLean", "heelLift"]);
});

test("반복이 끝나면 판정 근거 값(깊이·몸통-정강이·발 각도 변화)을 함께 돌려준다", () => {
  const session = createSession("squat", 0, 0);
  const [event] = playSquats(session, [GOOD]).flatMap((view) => view.events);
  assert.equal(event.type, "rep");
  assert.equal(Math.round(event.measures.depth), 90);
  assert.equal(Math.round(event.measures.torsoShin), 5);
  assert.equal(Math.round(event.measures.heelRise), 0);
});

test("정확도 = 올바른 반복 ÷ (카운트된 반복 + 범위 미달)", () => {
  const session = createSession("squat", 0, 0);
  playSquats(session, [GOOD, GOOD, { peak: 90, torso: 60, shin: 25 }, { ...GOOD, peak: 55 }]);
  assert.equal(session.stats.reps, 3);
  assert.equal(session.stats.correctReps, 2);
  assert.equal(session.stats.errors.squat.partialRep, 1);
  assert.equal(computeAccuracy(session.stats), 50); // 2 ÷ (3 + 1)
});
