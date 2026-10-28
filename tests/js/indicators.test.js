import assert from "node:assert/strict";
import { test } from "node:test";
import { PLANK, PUSHUP, SQUAT, STAGE_WARN_MARGIN } from "../../static/tracker/js/config.js";
import { createSession, stageOf } from "../../static/tracker/js/session.js";
import { fakeLandmarks, HEIGHT, proneBody, squatBody, WIDTH } from "./fake-landmarks.js";

// 같은 자세를 frames장 넣고 마지막 프레임 결과를 돌려준다 (40ms 간격)
function lastView(session, body, frames = 10) {
  let view = null;
  for (let i = 0; i < frames; i += 1) view = session.processFrame(fakeLandmarks(body), WIDTH, HEIGHT, i * 40);
  return view;
}

const find = (view, key) => view.indicators.find((indicator) => indicator.key === key);

test("단계: 기준을 넘으면 수정(bad), 기준까지 5° 이내면 주의(warn), 그보다 여유가 있으면 정상(good)", () => {
  assert.equal(STAGE_WARN_MARGIN, 5);
  assert.equal(stageOf(-0.1), "bad");
  assert.equal(stageOf(0), "warn");
  assert.equal(stageOf(5), "warn");
  assert.equal(stageOf(5.1), "good");
});

test("스쿼트 지표: 몸통-정강이 값과 기준까지의 여유, 걸리면 기록될 오답 키를 준다", () => {
  const view = lastView(createSession("squat", 0, 0), squatBody(0, { torso: 30, shin: 25 }));
  const torsoShin = find(view, "torsoShin");
  assert.equal(Math.round(torsoShin.value), 5);
  assert.equal(Math.round(torsoShin.margin), SQUAT.TORSO_SHIN_LIMIT - 5);
  assert.equal(torsoShin.stage, "good");
  assert.equal(torsoShin.errorKey, "torsoLean");
  assert.equal(Math.round(find(view, "heelRise").value), 0);
});

test("스쿼트 지표: 정강이 쪽으로 기울면 오답 키가 shinLean이고, 기준에 가까우면 주의다", () => {
  // 몸통-정강이 각 -22°: 기준 25°까지 3° 남음
  const view = lastView(createSession("squat", 0, 0), squatBody(0, { torso: 3, shin: 25 }));
  const torsoShin = find(view, "torsoShin");
  assert.equal(torsoShin.errorKey, "shinLean");
  assert.equal(torsoShin.stage, "warn");
});

test("푸시업·플랭크: 빨강(bad)이 되는 순간과 지속 오답이 쌓이기 시작하는 순간이 같다 (같은 값을 쓴다)", () => {
  for (const [exercise, key, limit] of [
    ["pushup", "coreDrop", PUSHUP.ALIGN_MIN],
    ["plank", "hipDrop", PLANK.ALIGN_MIN],
  ]) {
    const session = createSession(exercise, 0, 0);
    const view = lastView(session, proneBody({ sag: 80 }), 20); // 0.8초 동안 처짐
    const bodyLine = find(view, "bodyLine");
    assert.ok(bodyLine.value < limit);
    assert.equal(bodyLine.stage, "bad");
    assert.equal(bodyLine.errorKey, key);
    assert.equal(session.stats.errors[exercise][key], 1);
  }
});

test("푸시업 손 위치 지표는 팔을 폈을 때만 나온다", () => {
  assert.ok(find(lastView(createSession("pushup", 0, 0), proneBody({ elbow: 180 })), "armLean"));
  assert.equal(find(lastView(createSession("pushup", 0, 0), proneBody({ elbow: 100 })), "armLean"), undefined);
});

test("측정하지 않는 프레임에는 지표와 좌표가 없다", () => {
  const view = createSession("plank", 0, 10).processFrame(fakeLandmarks(proneBody()), WIDTH, HEIGHT, 0);
  assert.deepEqual(view.indicators, []);
  assert.equal(view.points, null);
});
