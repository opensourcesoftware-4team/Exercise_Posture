import assert from "node:assert/strict";
import { test } from "node:test";
import { PUSHUP, SQUAT } from "../../static/tracker/js/config.js";
import { depthZone, gaugePosition, GAUGES, guideLine } from "../../static/tracker/js/depth.js";

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≠ ${expected}`);

test("게이지 눈금은 판정 기준값을 그대로 쓴다", () => {
  assert.deepEqual(GAUGES.squat.ticks.map((tick) => tick.value), [SQUAT.STAND_MAX, SQUAT.ATTEMPT_MIN, SQUAT.PASS_MIN]);
  assert.deepEqual(GAUGES.pushup.ticks.map((tick) => tick.value), [PUSHUP.TOP_MIN, PUSHUP.ATTEMPT_MAX, PUSHUP.BOTTOM_MAX]);
  assert.equal(GAUGES.plank, undefined);
});

test("게이지 위치: 위 끝이 0, 아래 끝이 1이고 범위를 넘으면 끝에 붙는다", () => {
  near(gaugePosition(GAUGES.squat, 0), 0);
  near(gaugePosition(GAUGES.squat, 70), 0.7);
  near(gaugePosition(GAUGES.squat, 130), 1);
  near(gaugePosition(GAUGES.pushup, 180), 0);
  near(gaugePosition(GAUGES.pushup, 125), 0.5);
});

test("깊이 구간은 판정 경계와 같다: 스쿼트 70° 이상 통과, 35° 초과 시도", () => {
  assert.equal(depthZone("squat", 20), "idle");
  assert.equal(depthZone("squat", 35), "idle");
  assert.equal(depthZone("squat", 50), "attempt");
  assert.equal(depthZone("squat", 70), "pass");
});

test("푸시업 깊이 구간: 90° 이하 통과, 125° 미만 시도", () => {
  assert.equal(depthZone("pushup", 170), "idle");
  assert.equal(depthZone("pushup", 110), "attempt");
  assert.equal(depthZone("pushup", 90), "pass");
});

test("안내선은 무릎에서 시작해, 허벅지 길이만큼 사람이 보는 반대쪽 위로 70° 기울어진다", () => {
  // 오른쪽을 보는 사람: 코가 귀보다 오른쪽. 허벅지 길이 100
  const points = { nose: { x: 120, y: 0 }, ear: { x: 100, y: 0 }, knee: { x: 500, y: 400 }, hip: { x: 500, y: 300 } };
  const { from, to } = guideLine(points);
  assert.deepEqual(from, points.knee);
  near(to.x, 500 - 100 * Math.sin((70 * Math.PI) / 180)); // 뒤(왼쪽)로
  near(to.y, 400 - 100 * Math.cos((70 * Math.PI) / 180)); // 위로

  // 왼쪽을 보는 사람이면 오른쪽으로 뻗는다
  const left = guideLine({ ...points, nose: { x: 80, y: 0 } });
  near(left.to.x, 500 + 100 * Math.sin((70 * Math.PI) / 180));
});
