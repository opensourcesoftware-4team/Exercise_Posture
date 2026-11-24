import assert from "node:assert/strict";
import { test } from "node:test";
import { STATUS } from "../../static/tracker/js/catalog.js";
import {
  applyEvent,
  buildRecord,
  computeAccuracy,
  createHoldTracker,
  createSession,
  sessionCount,
  toLocalIsoString,
} from "../../static/tracker/js/session.js";
import { fakeLandmarks, HEIGHT, PLANK_BODY, STANDING_BODY, WIDTH } from "./fake-landmarks.js";

// frames장을 stepMs 간격으로 넣는다. 다음 프레임 시각을 돌려준다.
function play(session, landmarks, frames, startAt, stepMs = 125) {
  let at = startAt;
  for (let i = 0; i < frames; i += 1) {
    session.processFrame(landmarks, WIDTH, HEIGHT, at);
    at += stepMs;
  }
  return at;
}

test("지속 오답은 0.4초를 채워야 1회이고, 조건이 풀릴 때까지 다시 세지 않는다", () => {
  const holds = createHoldTracker(0.4);
  assert.deepEqual(holds.update(["coreDrop"], 0.25), []);
  assert.deepEqual(holds.update(["coreDrop"], 0.25), ["coreDrop"]);
  assert.deepEqual(holds.update(["coreDrop"], 1), []);
  assert.equal(holds.isWarning(), true);
  assert.deepEqual(holds.update([], 0.1), []);
  assert.equal(holds.isWarning(), false);
  assert.deepEqual(holds.update(["coreDrop"], 0.5), ["coreDrop"]);
});

test("0.4초 규칙은 FPS와 상관없다", () => {
  const countFor = (seconds, fps) => {
    const holds = createHoldTracker(0.4);
    let total = 0;
    for (let i = 0; i < Math.round(seconds * fps); i += 1) total += holds.update(["hipDrop"], 1 / fps).length;
    return total;
  };
  assert.equal(countFor(0.3, 10), 0);
  assert.equal(countFor(0.3, 60), 0);
  assert.equal(countFor(1, 10), 1);
  assert.equal(countFor(1, 60), 1);
});

test("반복 사이의 지속 오답은 진행 중인 반복을 틀린 반복으로 만든다", () => {
  const { stats } = createSession("pushup", 0, 0);
  applyEvent(stats, { type: "rep", errors: [] });
  applyEvent(stats, { type: "error", key: "coreDrop" });
  applyEvent(stats, { type: "rep", errors: [] });
  applyEvent(stats, { type: "partialRep" });
  assert.equal(stats.reps, 2);
  assert.equal(stats.correctReps, 1);
  assert.equal(stats.errors.pushup.coreDrop, 1);
  assert.equal(stats.errors.pushup.partialRep, 1);
  assert.equal(computeAccuracy(stats), 33); // 1 ÷ (2 + 1)
});

test("기록 양식: session-example.json과 같은 기록을 만든다", () => {
  const { stats } = createSession("squat", 0, 0);
  for (let i = 0; i < 10; i += 1) applyEvent(stats, { type: "rep", errors: [] });
  applyEvent(stats, { type: "rep", errors: ["torsoLean"] });
  applyEvent(stats, { type: "rep", errors: ["heelLift"] });
  applyEvent(stats, { type: "partialRep" });
  applyEvent(stats, { type: "partialRep" });

  const record = buildRecord(stats, "6f2c1a9e-4b7d-4e3a-9c51-2d8e7f0b3a64", "2026-10-27T19:30:12+09:00");
  assert.deepEqual(record, {
    id: "6f2c1a9e-4b7d-4e3a-9c51-2d8e7f0b3a64",
    startedAt: "2026-10-27T19:30:12+09:00",
    exercise: "squat",
    view: "side",
    count: 12,
    accuracy: 71,
    errors: {
      squat: { torsoLean: 1, shinLean: 0, heelLift: 1, partialRep: 2, kneeValgus: 0 },
      pushup: { coreDrop: 0, coreHigh: 0, handForward: 0, handBackward: 0, partialRep: 0 },
      plank: { hipDrop: 0, hipHigh: 0, neckDrop: 0, neckHigh: 0 },
    },
  });
});

