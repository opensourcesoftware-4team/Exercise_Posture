import assert from "node:assert/strict";
import { test } from "node:test";
import { MANNEQUIN_HEAD_RATIO, MANNEQUIN_WIDTHS } from "../../static/tracker/js/config.js";
import { mannequinParts } from "../../static/tracker/js/mannequin.js";
import { MODES } from "../../static/tracker/js/modes.js";
import { STAGE_COLORS, userPartColors } from "../../static/tracker/js/overlay.js";
import { createPushupReference, createSquatReference } from "../../static/tracker/js/reference-pose.js";

// F4 측정값 모양의 체형 (px)
const SQUAT_SIZE = { lengths: { shank: 180, thigh: 180, torso: 220, head: 50, foot: 80 }, facing: 1, heelOffset: -25, heelDrop: 15 };
const PRONE_SIZE = { lengths: { upperArm: 130, forearm: 130, leg: 300, torso: 300, head: 60 }, facing: 1, floorDrop: 20 };
const ANKLE = { x: 640, y: 640 };

const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);
const barOf = (parts, part) => parts.bars.find((bar) => bar.part === part);

test("명세 9장: 굵기는 측정 몸통 길이의 22%(몸통)·18%(허벅지)·14%(정강이·팔), 머리는 귀 중심 반지름 = 머리 길이 70%", () => {
  assert.deepEqual(MANNEQUIN_WIDTHS, { torso: 0.22, thigh: 0.18, limb: 0.14 });
  assert.equal(MANNEQUIN_HEAD_RATIO, 0.7);
  const pose = createSquatReference(SQUAT_SIZE).pose(ANKLE, 40);
  const parts = mannequinParts(pose);
  close(barOf(parts, "torso").width, 220 * 0.22);
  close(barOf(parts, "thigh").width, 220 * 0.18);
  close(barOf(parts, "shank").width, 220 * 0.14);
  close(barOf(parts, "foot").width, 220 * 0.14);
  assert.deepEqual(parts.head.center, pose.ear);
  close(parts.head.radius, 50 * 0.7);
});

test("스쿼트 정답 자세: 막대 양 끝이 관절이고, 팔이 없어서 팔 막대는 그리지 않는다", () => {
  const pose = createSquatReference(SQUAT_SIZE).pose(ANKLE, 40);
  const parts = mannequinParts(pose);
  assert.deepEqual(
    parts.bars.map(({ part, from, to }) => [part, from, to]),
    [
      ["torso", pose.hip, pose.shoulder],
      ["thigh", pose.hip, pose.knee],
      ["shank", pose.knee, pose.ankle],
      ["foot", pose.heel, pose.toe],
    ],
  );
});

test("엎드린 정답 자세: 무릎이 없어 엉덩이–발목 가운데를 무릎으로 보고, 발은 없고 팔은 있다", () => {
  const pose = createPushupReference(PRONE_SIZE).pose(ANKLE, 120);
  const parts = mannequinParts(pose);
  const knee = { x: (pose.hip.x + pose.ankle.x) / 2, y: (pose.hip.y + pose.ankle.y) / 2 };
  assert.deepEqual(barOf(parts, "thigh").to, knee);
  assert.deepEqual(barOf(parts, "shank").from, knee);
  assert.equal(barOf(parts, "foot"), undefined);
  assert.deepEqual([barOf(parts, "upperArm").to, barOf(parts, "forearm").to], [pose.elbow, pose.wrist]);
  close(barOf(parts, "torso").width, 300 * 0.22); // 몸통 막대도 측정 몸통 길이 기준
  close(barOf(parts, "upperArm").width, 300 * 0.14);
  close(parts.head.radius, 60 * 0.7);
});

test("몸이 클수록(화면에서 가까울수록) 막대와 머리도 같은 비율로 굵어진다", () => {
  const scale = (body, factor) => ({
    ...body,
    lengths: Object.fromEntries(Object.entries(body.lengths).map(([name, value]) => [name, value * factor])),
    heelOffset: body.heelOffset * factor,
    heelDrop: body.heelDrop * factor,
  });
  const small = mannequinParts(createSquatReference(SQUAT_SIZE).pose(ANKLE, 30));
  const large = mannequinParts(createSquatReference(scale(SQUAT_SIZE, 2)).pose(ANKLE, 30));
  for (const bar of small.bars) close(barOf(large, bar.part).width, bar.width * 2, 1e-6);
  close(large.head.radius, small.head.radius * 2, 1e-6);
});

// 판정 중인 프레임 (userPartColors가 쓰는 값만)
const view = (thigh, stages) => ({ angles: { thigh }, indicators: Object.entries(stages).map(([key, stage]) => ({ key, stage })) });

test("사용자 마네킹: 지표가 있는 부위는 3단계 색, 스쿼트 허벅지는 깊이 구간 색, 나머지는 중립색이다", () => {
  const colorOf = userPartColors("squat", view(80, { torsoShin: "warn", heelRise: "good" }), MODES.record);
  assert.equal(colorOf("torso"), STAGE_COLORS.warn);
  assert.equal(colorOf("foot"), STAGE_COLORS.good);
  assert.equal(colorOf("thigh"), STAGE_COLORS.good); // 80°: 통과 구간
  const neutral = colorOf("shank");
  assert.ok(![STAGE_COLORS.good, STAGE_COLORS.warn, STAGE_COLORS.bad].includes(neutral));
  for (const part of ["upperArm", "forearm", "head"]) assert.equal(colorOf(part), neutral);
  assert.equal(userPartColors("squat", view(10, {}), MODES.record)("thigh"), "#94a3b8"); // 서 있으면 회색 (선 뼈대와 같다)
});

test("사용자 마네킹: 연습 모드는 빨강 대신 주황이고, 엎드린 종목은 몸통 정렬·팔·목 지표를 그 부위에 칠한다", () => {
  const practice = userPartColors("squat", view(50, { torsoShin: "bad" }), MODES.practice);
  assert.equal(practice("torso"), STAGE_COLORS.warn);
  assert.equal(practice("thigh"), STAGE_COLORS.warn); // 50°: 시도 구간
  const pushup = userPartColors("pushup", view(undefined, { bodyLine: "bad", armLean: "good" }), MODES.record);
  for (const part of ["torso", "thigh", "shank"]) assert.equal(pushup(part), STAGE_COLORS.bad);
  for (const part of ["upperArm", "forearm"]) assert.equal(pushup(part), STAGE_COLORS.good);
  const plank = userPartColors("plank", view(undefined, { neck: "warn" }), MODES.record);
  assert.equal(plank("head"), STAGE_COLORS.warn);
});
