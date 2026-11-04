import assert from "node:assert/strict";
import { test } from "node:test";
import { PLAYBACK_PERIOD_SECONDS, PLAYBACK_SPEED_DEFAULT, PLAYBACK_SPEEDS, PUSHUP } from "../../static/tracker/js/config.js";
import { createReferenceFollow } from "../../static/tracker/js/follow.js";
import { createPlayback, depthFraction, hasPlayback } from "../../static/tracker/js/playback.js";

// F4 측정값 모양의 체형 (px). follow.test.js와 같다
const SQUAT_SIZE = { lengths: { shank: 180, thigh: 180, torso: 220, head: 50, foot: 80 }, facing: 1, heelOffset: -25, heelDrop: 15 };
const PRONE_SIZE = { lengths: { upperArm: 130, forearm: 130, leg: 300, torso: 300, head: 60 }, facing: 1, floorDrop: 20 };
const SQUAT_FOLLOW = createReferenceFollow("squat", SQUAT_SIZE);
const THETA_MAX = SQUAT_FOLLOW.thetaMax;
const HALF = (PLAYBACK_PERIOD_SECONDS * 1000) / 2; // 1배속에서 내려가기(또는 올라오기)에 걸리는 시간 (ms)

const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);

// 판정 중인 프레임 (발목과, 코·귀로 정한 보는 방향만)
const judging = (ankle, facing = 1) => ({
  points: { ankle, ear: { x: ankle.x, y: ankle.y - 600 }, nose: { x: ankle.x + facing * 20, y: ankle.y - 595 } },
});
const notJudging = { points: null };

test("깊이 비율은 시작 자세 0 → 반 바퀴에서 1 → 한 바퀴에서 0이다 (1 − cos 2πt) / 2", () => {
  close(depthFraction(0), 0);
  close(depthFraction(0.25), 0.5);
  close(depthFraction(0.5), 1);
  close(depthFraction(0.75), 0.5);
  close(depthFraction(1), 0);
  close(depthFraction(1.5), 1); // 계속 반복한다
});

test("1배속: 시작 자세에서 2초 동안 thetaMax까지 내려가고, 2초 동안 올라온다", () => {
  assert.equal(HALF, 2000);
  const playback = createPlayback("squat", SQUAT_FOLLOW, 1, 0);
  close(playback.depth(0), 0);
  close(playback.depth(HALF), THETA_MAX);
  close(playback.depth(2 * HALF), 0);
  for (let t = 0; t < HALF; t += 100) assert.ok(playback.depth(t + 100) > playback.depth(t), `내려가기 ${t}ms`);
  for (let t = HALF; t < 2 * HALF; t += 100) assert.ok(playback.depth(t + 100) < playback.depth(t), `올라오기 ${t}ms`);
  close(playback.depth(2 * HALF + 500), playback.depth(500)); // 다음 반복도 같다
});

test("배속을 낮추면 한 번이 길어진다: 기본 0.75배, 0.5배는 내려가기에 4초", () => {
  assert.deepEqual(PLAYBACK_SPEEDS, [0.5, 0.75, 1]);
  assert.equal(PLAYBACK_SPEED_DEFAULT, 0.75);
  close(createPlayback("squat", SQUAT_FOLLOW, 0.5, 0).depth(2 * HALF), THETA_MAX);
  close(createPlayback("squat", SQUAT_FOLLOW, 0.75, 0).depth(HALF / 0.75), THETA_MAX);
});

test("일시정지하면 그 깊이에 멈추고, 다시 재생하면 멈춘 지점에서 이어진다", () => {
  const playback = createPlayback("squat", SQUAT_FOLLOW, 1, 0);
  const unpaused = createPlayback("squat", SQUAT_FOLLOW, 1, 0);
  playback.pause(700);
  assert.equal(playback.playing, false);
  close(playback.depth(700), unpaused.depth(700));
  close(playback.depth(5000), unpaused.depth(700)); // 멈춰 있는 동안 그대로다
  playback.play(5000);
  assert.equal(playback.playing, true);
  close(playback.depth(5300), unpaused.depth(1000)); // 멈춘 지점(700ms)에서 300ms 더 갔다
  playback.play(5300); // 재생 중에 다시 눌러도 이어진다
  close(playback.depth(5600), unpaused.depth(1300));
});

test("재생 중에 배속을 바꿔도 자세가 튀지 않고, 바꾼 배속으로 이어진다", () => {
  const playback = createPlayback("squat", SQUAT_FOLLOW, 1, 0);
  const before = playback.depth(1000); // 1/4 바퀴
  playback.setSpeed(0.5, 1000);
  close(playback.depth(1000), before);
  close(playback.depth(1000 + HALF), THETA_MAX); // 0.5배로 1/4 바퀴 더 가면 가장 깊은 곳
  playback.pause(1000 + HALF);
  playback.setSpeed(1, 9000); // 멈춘 채로 바꾸면 계속 멈춰 있다
  close(playback.depth(9000), THETA_MAX);
  assert.equal(playback.playing, false);
});

test("처음부터 다시 재생하면 시작 자세에서 출발하고, 멈춰 있었어도 재생한다", () => {
  const playback = createPlayback("squat", SQUAT_FOLLOW, 1, 0);
  playback.pause(1500);
  playback.restart(8000);
  assert.equal(playback.playing, true);
  close(playback.depth(8000), 0);
  close(playback.depth(8000 + HALF), THETA_MAX);
});

test("푸시업은 팔꿈치 각 180° → 바닥(90°) → 180°로 재생하고, 플랭크는 재생하지 않는다", () => {
  const playback = createPlayback("pushup", createReferenceFollow("pushup", PRONE_SIZE), 1, 0);
  close(playback.depth(0), 180);
  close(playback.depth(HALF), PUSHUP.BOTTOM_MAX);
  close(playback.depth(2 * HALF), 180);
  assert.equal(hasPlayback("squat"), true);
  assert.equal(hasPlayback("pushup"), true);
  assert.equal(hasPlayback("plank"), false);
});

test("마지막으로 판정한 프레임의 발목·보는 방향에 그리고, 사용자가 화면에서 빠져도 그 자리에 그린다", () => {
  const playback = createPlayback("squat", SQUAT_FOLLOW, 1, 0);
  assert.equal(playback.pose(HALF), null); // 자리를 모르면 그리지 않는다

  const first = { x: 500, y: 620 };
  playback.see(judging(first, -1));
  assert.deepEqual(playback.pose(HALF), SQUAT_FOLLOW.poseAt(first, -1, THETA_MAX));
  playback.see(notJudging);
  assert.deepEqual(playback.pose(HALF), SQUAT_FOLLOW.poseAt(first, -1, THETA_MAX));
  assert.deepEqual(playback.pose(HALF).ankle, first);

  const second = { x: 700, y: 610 };
  playback.see(judging(second, 1));
  assert.deepEqual(playback.pose(1000), SQUAT_FOLLOW.poseAt(second, 1, playback.depth(1000)));
});

test("재생하는 정답 자세는 맞춰 보기와 같은 체형 맞춤 자세다 (푸시업 손 높이 포함)", () => {
  const follow = createReferenceFollow("pushup", PRONE_SIZE);
  const playback = createPlayback("pushup", follow, 1, 0);
  const ankle = { x: 300, y: 580 };
  playback.see(judging(ankle));
  const bottom = playback.pose(HALF);
  assert.deepEqual(bottom, follow.poseAt(ankle, 1, PUSHUP.BOTTOM_MAX));
  close(bottom.wrist.y, ankle.y + PRONE_SIZE.floorDrop);
});
