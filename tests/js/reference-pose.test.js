import assert from "node:assert/strict";
import { test } from "node:test";
import { createBodyMeasure } from "../../static/tracker/js/body-measure.js";
import { MEASURE_FRAMES, SHIN_MAX, TRUNK_EXTRA_MAX } from "../../static/tracker/js/config.js";
import { createSquatReference } from "../../static/tracker/js/reference-pose.js";
import { fakeLandmarks, fakeWorld, HEIGHT, squatBody, WIDTH } from "./fake-landmarks.js";

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
// 값: thetaMax, 깊이 40°의 정강이·상체 기울기 (소수 첫째 자리)
const SQUAT_SNAPSHOT = {
  standard: { thetaMax: 56, shin: 25.7, torso: 25.7 },
  shortLegs: { thetaMax: 63, shin: 24.7, torso: 24.7 },
  longLegs: { thetaMax: 49, shin: 27.8, torso: 27.8 },
};

test("스쿼트: 짧은 다리·긴 다리·표준 체형의 결과가 스냅샷과 같다", () => {
  const round = (value) => Math.round(value * 10) / 10;
  for (const [name, body] of Object.entries(SQUAT_BODIES)) {
    const reference = createSquatReference(body);
    const { shin, torso } = reference.angles(40);
    assert.deepEqual({ thetaMax: reference.thetaMax, shin: round(shin), torso: round(torso) }, SQUAT_SNAPSHOT[name], name);
  }
});
