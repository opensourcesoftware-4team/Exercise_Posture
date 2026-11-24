// 뼈대 캔버스에 지표 색(추가 기능 F2), 스쿼트 깊이 안내선(F3), 정답 뼈대(F6), 마네킹(F8)을 그린다.
// 이 캔버스는 CSS로 거울처럼 뒤집혀 보이므로 글자는 쓰지 않는다. 글자는 panel.js가 HTML로 쓴다.
import { REFERENCE_ALPHA, REFERENCE_GLOW_ALPHA, USER_MANNEQUIN_ALPHA } from "./config.js";
import { depthZone, guideLine } from "./depth.js";
import { mannequinParts } from "./mannequin.js";
import { displayStage } from "./modes.js";

export const STAGE_COLORS = { good: "#22c55e", warn: "#f59e0b", bad: "#ef4444" };
const ZONE_COLORS = { pass: STAGE_COLORS.good, attempt: STAGE_COLORS.warn, idle: "#94a3b8" };
const NEUTRAL_COLOR = "#e2e8f0"; // 사용자 마네킹에서 지표가 없는 부위

// 선 뼈대에서 지표마다 색칠할 선분 (양 끝 관절 이름)
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
  referenceTorso: [], // 마네킹 대비 상체는 사용자 뼈대가 아니라 정답 마네킹의 몸통을 칠한다 (drawReference)
};

// 마네킹에서 지표마다 색칠할 부위 (mannequin.js의 부위 이름). 선 뼈대의 SEGMENTS와 같은 곳이다
const PARTS = {
  torsoShin: ["torso"],
  heelRise: ["foot"],
  bodyLine: ["torso", "thigh", "shank"],
  armLean: ["upperArm", "forearm"],
  neck: ["head"],
  referenceTorso: [],
};

// 정답 마네킹에서 지표마다 주황으로 칠할 부위 (마네킹 대비 상체 안내)
const REFERENCE_PARTS = { referenceTorso: ["torso"] };

// 정답 마네킹에서 주황으로 칠할 부위: 정답 마네킹과 비교하는 지표가 초록이 아닌 부위
export function referenceWarnParts(indicators) {
  return indicators.filter((item) => item.stage !== "good").flatMap((item) => REFERENCE_PARTS[item.key] ?? []);
}

// 선 굵기: 영상 크기에 맞춘다
const lineWidthOf = (context) => Math.max(4, context.canvas.width / 160);

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

// 마네킹을 불투명하게 그려 두는 캔버스. 한 번에 반투명으로 얹어야 막대가 겹친 관절이 더 진해지지 않는다
let layer = null;

function clearedLayer(canvas) {
  if (!layer || layer.width !== canvas.width || layer.height !== canvas.height) {
    layer = document.createElement("canvas");
    layer.width = canvas.width;
    layer.height = canvas.height;
  }
  const layerContext = layer.getContext("2d");
  layerContext.clearRect(0, 0, layer.width, layer.height);
  return layerContext;
}

// 마네킹 (F8): 양 끝이 둥근 굵은 막대와 머리 원. colorOf: 부위 이름 → 색, alpha: 얹을 때의 불투명도
function drawMannequin(context, points, colorOf, alpha) {
  const { bars, head } = mannequinParts(points);
  const layerContext = clearedLayer(context.canvas);
  for (const { part, from, to, width } of bars) drawLine(layerContext, from, to, colorOf(part), width);
  layerContext.fillStyle = colorOf("head");
  layerContext.beginPath();
  layerContext.arc(head.center.x, head.center.y, head.radius, 0, 2 * Math.PI);
  layerContext.fill();
  context.save();
  context.globalAlpha = alpha;
  context.drawImage(layer, 0, 0);
  context.restore();
}

// 사용자 마네킹의 부위별 색 (부위 이름 → 색): 지표가 있는 부위는 3단계 색(F2), 스쿼트 허벅지는 깊이 구간 색(F3), 나머지는 중립색
export function userPartColors(exercise, view, mode) {
  const colors = {};
  if (exercise === "squat") colors.thigh = ZONE_COLORS[depthZone(exercise, view.angles.thigh)];
  for (const indicator of view.indicators) {
    for (const part of PARTS[indicator.key]) colors[part] = STAGE_COLORS[displayStage(indicator.stage, mode)];
  }
  return (part) => colors[part] ?? NEUTRAL_COLOR;
}

// view: session.processFrame 결과, mode: modes.js의 MODES 중 하나. 측정 중인 프레임에만 그린다.
// mannequin이면 사용자 뼈대를 마네킹으로 그리고(F8), 아니면 MediaPipe 선 뼈대 위에 지표 선분만 덧칠한다.
// 스쿼트 안내선은 어느 쪽이든 맨 위에 그린다
export function drawOverlay(context, exercise, view, mode, mannequin) {
  if (!view.points) return;
  const points = view.points;
  const width = lineWidthOf(context);
  const zone = exercise === "squat" ? depthZone(exercise, view.angles.thigh) : null;

  if (mannequin) drawMannequin(context, points, userPartColors(exercise, view, mode), USER_MANNEQUIN_ALPHA);
  else {
    if (zone) drawLine(context, points.hip, points.knee, ZONE_COLORS[zone], width);
    for (const indicator of view.indicators) {
      const color = STAGE_COLORS[displayStage(indicator.stage, mode)];
      for (const [from, to] of SEGMENTS[indicator.key]) drawLine(context, points[from], points[to], color, width);
    }
  }
  if (zone) {
    // 안내선: 엉덩이가 이 선까지 내려오면 통과. 통과 깊이면 초록, 아니면 회색 점선
    const guide = guideLine(points);
    drawLine(context, guide.from, guide.to, zone === "pass" ? ZONE_COLORS.pass : ZONE_COLORS.idle, width / 2, [width * 2, width * 1.5]);
  }
}

// 정답 뼈대 (F6·F8): 반투명 초록 마네킹. 사용자 뼈대보다 먼저(아래에) 그린다. glowing이면 잠깐 밝게 그린다
// warnParts: 주황으로 칠할 부위 (마네킹 대비 상체가 어긋나면 몸통)
export function drawReference(context, points, glowing, warnParts = []) {
  const colorOf = (part) => (warnParts.includes(part) ? STAGE_COLORS.warn : STAGE_COLORS.good);
  drawMannequin(context, points, colorOf, glowing ? REFERENCE_GLOW_ALPHA : REFERENCE_ALPHA);
}
