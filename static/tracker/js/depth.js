// 깊이 게이지와 안내선 계산 (추가 기능 F3). 눈금과 구간은 판정 기준값(config.js)을 그대로 쓴다.
import { PUSHUP, SQUAT } from "./config.js";

// 종목별 게이지: 어떤 각도를 보여 주는지, 막대 위·아래 끝의 값, 눈금. 플랭크는 게이지가 없다.
export const GAUGES = {
  squat: {
    angle: "thigh", // 허벅지-수직 각: 위가 0°(서기), 아래로 갈수록 깊다
    top: 0,
    bottom: 100,
    ticks: [
      { value: SQUAT.STAND_MAX, label: "서기" },
      { value: SQUAT.ATTEMPT_MIN, label: "시도" },
      { value: SQUAT.PASS_MIN, label: "통과" },
    ],
  },
  pushup: {
    angle: "elbow", // 팔꿈치 각: 위가 180°(팔 펴짐), 아래로 갈수록 깊다
    top: 180,
    bottom: 70,
    ticks: [
      { value: PUSHUP.TOP_MIN, label: "펴짐" },
      { value: PUSHUP.ATTEMPT_MAX, label: "시도" },
      { value: PUSHUP.BOTTOM_MAX, label: "통과" },
    ],
  },
};

// 막대 위 끝에서부터의 위치 (0~1)
export function gaugePosition(gauge, value) {
  const position = (value - gauge.top) / (gauge.bottom - gauge.top);
  return Math.min(1, Math.max(0, position));
}

// 깊이 구간: pass(통과, 초록), attempt(반복 시도 중, 주황), idle(그 밖, 회색). 판정의 경계와 같다.
export function depthZone(exercise, value) {
  if (exercise === "squat") {
    if (value >= SQUAT.PASS_MIN) return "pass";
    return value > SQUAT.ATTEMPT_MIN ? "attempt" : "idle";
  }
  if (value <= PUSHUP.BOTTOM_MAX) return "pass";
  return value < PUSHUP.ATTEMPT_MAX ? "attempt" : "idle";
}

// 스쿼트 안내선: 무릎에서, 허벅지-수직 각이 통과 각(70°)일 때 엉덩이가 있을 곳까지의 선분 (픽셀 좌표).
// 엉덩이는 사람이 보는 방향의 반대쪽(뒤)으로 빠진다. 보는 방향은 코가 귀보다 앞쪽인지로 정한다.
export function guideLine(points) {
  const facing = points.nose.x > points.ear.x ? 1 : -1;
  const thighLength = Math.hypot(points.hip.x - points.knee.x, points.hip.y - points.knee.y);
  const radians = (SQUAT.PASS_MIN * Math.PI) / 180;
  return {
    from: points.knee,
    to: {
      x: points.knee.x - facing * thighLength * Math.sin(radians),
      y: points.knee.y - thighLength * Math.cos(radians),
    },
  };
}
