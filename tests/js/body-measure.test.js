import assert from "node:assert/strict";
import { test } from "node:test";
import { createBodyMeasure, lengthDifference } from "../../static/tracker/js/body-measure.js";
import { MEASURE_TEXT, STATUS } from "../../static/tracker/js/catalog.js";
import { MEASURE_FRAMES } from "../../static/tracker/js/config.js";
import { fakeLandmarks, HEIGHT, PLANK_BODY, proneBody, squatBody, WIDTH } from "./fake-landmarks.js";

// 선 자세 (오른쪽을 본다). squatBody의 픽셀 길이: 정강이·허벅지 180, 몸통 220, 머리 50, 발 80, 뒤꿈치는 발목보다 25px 뒤
const STANDING = squatBody(10, { torso: 10, shin: 5 });
const STANDING_LENGTHS = { shank: 180, thigh: 180, torso: 220, head: 50, foot: 80 };

// 같은 랜드마크를 count장 넣고 마지막 결과를 돌려준다
function feed(measure, landmarks, count) {
  let step = null;
  for (let i = 0; i < count; i += 1) step = measure.add(landmarks, WIDTH, HEIGHT);
  return step;
}

function assertLengths(actual, expected) {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
  for (const [name, value] of Object.entries(expected)) {
    assert.ok(Math.abs(actual[name] - value) < 0.01, `${name}: ${actual[name]} ≠ ${value}`);
  }
}

// 좌우를 뒤집은 몸 (왼쪽을 보는 사람)
function mirrored(body) {
  return Object.fromEntries(Object.entries(body).map(([joint, { x, y }]) => [joint, { x: 1 - x, y }]));
}

test("스쿼트: 선 자세를 60프레임 재면 분절 길이(px)·보는 방향·뒤꿈치 위치가 나온다", () => {
  const measure = createBodyMeasure("squat");
  const before = feed(measure, fakeLandmarks(STANDING), MEASURE_FRAMES - 1);
  assert.equal(before.result, null);
  assert.equal(before.status, MEASURE_TEXT.squat);
  assert.ok(Math.abs(before.progress - (MEASURE_FRAMES - 1) / MEASURE_FRAMES) < 1e-9);

  const { result, progress } = measure.add(fakeLandmarks(STANDING), WIDTH, HEIGHT);
  assert.equal(progress, 1);
  assertLengths(result.lengths, STANDING_LENGTHS);
  assert.equal(result.facing, 1);
  assert.ok(Math.abs(result.heelOffset - -25) < 0.01);
});

test("왼쪽을 보고 서도 길이는 같고 보는 방향만 -1이다", () => {
  const { result } = feed(createBodyMeasure("squat"), fakeLandmarks(mirrored(STANDING)), MEASURE_FRAMES);
  assertLengths(result.lengths, STANDING_LENGTHS);
  assert.equal(result.facing, -1);
  assert.ok(Math.abs(result.heelOffset - 25) < 0.01);
});

test("한 묶음 60프레임 중 유효 프레임이 30장 미만이면 처음부터 다시 잰다", () => {
  const hidden = fakeLandmarks(STANDING, { hidden: ["heel"] }); // 발 길이를 잴 수 없다
  const visible = fakeLandmarks(STANDING);

  const measure = createBodyMeasure("squat");
  assert.equal(feed(measure, hidden, 31).status, STATUS.notVisible);
  const restarted = feed(measure, visible, 29);
  assert.equal(restarted.result, null);
  assert.equal(restarted.progress, 0);
  assert.equal(feed(measure, visible, MEASURE_FRAMES - 1).result, null);
  assert.notEqual(measure.add(visible, WIDTH, HEIGHT).result, null);

  const enough = createBodyMeasure("squat");
  feed(enough, hidden, 30);
  assert.notEqual(feed(enough, visible, 30).result, null);
});

test("가시성 0.7 미만인 프레임의 길이는 중앙값에 들어가지 않는다", () => {
  // 무릎이 가려진 프레임에서는 무릎 점이 엉뚱한 곳에 찍힌다
  const wrongKnee = { ...STANDING, knee: { x: STANDING.knee.x, y: STANDING.knee.y + 0.1 } };
  const measure = createBodyMeasure("squat");
  feed(measure, fakeLandmarks(wrongKnee, { hidden: ["knee"] }), 30);
  const { result } = feed(measure, fakeLandmarks(STANDING), 30);
  assertLengths(result.lengths, STANDING_LENGTHS);
});

