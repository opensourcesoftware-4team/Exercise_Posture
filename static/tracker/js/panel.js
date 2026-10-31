// 정보 레이어 (뒤집지 않는 HTML): 지표 패널(추가 기능 F2)과 깊이 게이지(F3)
import { INDICATOR_LABELS } from "./catalog.js";
import { depthZone, gaugePosition, GAUGES } from "./depth.js";
import { displayStage } from "./modes.js";

// 종목마다 패널에 보여 줄 지표와, 부호(+/−)를 붙여 보여 줄 지표
const ROWS = { squat: ["torsoShin", "heelRise"], pushup: ["bodyLine", "armLean"], plank: ["bodyLine", "neck"] };
const SIGNED = ["torsoShin", "heelRise", "armLean"];

function formatValue(key, value) {
  const rounded = Math.round(value);
  return SIGNED.includes(key) && rounded > 0 ? `+${rounded}°` : `${rounded}°`;
}

// elements: indicators(지표 목록 상자), gauge(게이지 전체), track(막대), fill(채움), value(현재 값 글자)
export function createPanel(elements) {
  let exercise = null;
  let mode = null;
  let rows = {}; // 지표 키 → { row, value }

  // 게이지 눈금을 막대 위에 놓는다. 서기(30°)와 시도(35°)처럼 가까운 눈금이 겹치지 않게 글자를 좌우로 번갈아 둔다
  function placeTicks(gauge) {
    elements.track.querySelectorAll(".depth-tick").forEach((tick) => tick.remove());
    gauge.ticks.forEach(({ value, label }, index) => {
      const tick = document.createElement("div");
      tick.className = index % 2 === 1 ? "depth-tick left" : "depth-tick";
      tick.style.top = `${gaugePosition(gauge, value) * 100}%`;
      const text = document.createElement("span");
      text.textContent = `${value}° ${label}`;
      tick.append(text);
      elements.track.append(tick);
    });
  }

  return {
    // 세션 시작: 종목에 맞는 지표 줄과 게이지 눈금을 만든다
    setup(nextExercise, nextMode) {
      exercise = nextExercise;
      mode = nextMode;
      rows = {};
      elements.indicators.replaceChildren();
      for (const key of ROWS[exercise]) {
        const row = document.createElement("div");
        row.className = "indicator";
        row.dataset.stage = "none";
        const label = document.createElement("span");
        label.textContent = INDICATOR_LABELS[key];
        const value = document.createElement("strong");
        value.textContent = "–";
        row.append(label, value);
        elements.indicators.append(row);
        rows[key] = { row, value };
      }
      const gauge = GAUGES[exercise];
      elements.gauge.hidden = !gauge;
      if (gauge) placeTicks(gauge);
    },

    // 프레임마다: 지표 값과 단계 색, 게이지 높이와 색. 측정하지 않는 프레임은 "–"로 둔다
    update(view) {
      for (const [key, { row, value }] of Object.entries(rows)) {
        const indicator = view.indicators.find((item) => item.key === key);
        row.dataset.stage = indicator ? displayStage(indicator.stage, mode) : "none";
        value.textContent = indicator ? formatValue(key, indicator.value) : "–";
      }
      const gauge = GAUGES[exercise];
      if (!gauge) return;
      const angle = view.angles?.[gauge.angle];
      elements.fill.style.height = angle === undefined ? "0%" : `${gaugePosition(gauge, angle) * 100}%`;
      elements.fill.dataset.zone = angle === undefined ? "idle" : depthZone(exercise, angle);
      elements.value.textContent = angle === undefined ? "–" : `${Math.round(angle)}°`;
    },
  };
}
