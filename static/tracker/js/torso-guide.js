// 마네킹 대비 상체 안내 (연습 모드, 스쿼트). 판정(rules/)과 기록은 바꾸지 않는다. DOM을 쓰지 않아 Node 테스트를 할 수 있다.
// 판정의 몸통-정강이 각은 두 각도의 차이만 봐서, 상체를 체형에 비해 너무 세우거나 숙여도 정강이가 같이 기울면 정상이다.
// 그래서 사용자 상체 기울기를 같은 깊이의 체형 맞춤 정답 자세(F5) 상체 기울기와 비교한 지표 하나를 판정 결과에 더한다.
import { ERROR_HOLD_SECONDS, REFERENCE_TORSO_LIMIT, SQUAT } from "./config.js";
import { stageOf } from "./session.js";

// 상체 차(°) = 사용자 상체 기울기 − 같은 깊이 정답 자세의 상체 기울기. 음수면 마네킹보다 세웠고, 양수면 더 숙였다.
// 반복 구간(허벅지 각 35° 초과)이면서 정답 자세가 그 깊이까지 갈 수 있을 때(thetaMax 이하)만 잰다. 아니면 null
export function torsoGapOf(view, follow) {
  if (!view.points) return null;
  const { thigh, torso } = view.angles;
  if (thigh <= SQUAT.ATTEMPT_MIN || thigh > follow.thetaMax) return null;
  return torso - follow.angles(thigh).torso;
}

// follow: 맞춰 보기(F6). 스쿼트 연습에서 몸 길이를 다 잰 뒤 만든다
export function createTorsoGuide(follow) {
  let overSince = null; // 상체 차가 기준을 넘기 시작한 시각 (ms)

  return {
    // view: session.processFrame 결과, now: 시각(ms), active: 지금 맞춰 보기를 보고 있는가.
    // 잴 수 있으면 지표 referenceTorso를 더한 새 결과를, 아니면 view를 그대로 돌려준다.
    // 지표의 단계는 판정 지표와 같은 3단계이고, 힌트 키(errorKey)는 기준을 0.4초 넘게 넘었을 때만 붙는다
    apply(view, now, active) {
      const gap = active ? torsoGapOf(view, follow) : null;
      if (gap === null) {
        overSince = null;
        return view;
      }
      const margin = REFERENCE_TORSO_LIMIT - Math.abs(gap);
      if (margin >= 0) overSince = null;
      else overSince ??= now;
      const held = overSince !== null && now - overSince >= ERROR_HOLD_SECONDS * 1000;
      const indicator = {
        key: "referenceTorso",
        value: gap,
        margin,
        stage: stageOf(margin),
        errorKey: held ? (gap < 0 ? "torsoUpright" : "torsoForward") : null,
      };
      return { ...view, indicators: [...view.indicators, indicator] };
    },
  };
}
