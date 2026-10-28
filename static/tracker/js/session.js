// 세션 하나의 상태 흐름, 집계, 기록 만들기, 저장 요청 (HANDOFF 6장, 7.1, 7.5, 7.6)
// DOM을 쓰지 않으므로 녹화한 랜드마크를 넣어 Node 테스트로 그대로 확인할 수 있다.
import {
  COUNTDOWN_SECONDS,
  ERROR_HOLD_SECONDS,
  MAX_FRAME_GAP_SECONDS,
  SMOOTHING_FRAMES,
  STAGE_WARN_MARGIN,
} from "./config.js";
import { ERROR_NAMES, STATUS } from "./catalog.js";
import { createSmoother, measureAngles } from "./geometry.js";
import { readBody } from "./pose-engine.js";
import { createPlankRule } from "./rules/plank.js";
import { createPushupRule } from "./rules/pushup.js";
import { createSquatRule } from "./rules/squat.js";

const RULES = { squat: createSquatRule, pushup: createPushupRule, plank: createPlankRule };

// 지속 오답의 0.4초 규칙 (7.1). 프레임 수가 아니라 시간으로 재므로 기기 FPS와 상관없다.
export function createHoldTracker(holdSeconds) {
  const held = new Map(); // 오답 키 → { seconds: 이어진 시간, counted: 이미 1회로 셌는가 }

  return {
    // holding: 이번 프레임에 조건이 참인 키 목록. 반환: 이번 프레임에 새로 1회가 된 키 목록
    update(holding, dt) {
      for (const key of held.keys()) {
        if (!holding.includes(key)) held.delete(key); // 조건이 풀려야 다시 셀 수 있다
      }
      const confirmed = [];
      for (const key of holding) {
        const entry = held.get(key) ?? { seconds: 0, counted: false };
        entry.seconds += dt;
        if (!entry.counted && entry.seconds >= holdSeconds) {
          entry.counted = true;
          confirmed.push(key);
        }
        held.set(key, entry);
      }
      return confirmed;
    },
    // 1회로 센 오답이 아직 이어지는 중인가 (플랭크 경고 시간)
    isWarning() {
      return [...held.values()].some((entry) => entry.counted);
    },
  };
}

// 집계 초기값. 오답은 3종목 14개 키를 모두 0으로 둔다 (6장)
function createStats(exercise) {
  const errors = {};
  for (const [name, keys] of Object.entries(ERROR_NAMES)) {
    errors[name] = Object.fromEntries(Object.keys(keys).map((key) => [key, 0]));
  }
  return { exercise, reps: 0, correctReps: 0, goodSeconds: 0, warningSeconds: 0, repHasError: false, errors };
}

// 사건 하나를 집계에 반영한다.
// rep: 카운트된 반복(errors는 그 반복의 반복당 오답), partialRep: 범위 미달 시도, error: 1회가 된 지속 오답
export function applyEvent(stats, event) {
  const counts = stats.errors[stats.exercise];
  if (event.type === "rep") {
    stats.reps += 1;
    if (event.errors.length === 0 && !stats.repHasError) stats.correctReps += 1;
    for (const key of event.errors) counts[key] += 1;
    stats.repHasError = false;
  } else if (event.type === "partialRep") {
    counts.partialRep += 1;
    stats.repHasError = false; // 범위 미달로 끝난 시도는 반복에 넣지 않는다
  } else if (event.type === "error") {
    counts[event.key] += 1;
    stats.repHasError = true; // 반복 사이의 지속 오답은 진행 중인 반복에 속한다 (7.5)
  }
}

// 사건이 화면·음성으로 낼 안내 id
function cuesOf(event) {
  if (event.type === "rep") return event.errors;
  if (event.type === "partialRep") return [event.cue ?? "partialRep"];
  return [event.key];
}

// 지표의 화면 단계 (추가 기능 F2): 기준을 넘으면 bad(수정), 기준까지 STAGE_WARN_MARGIN 이내면 warn(주의)
export function stageOf(margin) {
  if (margin < 0) return "bad";
  if (margin <= STAGE_WARN_MARGIN) return "warn";
  return "good";
}

// 측정하지 않는 프레임의 결과
function statusOnly(status, angles = null) {
  return { status, cues: [], success: false, angles, events: [], indicators: [], points: null };
}

