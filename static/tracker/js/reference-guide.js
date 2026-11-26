// 마네킹 대비 안내 (연습 모드). 판정(rules/)과 기록은 바꾸지 않는다. DOM을 쓰지 않아 Node 테스트를 할 수 있다.
// 판정이 보지 않는 부위를 같은 순간의 체형 맞춤 정답 마네킹(F5)과 비교한 지표 하나를 판정 결과에 더한다.
// - 스쿼트 상체: 판정은 상체-정강이 각도 차만 봐서, 상체를 체형에 비해 너무 세우거나 숙여도 정강이가 같이 기울면 정상이다
// - 푸시업 고개: 푸시업 판정에는 목 정렬이 없다 (플랭크에만 있다)
// - 플랭크 팔꿈치: 판정은 팔꿈치가 어깨 바로 아래에 있는지 보지 않는다
// 몸통 정렬(엉덩이 처짐·솟음)은 푸시업·플랭크 판정이 같은 값으로 이미 보므로 넣지 않는다.
import { ERROR_HOLD_SECONDS, PLANK, REFERENCE_ELBOW_LIMIT, REFERENCE_TORSO_LIMIT, SQUAT } from "./config.js";
import { angleAt, armLean, isBelowLine } from "./geometry.js";
import { stageOf } from "./session.js";

// 상체 차(°) = 사용자 상체 기울기 − 같은 깊이 정답 자세의 상체 기울기. 음수면 마네킹보다 세웠고, 양수면 더 숙였다.
// 반복 구간(허벅지 각 35° 초과)이면서 정답 자세가 그 깊이까지 갈 수 있을 때(thetaMax 이하)만 잰다. 아니면 null
export function torsoGapOf(view, follow) {
  if (!view.points) return null;
  const { thigh, torso } = view.angles;
  if (thigh <= SQUAT.ATTEMPT_MIN || thigh > follow.thetaMax) return null;
  return torso - follow.angles(thigh).torso;
}

// 고개 꺾임(°): 몸통 선(엉덩이→어깨)의 연장선에서 귀가 벗어난 각. 귀가 연장선보다 아래면 음수, 위면 양수다.
// 플랭크 목 정렬 판정(neck)과 같은 각도와 위·아래 구분이다 (꺾임 = 180° − 목 정렬 각)
function headBend(points) {
  const bend = 180 - angleAt(points.ear, points.shoulder, points.hip);
  return isBelowLine(points.ear, points.shoulder, points.hip) ? -bend : bend;
}

// 고개 차(°) = 사용자 고개 꺾임 − 지금 보는 정답 마네킹의 고개 꺾임. 음수면 마네킹보다 숙였고, 양수면 더 들었다.
// 판정 중인 프레임마다 잰다. 아니면 null
export function headGapOf(view, follow) {
  if (!view.points) return null;
  return headBend(view.points) - headBend(follow.pose(view));
}

// 팔꿈치 차(°) = 사용자 위팔 기울기 − 정답 마네킹의 위팔 기울기. 위팔 기울기는 어깨→팔꿈치 선과 수직선(아래) 사이의 각이다.
// 양수면 팔꿈치가 마네킹보다 머리 쪽(어깨보다 앞), 음수면 발 쪽(어깨보다 뒤)에 있다. 판정 중인 프레임마다 잰다. 아니면 null
export function elbowGapOf(view, follow) {
  if (!view.points) return null;
  const reference = follow.pose(view);
  const lean = (points) => armLean(points.shoulder, points.elbow, points.hip);
  return lean(view.points) - lean(reference);
}

// 종목별 비교: 지표 키, 차이 계산, 안내 기준(°), 힌트 키 [음수일 때, 양수일 때]
const GUIDES = {
  squat: { key: "referenceTorso", gapOf: torsoGapOf, limit: REFERENCE_TORSO_LIMIT, hints: ["torsoUpright", "torsoForward"] },
  // 고개 기준은 플랭크 목 정렬 판정과 같다 (HANDOFF 7.4 선택 항목: 푸시업 고개는 플랭크 규칙 재사용)
  pushup: { key: "referenceHead", gapOf: headGapOf, limit: 180 - PLANK.NECK_MIN, hints: ["headDrop", "headHigh"] },
  plank: { key: "referenceElbow", gapOf: elbowGapOf, limit: REFERENCE_ELBOW_LIMIT, hints: ["elbowBehind", "elbowAhead"] },
};

// 마네킹 대비 안내를 만든다. follow: 맞춰 보기(F6). 연습 모드에서 몸 길이를 다 잰 뒤 만든다
export function createReferenceGuide(exercise, follow) {
  const { key, gapOf, limit, hints } = GUIDES[exercise];
  let overSince = null; // 차이가 기준을 넘기 시작한 시각 (ms)

  return {
    // view: session.processFrame 결과, now: 시각(ms), active: 지금 맞춰 보기를 보고 있는가.
    // 잴 수 있으면 지표 하나를 더한 새 결과를, 아니면 view를 그대로 돌려준다.
    // 지표의 단계는 판정 지표와 같은 3단계이고, 힌트 키(errorKey)는 기준을 0.4초 넘게 넘었을 때만 붙는다
    apply(view, now, active) {
      const gap = active ? gapOf(view, follow) : null;
      if (gap === null) {
        overSince = null;
        return view;
      }
      const margin = limit - Math.abs(gap);
      if (margin >= 0) overSince = null;
      else overSince ??= now;
      const held = overSince !== null && now - overSince >= ERROR_HOLD_SECONDS * 1000;
      const indicator = {
        key,
        value: gap,
        margin,
        stage: stageOf(margin),
        errorKey: held ? hints[gap < 0 ? 0 : 1] : null,
      };
      return { ...view, indicators: [...view.indicators, indicator] };
    },
  };
}
