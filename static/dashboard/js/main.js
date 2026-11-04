// 대시보드 기본 화면: 스쿼트 최근 7회 요약·추이 그래프·기록 표. 값은 모두 textContent로 넣는다.
import { getStats, getRecords, deleteRecord } from "./api.js";
import { drawTrend, destroyTrend } from "./charts.js";
import { errorLabel } from "../../shared/error-labels.js";

const EXERCISE = "squat";
const RANGE = { type: "last", value: 7 };
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

function renderTable(records) {
  const body = $("history-body");
  body.replaceChildren();
  for (const r of records.slice(0, 20)) {
    const tr = el("tr");
    const errs = Object.entries(r.errors[r.exercise]).sort((a, b) => b[1] - a[1])[0];
    const top = errs && errs[1] > 0 ? `${errorLabel(r.exercise, errs[0])} ${errs[1]}회` : "-";
    const acc = el("td", "db-acc", `${r.accuracy}%`);
    acc.style.color = accuracyColor(r.accuracy);
    const del = el("button", "db-del", "삭제");
    del.type = "button";
    del.addEventListener("click", () => onDelete(r));
    const delCell = el("td");
    delCell.append(del);
    tr.append(el("td", "", rowLabel(r.startedAt)), el("td", "", `${r.count}회`), acc, el("td", "", top), delCell);
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
  showMessage("");
  try {
    const [records, stats] = await Promise.all([getRecords(EXERCISE), getStats(EXERCISE, RANGE)]);
    renderSummary(stats);
    renderTrend(stats);
    renderTable(records);
  } catch (e) {
    showMessage(`데이터를 불러오지 못했습니다: ${e.message}`);
  }
}

load();
