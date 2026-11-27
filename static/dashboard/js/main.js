// 대시보드 화면 조립 + 상태(종목·기간). 값은 모두 textContent로 넣는다.
import { getStats, getRecords, deleteRecord } from "./api.js";
import { drawTrend, destroyTrend } from "./charts.js";
import { errorLabel, EXERCISE_NAMES, ERROR_ORDER } from "../../shared/error-labels.js";

const state = { exercise: "squat", range: { type: "last", value: 7 } };
const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function accuracyColor(acc) {
  if (acc >= 90) return "#10b981";
  if (acc < 70) return "#f43f5e";
  return "#38bdf8";
}

// startedAt("2026-10-28T10:48:29+09:00") → "10/28 10:48" (서버 label과 같은 형식)
const rowLabel = (startedAt) => `${startedAt.slice(5, 10).replace("-", "/")} ${startedAt.slice(11, 16)}`;

function renderTabs() {
  const box = $("exercise-tabs");
  box.replaceChildren();
  for (const [key, name] of Object.entries(EXERCISE_NAMES)) {
    const btn = el("button", "db-tab" + (key === state.exercise ? " active" : ""), name);
    btn.type = "button";
    btn.addEventListener("click", () => { state.exercise = key; load(); });
    box.append(btn);
  }
}

function renderSummary(stats) {
  const box = $("summary-cards");
  box.replaceChildren();
  const items = [
    ["세션 수", String(stats.sessions), ""],
    ["평균 정확도", stats.summary.avgAccuracy ?? "-", stats.summary.avgAccuracy == null ? "" : "%"],
    ["최고 기록", String(stats.summary.bestCount), stats.unit],
  ];
  for (const [label, value, unit] of items) {
    const card = el("div", "db-stat");
    const v = el("div", "db-stat-value", value);
    if (unit) v.append(el("small", "", unit));
    card.append(el("div", "db-stat-label", label), v);
    box.append(card);
  }
}

function renderTrend(stats) {
  const enough = stats.trend.length >= 2;
  $("trend-note").hidden = enough;
  $("trend-chart-box").hidden = !enough;
  if (enough) drawTrend($("trend-canvas"), stats); else destroyTrend();
}

// 자주 틀린 자세: 기간 안 오답 합계를 정해진 순서로, 0회도 보여 준다. 정면 기록이 없으면 무릎 안쪽 모임(정면 전용)은 숨김
function renderErrors(stats) {
  const list = $("error-list");
  list.replaceChildren();
  const keys = ERROR_ORDER[stats.exercise].filter((k) => k !== "kneeValgus" || stats.hasFrontView);
  const max = Math.max(1, ...keys.map((k) => stats.errorTotals[k]));
  for (const key of keys) {
    const n = stats.errorTotals[key];
    const head = el("div", "db-error-head");
    head.append(el("span", "", errorLabel(stats.exercise, key)), el("span", "db-error-count" + (n === 0 ? " zero" : ""), `${n}회`));
    const fill = el("div", "db-bar-fill");
    fill.style.width = `${(n / max) * 100}%`;
    const track = el("div", "db-bar-track");
    track.append(fill);
    const row = el("div", "db-error-row");
    row.append(head, track);
    list.append(row);
  }

  const box = $("top-error");
  box.replaceChildren();
  if (!stats.topError) {
    box.append(el("p", "db-top-ok", "이 기간에는 반복된 오답이 없어요 ✅"));
    return;
  }
  // 운동 가이드(기능 3)로 이동: 그 종목의 오답별 원인·교정 방법·횟수별 루틴 (#13)
  const guideLink = el("a", "db-top-link", "교정 가이드 보기 →");
  guideLink.href = `/guide/?exercise=${stats.exercise}`;
  box.append(
    el("p", "db-top-title", errorLabel(stats.exercise, stats.topError)),
    el("p", "db-top-sub", `선택한 기간 동안 ${stats.errorTotals[stats.topError]}회 나왔어요`),
    guideLink,
  );
}

function renderTable(records) {
  const body = $("history-body");
  body.replaceChildren();
  for (const r of records.slice(0, 20)) {
    const tr = el("tr");
    const errs = Object.entries(r.errors[r.exercise]).sort((a, b) => b[1] - a[1])[0];
    const top = errs && errs[1] > 0 ? `${errorLabel(r.exercise, errs[0])} ${errs[1]}회` : "-";
    const unit = r.exercise === "plank" ? "초" : "회";
    const acc = el("td", "db-acc", `${r.accuracy}%`);
    acc.style.color = accuracyColor(r.accuracy);
    const del = el("button", "db-del", "삭제");
    del.type = "button";
    del.addEventListener("click", () => onDelete(r));
    const delCell = el("td");
    delCell.append(del);
    tr.append(el("td", "", rowLabel(r.startedAt)), el("td", "", `${r.count}${unit}`), acc, el("td", "", top), delCell);
    body.append(tr);
  }
}

async function onDelete(record) {
  if (!confirm(`${rowLabel(record.startedAt)} 기록을 삭제할까요?`)) return;
  try {
    await deleteRecord(record.id);
    await load();
  } catch (e) {
    showMessage(e.message);
  }
}

function showMessage(text) {
  const box = $("db-message");
  box.textContent = text;
  box.hidden = !text;
}

async function load() {
  renderTabs();
  showMessage("");
  try {
    const [records, stats] = await Promise.all([getRecords(state.exercise), getStats(state.exercise, state.range)]);
    renderSummary(stats);
    renderTrend(stats);
    $("error-area").hidden = stats.sessions === 0;
    renderErrors(stats);
    renderTable(records);
  } catch (e) {
    showMessage(`데이터를 불러오지 못했습니다: ${e.message}`);
  }
}

$("range-select").addEventListener("change", (e) => {
  const [type, value] = e.target.value.split(":");
  state.range = { type, value: Number(value) };
  load();
});

load();
