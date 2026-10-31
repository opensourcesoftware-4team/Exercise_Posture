import assert from "node:assert/strict";
import { test } from "node:test";
import { computeAccuracy, createSession, sessionCount } from "../../static/tracker/js/session.js";
import { fakeLandmarks, HEIGHT, proneBody, WIDTH } from "./fake-landmarks.js";

// pose 자세로 frames장을 125ms 간격(0.125초는 2진수로 정확하다)으로 넣는다. 다음 프레임 시각을 돌려준다.
function hold(session, pose, frames, startAt = 0) {
  const views = [];
  for (let i = 0; i < frames; i += 1) {
    views.push(session.processFrame(fakeLandmarks(proneBody(pose)), WIDTH, HEIGHT, startAt + i * 125));
  }
  return { views, next: startAt + frames * 125 };
}

const allCues = (views) => views.flatMap((view) => view.cues);

test("바른 자세로 2초 버티면 유지 시간 2초, 정확도 100%", () => {
  const session = createSession("plank", 0, 0);
  const { views } = hold(session, {}, 17); // 첫 프레임은 간격 0 → 16 × 0.125 = 2초
  assert.equal(session.stats.goodSeconds, 2);
  assert.equal(sessionCount(session.stats), 2);
  assert.equal(computeAccuracy(session.stats), 100);
  assert.deepEqual(allCues(views), []);
});

test("엉덩이가 처진 채 0.4초가 지나면 hipDrop 1회, 그 뒤 시간은 경고 시간이다", () => {
  const session = createSession("plank", 0, 0);
  const { views } = hold(session, { sag: 80 }, 17);
  assert.equal(session.stats.errors.plank.hipDrop, 1);
  assert.equal(session.stats.goodSeconds, 0.375); // 1회가 되기 전(0.4초 미만)은 바른 자세 시간
  assert.equal(session.stats.warningSeconds, 1.625);
  assert.equal(computeAccuracy(session.stats), 19); // 0.375 ÷ 2
  assert.deepEqual(allCues(views), ["hipDrop"]);
});

test("엉덩이가 솟으면 hipHigh다 (hipDrop과 동시에 나오지 않는다)", () => {
  const session = createSession("plank", 0, 0);
  hold(session, { sag: -80 }, 17);
  assert.equal(session.stats.errors.plank.hipHigh, 1);
  assert.equal(session.stats.errors.plank.hipDrop, 0);
});

test("귀가 어깨-엉덩이 연장선 아래로 떨어지면 neckDrop, 위로 들리면 neckHigh", () => {
  const drop = createSession("plank", 0, 0);
  hold(drop, { headDrop: 50 }, 17);
  assert.equal(drop.stats.errors.plank.neckDrop, 1);
  assert.equal(drop.stats.errors.plank.neckHigh, 0);

  const high = createSession("plank", 0, 0);
  hold(high, { headDrop: -90 }, 17);
  assert.equal(high.stats.errors.plank.neckHigh, 1);
  assert.equal(high.stats.errors.plank.neckDrop, 0);
});

test("자세를 바로잡았다가 다시 무너지면 한 번 더 센다", () => {
  const session = createSession("plank", 0, 0);
  let { next } = hold(session, { sag: 80 }, 8);
  ({ next } = hold(session, {}, 8, next));
  hold(session, { sag: 80 }, 8, next);
  assert.equal(session.stats.errors.plank.hipDrop, 2);
});

test("엉덩이와 고개가 함께 무너지면 둘 다 세고 한 번에 함께 안내한다", () => {
  const session = createSession("plank", 0, 0);
  const { views } = hold(session, { sag: 80, headDrop: 50 }, 17);
  assert.equal(session.stats.errors.plank.hipDrop, 1);
  assert.equal(session.stats.errors.plank.neckDrop, 1);
  assert.deepEqual(views.find((view) => view.cues.length > 0).cues, ["hipDrop", "neckDrop"]);
});