test("측정 자세가 아니면 재지 않는다: 스쿼트는 선 자세, 푸시업은 팔을 편 자세", () => {
  const squatting = feed(createBodyMeasure("squat"), fakeLandmarks(squatBody(60)), MEASURE_FRAMES * 2);
  assert.equal(squatting.result, null);
  assert.equal(squatting.status, MEASURE_TEXT.squat);

  const bent = feed(createBodyMeasure("pushup"), fakeLandmarks(proneBody({ elbow: 100 })), MEASURE_FRAMES * 2);
  assert.equal(bent.result, null);
  assert.equal(bent.status, MEASURE_TEXT.pushup);
});

test("푸시업: 팔을 편 시작 자세에서 팔·다리·몸통·머리 길이를 잰다 (뒤꿈치 위치는 없다)", () => {
  const { result } = feed(createBodyMeasure("pushup"), fakeLandmarks(proneBody()), MEASURE_FRAMES);
  // proneBody: 위팔·아래팔 130, 어깨~발목 600의 가운데가 엉덩이, 귀는 어깨에서 60
  assertLengths(result.lengths, { upperArm: 130, forearm: 130, leg: 300, torso: 300, head: 60 });
  assert.equal(result.facing, 1);
  assert.equal("heelOffset" in result, false);
});

test("플랭크: 팔꿈치를 댄 자세에서 재고, 왼쪽을 보면 방향이 -1이다", () => {
  const { result } = feed(createBodyMeasure("plank"), fakeLandmarks(PLANK_BODY), MEASURE_FRAMES);
  const px = (joint) => ({ x: PLANK_BODY[joint].x * WIDTH, y: PLANK_BODY[joint].y * HEIGHT });
  const length = (a, b) => Math.hypot(px(a).x - px(b).x, px(a).y - px(b).y);
  assertLengths(result.lengths, {
    upperArm: length("shoulder", "elbow"),
    forearm: length("elbow", "wrist"),
    leg: length("hip", "ankle"),
    torso: length("hip", "shoulder"),
    head: length("shoulder", "ear"),
  });
  assert.equal(result.facing, -1);
});

test("사람이 없거나 정면이면 그 까닭을 안내하고 재지 않는다", () => {
  const measure = createBodyMeasure("squat");
  assert.equal(measure.add(null, WIDTH, HEIGHT).status, STATUS.notVisible);
  const front = fakeLandmarks(STANDING);
  front[11] = { x: 0.6, y: 0.25, z: 0, visibility: 0.9 };
  front[12] = { x: 0.4, y: 0.25, z: 0, visibility: 0.9 };
  assert.equal(measure.add(front, WIDTH, HEIGHT).status, STATUS.notSideView);
});

// 테스트가 매번 같은 값을 쓰도록 씨앗으로 정해지는 의사난수 (-0.5 ~ 0.5)
function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state / 2 ** 31 - 0.5;
  };
}

// 점마다 ±3px 흔들고, 10% 프레임은 관절 하나가 40px 튄다 (MediaPipe 점 튐 흉내)
function shakyFrames(body, seed, count) {
  const random = seededRandom(seed);
  const joints = Object.keys(body);
  return Array.from({ length: count }, () => {
    const jumped = random() < -0.4 ? joints[Math.floor((random() + 0.5) * joints.length)] : null;
    const shaken = Object.fromEntries(
      joints.map((joint) => {
        const size = joint === jumped ? 40 : 6;
        return [joint, { x: body[joint].x + (random() * size) / WIDTH, y: body[joint].y + (random() * size) / HEIGHT }];
      }),
    );
    return fakeLandmarks(shaken);
  });
}

test("점이 흔들리고 가끔 튀어도 두 번 잰 길이가 5% 이내로 일치한다", () => {
  const measureOnce = (seed) => {
    const measure = createBodyMeasure("squat");
    let step = null;
    for (const landmarks of shakyFrames(STANDING, seed, MEASURE_FRAMES)) step = measure.add(landmarks, WIDTH, HEIGHT);
    return step.result;
  };
  const first = measureOnce(7);
  const second = measureOnce(2026);
  assert.ok(lengthDifference(first, second) <= 5, `차이 ${lengthDifference(first, second).toFixed(1)}%`);
});

test("길이 차이는 같은 분절끼리 평균 대비 가장 큰 값(%)이다", () => {
  const a = { lengths: { shank: 100, thigh: 200, torso: 300 } };
  const b = { lengths: { shank: 110, thigh: 200, head: 50 } };
  assert.ok(Math.abs(lengthDifference(a, b) - (10 / 105) * 100) < 1e-9);
  assert.equal(lengthDifference(a, a), 0);
});