test("플랭크: 기록 count는 바른 자세 시간(초, 내림)이고 정확도는 시간 비율이다", () => {
  const { stats } = createSession("plank", 0, 0);
  stats.goodSeconds = 45.9;
  stats.warningSeconds = 5.1;
  assert.equal(sessionCount(stats), 45);
  assert.equal(computeAccuracy(stats), 90);
});

test("플랭크: 몸이 안 보이던 시간은 유지 시간에 넣지 않는다", () => {
  const session = createSession("plank", 0, 0);
  const hidden = fakeLandmarks(PLANK_BODY, { near: 0.2, far: 0.2 });
  let at = play(session, fakeLandmarks(PLANK_BODY), 17, 0); // 첫 프레임은 간격 0 → 16 × 0.125 = 2초
  at = play(session, hidden, 40, at); // 5초 동안 화면 밖
  play(session, fakeLandmarks(PLANK_BODY), 8, at); // 8 × 0.125 = 1초
  assert.equal(session.stats.goodSeconds, 3);
});

test("프레임이 1초 넘게 끊기면(탭 전환 등) 그 시간은 세지 않는다", () => {
  const session = createSession("plank", 0, 0);
  const body = fakeLandmarks(PLANK_BODY);
  for (const at of [0, 500, 5500, 6000]) session.processFrame(body, WIDTH, HEIGHT, at);
  assert.equal(session.stats.goodSeconds, 1);
});

test("카운트다운 동안은 측정하지 않고 남은 초를 안내한다", () => {
  const session = createSession("plank", 0, 10);
  const body = fakeLandmarks(PLANK_BODY);
  assert.equal(session.countdownEndsAt, 10000);
  assert.equal(session.processFrame(body, WIDTH, HEIGHT, 2500).status, STATUS.countdown(8));
  play(session, body, 50, 3000);
  assert.equal(session.stats.goodSeconds, 0);
});

test("사람이 없거나, 정면이거나, 운동 자세가 아니면 측정하지 않는다", () => {
  const session = createSession("pushup", 0, 0);
  assert.equal(session.processFrame(null, WIDTH, HEIGHT, 0).status, STATUS.notVisible);
  const front = fakeLandmarks(STANDING_BODY);
  front[11] = { x: 0.6, y: 0.25, z: 0, visibility: 0.9 };
  front[12] = { x: 0.4, y: 0.25, z: 0, visibility: 0.9 };
  assert.equal(session.processFrame(front, WIDTH, HEIGHT, 100).status, STATUS.notSideView);
  assert.equal(session.processFrame(fakeLandmarks(STANDING_BODY), WIDTH, HEIGHT, 200).status, STATUS.notInPosition);
});

test("푸시업·플랭크: 누운 자세에서 손목·팔꿈치가 어깨 아래면 측정한다", () => {
  for (const exercise of ["pushup", "plank"]) {
    const session = createSession(exercise, 0, 0);
    assert.equal(session.processFrame(fakeLandmarks(PLANK_BODY), WIDTH, HEIGHT, 0).status, STATUS.measuring);
  }
});

test("스쿼트: 선 자세를 한 번 거친 뒤부터 측정한다", () => {
  const session = createSession("squat", 0, 0);
  const sitting = fakeLandmarks({ ...STANDING_BODY, knee: { x: 0.62, y: 0.55 } });
  assert.equal(session.processFrame(sitting, WIDTH, HEIGHT, 0).status, STATUS.notInPosition);
  const at = play(session, fakeLandmarks(STANDING_BODY), 3, 125);
  assert.equal(session.processFrame(fakeLandmarks(STANDING_BODY), WIDTH, HEIGHT, at).status, STATUS.measuring);
  assert.equal(session.processFrame(sitting, WIDTH, HEIGHT, at + 125).status, STATUS.measuring);
});

test("새 세션은 이전 세션의 집계를 이어받지 않는다", () => {
  const first = createSession("squat", 0, 0);
  applyEvent(first.stats, { type: "rep", errors: ["torsoLean"] });
  const second = createSession("squat", 0, 0);
  assert.equal(second.stats.reps, 0);
  assert.equal(second.stats.errors.squat.torsoLean, 0);
});

test("startedAt은 시간대가 붙은 ISO 8601이다", () => {
  const date = new Date(2026, 9, 27, 19, 30, 12);
  const text = toLocalIsoString(date);
  assert.match(text, /^2026-10-27T19:30:12[+-]\d{2}:\d{2}$/);
  assert.equal(new Date(text).getTime(), date.getTime());
});
