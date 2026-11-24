import assert from "node:assert/strict";
import { test } from "node:test";
import { readBody } from "../../static/tracker/js/pose-engine.js";
import { fakeLandmarks, HEIGHT, PLANK_BODY, STANDING_BODY, WIDTH } from "./fake-landmarks.js";

test("좌·우 중 평균 가시성이 높은 쪽 몸을 고른다", () => {
  assert.equal(readBody(fakeLandmarks(PLANK_BODY, { nearSide: "right" }), WIDTH, HEIGHT).side, "right");
  assert.equal(readBody(fakeLandmarks(PLANK_BODY, { nearSide: "left" }), WIDTH, HEIGHT).side, "left");
});

test("양쪽 모두 평균 가시성이 0.7 미만이면 보이지 않는 것으로 본다", () => {
  assert.equal(readBody(fakeLandmarks(PLANK_BODY), WIDTH, HEIGHT).visible, true);
  assert.equal(readBody(fakeLandmarks(PLANK_BODY, { near: 0.6, far: 0.6 }), WIDTH, HEIGHT).visible, false);
});

test("판정용 점마다 가시성이 들어 있다 (발 가시성은 heelLift가 따로 확인한다)", () => {
  const { points } = readBody(fakeLandmarks(PLANK_BODY, { hidden: ["heel"] }), WIDTH, HEIGHT);
  assert.equal(points.hip.visibility, 0.9);
  assert.equal(points.heel.visibility, 0.3);
});

test("측면이면 sideView, 양 어깨가 벌어진 정면이면 아니다", () => {
  assert.equal(readBody(fakeLandmarks(STANDING_BODY), WIDTH, HEIGHT).sideView, true);
  const front = fakeLandmarks(STANDING_BODY);
  front[11] = { x: 0.6, y: 0.25, z: 0, visibility: 0.9 };
  front[12] = { x: 0.4, y: 0.25, z: 0, visibility: 0.9 };
  assert.equal(readBody(front, WIDTH, HEIGHT).sideView, false);
});

test("판정용 점은 픽셀 좌표다", () => {
  const { hip } = readBody(fakeLandmarks(PLANK_BODY), WIDTH, HEIGHT).points;
  assert.ok(Math.abs(hip.x - 0.5 * WIDTH) < 1e-9);
  assert.ok(Math.abs(hip.y - 0.52 * HEIGHT) < 1e-9);
});
