import assert from "node:assert/strict";
import { test } from "node:test";
import { displayStage, MODES, pickPracticeHint } from "../../static/tracker/js/modes.js";

test("수행 모드는 숫자·효과음·저장이 켜져 있고, 연습 모드는 모두 꺼져 있다", () => {
  assert.deepEqual(
    [MODES.record.showNumbers, MODES.record.sounds, MODES.record.save, MODES.record.badge],
    [true, true, true, false],
  );
  assert.deepEqual(
    [MODES.practice.showNumbers, MODES.practice.sounds, MODES.practice.save, MODES.practice.badge],
    [false, false, false, true],
  );
});

test("연습 모드에서는 빨강(수정) 단계도 주황(주의)으로 보인다", () => {
  assert.equal(displayStage("bad", MODES.record), "bad");
  assert.equal(displayStage("bad", MODES.practice), "warn");
  assert.equal(displayStage("good", MODES.practice), "good");
});

test("연습 힌트는 걸린 것 중 우선순위가 가장 높은 하나만 고른다", () => {
  // 스쿼트 순서: 뒤꿈치 > 상체 숙임 > 정강이 > 깊이 부족
  assert.equal(pickPracticeHint("squat", ["partialRep", "torsoLean", "heelLift"]), "뒤꿈치를 바닥에 붙여 볼까요?");
  assert.equal(pickPracticeHint("squat", ["partialRep", "torsoLean"]), "가슴을 조금만 세워 볼까요?");
  assert.equal(pickPracticeHint("squat", ["partialRep"]), "조금만 더 앉아 볼까요?");
  assert.equal(pickPracticeHint("squat", []), null);
});

test("연습 힌트는 위·아래 오답 키를 하나의 문구로 묶는다", () => {
  const line = "배에 힘을 주고 몸을 일직선으로 만들어 볼까요?";
  assert.equal(pickPracticeHint("pushup", ["coreDrop"]), line);
  assert.equal(pickPracticeHint("pushup", ["coreHigh", "handForward"]), line);
  assert.equal(pickPracticeHint("pushup", ["partialRepLockout"]), "팔을 끝까지 펴 볼까요?");
  assert.equal(pickPracticeHint("plank", ["neckHigh"]), "시선을 바닥 조금 앞쪽에 두어 볼까요?");
});
