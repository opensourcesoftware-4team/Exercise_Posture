import assert from "node:assert/strict";
import { test } from "node:test";
import { createAnkleLimit, percentile } from "../../static/tracker/js/ankle-limit.js";
import { ANKLE_MIN_ATTEMPTS, ANKLE_PERCENTILE, SHIN_MAX, SQUAT, TRUNK_EXTRA_MAX } from "../../static/tracker/js/config.js";
import { createReferenceFollow } from "../../static/tracker/js/follow.js";
import { createPlayback } from "../../static/tracker/js/playback.js";
import { createSquatReference } from "../../static/tracker/js/reference-pose.js";
import { createSession } from "../../static/tracker/js/session.js";
import { fakeLandmarks, HEIGHT, squatBody, WIDTH } from "./fake-landmarks.js";

// F4 측정값 모양의 표준 체형 (px). fake-landmarks.js squatBody의 길이와 같다
const SQUAT_SIZE = { lengths: { shank: 180, thigh: 180, torso: 220, head: 50, foot: 80 }, facing: 1, heelOffset: -25, heelDrop: 15 };
const DEEP = SQUAT.ATTEMPT_MIN + 20; // 반복 구간 안의 허벅지 각
const STAND = SQUAT.STAND_MAX - 10;

// 판정 중인 프레임 (ankle-limit.js가 쓰는 값만). heel: 발 각도 변화(°), null이면 발이 가려져 잴 수 없다
function frame(thigh, shin, { heel = 0, ended = false } = {}) {
  const indicators = [{ key: "torsoShin", value: 0 }];
  if (heel !== null) indicators.push({ key: "heelRise", value: heel });
  return { points: {}, angles: { thigh, shin }, indicators, events: ended ? [{ type: "rep", errors: [], measures: {} }] : [] };
}

// 반복 시도 한 번: 반복 구간에서 정강이 기울기 shins를 차례로 보이고, 일어서며 끝낸다. 끝난 프레임의 update 결과를 돌려준다
function attempt(limit, shins, options) {
  for (const shin of shins) assert.equal(limit.update(frame(DEEP, shin, options)), false);
  return limit.update(frame(STAND, 5, { ended: true }));
}

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

test("상위 5% 값은 작은 순서로 놓았을 때 95% 위치의 값이다 (nearest-rank)", () => {
  assert.equal(ANKLE_PERCENTILE, 0.95);
  assert.equal(percentile(range(1, 100), 0.95), 95);
  assert.equal(percentile(range(1, 20).reverse(), 0.95), 19);
  assert.equal(percentile([7], 0.95), 7);
});

test(`반복 시도가 ${ANKLE_MIN_ATTEMPTS}번 끝나기 전에는 상한을 바꾸지 않고, 끝날 때마다 다시 정한다`, () => {
  const limit = createAnkleLimit();
  for (let i = 1; i < ANKLE_MIN_ATTEMPTS; i += 1) {
    assert.equal(attempt(limit, [20, 21, 22]), true);
    assert.equal(limit.limit, null);
  }
  assert.equal(attempt(limit, [20, 21, 22]), true);
  assert.equal(limit.limit, 22); // 관찰 9프레임 중 상위 5%
  assert.deepEqual(limit.summary, { observed: 22, frames: 3 * ANKLE_MIN_ATTEMPTS, attempts: ANKLE_MIN_ATTEMPTS });
});

test("상위 5% 값은 1° 단위로 반올림하고, 몇 프레임 튄 값은 무시한다", () => {
  const limit = createAnkleLimit();
  const shins = [...Array(57).fill(18.4), 18.6, 18.6, 18.6, 40]; // 61프레임 중 1프레임만 튐
  for (let i = 0; i < ANKLE_MIN_ATTEMPTS; i += 1) attempt(limit, shins);
  assert.equal(limit.limit, 19);
});

test("뒤꿈치가 들린 프레임, 발이 가려진 프레임, 반복 구간 밖(서 있음)의 프레임은 보지 않는다", () => {
  const limit = createAnkleLimit();
  for (let i = 0; i < ANKLE_MIN_ATTEMPTS; i += 1) {
    attempt(limit, [20, 20]);
    attempt(limit, [29, 29], { heel: SQUAT.HEEL_LIFT_LIMIT + 1 }); // 뒤꿈치 들림: 정강이가 더 기운다
    attempt(limit, [29, 29], { heel: null }); // 발이 가려짐
    limit.update(frame(SQUAT.ATTEMPT_MIN, 2)); // 반복 구간의 경계 (35°)는 구간 밖이다
  }
  assert.equal(limit.limit, 20);
  assert.equal(limit.summary.frames, 2 * ANKLE_MIN_ATTEMPTS);
  limit.update({ points: null, angles: null, indicators: [], events: [] }); // 판정하지 않는 프레임도 넣을 수 있다
  assert.equal(limit.summary.frames, 2 * ANKLE_MIN_ATTEMPTS);
});

