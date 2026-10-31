// 트래커 화면 연결: 버튼, 카메라, 프레임 반복, 결과 표시
import { ERROR_NAMES, EXERCISE_NAMES, MODE_TEXT, STATUS } from "./catalog.js";
import { createDevTools } from "./devtools.js";
import { createFeedback } from "./feedback.js";
import { MODES, pickPracticeHint } from "./modes.js";
import { drawOverlay } from "./overlay.js";
import { createPanel } from "./panel.js";
import { createPoseEngine, startCamera, stopCamera } from "./pose-engine.js";
import { buildRecord, computeAccuracy, createSession, saveRecord, sessionCount, toLocalIsoString } from "./session.js";

const PARTIAL_HINT_MS = 3000; // 연습 모드에서 범위 미달 힌트를 보여 주는 시간

const byId = (id) => document.getElementById(id);
const video = byId("webcam");
const canvas = byId("pose-canvas");
const context = canvas.getContext("2d");
const exerciseSelect = byId("exercise-select");
const startButtons = [byId("start-record"), byId("start-practice")];
const finishButton = byId("finish-button");
const feedback = createFeedback({
  message: byId("feedback-message"),
  panel: byId("panel"),
  count: byId("count-display"),
  accuracyText: byId("accuracy-text"),
  accuracyBar: byId("accuracy-bar"),
  hint: byId("practice-hint"),
});
const panel = createPanel({
  indicators: byId("indicators"),
  gauge: byId("depth-gauge"),
  track: byId("depth-track"),
  fill: byId("depth-fill"),
  value: byId("depth-value"),
});
const devTools = createDevTools(
  { angles: byId("angles-view"), attemptLog: byId("attempt-log"), captureButton: byId("capture-button") },
  video,
);

let engine = null;
let session = null; // 진행 중인 세션. 없으면 null
let mode = MODES.record; // 지금 세션의 모드 (modes.js)
let startedAt = null; // 기록의 startedAt: 시작 버튼을 누른 시각
let frameRequest = 0;
let lastVideoTime = -1;
let partialHint = null; // 연습 모드: 방금 끝난 범위 미달 { cue, until }

loadEngine();
byId("start-record").addEventListener("click", () => start("record"));
byId("start-practice").addEventListener("click", () => start("practice"));
finishButton.addEventListener("click", finish);
byId("capture-button").addEventListener("click", () => devTools.startCapture(session.stats.exercise, performance.now()));

async function loadEngine() {
  feedback.status(STATUS.loading, 0);
  try {
    engine = await createPoseEngine(canvas);
  } catch (error) {
    console.error(error);
    feedback.status(STATUS.loadError, 0);
    return;
  }
  setStartEnabled(true);
  feedback.status(STATUS.ready, 0);
}

function setStartEnabled(enabled) {
  for (const button of startButtons) button.disabled = !enabled;
}

// 시작: 카메라를 켜고, 고른 모드로 새 세션을 만든 뒤 프레임 반복을 한 번만 시작한다
async function start(modeName) {
  setStartEnabled(false); // 카메라를 켜는 동안 두 번 눌리지 않게 막는다
  feedback.unlockAudio();
  try {
    await startCamera(video);
  } catch (error) {
    console.error(error);
    feedback.status(STATUS.cameraError, performance.now());
    setStartEnabled(true);
    return;
  }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  byId("stage").style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
  byId("result").hidden = true;
  mode = MODES[modeName];
  partialHint = null;
  feedback.reset();
  devTools.reset();
  panel.setup(exerciseSelect.value, mode);
  showMode();
  session = createSession(exerciseSelect.value, performance.now());
  startedAt = new Date();
  setRunning(true);
  frameRequest = requestAnimationFrame(loop);
}

// 모드에 따라 숫자·배지·종료 버튼 문구를 바꾼다 (F1)
function showMode() {
  byId("accuracy-box").hidden = !mode.showNumbers;
  byId("count-row").hidden = !mode.showNumbers;
  byId("practice-badge").hidden = !mode.badge;
  finishButton.textContent = mode.save ? MODE_TEXT.finishRecord : MODE_TEXT.finishPractice;
}

// 종료: 반복과 카메라를 멈춘다. 수행 모드는 기록을 저장하고, 연습 모드는 저장하지 않는다
function finish() {
  cancelAnimationFrame(frameRequest);
  stopCamera(video);
  context.clearRect(0, 0, canvas.width, canvas.height);
  setRunning(false);
  byId("practice-badge").hidden = true;
  feedback.hint(null, performance.now(), false);
  const { stats } = session;
  session = null;
  if (mode.save) showResult(stats);
  else showPracticeEnd();
}

// 영상에 새 프레임이 나올 때마다 한 번 분석한다
function loop() {
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const now = performance.now();
    const landmarks = engine.detect(video, now);
    engine.draw(landmarks);
    devTools.frame(landmarks, now);
    render(session.processFrame(landmarks, video.videoWidth, video.videoHeight, now), now);
  }
  frameRequest = requestAnimationFrame(loop);
}

function render(view, now) {
  const exercise = session.stats.exercise;
  if (view.status) feedback.status(view.status, now);
  if (mode.practiceHints) feedback.hint(practiceHint(view, now), now, byId("practice-voice").checked);
  else feedback.cues(exercise, view.cues, now);
  if (view.success && mode.sounds) feedback.success();
  if (mode.showNumbers) feedback.progress(progressText(session.stats), computeAccuracy(session.stats));
  panel.update(view);
  drawOverlay(context, exercise, view, mode);
  devTools.show(view, exercise);
}

// 연습 모드 힌트 (F1): 주황 이상인 지표와 3초 안에 끝난 범위 미달 중 우선순위가 가장 높은 하나
function practiceHint(view, now) {
  const partial = view.events.find((event) => event.type === "partialRep");
  if (partial) partialHint = { cue: partial.cue ?? "partialRep", until: now + PARTIAL_HINT_MS };
  const activeKeys = view.indicators.filter((item) => item.stage !== "good").map((item) => item.errorKey);
  if (partialHint && now < partialHint.until) activeKeys.push(partialHint.cue);
  return pickPracticeHint(session.stats.exercise, activeKeys);
}

// 스쿼트·푸시업은 "전체 n회 / 올바른 n회", 플랭크는 바른 자세 유지 시간 (7.3)
function progressText(stats) {
  if (stats.exercise === "plank") return `${sessionCount(stats)}초`;
  return `전체 ${stats.reps}회 / 올바른 ${stats.correctReps}회`;
}

// 진행 중에는 종목을 바꾸거나 다시 시작할 수 없다
function setRunning(running) {
  exerciseSelect.disabled = running;
  setStartEnabled(!running);
  finishButton.disabled = !running;
  devTools.setRunning(running);
}

// 연습 모드 종료: 요약 없이 한 줄만 보여 준다
function showPracticeEnd() {
  byId("result").hidden = false;
  byId("result-summary").textContent = MODE_TEXT.practiceEnd;
  byId("result-status").textContent = "";
  byId("result-details").hidden = true;
}

// 기록할 운동이 있을 때(count > 0)만 기록을 만들어 저장한다. 저장 조건은 이것 하나다 (7.6)
async function showResult(stats) {
  byId("result").hidden = false;
  byId("result-details").hidden = false;
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
