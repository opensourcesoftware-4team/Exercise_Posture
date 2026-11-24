import assert from "node:assert/strict";
import { test } from "node:test";
import { computeAccuracy, createSession } from "../../static/tracker/js/session.js";
import { fakeLandmarks, HEIGHT, proneBody, WIDTH } from "./fake-landmarks.js";

// 팔꿈치 각을 keys 사이로 10프레임씩 바꾸고, 지점마다 3프레임(처음·끝은 5프레임) 머문다
function elbowPath(keys) {
  const path = Array(5).fill(keys[0]);
  for (let k = 1; k < keys.length; k += 1) {
    for (let i = 1; i <= 10; i += 1) path.push(keys[k - 1] + ((keys[k] - keys[k - 1]) * i) / 10);
    path.push(...Array(k === keys.length - 1 ? 5 : 3).fill(keys[k]));
  }
  return path;
}

// 팔꿈치 각 목록을 25fps(40ms 간격)로 넣는다. pose는 팔꿈치 각을 뺀 나머지 자세(sag, armLean 등)다.
function play(session, elbows, pose = {}, startAt = 0) {
  return elbows.map((elbow, i) =>
    session.processFrame(fakeLandmarks(proneBody({ ...pose, elbow })), WIDTH, HEIGHT, startAt + i * 40),
  );
}

const allCues = (views) => views.flatMap((view) => view.cues);
const FULL_REP = elbowPath([180, 80, 180]);

test("팔꿈치가 90° 이하까지 굽었다가 160° 이상으로 펴지면 1회, 오답이 없으면 올바른 반복이다", () => {
  const session = createSession("pushup", 0, 0);
  const views = play(session, FULL_REP);
  assert.equal(session.stats.reps, 1);
  assert.equal(session.stats.correctReps, 1);
  assert.deepEqual(allCues(views), []);
  assert.ok(views.some((view) => view.success));
});

test("125° 아래로 내려갔지만 90°에 못 미치고 펴면 범위 미달 ① (가슴을 더 내리라는 안내)", () => {
  const session = createSession("pushup", 0, 0);
  const views = play(session, elbowPath([180, 105, 180]));
  assert.equal(session.stats.reps, 0);
  assert.equal(session.stats.errors.pushup.partialRep, 1);
  assert.deepEqual(allCues(views), ["partialRepShallow"]);
});

test("125°까지도 내려가지 않은 작은 움직임은 반복 시도로 보지 않는다", () => {
  const session = createSession("pushup", 0, 0);
  play(session, elbowPath([180, 130, 180]));
  assert.equal(session.stats.reps, 0);
  assert.equal(session.stats.errors.pushup.partialRep, 0);
});

test("바닥을 찍고 160°까지 펴지 않은 채 다시 내려가면 범위 미달 ② (팔을 끝까지 펴라는 안내), 다음 반복은 센다", () => {
  const session = createSession("pushup", 0, 0);
  const views = play(session, elbowPath([180, 80, 140, 80, 180]));
  assert.equal(session.stats.errors.pushup.partialRep, 1);
  assert.equal(session.stats.reps, 1);
  assert.deepEqual(allCues(views), ["partialRepLockout"]);
  assert.equal(computeAccuracy(session.stats), 50); // 1 ÷ (1 + 1)
});

test("바닥 근처에서 125°를 넘지 않고 흔들리는 것은 범위 미달 ②가 아니다", () => {
  const session = createSession("pushup", 0, 0);
  play(session, elbowPath([180, 80, 115, 80, 180]));
  assert.equal(session.stats.errors.pushup.partialRep, 0);
  assert.equal(session.stats.reps, 1);
});

test("허리가 처진 채(몸통 정렬 160° 미만, 엉덩이가 선 아래) 0.4초가 지나면 coreDrop 1회, 그 반복은 틀린 반복이다", () => {
  const session = createSession("pushup", 0, 0);
  const views = play(session, FULL_REP, { sag: 80 });
  assert.equal(session.stats.errors.pushup.coreDrop, 1);
  assert.equal(session.stats.reps, 1);
  assert.equal(session.stats.correctReps, 0);
  assert.deepEqual(allCues(views), ["coreDrop"]);
});

test("엉덩이가 선 위로 솟으면 coreHigh다 (coreDrop과 동시에 나오지 않는다)", () => {
  const session = createSession("pushup", 0, 0);
  play(session, FULL_REP, { sag: -80 });
  assert.equal(session.stats.errors.pushup.coreHigh, 1);
  assert.equal(session.stats.errors.pushup.coreDrop, 0);
});

test("0.4초보다 짧게 처진 것은 세지 않는다", () => {
  const session = createSession("pushup", 0, 0);
  const at = play(session, Array(10).fill(180)).length * 40;
  play(session, Array(8).fill(180), { sag: 80 }, at); // 0.32초
  play(session, Array(10).fill(180), {}, at + 8 * 40);
  assert.equal(session.stats.errors.pushup.coreDrop, 0);
});

test("팔을 편 자세에서 손이 어깨보다 15° 넘게 앞이면 handForward, 뒤면 handBackward", () => {
  const forward = createSession("pushup", 0, 0);
  play(forward, Array(20).fill(180), { armLean: 25 });
  assert.equal(forward.stats.errors.pushup.handForward, 1);

  const backward = createSession("pushup", 0, 0);
  play(backward, Array(20).fill(180), { armLean: -25 });
  assert.equal(backward.stats.errors.pushup.handBackward, 1);
});

test("팔이 바닥에 수직이면 몸이 기울어 있어도 손 위치 오답이 아니다", () => {
  // 팔을 편 위쪽 자세에서 몸은 약 24° 기울어 있다. 옛 정의(엉덩이-어깨-손목 90°±10°)로는 약 66°라 오답이었다.
  const session = createSession("pushup", 0, 0);
  const views = play(session, Array(20).fill(180));
  assert.deepEqual(allCues(views), []);
});

test("정확도 = 올바른 반복 ÷ (카운트된 반복 + 범위 미달)", () => {
  const session = createSession("pushup", 0, 0);
  const shallow = elbowPath([180, 105, 180]);
  let at = 0;
  for (const elbows of [FULL_REP, FULL_REP, shallow]) {
    play(session, elbows, {}, at);
    at += elbows.length * 40;
  }
  play(session, FULL_REP, { sag: 80 }, at);
  assert.equal(session.stats.reps, 3);
  assert.equal(session.stats.correctReps, 2);
  assert.equal(session.stats.errors.pushup.partialRep, 1);
  assert.equal(computeAccuracy(session.stats), 50); // 2 ÷ (3 + 1)
});
