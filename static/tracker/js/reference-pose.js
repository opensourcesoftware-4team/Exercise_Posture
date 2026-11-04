// 체형 맞춤 정답 자세 계산기 (추가 기능 F5). F4에서 잰 몸 길이로, 깊이마다 그 사람에게 맞는 정답 관절 좌표를 만든다.
// 카메라와 DOM을 쓰지 않는 순수 함수다. 좌표는 픽셀이고 y는 아래로 갈수록 커진다.
// 계산은 "발목이 원점이고 사람이 +x 쪽을 보는" 기준 좌표에서 하고, 마지막에 보는 방향과 발목 위치로 옮긴다.
import { DEPTH_TARGET, MASS_HAT, MASS_SHANK, MASS_THIGH, PUSHUP, SHIN_MAX, TRUNK_EXTRA_MAX } from "./config.js";

const RADIANS_PER_DEGREE = Math.PI / 180;
const BISECTION_STEPS = 20; // 이분 탐색 횟수 (30° 범위를 0.00003°까지 좁힌다)
const ORIGIN = { x: 0, y: 0 };

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// from에서 수직 위를 기준으로 앞(+x)쪽으로 degrees만큼 기운 방향으로 length만큼 간 점. 음수 각은 뒤쪽이다
function step(from, length, degrees) {
  const radians = degrees * RADIANS_PER_DEGREE;
  return { x: from.x + length * Math.sin(radians), y: from.y - length * Math.cos(radians) };
}

// 기준 좌표의 점들을 화면 좌표로 옮긴다. facing이 -1이면 발목을 축으로 좌우를 뒤집는다
function toScreen(anchor, facing, points) {
  return Object.fromEntries(
    Object.entries(points).map(([name, point]) => [name, { x: anchor.x + facing * point.x, y: anchor.y + point.y }]),
  );
}

// 증가 함수 f가 [low, high]에서 0이 되는 값 (f(low) < 0 ≤ f(high)일 때)
function bisect(f, low, high) {
  let [from, to] = [low, high];
  for (let i = 0; i < BISECTION_STEPS; i += 1) {
    const middle = (from + to) / 2;
    if (f(middle) < 0) from = middle;
    else to = middle;
  }
  return (from + to) / 2;
}

// 스쿼트 정답 자세 계산기 (명세 6.1). body: F4 측정값 { lengths, facing, heelOffset, heelDrop }
// 무게중심이 발 중앙 위에 오도록 정강이·상체 기울기를 정한다. 상체는 정강이와 나란한 것이 기본이고,
// 정강이가 shinMax에 걸리면 상체만 TRUNK_EXTRA_MAX까지 더 숙인다. 그래도 균형이 안 맞는 깊이는 이 체형에 무리다.
// shinMax: 정강이 기울기 상한(°). 기본은 SHIN_MAX이고, F9가 이 세션의 발목 범위에 맞춰 낮춘 값을 넘긴다
export function createSquatReference(body, shinMax = SHIN_MAX) {
  const { shank, thigh, torso, head, foot } = body.lengths;
  const heel = { x: body.facing * body.heelOffset, y: body.heelDrop }; // 기준 좌표의 뒤꿈치 (발목 기준)
  const footCenter = heel.x + foot / 2; // 무게중심이 이 x에 오면 균형이 맞는다

  // 정강이 기울기 shin, 허벅지-수직 각 thigh(엉덩이는 무릎 뒤로 빠진다), 상체 기울기 lean(°)으로 쌓은 관절
  function joints(shin, thighAngle, lean) {
    const knee = step(ORIGIN, shank, shin);
    const hip = step(knee, thigh, -thighAngle);
    const shoulder = step(hip, torso, lean);
    return { ankle: ORIGIN, knee, hip, shoulder };
  }

  // 무게중심 x − 발 중앙 x. 분절 무게중심은 양 끝의 가운데로 본다. 몸이 앞으로 기울수록 커진다
  function balance(shin, thighAngle, lean) {
    const { ankle, knee, hip, shoulder } = joints(shin, thighAngle, lean);
    const middle = (a, b) => (a.x + b.x) / 2;
    const weighted =
      MASS_SHANK * middle(ankle, knee) + MASS_THIGH * middle(knee, hip) + MASS_HAT * middle(hip, shoulder);
    return weighted / (MASS_SHANK + MASS_THIGH + MASS_HAT) - footCenter;
  }

  // 깊이 thighAngle에서 균형이 맞는 { shin, torso } 기울기 (명세 6.1 풀이 순서 1·2). 균형을 못 맞추면 null
  function solve(thighAngle) {
    // 기울이지 않아도 무게중심이 발 중앙 앞에 있으면 똑바로 선다 (뒤로 기울이지는 않는다)
    if (balance(0, thighAngle, 0) >= 0) return { shin: 0, torso: 0 };
    if (balance(shinMax, thighAngle, shinMax) >= 0) {
      const shin = bisect((value) => balance(value, thighAngle, value), 0, shinMax);
      return { shin, torso: shin };
    }
    const leanMax = shinMax + TRUNK_EXTRA_MAX;
    if (balance(shinMax, thighAngle, leanMax) < 0) return null;
    return { shin: shinMax, torso: bisect((value) => balance(shinMax, thighAngle, value), shinMax, leanMax) };
  }

  // 무리 없이 갈 수 있는 최대 깊이 (명세 6.1 풀이 순서 3): DEPTH_TARGET에서 1°씩 줄여 처음 균형이 맞는 깊이
  let thetaMax = DEPTH_TARGET;
  while (thetaMax > 0 && solve(thetaMax) === null) thetaMax -= 1;

  // 깊이를 0~thetaMax로 자른 뒤의 기울기 (°): thigh(허벅지-수직 각), shin(정강이), torso(상체)
  function angles(theta) {
    const thighAngle = clamp(theta, 0, thetaMax);
    const lean = solve(thighAngle) ?? { shin: shinMax, torso: shinMax + TRUNK_EXTRA_MAX }; // thetaMax가 0인 체형
    return { thigh: thighAngle, ...lean };
  }

  return {
    thetaMax,
    angles,
    // 발목 ankle(px)에 맞춘 깊이 theta(허벅지-수직 각, °)의 정답 관절 좌표. theta는 0~thetaMax로 자른다
    pose(ankle, theta) {
      const { thigh: thighAngle, shin, torso: lean } = angles(theta);
      const points = joints(shin, thighAngle, lean);
      points.ear = step(points.shoulder, head, lean);
      points.heel = heel;
      points.toe = { x: heel.x + foot, y: heel.y }; // 발은 바닥에 평평하게 둔다
      return toScreen(ankle, body.facing, points);
    },
  };
}

