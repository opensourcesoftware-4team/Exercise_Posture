import assert from "node:assert/strict";
import { test } from "node:test";
import { createBodyMeasure } from "../../static/tracker/js/body-measure.js";
import { MEASURE_FRAMES, PUSHUP, SHIN_MAX, TRUNK_EXTRA_MAX } from "../../static/tracker/js/config.js";
import { angleAt } from "../../static/tracker/js/geometry.js";
import {
  createPlankReference,
  createPushupReference,
  createSquatReference,
} from "../../static/tracker/js/reference-pose.js";
import { fakeLandmarks, fakeWorld, HEIGHT, proneBody, squatBody, WIDTH } from "./fake-landmarks.js";

// F4 측정값 모양의 체형 3세트 (px). 표준은 fake-landmarks.js squatBody의 길이와 같다
const SQUAT_BODIES = {
  standard: { lengths: { shank: 180, thigh: 180, torso: 220, head: 50, foot: 80 }, facing: 1, heelOffset: -25, heelDrop: 15 },
  shortLegs: { lengths: { shank: 150, thigh: 150, torso: 240, head: 50, foot: 75 }, facing: 1, heelOffset: -20, heelDrop: 15 },
  longLegs: { lengths: { shank: 210, thigh: 210, torso: 200, head: 50, foot: 85 }, facing: 1, heelOffset: -25, heelDrop: 15 },
};
const ANKLE = { x: 640, y: 640 };

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const close = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);

// 0 ~ thetaMax의 정수 깊이 전부
const depths = (reference) => Array.from({ length: reference.thetaMax + 1 }, (_, theta) => theta);

// 정강이·허벅지·상체(어깨)와 발 중앙의 무게중심 차이 (config 질량비, 화면 좌표)
function balanceOf(body, pose) {
  const middle = (a, b) => (a.x + b.x) / 2;
  const com =
    (0.093 * middle(pose.ankle, pose.knee) + 0.2 * middle(pose.knee, pose.hip) + 0.678 * middle(pose.hip, pose.shoulder)) /
    0.971;
  const footCenter = (pose.heel.x + pose.toe.x) / 2;
  return body.facing * (com - footCenter);
}

test("스쿼트: 0~thetaMax 모든 깊이에서 상체-정강이 차가 10° 이내이고 뒤꿈치·발끝이 움직이지 않는다", () => {
  for (const body of Object.values(SQUAT_BODIES)) {
    const reference = createSquatReference(body);
    const first = reference.pose(ANKLE, 0);
    for (const theta of depths(reference)) {
      const { shin, torso } = reference.angles(theta);
      assert.ok(torso - shin >= 0 && torso - shin <= TRUNK_EXTRA_MAX + 1e-9, `θ${theta}: 상체 ${torso} 정강이 ${shin}`);
      assert.ok(shin <= SHIN_MAX);
      const pose = reference.pose(ANKLE, theta);
      assert.deepEqual([pose.heel, pose.toe], [first.heel, first.toe]);
      assert.deepEqual(pose.ankle, ANKLE);
    }
  }
});

test("스쿼트: 분절 길이는 측정값 그대로이고, 무게중심이 발 중앙 위에 온다", () => {
  const body = SQUAT_BODIES.standard;
  const reference = createSquatReference(body);
  for (const theta of [10, 30, reference.thetaMax]) {
    const pose = reference.pose(ANKLE, theta);
    close(distance(pose.ankle, pose.knee), 180);
    close(distance(pose.knee, pose.hip), 180);
    close(distance(pose.hip, pose.shoulder), 220);
    close(distance(pose.shoulder, pose.ear), 50);
    close(distance(pose.heel, pose.toe), 80);
    close(balanceOf(body, pose), 0, 0.01);
  }
});

