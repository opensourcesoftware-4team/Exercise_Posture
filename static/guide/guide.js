// 운동 가이드 화면 (기능 3 Exercise-Guide, MVP 통합). /api/guide가 주는 오답별 원인·교정 방법·횟수별 루틴·유튜브 영상을
// 내 기록에서 많이 나온 순서로 보여 준다. 주소의 ?exercise=pushup처럼 종목을 골라 열 수 있다. 값은 모두 textContent로 넣는다.
import { errorLabel, EXERCISE_NAMES } from "../shared/error-labels.js";

const EXERCISES = Object.keys(EXERCISE_NAMES); // squat, pushup, plank
const $ = (id) => document.getElementById(id);
let requestNumber = 0; // 종목을 빨리 바꿔도 마지막으로 고른 종목의 응답만 그린다

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function fetchGuide(exercise) {
  const response = await fetch(`/api/guide?exercise=${encodeURIComponent(exercise)}`, { cache: "no-store" });
  const data = await response.json();
  // 오류 형식: 가이드 API는 { error: "문구" }, 서버 공통 오류 처리(app.py)는 { error: { message } }
  if (!response.ok) throw new Error(data.error?.message ?? data.error ?? `요청 실패 (${response.status})`);
  return data;
}

// 예: "스쿼트 기록 3회에서 가장 많이 나온 오류는 '깊이 부족'(4회)이에요."
function summaryText(exercise, data) {
  const name = EXERCISE_NAMES[exercise];
  if (data.sessions === 0) return `아직 저장된 ${name} 기록이 없어요. 모든 자세 오류의 가이드를 보여 줘요.`;
  const top = data.guides[0];
  if (top.count === 0) return `${name} 기록 ${data.sessions}회에서 자세 오류가 나오지 않았어요.`;
  return `${name} 기록 ${data.sessions}회에서 가장 많이 나온 오류는 '${errorLabel(exercise, top.key)}'(${top.count}회)이에요.`;
}

// 유튜브 가이드 영상. 이 서버는 Referrer-Policy가 same-origin이라 그대로 두면 유튜브가 영상을 띄운 곳을 알 수 없어
// 재생을 막는다(오류 153). 그래서 영상 요청에만 주소의 앞부분(출처)을 보낸다
function videoFrame(video) {
  const box = el("div", "guide-video");
  const frame = document.createElement("iframe");
  frame.src = video.embedUrl;
  frame.title = video.title || "자세 교정 가이드 영상";
  frame.loading = "lazy";
  frame.allow = "accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
  frame.allowFullscreen = true;
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  box.append(frame);
  return box;
}

function renderCard(exercise, guide, isTop) {
  const card = el("article", isTop ? "guide-card guide-card-top" : "guide-card");
  const head = el("header", "guide-card-head");
  head.append(el("h2", "", errorLabel(exercise, guide.key)));
  if (guide.count > 0) head.append(el("span", "guide-count", `${guide.count}회`));
  const detail = el("dl", "guide-detail");
  detail.append(el("dt", "", "원인"), el("dd", "", guide.cause), el("dt", "", "교정 방법"), el("dd", "", guide.solution));
  // 내 기록에서 나온 오답은 나온 횟수(1회 / 2~4회 / 5회 이상)에 맞춘 교정 루틴을 함께 보여 준다
  if (guide.routine) {
    const routine = el("dd", "guide-routine");
    routine.append(el("strong", "", guide.routine.level), el("span", "", guide.routine.routine));
    detail.append(el("dt", "", "맞춤 루틴"), routine);
  }
  card.append(head, el("p", "guide-description", guide.description), detail);
  card.append(guide.video ? videoFrame(guide.video) : el("p", "guide-muted", "가이드 영상 준비 중"));
  if (guide.reference) card.append(el("p", "guide-muted", `참고: ${guide.reference}`));
  return card;
}

async function show(exercise) {
  const number = ++requestNumber;
  for (const button of $("guide-tabs").children) {
    button.setAttribute("aria-pressed", String(button.dataset.exercise === exercise));
  }
  history.replaceState(null, "", `?exercise=${exercise}`);
  $("guide-summary").textContent = "불러오는 중...";
  $("guide-list").replaceChildren();
  try {
    const data = await fetchGuide(exercise);
    if (number !== requestNumber) return;
    $("guide-summary").textContent = summaryText(exercise, data);
    $("guide-list").replaceChildren(
      ...data.guides.map((guide, index) => renderCard(exercise, guide, index === 0 && guide.count > 0)),
    );
  } catch (error) {
    if (number === requestNumber) $("guide-summary").textContent = `가이드를 불러오지 못했습니다: ${error.message}`;
  }
}

for (const exercise of EXERCISES) {
  const button = el("button", "", EXERCISE_NAMES[exercise]);
  button.type = "button";
  button.dataset.exercise = exercise;
  button.addEventListener("click", () => show(exercise));
  $("guide-tabs").append(button);
}
const requested = new URLSearchParams(location.search).get("exercise");
show(EXERCISES.includes(requested) ? requested : EXERCISES[0]);
