// 트래커 화면 연결: 버튼, 카메라, 프레임 반복, 결과 표시
import { ERROR_NAMES, EXERCISE_NAMES, MEASURE_LABELS, STATUS } from "./catalog.js";
import { createFeedback } from "./feedback.js";
import { createPoseEngine, startCamera, stopCamera } from "./pose-engine.js";
import { buildRecord, computeAccuracy, createSession, saveRecord, sessionCount, toLocalIsoString } from "./session.js";

const RECORD_SECONDS = 10; // 개발용 랜드마크 녹화 길이 (스쿼트 3~4회)

const byId = (id) => document.getElementById(id);
const video = byId("webcam");
const canvas = byId("pose-canvas");
const exerciseSelect = byId("exercise-select");
const startButton = byId("start-button");
const finishButton = byId("finish-button");
const recordButton = byId("record-button");
const feedback = createFeedback({
  message: byId("feedback-message"),
  panel: byId("panel"),
  count: byId("count-display"),
  accuracyText: byId("accuracy-text"),
  accuracyBar: byId("accuracy-bar"),
});

let engine = null;
let session = null; // 진행 중인 세션. 없으면 null
let startedAt = null; // 기록의 startedAt: 시작 버튼을 누른 시각
let frameRequest = 0;
let lastVideoTime = -1;
let recording = null; // 개발용 녹화: { frames, until }
let attemptLog = []; // 개발용: 최근 반복의 판정 값 (최신이 위)

loadEngine();
startButton.addEventListener("click", start);
finishButton.addEventListener("click", finish);
recordButton.addEventListener("click", startRecording);

async function loadEngine() {
  feedback.status(STATUS.loading, 0);
  try {
    engine = await createPoseEngine(canvas);
  } catch (error) {
    console.error(error);
    feedback.status(STATUS.loadError, 0);
    return;
  }
  startButton.disabled = false;
  feedback.status(STATUS.ready, 0);
}

// 시작: 카메라를 켜고 새 세션을 만든 뒤 프레임 반복을 한 번만 시작한다
async function start() {
  startButton.disabled = true; // 카메라를 켜는 동안 두 번 눌리지 않게 막는다
  feedback.unlockAudio();
  try {
    await startCamera(video);
  } catch (error) {
    console.error(error);
    feedback.status(STATUS.cameraError, performance.now());
    startButton.disabled = false;
    return;
  }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  byId("stage").style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
  byId("result").hidden = true;
  attemptLog = [];
  byId("attempt-log").textContent = "";
  feedback.reset();
  session = createSession(exerciseSelect.value, performance.now());
  startedAt = new Date();
  setRunning(true);
  frameRequest = requestAnimationFrame(loop);
}

// 종료: 반복과 카메라를 멈추고 결과를 보여 준다
function finish() {
  cancelAnimationFrame(frameRequest);
  stopCamera(video);
  setRunning(false);
  recording = null;
  const { stats } = session;
  session = null;
  showResult(stats);
}

// 영상에 새 프레임이 나올 때마다 한 번 분석한다
function loop() {
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const now = performance.now();
    const landmarks = engine.detect(video, now);
    engine.draw(landmarks);
    recordFrame(landmarks, now);
    render(session.processFrame(landmarks, video.videoWidth, video.videoHeight, now), now);
  }
  frameRequest = requestAnimationFrame(loop);
}

function render(view, now) {
  if (view.status) feedback.status(view.status, now);
  feedback.cues(session.stats.exercise, view.cues, now);
  if (view.success) feedback.success();
  feedback.progress(progressText(session.stats), computeAccuracy(session.stats));
  byId("angles-view").textContent = view.angles ? formatAngles(view.angles) : "";
  if (view.events.length > 0) logAttempts(view.events);
}

// 개발용: 반복마다 판정 결과와 그 근거 값을 최근 10개까지 보여 준다 (기준값을 조정할 때 쓴다)
function logAttempts(events) {
  attemptLog = [...events.map(describeAttempt).reverse(), ...attemptLog].slice(0, 10);
  byId("attempt-log").textContent = attemptLog.join("\n");
}