// 세션을 만든다. 만든 순간이 시작이고, countdownSeconds 뒤부터 측정한다.
// 시작할 때마다 새로 만들므로 이전 세션의 횟수·오답·타이머가 섞이지 않는다 (7.6)
export function createSession(exercise, now, countdownSeconds = COUNTDOWN_SECONDS) {
  const rule = RULES[exercise]();
  const smooth = createSmoother(SMOOTHING_FRAMES);
  const holds = createHoldTracker(ERROR_HOLD_SECONDS);
  const stats = createStats(exercise);
  const measureFrom = now + countdownSeconds * 1000;
  let lastFrameAt = null;

  // 직전 프레임과의 간격(초). 측정하지 않는 프레임에서도 갱신해야 빠진 시간이 나중에 더해지지 않는다.
  function elapsed(frameAt) {
    const seconds = lastFrameAt === null ? 0 : (frameAt - lastFrameAt) / 1000;
    lastFrameAt = frameAt;
    return seconds > MAX_FRAME_GAP_SECONDS ? 0 : seconds;
  }

  // 측정 중인 프레임: 규칙 판정 → 0.4초 규칙 → 집계 → 시간 누적
  function judge(angles, points, dt) {
    const { events, holding, indicators } = rule.update(angles, points);
    const confirmed = holds.update(holding, dt).map((key) => ({ type: "error", key }));
    const cues = [];
    let success = false;
    // 같은 프레임이면 지속 오답을 먼저 반영한다. 그 오답은 지금 끝나는 반복에 속하기 때문이다.
    for (const event of [...confirmed, ...events]) {
      const correctBefore = stats.correctReps;
      applyEvent(stats, event);
      if (stats.correctReps > correctBefore) success = true;
      cues.push(...cuesOf(event));
    }
    const warning = holds.isWarning();
    if (warning) stats.warningSeconds += dt;
    else stats.goodSeconds += dt;
    return {
      status: warning ? null : STATUS.measuring,
      cues,
      success,
      angles,
      events,
      indicators: indicators.map((indicator) => ({ ...indicator, stage: stageOf(indicator.margin) })),
      points,
    };
  }

  return {
    stats,
    // 프레임 1장을 처리한다. landmarks는 MediaPipe 결과(사람이 없으면 null), frameAt은 밀리초다.
    // 반환: status(상태 문구, 없으면 null), cues(오답 안내 id), success(올바른 반복 완료),
    //       angles(다듬은 각도), events(이번 프레임에 끝난 반복·범위 미달과 그 판정 값),
    //       indicators(지표와 화면 단계, 측정 중일 때만), points(판정에 쓴 한쪽 몸의 픽셀 좌표, 측정 중일 때만)
    processFrame(landmarks, width, height, frameAt) {
      const dt = elapsed(frameAt);
      if (frameAt < measureFrom) {
        return statusOnly(STATUS.countdown(Math.ceil((measureFrom - frameAt) / 1000)));
      }
      if (!landmarks) return statusOnly(STATUS.notVisible);
      const body = readBody(landmarks, width, height);
      if (!body.visible) return statusOnly(STATUS.notVisible);
      if (!body.sideView) return statusOnly(STATUS.notSideView);
      const angles = smooth(measureAngles(body.points));
      if (!rule.isInPosition(angles, body.points)) return statusOnly(STATUS.notInPosition, angles);
      return judge(angles, body.points, dt);
    },
  };
}

// 기록의 count: 스쿼트·푸시업은 카운트된 반복 수, 플랭크는 바른 자세 시간(초, 내림)
export function sessionCount(stats) {
  return stats.exercise === "plank" ? Math.floor(stats.goodSeconds) : stats.reps;
}

// 정확도 0~100 (7.5). 아직 시도가 없으면 null
export function computeAccuracy(stats) {
  if (stats.exercise === "plank") {
    const total = stats.goodSeconds + stats.warningSeconds;
    return total > 0 ? Math.round((stats.goodSeconds / total) * 100) : null;
  }
  const attempts = stats.reps + stats.errors[stats.exercise].partialRep;
  return attempts > 0 ? Math.round((stats.correctReps / attempts) * 100) : null;
}

// 공통 기록 양식 1건 (6장)
export function buildRecord(stats, id, startedAt) {
  return {
    id,
    startedAt,
    exercise: stats.exercise,
    view: "side",
    count: sessionCount(stats),
    accuracy: computeAccuracy(stats),
    errors: structuredClone(stats.errors),
  };
}

// 시간대가 붙은 ISO 8601 문자열 (예: 2026-10-27T19:30:12+09:00)
export function toLocalIsoString(date) {
  const pad = (number) => String(number).padStart(2, "0");
  const offset = -date.getTimezoneOffset(); // 분 단위. 한국은 +540
  const sign = offset >= 0 ? "+" : "-";
  const zone = `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${day}T${time}${zone}`;
}

// 기록 1건을 서버에 저장한다 (6장 API). 201이 아니면 실패다.
export async function saveRecord(record) {
  const response = await fetch("/api/records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
  if (response.status !== 201) throw new Error(`저장 실패 (${response.status})`);
}
