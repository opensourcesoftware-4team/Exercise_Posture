// 뼈대 캔버스에 지표 색(추가 기능 F2)과 스쿼트 깊이 안내선(F3)을 그린다.
// 이 캔버스는 CSS로 거울처럼 뒤집혀 보이므로 글자는 쓰지 않는다. 글자는 panel.js가 HTML로 쓴다.
import { depthZone, guideLine } from "./depth.js";
import { displayStage } from "./modes.js";

export const STAGE_COLORS = { good: "#22c55e", warn: "#f59e0b", bad: "#ef4444" };
const ZONE_COLORS = { pass: STAGE_COLORS.good, attempt: STAGE_COLORS.warn, idle: "#94a3b8" };

// 지표마다 색칠할 선분 (양 끝 관절 이름)
const SEGMENTS = {
  torsoShin: [["hip", "shoulder"]],
  heelRise: [["heel", "toe"]],
  bodyLine: [
    ["shoulder", "hip"],
    ["hip", "ankle"],
  ],
  armLean: [
    ["shoulder", "elbow"],
    ["elbow", "wrist"],
  ],
  neck: [["ear", "shoulder"]],
};

function drawLine(context, from, to, color, width, dash = []) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.setLineDash(dash);
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
  context.restore();
}

// view: session.processFrame 결과, mode: modes.js의 MODES 중 하나. 측정 중인 프레임에만 그린다.
export function drawOverlay(context, exercise, view, mode) {
  if (!view.points) return;
  const points = view.points;
  const width = Math.max(4, context.canvas.width / 160); // 영상 크기에 맞춘 선 굵기

  if (exercise === "squat") {
    // 안내선: 엉덩이가 이 선까지 내려오면 통과. 통과 깊이면 초록, 아니면 회색 점선
    const zone = depthZone(exercise, view.angles.thigh);
    const guide = guideLine(points);
    drawLine(context, guide.from, guide.to, zone === "pass" ? ZONE_COLORS.pass : ZONE_COLORS.idle, width / 2, [width * 2, width * 1.5]);
    drawLine(context, points.hip, points.knee, ZONE_COLORS[zone], width);
  }
  for (const indicator of view.indicators) {
    const color = STAGE_COLORS[displayStage(indicator.stage, mode)];
    for (const [from, to] of SEGMENTS[indicator.key]) drawLine(context, points[from], points[to], color, width);
  }
}