test("스쿼트: 허벅지-수직 각이 입력 깊이와 같고, thetaMax를 넘는 깊이는 thetaMax로 자른다", () => {
  const reference = createSquatReference(SQUAT_BODIES.standard);
  const thighAngle = (pose) => (Math.atan2(pose.hip.x - pose.knee.x, pose.knee.y - pose.hip.y) * -180) / Math.PI;
  close(thighAngle(reference.pose(ANKLE, 40)), 40);
  assert.deepEqual(reference.pose(ANKLE, 120), reference.pose(ANKLE, reference.thetaMax));
  assert.deepEqual(reference.pose(ANKLE, -10), reference.pose(ANKLE, 0));
  assert.equal(reference.angles(120).thigh, reference.thetaMax);
});

test("스쿼트: 엉덩이는 무릎 뒤로, 무릎은 발목 앞으로 간다 (보는 방향 기준)", () => {
  const reference = createSquatReference(SQUAT_BODIES.standard);
  const pose = reference.pose(ANKLE, 45);
  assert.ok(pose.knee.x > pose.ankle.x);
  assert.ok(pose.hip.x < pose.knee.x);
  assert.ok(pose.toe.x > pose.heel.x);
});

test("스쿼트: 허벅지를 1.3배로 늘리면 같은 깊이에서 상체가 더 숙여지거나 최대 깊이가 작아진다", () => {
  const body = SQUAT_BODIES.standard;
  const longer = { ...body, lengths: { ...body.lengths, thigh: body.lengths.thigh * 1.3 } };
  const [base, long] = [createSquatReference(body), createSquatReference(longer)];
  assert.ok(long.thetaMax < base.thetaMax);
  // 허벅지가 거의 서 있는 얕은 깊이에서는 길이가 엉덩이를 뒤로 보내지 않아서, 허벅지가 기운 30°부터 비교한다
  for (let theta = 30; theta <= long.thetaMax; theta += 1) {
    assert.ok(long.angles(theta).torso > base.angles(theta).torso, `θ${theta}`);
  }
});

test("스쿼트: 보는 방향만 바꾸면 발목을 축으로 좌우 대칭이다", () => {
  const right = SQUAT_BODIES.standard;
  const left = { ...right, facing: -1, heelOffset: -right.heelOffset };
  const [a, b] = [createSquatReference(right).pose(ANKLE, 50), createSquatReference(left).pose(ANKLE, 50)];
  for (const joint of Object.keys(a)) {
    close(b[joint].x, 2 * ANKLE.x - a[joint].x);
    close(b[joint].y, a[joint].y);
  }
});

test("스쿼트: F4로 잰 측정값을 그대로 넣을 수 있다", () => {
  const measure = createBodyMeasure("squat");
  let step = null;
  for (let i = 0; i < MEASURE_FRAMES; i += 1) {
    step = measure.add(fakeLandmarks(squatBody(10, { torso: 10, shin: 5 })), fakeWorld(1.2), WIDTH, HEIGHT);
  }
  const fromMeasure = createSquatReference(step.result);
  const fromTable = createSquatReference(SQUAT_BODIES.standard);
  assert.equal(fromMeasure.thetaMax, fromTable.thetaMax);
  close(fromMeasure.angles(40).torso, fromTable.angles(40).torso, 0.01);
});

// 체형 3세트 결과 스냅샷 (명세 12장). 설정값(SHIN_MAX 등)이나 계산을 바꾸면 이 값을 다시 만든다.
// 값: thetaMax, 깊이 40°·70°의 정강이·상체 기울기 (소수 첫째 자리). 긴 다리는 70°에서 정강이가 상한(40°)에 걸려 상체를 더 숙인다
const SQUAT_SNAPSHOT = {
  standard: { thetaMax: 90, at40: { shin: 25.7, torso: 25.7 }, at70: { shin: 37.3, torso: 37.3 } },
  shortLegs: { thetaMax: 90, at40: { shin: 24.7, torso: 24.7 }, at70: { shin: 35.1, torso: 35.1 } },
  longLegs: { thetaMax: 77, at40: { shin: 27.8, torso: 27.8 }, at70: { shin: 40, torso: 42.4 } },
};

