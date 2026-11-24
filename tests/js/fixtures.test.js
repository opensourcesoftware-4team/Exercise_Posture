import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { ERROR_NAMES } from "../../static/tracker/js/catalog.js";
import { createSession, sessionCount } from "../../static/tracker/js/session.js";

// 트래커의 '랜드마크 녹화'로 받은 파일에 expected를 적어 tests/fixtures/에 두면,
// 카메라 없이 같은 판정이 나오는지 다시 확인한다 (HANDOFF 9장, 형식은 tests/fixtures/README.md)
const FIXTURES = new URL("../fixtures/", import.meta.url);

for (const name of readdirSync(FIXTURES).filter((file) => file.endsWith(".json"))) {
  const fixture = JSON.parse(readFileSync(new URL(name, FIXTURES), "utf-8"));

  test(`녹화 재생: ${name}`, { skip: !fixture.expected && "expected가 없다" }, () => {
    const session = createSession(fixture.exercise, fixture.frames[0].t, 0);
    for (const frame of fixture.frames) {
      session.processFrame(frame.landmarks, frame.width, frame.height, frame.t);
    }

    const { count, correctReps, errors = {} } = fixture.expected;
    assert.equal(sessionCount(session.stats), count, "count");
    if (correctReps !== undefined) assert.equal(session.stats.correctReps, correctReps, "correctReps");
    for (const key of Object.keys(ERROR_NAMES[fixture.exercise])) {
      assert.equal(session.stats.errors[fixture.exercise][key], errors[key] ?? 0, key);
    }
  });
}