// 예: "✖ 상체 과다 숙임 | 깊이 92° · 몸통-정강이 18° · 발 각도 변화 3°"
function describeAttempt(event) {
  const names = ERROR_NAMES[session.stats.exercise];
  let verdict = "✔ 올바른 반복";
  if (event.type === "partialRep") verdict = "△ 범위 미달";
  else if (event.errors.length > 0) verdict = `✖ ${event.errors.map((key) => names[key]).join(", ")}`;
  const values = Object.entries(event.measures ?? {})
    .filter(([, value]) => value !== null)
    .map(([key, value]) => `${MEASURE_LABELS[key]} ${Math.round(value)}°`);
  return `${verdict} | ${values.join(" · ")}`;
}

// 스쿼트·푸시업은 "전체 n회 / 올바른 n회", 플랭크는 바른 자세 유지 시간 (7.3)
function progressText(stats) {
  if (stats.exercise === "plank") return `${sessionCount(stats)}초`;
  return `전체 ${stats.reps}회 / 올바른 ${stats.correctReps}회`;
}

function formatAngles(angles) {
  return Object.entries(angles)
    .map(([name, value]) => `${name} ${Math.round(value)}°`)
    .join(" · ");
}

// 진행 중에는 종목을 바꾸거나 다시 시작할 수 없다
function setRunning(running) {
  exerciseSelect.disabled = running;
  startButton.disabled = running;
  finishButton.disabled = !running;
  recordButton.disabled = !running;
  recordButton.textContent = `랜드마크 ${RECORD_SECONDS}초 녹화`;
}

// 기록할 운동이 있을 때(count > 0)만 기록을 만들어 저장한다. 저장 조건은 이것 하나다 (7.6)
async function showResult(stats) {
  byId("result").hidden = false;
  const summary = byId("result-summary");
  const status = byId("result-status");
  const json = byId("result-json");
  if (sessionCount(stats) <= 0) {
    summary.textContent = STATUS.noRecord;
    status.textContent = "";
    json.textContent = "";
    return;
  }
  const record = buildRecord(stats, crypto.randomUUID(), toLocalIsoString(startedAt));
  summary.textContent = summarize(record);
  json.textContent = JSON.stringify(record, null, 2);
  status.textContent = "저장하는 중...";
  try {
    await saveRecord(record);
    status.textContent = "기록을 저장했어요.";
  } catch (error) {
    status.textContent = `서버에 저장하지 못했어요. (${error.message})`;
  }
}

// 예: "스쿼트 12회 · 정확도 71% · 상체 과다 숙임 1회 · 범위 미달 2회"
function summarize(record) {
  const unit = record.exercise === "plank" ? "초" : "회";
  const names = ERROR_NAMES[record.exercise];
  const errors = Object.entries(record.errors[record.exercise])
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${names[key]} ${count}회`);
  const head = `${EXERCISE_NAMES[record.exercise]} ${record.count}${unit}`;
  return [head, `정확도 ${record.accuracy}%`, ...errors].join(" · ");
}

// 개발용: 지금부터 몇 초 동안의 랜드마크를 JSON 파일로 내려받는다 (HANDOFF 9장, tests/fixtures용)
function startRecording() {
  recording = { frames: [], until: performance.now() + RECORD_SECONDS * 1000 };
  recordButton.textContent = "녹화 중...";
}

// 파일 크기를 줄이려고 판정에 쓰지 않는 z는 빼고 소수 넷째 자리까지만 남긴다 (1280px 영상에서 0.1px 차이)
function compact(landmarks) {
  const round = (value) => Math.round(value * 10000) / 10000;
  return landmarks?.map(({ x, y, visibility }) => ({ x: round(x), y: round(y), visibility: round(visibility) })) ?? null;
}

function recordFrame(landmarks, now) {
  if (!recording) return;
  recording.frames.push({ t: now, width: video.videoWidth, height: video.videoHeight, landmarks: compact(landmarks) });
  if (now < recording.until) return;
  const exercise = session.stats.exercise;
  download(`landmarks-${exercise}-${Date.now()}.json`, { exercise, frames: recording.frames });
  recording = null;
  recordButton.textContent = `랜드마크 ${RECORD_SECONDS}초 녹화`;
}

function download(filename, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
