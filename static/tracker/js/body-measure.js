// 몸 길이 측정 (추가 기능 F4). 연습을 시작할 때 사용자의 분절 길이를 재서 정답 자세 계산(F5)에 넘긴다.
// DOM을 쓰지 않으므로 가짜 랜드마크로 Node 테스트를 할 수 있다. 결과는 세션 동안 메모리에만 두고 저장하지 않는다.
import { MEASURE_STANCE_TEXT, MEASURE_TEXT, STATUS } from "./catalog.js";
import {
  LYING_MAX_ANGLE,
  MEASURE_FRAMES,
  MEASURE_MIN_VALID,
  MEASURE_STANCE_MIN,
  MIN_VISIBILITY,
  PUSHUP,
  SQUAT,
} from "./config.js";
import { facingOf, measureAngles, median } from "./geometry.js";
import { readBody } from "./pose-engine.js";

// 분절 이름 → 양 끝 관절. 길이는 두 점 사이의 픽셀 거리다
const SEGMENTS = {
  shank: ["ankle", "knee"],
  thigh: ["knee", "hip"],
  torso: ["hip", "shoulder"],
  head: ["shoulder", "ear"],
  foot: ["heel", "toe"],
  upperArm: ["shoulder", "elbow"],
  forearm: ["elbow", "wrist"],
  leg: ["hip", "ankle"], // 무릎을 편 다리 (허벅지 + 정강이)
};

// 종목마다 재는 분절과 측정 자세. 측정 자세가 아닌 프레임은 재지 않는다.
// stance: 발 간격을 확인하는 종목. 스쿼트는 실제로 앉을 때의 보폭에서 재야 정강이·발 길이가 앉은 자세와 맞는다
const PLANS = {
  squat: {
    segments: ["shank", "thigh", "torso", "head", "foot"],
    inPose: (angles) => angles.thigh <= SQUAT.STAND_MAX, // 선 자세
    stance: true,
  },
  pushup: {
    segments: ["upperArm", "forearm", "leg", "torso", "head"],
    // 팔을 편 시작 자세: 엎드려 손목이 어깨보다 아래에 있고 팔꿈치가 펴져 있다
    inPose: (angles, points) =>
      angles.bodyLevel <= LYING_MAX_ANGLE && points.wrist.y > points.shoulder.y && angles.elbow >= PUSHUP.TOP_MIN,
  },
  plank: {
    segments: ["upperArm", "forearm", "leg", "torso", "head"],
    // 플랭크 자세: 엎드려 팔꿈치가 어깨보다 아래에 있다 (판정의 진입 조건과 같다)
    inPose: (angles, points) => angles.bodyLevel <= LYING_MAX_ANGLE && points.elbow.y > points.shoulder.y,
  },
};

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// 3D 추정 좌표의 양 어깨·양 발목 번호 (MediaPipe)
const WORLD = { leftShoulder: 11, rightShoulder: 12, leftAnkle: 27, rightAnkle: 28 };

// 발 간격 비율: 두 발목 사이 거리 ÷ 어깨 너비. 1이면 어깨너비만큼 벌렸다.
// 옆에서 찍으면 좌우 간격이 카메라 쪽(깊이)으로 벌어져 화면 좌표로는 잴 수 없어서, MediaPipe의 3D 추정 좌표로 잰다
export function stanceRatio(world) {
  const distance3d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const shoulders = distance3d(world[WORLD.leftShoulder], world[WORLD.rightShoulder]);
  return shoulders === 0 ? 0 : distance3d(world[WORLD.leftAnkle], world[WORLD.rightAnkle]) / shoulders;
}

