// 각도·직선 계산 (HANDOFF 7.2). 좌표는 픽셀 단위이고 y는 아래로 갈수록 커진다.

const DEGREES_PER_RADIAN = 180 / Math.PI;
const UP = { x: 0, y: -1 };
const DOWN = { x: 0, y: 1 };

// 정규화 좌표(0~1)에 영상 크기를 곱해 픽셀 좌표로 바꾼다. 화면비 때문에 각도가 틀어지는 것을 막는다.
export function toPixel(landmark, width, height) {
  return { x: landmark.x * width, y: landmark.y * height };
}

// 세 점 a-b-c에서 b를 꼭짓점으로 하는 사잇각 (0~180°)
export function angleAt(a, b, c) {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  const degrees = Math.abs(radians * DEGREES_PER_RADIAN);
  return degrees > 180 ? 360 - degrees : degrees;
}

// 벡터 from→to와 기준 방향(단위 벡터) 사이의 각 (0~180°)
function angleToDirection(from, to, direction) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return 0;
  const cos = (dx * direction.x + dy * direction.y) / length;
  return Math.acos(Math.min(1, Math.max(-1, cos))) * DEGREES_PER_RADIAN;
}

// 선분 a-b와 수평선 사이의 각 (0~90°). 사람이 왼쪽을 보든 오른쪽을 보든 같은 값이 나온다.
function angleToHorizontal(a, b) {
  return Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x)) * DEGREES_PER_RADIAN;
}

// 발 각도: 뒤꿈치→발끝 선과 수평선 사이의 각. 뒤꿈치가 발끝보다 높을수록 커지고, 낮으면 음수다.
function footAngle(heel, toe) {
  return Math.atan2(toe.y - heel.y, Math.abs(toe.x - heel.x)) * DEGREES_PER_RADIAN;
}

// 팔 기울기: 어깨→손목 선과 수직선(아래) 사이의 각. 손목이 머리 쪽(엉덩이→어깨 방향)이면 +, 발 쪽이면 -다.
// 0°면 손이 어깨 바로 아래에 있다. 푸시업에서 몸이 기울어 있어도 바닥 기준으로 잰다.
function armLean(shoulder, wrist, hip) {
  const headward = Math.sign(shoulder.x - hip.x);
  return Math.atan2((wrist.x - shoulder.x) * headward, wrist.y - shoulder.y) * DEGREES_PER_RADIAN;
}

// 점이 직선 a-b(연장선 포함)보다 아래에 있는가. 레거시 expectedLineY와 같은 방식이다.
export function isBelowLine(point, a, b) {
  if (a.x === b.x) return false; // 수직선이면 같은 x의 y를 정할 수 없다
  const lineY = a.y + ((point.x - a.x) * (b.y - a.y)) / (b.x - a.x);
  return point.y > lineY;
}

// 한쪽 몸의 점들로 7.2의 각도를 모두 계산한다
export function measureAngles(p) {
  const torso = angleToDirection(p.hip, p.shoulder, UP);
  const shin = angleToDirection(p.ankle, p.knee, UP);
  return {
    thigh: angleToDirection(p.hip, p.knee, DOWN), // 허벅지-수직 각: 서면 0°, 허벅지 수평이면 90°
    torso, // 몸통 기울기
    shin, // 정강이 기울기
    torsoShin: torso - shin, // 몸통-정강이 각
    elbow: angleAt(p.shoulder, p.elbow, p.wrist), // 팔꿈치 각: 180°면 팔 펴짐
    bodyLine: angleAt(p.shoulder, p.hip, p.ankle), // 몸통 정렬 각: 180°면 일직선
    armLean: armLean(p.shoulder, p.wrist, p.hip), // 팔 기울기: 0°면 손이 어깨 바로 아래
    neck: angleAt(p.ear, p.shoulder, p.hip), // 목 정렬 각: 180°면 머리와 몸통이 일직선
    foot: footAngle(p.heel, p.toe), // 발 각도
    bodyLevel: angleToHorizontal(p.shoulder, p.ankle), // 몸 수평 각: 0°면 몸이 수평
  };
}

// 값들의 중앙값
export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// 각도마다 최근 frames개 값의 중앙값으로 튀는 값을 다듬는다 (7.1 노이즈). 세션마다 새로 만든다.
export function createSmoother(frames) {
  const history = {};
  return (angles) => {
    const smoothed = {};
    for (const [name, value] of Object.entries(angles)) {
      history[name] = [...(history[name] ?? []), value].slice(-frames);
      smoothed[name] = median(history[name]);
    }
    return smoothed;
  };
}