// 두 원(중심 a 반지름 ra, 중심 b 반지름 rb)의 교점 두 개. 원이 닿지 않으면 가장 가까운 점 하나를 두 번 돌려준다
function circleIntersections(a, ra, b, rb) {
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  const gap = Math.hypot(dx, dy);
  const along = (ra * ra - rb * rb + gap * gap) / (2 * gap); // a에서 두 교점의 가운데까지
  const across = Math.sqrt(Math.max(0, ra * ra - along * along)); // 가운데에서 각 교점까지
  const base = { x: a.x + (along * dx) / gap, y: a.y + (along * dy) / gap };
  return [
    { x: base.x - (across * dy) / gap, y: base.y + (across * dx) / gap },
    { x: base.x + (across * dy) / gap, y: base.y - (across * dx) / gap },
  ];
}

// 엎드린 자세의 몸 선: 발목→어깨 일직선 위에서 엉덩이는 발목에서 leg만큼, 귀는 어깨에서 head만큼 간 점
function bodyLine(shoulder, leg, head) {
  const length = Math.hypot(shoulder.x, shoulder.y);
  const along = (distance) => ({ x: (shoulder.x * distance) / length, y: (shoulder.y * distance) / length });
  const beyond = along(head);
  return { hip: along(leg), ear: { x: shoulder.x + beyond.x, y: shoulder.y + beyond.y } };
}

// 푸시업 정답 자세 계산기 (명세 6.2). body: F4 측정값 { lengths, facing, floorDrop }
// 발목을 고정점으로 둔다(F4의 leg가 엉덩이–발목 길이라서). 발끝으로 서면 발목이 들리므로 손은 발목보다 floorDrop만큼 아래 바닥을 짚는다.
// 손목은 팔을 다 폈을 때 어깨 바로 아래 바닥에 고정하고, 팔꿈치 각에 따라 몸 선이 발목을 축으로 내려간다.
export function createPushupReference(body) {
  const { upperArm, forearm, leg, torso, head } = body.lengths;
  const length = leg + torso; // 발목–어깨 (몸이 일직선)
  const arm = upperArm + forearm;
  const wrist = { x: Math.sqrt(Math.max(0, length * length - (arm - body.floorDrop) ** 2)), y: body.floorDrop };

  return {
    // 발목 ankle(px)에 맞춘 팔꿈치 각 elbowAngle(°)의 정답 관절 좌표. 각은 PUSHUP.BOTTOM_MAX(바닥)~180으로 자른다
    pose(ankle, elbowAngle) {
      const alpha = clamp(elbowAngle, PUSHUP.BOTTOM_MAX, 180) * RADIANS_PER_DEGREE;
      const reach = Math.sqrt(upperArm ** 2 + forearm ** 2 - 2 * upperArm * forearm * Math.cos(alpha)); // 손목–어깨
      const shoulder = circleIntersections(ORIGIN, length, wrist, reach).reduce((a, b) => (a.y < b.y ? a : b)); // 위쪽
      // 팔꿈치는 손목·어깨에서 각각 아래팔·위팔 길이인 점 중 발 쪽(뒤)이다
      const elbow = circleIntersections(wrist, forearm, shoulder, upperArm).reduce((a, b) => (a.x < b.x ? a : b));
      return toScreen(ankle, body.facing, { ankle: ORIGIN, ...bodyLine(shoulder, leg, head), shoulder, elbow, wrist });
    },
  };
}

// 플랭크 정답 자세 계산기 (명세 6.3, 정지 자세 하나). body: F4 측정값 { lengths, facing, floorDrop }
// 팔꿈치를 어깨 바로 아래 바닥(발목보다 floorDrop 아래)에 대고 아래팔은 머리 쪽으로 둔다. 몸은 발목–어깨 일직선이다.
export function createPlankReference(body) {
  const { upperArm, forearm, leg, torso, head } = body.lengths;
  const length = leg + torso;
  const floor = body.floorDrop;
  const shoulder = { x: Math.sqrt(Math.max(0, length * length - (upperArm - floor) ** 2)), y: floor - upperArm };
  const points = {
    ankle: ORIGIN,
    ...bodyLine(shoulder, leg, head),
    shoulder,
    elbow: { x: shoulder.x, y: floor },
    wrist: { x: shoulder.x + forearm, y: floor },
  };

  return {
    // 발목 ankle(px)에 맞춘 정답 관절 좌표. 깊이가 없어 다른 종목과 같은 모양으로 부를 수 있게 두 번째 값은 쓰지 않는다
    pose(ankle) {
      return toScreen(ankle, body.facing, points);
    },
  };
}
