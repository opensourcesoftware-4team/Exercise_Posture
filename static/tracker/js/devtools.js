// 개발용 도구: 실시간 각도, 반복별 판정 값, 랜드마크 녹화 (HANDOFF 9장. 기준값 조정과 tests/fixtures용)
import { ERROR_NAMES, MEASURE_LABELS } from "./catalog.js";

const CAPTURE_SECONDS = 10; // 랜드마크 녹화 길이 (스쿼트 3~4회)
const LOG_SIZE = 10; // 반복별 판정 값을 몇 개까지 보여 줄지

function formatAngles(angles) {
  return Object.entries(angles)
    .map(([name, value]) => `${name} ${Math.round(value)}°`)
    .join(" · ");
}

// 예: "✖ 상체 과다 숙임 | 깊이 92° · 몸통-정강이 18° · 발 각도 변화 3°"
function describeAttempt(exercise, event) {
  const names = ERROR_NAMES[exercise];
  let verdict = "✔ 올바른 반복";
  if (event.type === "partialRep") verdict = "△ 범위 미달";
  else if (event.errors.length > 0) verdict = `✖ ${event.errors.map((key) => names[key]).join(", ")}`;
  const values = Object.entries(event.measures ?? {})
    .filter(([, value]) => value !== null)
    .map(([key, value]) => `${MEASURE_LABELS[key]} ${Math.round(value)}°`);
  return `${verdict} | ${values.join(" · ")}`;
}

// 파일 크기를 줄이려고 판정에 쓰지 않는 z는 빼고 소수 넷째 자리까지만 남긴다 (1280px 영상에서 0.1px 차이)
function compact(landmarks) {
  const round = (value) => Math.round(value * 10000) / 10000;
  return landmarks?.map(({ x, y, visibility }) => ({ x: round(x), y: round(y), visibility: round(visibility) })) ?? null;
}

function download(filename, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// elements: angles(실시간 각도 글자), attemptLog(판정 값 목록), captureButton(녹화 버튼)
export function createDevTools(elements, video) {
  const idleLabel = `랜드마크 ${CAPTURE_SECONDS}초 녹화`;
  let log = [];
  let capture = null; // 녹화 중이면 { exercise, frames, until }

  return {
    reset() {
      log = [];
      elements.attemptLog.textContent = "";
    },

    setRunning(running) {
      elements.captureButton.disabled = !running;
      elements.captureButton.textContent = idleLabel;
      if (!running) capture = null;
    },

    startCapture(exercise, now) {
      capture = { exercise, frames: [], until: now + CAPTURE_SECONDS * 1000 };
      elements.captureButton.textContent = "녹화 중...";
    },

    // 프레임마다: 녹화 중이면 랜드마크를 모으고, 시간이 다 되면 JSON 파일로 내려받는다
    frame(landmarks, now) {
      if (!capture) return;
      capture.frames.push({ t: now, width: video.videoWidth, height: video.videoHeight, landmarks: compact(landmarks) });
      if (now < capture.until) return;
      download(`landmarks-${capture.exercise}-${Date.now()}.json`, { exercise: capture.exercise, frames: capture.frames });
      capture = null;
      elements.captureButton.textContent = idleLabel;
    },

    // 프레임마다: 실시간 각도와, 이번 프레임에 끝난 반복의 판정 값
    show(view, exercise) {
      elements.angles.textContent = view.angles ? formatAngles(view.angles) : "";
      if (view.events.length === 0) return;
      log = [...view.events.map((event) => describeAttempt(exercise, event)).reverse(), ...log].slice(0, LOG_SIZE);
      elements.attemptLog.textContent = log.join("\n");
    },
  };
}
