import assert from "node:assert/strict";
import { test } from "node:test";
import {
  angleAt,
  createSmoother,
  isBelowLine,
  measureAngles,
  median,
  toPixel,
} from "../../static/tracker/js/geometry.js";

const point = (x, y) => ({ x, y });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≠ ${expected}`);

// 옆으로 꼿꼿이 선 몸 (픽셀 좌표)
const STANDING = {
  ear: point(100, 20),
  shoulder: point(100, 50),
  elbow: point(100, 80),
  wrist: point(100, 110),
  hip: point(100, 110),
  knee: point(100, 170),
  ankle: point(100, 230),
  heel: point(90, 235),
  toe: point(120, 235),
};

test("angleAt: 직각은 90°, 일직선은 180°", () => {
  near(angleAt(point(1, 0), point(0, 0), point(0, 1)), 90);
  near(angleAt(point(-1, 0), point(0, 0), point(1, 0)), 180);
});

test("서 있으면 허벅지-수직 각 0°, 몸통·팔꿈치 정렬 180°, 몸 수평 각 90°", () => {
  const angles = measureAngles(STANDING);
  near(angles.thigh, 0);
  near(angles.bodyLine, 180);
  near(angles.elbow, 180);
  near(angles.bodyLevel, 90);
});

test("허벅지가 수평이면 허벅지-수직 각 90°", () => {
  near(measureAngles({ ...STANDING, knee: point(160, 110) }).thigh, 90);
});

test("몸통-정강이 각 = 몸통 기울기 - 정강이 기울기", () => {
  const angles = measureAngles({ ...STANDING, shoulder: point(150, 60) }); // 몸통만 45° 숙임
  near(angles.torso, 45);
  near(angles.shin, 0);
  near(angles.torsoShin, 45);
});

test("발 각도: 발바닥이 평평하면 0°, 뒤꿈치가 들리면 커진다", () => {
  near(measureAngles(STANDING).foot, 0);
  assert.ok(measureAngles({ ...STANDING, heel: point(90, 225) }).foot > 15);
});

test("몸 수평 각: 누우면 0°", () => {
  near(measureAngles({ ...STANDING, shoulder: point(0, 100), ankle: point(300, 100) }).bodyLevel, 0);
});

test("팔 기울기: 손이 어깨 바로 아래면 0°, 머리 쪽이면 +, 발 쪽이면 -", () => {
  // 엎드린 몸 (오른쪽이 머리): 어깨 (200, 100), 엉덩이 (0, 150)
  const prone = { ...STANDING, shoulder: point(200, 100), hip: point(0, 150), elbow: point(200, 150) };
  near(measureAngles({ ...prone, wrist: point(200, 200) }).armLean, 0);
  near(measureAngles({ ...prone, wrist: point(300, 200) }).armLean, 45);
  near(measureAngles({ ...prone, wrist: point(100, 200) }).armLean, -45);
  // 왼쪽이 머리여도 머리 쪽이 +다
  const mirrored = { ...STANDING, shoulder: point(0, 100), hip: point(200, 150), elbow: point(0, 150) };
  near(measureAngles({ ...mirrored, wrist: point(-100, 200) }).armLean, 45);
});

test("픽셀 좌표로 바꿔야 화면비 때문에 각도가 틀어지지 않는다", () => {
  const hip = { x: 0.5, y: 0.5 };
  const knee = { x: 0.6, y: 0.6 };
  // 정규화 좌표 그대로면 45°지만, 1280×720 영상에서 실제 각도는 약 60.6°다
  const thigh = measureAngles({ ...STANDING, hip: toPixel(hip, 1280, 720), knee: toPixel(knee, 1280, 720) }).thigh;
  near(thigh, (Math.atan2(128, 72) * 180) / Math.PI);
});

test("isBelowLine: 직선(연장선 포함)보다 아래인지", () => {
  const a = point(0, 100);
  const b = point(200, 100);
  assert.equal(isBelowLine(point(100, 120), a, b), true);
  assert.equal(isBelowLine(point(100, 80), a, b), false);
  assert.equal(isBelowLine(point(300, 120), a, b), true);
  assert.equal(isBelowLine(point(100, 120), point(0, 0), point(0, 200)), false);
});

test("median: 홀수 개는 가운데, 짝수 개는 가운데 둘의 평균", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test("smoother: 한 프레임만 튄 값은 중앙값으로 걸러진다", () => {
  const smooth = createSmoother(5);
  smooth({ thigh: 10 });
  smooth({ thigh: 10 });
  assert.equal(smooth({ thigh: 90 }).thigh, 10);
});