test("관찰 값이 SHIN_MAX 이상이면 SHIN_MAX를 그대로 쓰고(올리지 않음), 더 깊이 앉으면 상한이 SHIN_MAX까지 다시 올라간다", () => {
  const stiff = createAnkleLimit();
  for (let i = 0; i < ANKLE_MIN_ATTEMPTS; i += 1) attempt(stiff, [SHIN_MAX + 5]);
  assert.equal(stiff.limit, null);

  const limit = createAnkleLimit();
  for (let i = 0; i < ANKLE_MIN_ATTEMPTS; i += 1) attempt(limit, [15]);
  assert.equal(limit.limit, 15);
  for (let i = 0; i < 2 * ANKLE_MIN_ATTEMPTS; i += 1) attempt(limit, [SHIN_MAX - 4, SHIN_MAX - 4]);
  assert.equal(limit.limit, SHIN_MAX - 4);
  for (let i = 0; i < 4 * ANKLE_MIN_ATTEMPTS; i += 1) attempt(limit, [SHIN_MAX + 2, SHIN_MAX + 2]);
  assert.equal(limit.limit, null);
});

test("한 번 확인한 발목 범위는 줄이지 않는다 (얕은 정답 자세를 따라 앉아도 상한이 계속 내려가지 않게)", () => {
  const limit = createAnkleLimit();
  for (let i = 0; i < ANKLE_MIN_ATTEMPTS; i += 1) attempt(limit, [24, 24]);
  assert.equal(limit.limit, 24);
  for (let i = 0; i < 40; i += 1) attempt(limit, [15, 15, 15]); // 24°였던 6프레임이 전체의 5% 아래로 내려간다
  assert.equal(limit.summary.observed, 15); // 지금까지 모은 값의 상위 5%는 내려갔지만
  assert.equal(limit.limit, 24); // 상한은 그대로다
});

test("실제 판정 결과(processFrame): 뒤꿈치를 붙이고 정강이를 22°까지 기울여 3번 앉으면 상한이 22°다", () => {
  const session = createSession("squat", 0, 0);
  const limit = createAnkleLimit();
  const poses = [];
  for (let rep = 0; rep < ANKLE_MIN_ATTEMPTS; rep += 1) {
    poses.push(...Array(10).fill(squatBody(10, { torso: 10, shin: 5 })), ...Array(15).fill(squatBody(80, { torso: 22, shin: 22 })));
  }
  poses.push(...Array(10).fill(squatBody(10, { torso: 10, shin: 5 })));
  let changes = 0;
  poses.forEach((body, i) => {
    if (limit.update(session.processFrame(fakeLandmarks(body), WIDTH, HEIGHT, i * 33))) changes += 1;
  });
  assert.equal(changes, ANKLE_MIN_ATTEMPTS); // 반복이 끝날 때마다 다시 정했다
  assert.equal(session.stats.reps, ANKLE_MIN_ATTEMPTS);
  assert.equal(limit.limit, 22);
});

test("정강이 상한을 낮추면(F5) 모든 깊이에서 정강이가 그 상한 이하이고, 최대 깊이가 얕아지거나 같다", () => {
  const normal = createSquatReference(SQUAT_SIZE);
  const limited = createSquatReference(SQUAT_SIZE, 20);
  assert.ok(limited.thetaMax <= normal.thetaMax);
  for (let theta = 0; theta <= limited.thetaMax; theta += 1) {
    const { shin, torso } = limited.angles(theta);
    assert.ok(shin <= 20 + 1e-9, `${theta}°: 정강이 ${shin}`);
    assert.ok(torso - shin <= TRUNK_EXTRA_MAX + 1e-9);
  }
  assert.deepEqual(createSquatReference(SQUAT_SIZE, SHIN_MAX).pose({ x: 0, y: 0 }, 40), normal.pose({ x: 0, y: 0 }, 40));
});

test("맞춰 보기·따라 하기는 바꾼 정강이 상한의 정답 자세를 쓰고, null이면 SHIN_MAX로 돌아간다", () => {
  const follow = createReferenceFollow("squat", SQUAT_SIZE);
  const playback = createPlayback("squat", follow, 1, 0);
  const original = follow.thetaMax;
  follow.setShinMax(20);
  assert.equal(follow.thetaMax, createSquatReference(SQUAT_SIZE, 20).thetaMax);
  assert.deepEqual(follow.poseAt({ x: 0, y: 0 }, 1, 30), createSquatReference(SQUAT_SIZE, 20).pose({ x: 0, y: 0 }, 30));
  assert.ok(Math.abs(playback.depth(2000) - follow.thetaMax) < 1e-9); // 재생도 새 최대 깊이까지 내려간다
  follow.setShinMax(null);
  assert.equal(follow.thetaMax, original);
});
