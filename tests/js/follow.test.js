import assert from "node:assert/strict";
import { test } from "node:test";
import { MATCH_GLOW_SECONDS, MATCH_HOLD_SECONDS, PUSHUP, SQUAT } from "../../static/tracker/js/config.js";
import { createMatchGlow, createReferenceFollow } from "../../static/tracker/js/follow.js";
import { createPlankReference, createPushupReference, createSquatReference } from "../../static/tracker/js/reference-pose.js";
import { createSession } from "../../static/tracker/js/session.js";
import { fakeLandmarks, HEIGHT, squatBody, WIDTH } from "./fake-landmarks.js";

// F4 측정값 모양의 체형 (px). 스쿼트는 fake-landmarks.js squatBody의 길이와 같다
const SQUAT_SIZE = { lengths: { shank: 180, thigh: 180, torso: 220, head: 50, foot: 80 }, facing: 1, heelOffset: -25, heelDrop: 15 };
const PRONE_SIZE = { lengths: { upperArm: 130, forearm: 130, leg: 300, torso: 300, head: 60 }, facing: 1, floorDrop: 20 };
const ANKLE = { x: 640, y: 640 };

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// 판정 중인 프레임의 결과 (follow.js가 쓰는 값만). facing: 사용자가 보는 방향 (코가 귀보다 그쪽에 있다)
function judging(angles, { facing = 1, ankle = ANKLE, stages = ["good"] } = {}) {
  const points = { ankle, ear: { x: 600, y: 300 }, nose: { x: 600 + facing * 20, y: 305 } };
  return { points, angles, indicators: stages.map((stage) => ({ key: "torsoShin", stage })) };
}

// 판정하지 않는 프레임 (카운트다운, 사람이 안 보임, 자세 밖)
const notJudging = { points: null, angles: null, indicators: [] };

test("판정 중인 프레임이 아니면 정답 뼈대를 그리지 않는다", () => {
  assert.equal(createReferenceFollow("squat", SQUAT_SIZE).pose(notJudging), null);
  assert.equal(createReferenceFollow("plank", PRONE_SIZE).pose({ ...notJudging, angles: { thigh: 0 } }), null);
});

test("스쿼트: 사용자의 다듬은 허벅지 각과 지금 발목에 맞춘 F5 정답 자세이고, 깊이는 thetaMax에서 멈춘다", () => {
  const follow = createReferenceFollow("squat", SQUAT_SIZE);
  const reference = createSquatReference(SQUAT_SIZE);
  assert.equal(follow.thetaMax, reference.thetaMax);
  const ankle = { x: 512.3, y: 601.7 };
  for (const thigh of [0, 20, 45, reference.thetaMax, 89]) {
    const pose = follow.pose(judging({ thigh }, { ankle }));
    assert.deepEqual(pose, reference.pose(ankle, thigh));
    assert.deepEqual(pose.ankle, ankle); // 발목이 겹친다 (0px)
  }
  // 깊이가 같으면 정답 뼈대도 그대로이고, 더 앉으면 엉덩이가 내려간다
  assert.deepEqual(follow.pose(judging({ thigh: 30 })), follow.pose(judging({ thigh: 30 })));
  assert.ok(follow.pose(judging({ thigh: 40 })).hip.y > follow.pose(judging({ thigh: 30 })).hip.y);
  assert.deepEqual(follow.pose(judging({ thigh: 89 })), follow.pose(judging({ thigh: reference.thetaMax })));
});

test("측정 뒤 반대쪽으로 돌아서면 정답 뼈대도 발목을 축으로 좌우가 뒤집힌다", () => {
  const follow = createReferenceFollow("squat", SQUAT_SIZE);
  const right = follow.pose(judging({ thigh: 40 }, { facing: 1 }));
  const left = follow.pose(judging({ thigh: 40 }, { facing: -1 }));
  for (const joint of Object.keys(right)) {
    assert.ok(Math.abs(left[joint].x - (2 * ANKLE.x - right[joint].x)) < 1e-9, joint);
    assert.ok(Math.abs(left[joint].y - right[joint].y) < 1e-9, joint);
  }
  assert.ok(right.toe.x > right.heel.x && left.toe.x < left.heel.x); // 발끝이 보는 쪽에 있다
});

test("정강이가 긴 사람과 짧은 사람은 같은 깊이에서 정답 뼈대 모양이 다르다", () => {
  const short = createReferenceFollow("squat", { ...SQUAT_SIZE, lengths: { ...SQUAT_SIZE.lengths, shank: 150 } });
  const long = createReferenceFollow("squat", { ...SQUAT_SIZE, lengths: { ...SQUAT_SIZE.lengths, shank: 210 } });
  const [a, b] = [short.pose(judging({ thigh: 40 })), long.pose(judging({ thigh: 40 }))];
  assert.ok(Math.abs(distance(a.ankle, a.knee) - 150) < 1e-9);
  assert.ok(Math.abs(distance(b.ankle, b.knee) - 210) < 1e-9);
  assert.ok(distance(a.shoulder, b.shoulder) > 10);
});