// 프레임 1장에서 잰 값. 잴 수 없는 프레임이면 sample이 null이고 status가 그 까닭이다.
// 길이를 잴 관절이 하나라도 가시성 기준 미만이면 그 프레임은 뺀다. stance: 발 간격 비율(재지 않는 종목은 null)
function readFrame(exercise, landmarks, stance, width, height) {
  const plan = PLANS[exercise];
  if (!landmarks) return { sample: null, status: STATUS.notVisible };
  const { points, sideView } = readBody(landmarks, width, height);
  const joints = plan.segments.flatMap((name) => SEGMENTS[name]);
  if (joints.some((joint) => points[joint].visibility < MIN_VISIBILITY)) return { sample: null, status: STATUS.notVisible };
  if (!sideView) return { sample: null, status: STATUS.notSideView };
  if (!plan.inPose(measureAngles(points), points)) return { sample: null, status: MEASURE_TEXT[exercise] };
  if (plan.stance && !(stance >= MEASURE_STANCE_MIN)) return { sample: null, status: MEASURE_STANCE_TEXT };
  const lengths = Object.fromEntries(
    plan.segments.map((name) => [name, distance(points[SEGMENTS[name][0]], points[SEGMENTS[name][1]])]),
  );
  const sample = { lengths, facing: facingOf(points), heelOffset: points.heel.x - points.ankle.x, stance };
  return { sample, status: MEASURE_TEXT[exercise] };
}

// 유효 프레임 값들의 중앙값. 보는 방향은 프레임 다수결이다.
// 뒤꿈치 위치는 발을 재는 스쿼트만 둔다 (F5가 발 중앙을 정할 때 쓴다). 발 간격 비율은 확인용이다
function summarize(samples, plan) {
  const lengths = Object.fromEntries(
    plan.segments.map((name) => [name, median(samples.map((sample) => sample.lengths[name]))]),
  );
  const facing = Math.sign(samples.reduce((sum, sample) => sum + sample.facing, 0)) || 1;
  const result = { lengths, facing };
  if (plan.segments.includes("foot")) result.heelOffset = median(samples.map((sample) => sample.heelOffset));
  if (plan.stance) result.stance = median(samples.map((sample) => sample.stance));
  return result;
}

// 몸 길이 측정기를 만든다. 연습을 시작할 때마다 새로 만든다.
// MEASURE_FRAMES장을 한 묶음으로 보고, 그중 유효 프레임이 MEASURE_MIN_VALID장 이상이면 중앙값으로 끝낸다.
// 모자라면 그 묶음을 버리고 처음부터 다시 잰다.
export function createBodyMeasure(exercise) {
  let frames = 0; // 이번 묶음에서 본 프레임 수
  let samples = []; // 이번 묶음의 유효 프레임 값
  let result = null;

  return {
    // 프레임 1장을 넣는다. landmarks·world는 MediaPipe 화면 좌표와 3D 추정 좌표(사람이 없으면 null)다.
    // 반환: status(안내 문구), progress(이번 묶음 진행 0~1), result(끝났으면 측정값, 아니면 null),
    //       stance(이번 프레임의 발 간격 비율, 스쿼트만. 없으면 null)
    // 측정값: lengths(분절 이름 → px), facing(보는 방향 ±1), 스쿼트만 heelOffset(뒤꿈치 x − 발목 x, px)과
    //         stance(잰 프레임들의 발 간격 비율)
    add(landmarks, world, width, height) {
      if (result) return { status: null, progress: 1, result, stance: null };
      const stance = PLANS[exercise].stance && world ? stanceRatio(world) : null;
      const { sample, status } = readFrame(exercise, landmarks, stance, width, height);
      frames += 1;
      if (sample) samples.push(sample);
      if (frames === MEASURE_FRAMES) {
        if (samples.length >= MEASURE_MIN_VALID) result = summarize(samples, PLANS[exercise]);
        frames = 0;
        samples = [];
      }
      return { status, progress: result ? 1 : frames / MEASURE_FRAMES, result, stance };
    },
  };
}

// 두 측정값에서 같은 분절 길이의 차이 중 가장 큰 것 (%, 두 값의 평균 대비).
// 같은 자리에서 두 번 잰 값이 5% 이내인지 확인할 때 쓴다
export function lengthDifference(a, b) {
  const names = Object.keys(a.lengths).filter((name) => name in b.lengths);
  const differences = names.map((name) => {
    const [x, y] = [a.lengths[name], b.lengths[name]];
    return (Math.abs(x - y) / ((x + y) / 2)) * 100;
  });
  return Math.max(0, ...differences);
}