test("스쿼트: 짧은 다리·긴 다리·표준 체형의 결과가 스냅샷과 같다", () => {
  const round = (value) => Math.round(value * 10) / 10;
  const at = (reference, theta) => {
    const { shin, torso } = reference.angles(theta);
    return { shin: round(shin), torso: round(torso) };
  };
  for (const [name, body] of Object.entries(SQUAT_BODIES)) {
    const reference = createSquatReference(body);
    const actual = { thetaMax: reference.thetaMax, at40: at(reference, 40), at70: at(reference, 70) };
    assert.deepEqual(actual, SQUAT_SNAPSHOT[name], name);
  }
});

// 엎드린 자세 체형 (px). fake-landmarks.js proneBody의 길이와 같다 (오른쪽이 머리). 손과 발목이 같은 높이다
const PRONE_BODY = { lengths: { upperArm: 130, forearm: 130, leg: 300, torso: 300, head: 60 }, facing: 1, floorDrop: 0 };
const PRONE_ANKLE = { x: 200, y: 600 };
const ELBOW_ANGLES = Array.from({ length: 91 }, (_, i) => 90 + i); // 90~180

test("푸시업: 팔을 다 폈을 때 손목이 어깨 바로 아래 바닥에 있다", () => {
  const pose = createPushupReference(PRONE_BODY).pose(PRONE_ANKLE, 180);
  close(pose.wrist.x, pose.shoulder.x);
  close(pose.wrist.y, PRONE_ANKLE.y);
  close(pose.shoulder.y, PRONE_ANKLE.y - 260);
});

test("푸시업: 모든 팔꿈치 각에서 발목–엉덩이–어깨–귀가 일직선이고 길이는 측정값 그대로다", () => {
  const reference = createPushupReference(PRONE_BODY);
  const wrist = reference.pose(PRONE_ANKLE, 180).wrist;
  for (const alpha of ELBOW_ANGLES) {
    const pose = reference.pose(PRONE_ANKLE, alpha);
    close(angleAt(pose.ankle, pose.hip, pose.shoulder), 180, 1e-6);
    close(angleAt(pose.hip, pose.shoulder, pose.ear), 180, 1e-6);
    close(distance(pose.ankle, pose.hip), 300);
    close(distance(pose.ankle, pose.shoulder), 600);
    close(distance(pose.shoulder, pose.ear), 60);
    close(distance(pose.shoulder, pose.elbow), 130);
    close(distance(pose.elbow, pose.wrist), 130);
    close(angleAt(pose.shoulder, pose.elbow, pose.wrist), alpha, 1e-4);
    assert.deepEqual(pose.wrist, wrist); // 손은 바닥에 고정
  }
});

test("푸시업: 팔을 굽힐수록 어깨가 내려가고, 팔꿈치는 발 쪽으로 나간다", () => {
  const reference = createPushupReference(PRONE_BODY);
  const [top, middle, bottom] = [180, 130, 90].map((alpha) => reference.pose(PRONE_ANKLE, alpha));
  assert.ok(top.shoulder.y < middle.shoulder.y && middle.shoulder.y < bottom.shoulder.y);
  assert.ok(bottom.elbow.x < bottom.wrist.x);
  assert.ok(bottom.elbow.y < bottom.wrist.y);
});

test("푸시업: 팔꿈치 각은 바닥 기준(90°)~180°로 자르고, 보는 방향을 바꾸면 좌우 대칭이다", () => {
  const reference = createPushupReference(PRONE_BODY);
  assert.deepEqual(reference.pose(PRONE_ANKLE, 60), reference.pose(PRONE_ANKLE, PUSHUP.BOTTOM_MAX));
  assert.deepEqual(reference.pose(PRONE_ANKLE, 200), reference.pose(PRONE_ANKLE, 180));
  const right = reference.pose(PRONE_ANKLE, 120);
  const left = createPushupReference({ ...PRONE_BODY, facing: -1 }).pose(PRONE_ANKLE, 120);
  for (const joint of Object.keys(right)) {
    close(left[joint].x, 2 * PRONE_ANKLE.x - right[joint].x);
    close(left[joint].y, right[joint].y);
  }
});