test("푸시업은 다듬은 팔꿈치 각을, 플랭크는 고정 자세를 사용자 발목에 맞춰 그린다", () => {
  const pushup = createReferenceFollow("pushup", PRONE_SIZE);
  assert.equal(pushup.thetaMax, undefined);
  assert.deepEqual(pushup.pose(judging({ elbow: 120 })), createPushupReference(PRONE_SIZE).pose(ANKLE, 120));
  const plank = createReferenceFollow("plank", PRONE_SIZE);
  assert.deepEqual(plank.pose(judging({ elbow: 90 })), createPlankReference(PRONE_SIZE).pose(ANKLE));
  assert.deepEqual(plank.pose(judging({ elbow: 170 })), createPlankReference(PRONE_SIZE).pose(ANKLE));
});

test("실제 판정 결과(processFrame)를 넣어도 정답 뼈대의 발목이 사용자 발목과 겹친다", () => {
  const session = createSession("squat", 0, 0);
  const follow = createReferenceFollow("squat", SQUAT_SIZE);
  let view = null;
  const frames = [...Array(10).fill(10), ...Array(10).fill(50)]; // 서 있다가 50°까지 앉는다
  frames.forEach((thigh, i) => {
    view = session.processFrame(fakeLandmarks(squatBody(thigh, { torso: 25, shin: 25 })), WIDTH, HEIGHT, i * 40);
  });
  const pose = follow.pose(view);
  assert.ok(distance(pose.ankle, view.points.ankle) < 1e-9);
  assert.ok(Math.abs(view.angles.thigh - 50) < 1e-6);
  assert.deepEqual(pose, createSquatReference(SQUAT_SIZE).pose(view.points.ankle, view.angles.thigh));
});

// 프레임 시각 목록(ms)과 그때의 결과로 매 프레임 밝게 그릴지 모은다
function glowOf(glow, frames) {
  return frames.map(([now, view]) => glow.update(view, now));
}

const HOLD = MATCH_HOLD_SECONDS * 1000;
const GLOW = MATCH_GLOW_SECONDS * 1000;
const DEEP = SQUAT.ATTEMPT_MIN + 10; // 반복 구간 안
const STAND = SQUAT.ATTEMPT_MIN - 10;

test("스쿼트: 반복 구간에서 지표가 모두 초록인 상태가 1초 이어지면 1초 동안 밝고, 그 반복에서는 다시 밝아지지 않는다", () => {
  const glow = createMatchGlow("squat");
  const deep = judging({ thigh: DEEP });
  assert.deepEqual(glowOf(glow, [[0, deep], [HOLD - 1, deep], [HOLD, deep], [HOLD + GLOW - 1, deep], [HOLD + GLOW, deep]]), [
    false,
    false,
    true,
    true,
    false,
  ]);
  // 같은 반복에서 계속 초록이어도 다시 밝아지지 않는다
  assert.deepEqual(glowOf(glow, [[3 * HOLD, deep], [5 * HOLD, deep]]), [false, false]);
  // 일어섰다가(반복 구간 밖) 다시 앉으면 다음 반복으로 본다
  const t = 6 * HOLD;
  assert.deepEqual(glowOf(glow, [[t, judging({ thigh: STAND })], [t + 1, deep], [t + 1 + HOLD, deep]]), [false, false, true]);
});

test("스쿼트: 서 있을 때는 초록이어도 밝아지지 않고, 주황이 끼면 1초를 처음부터 다시 잰다", () => {
  const glow = createMatchGlow("squat");
  const stand = judging({ thigh: STAND });
  assert.deepEqual(glowOf(glow, [[0, stand], [2 * HOLD, stand]]), [false, false]);
  const deep = judging({ thigh: DEEP });
  const warn = judging({ thigh: DEEP }, { stages: ["good", "warn"] });
  const t = 3 * HOLD;
  assert.deepEqual(glowOf(glow, [[t, deep], [t + HOLD - 1, warn], [t + HOLD, deep], [t + 2 * HOLD - 1, deep], [t + 2 * HOLD, deep]]), [
    false,
    false,
    false,
    false,
    true,
  ]);
});

test("판정하지 않는 프레임이 끼면 초록이 끊긴 것으로 본다", () => {
  const glow = createMatchGlow("squat");
  const deep = judging({ thigh: DEEP });
  assert.deepEqual(glowOf(glow, [[0, deep], [HOLD / 2, notJudging], [HOLD, deep], [HOLD * 1.5, deep], [HOLD * 2, deep]]), [
    false,
    false,
    false,
    false,
    true,
  ]);
});

test("푸시업: 팔꿈치 각이 반복 구간(125° 미만)일 때만 잰다", () => {
  const glow = createMatchGlow("pushup");
  const top = judging({ elbow: PUSHUP.ATTEMPT_MAX + 20 });
  assert.deepEqual(glowOf(glow, [[0, top], [2 * HOLD, top]]), [false, false]);
  const down = judging({ elbow: PUSHUP.ATTEMPT_MAX - 20 });
  assert.deepEqual(glowOf(glow, [[3 * HOLD, down], [4 * HOLD, down]]), [false, true]);
});

test("플랭크: 초록이 1초 이어질 때마다 한 번 밝아지고, 지표가 초록을 벗어났다가 돌아오면 다시 잰다", () => {
  const glow = createMatchGlow("plank");
  const good = judging({ bodyLevel: 5 });
  const warn = judging({ bodyLevel: 5 }, { stages: ["warn"] });
  assert.deepEqual(glowOf(glow, [[0, good], [HOLD, good], [4 * HOLD, good]]), [false, true, false]);
  assert.deepEqual(glowOf(glow, [[5 * HOLD, warn], [6 * HOLD, good], [7 * HOLD, good]]), [false, false, true]);
});