test("푸시업: F4로 잰 측정값을 그대로 넣을 수 있다", () => {
  const measure = createBodyMeasure("pushup");
  let step = null;
  for (let i = 0; i < MEASURE_FRAMES; i += 1) step = measure.add(fakeLandmarks(proneBody()), null, WIDTH, HEIGHT);
  const pose = createPushupReference(step.result).pose(PRONE_ANKLE, 180);
  close(pose.wrist.x, pose.shoulder.x);
  close(distance(pose.ankle, pose.shoulder), 600, 0.01);
});

test("푸시업: 손은 발목보다 floorDrop만큼 아래 바닥을 짚고, 바른 시작 자세면 사용자 관절과 겹친다", () => {
  const raised = createPushupReference({ ...PRONE_BODY, floorDrop: 20 });
  for (const alpha of ELBOW_ANGLES) {
    const pose = raised.pose(PRONE_ANKLE, alpha);
    close(pose.wrist.y, PRONE_ANKLE.y + 20);
    close(distance(pose.ankle, pose.shoulder), 600);
    close(angleAt(pose.shoulder, pose.elbow, pose.wrist), alpha, 1e-4);
  }
  close(raised.pose(PRONE_ANKLE, 180).wrist.x, raised.pose(PRONE_ANKLE, 180).shoulder.x);

  // proneBody()는 손목이 어깨 바로 아래인 바른 시작 자세다. F4로 잰 값으로 사용자 발목에 맞추면 손목·어깨가 겹친다
  const user = proneBody();
  const px = (joint) => ({ x: user[joint].x * WIDTH, y: user[joint].y * HEIGHT });
  const measure = createBodyMeasure("pushup");
  let step = null;
  for (let i = 0; i < MEASURE_FRAMES; i += 1) step = measure.add(fakeLandmarks(user), null, WIDTH, HEIGHT);
  const pose = createPushupReference(step.result).pose(px("ankle"), 180);
  for (const joint of ["wrist", "shoulder", "elbow", "hip", "ear"]) {
    assert.ok(distance(pose[joint], px(joint)) < 0.01, `${joint} ${distance(pose[joint], px(joint))}px`);
  }
});

test("플랭크: 팔꿈치가 어깨 바로 아래 바닥에 있고, 아래팔은 머리 쪽 바닥에 놓인다", () => {
  const pose = createPlankReference(PRONE_BODY).pose(PRONE_ANKLE);
  close(pose.elbow.x, pose.shoulder.x);
  close(pose.elbow.y, PRONE_ANKLE.y);
  close(pose.shoulder.y, PRONE_ANKLE.y - 130);
  close(pose.wrist.x, pose.elbow.x + 130);
  close(pose.wrist.y, PRONE_ANKLE.y);
});

test("플랭크: 발목–엉덩이–어깨–귀가 일직선이고 길이는 측정값 그대로이며, 보는 방향을 바꾸면 좌우 대칭이다", () => {
  const pose = createPlankReference(PRONE_BODY).pose(PRONE_ANKLE);
  close(angleAt(pose.ankle, pose.hip, pose.shoulder), 180, 1e-6);
  close(angleAt(pose.hip, pose.shoulder, pose.ear), 180, 1e-6);
  close(distance(pose.ankle, pose.hip), 300);
  close(distance(pose.ankle, pose.shoulder), 600);
  close(distance(pose.shoulder, pose.ear), 60);
  const left = createPlankReference({ ...PRONE_BODY, facing: -1 }).pose(PRONE_ANKLE);
  for (const joint of Object.keys(pose)) close(left[joint].x, 2 * PRONE_ANKLE.x - pose[joint].x);
});

test("플랭크: 팔꿈치·손목은 발목보다 floorDrop만큼 아래 바닥에 있고, 어깨는 그 위로 위팔 길이다", () => {
  const pose = createPlankReference({ ...PRONE_BODY, floorDrop: 40 }).pose(PRONE_ANKLE);
  close(pose.elbow.y, PRONE_ANKLE.y + 40);
  close(pose.wrist.y, PRONE_ANKLE.y + 40);
  close(pose.elbow.x, pose.shoulder.x);
  close(distance(pose.shoulder, pose.elbow), 130);
  close(distance(pose.ankle, pose.shoulder), 600);
  close(angleAt(pose.ankle, pose.hip, pose.shoulder), 180, 1e-6);
});
