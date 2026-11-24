// 플랭크 판정 규칙 (HANDOFF 7.1 진입 조건, 7.4 오답). 유지 시간은 session.js가 잰다.
import { LYING_MAX_ANGLE, PLANK } from "../config.js";
import { isBelowLine } from "../geometry.js";

// 지금 프레임의 지표. 화면 색·패널·연습 힌트와 지속 오답 판정이 이 값 하나를 함께 쓴다.
// margin = 기준까지 남은 여유(도). 음수면 기준을 넘은 상태이고, 그때 errorKey가 지속 오답 후보가 된다.
function indicatorsOf(angles, points) {
  return [
    {
      key: "bodyLine",
      value: angles.bodyLine,
      margin: angles.bodyLine - PLANK.ALIGN_MIN,
      errorKey: isBelowLine(points.hip, points.shoulder, points.ankle) ? "hipDrop" : "hipHigh",
    },
    {
      // 귀가 어깨-엉덩이 선의 연장선보다 아래면 고개가 떨어진 것이다
      key: "neck",
      value: angles.neck,
      margin: angles.neck - PLANK.NECK_MIN,
      errorKey: isBelowLine(points.ear, points.shoulder, points.hip) ? "neckDrop" : "neckHigh",
    },
  ];
}

// 세션마다 새로 만든다. 플랭크는 반복이 없어 상태도 없다.
export function createPlankRule() {
  return {
    // 진입 조건: 누운 자세(몸 수평 각 45° 이하)이고 팔꿈치가 어깨보다 아래
    isInPosition(angles, points) {
      return angles.bodyLevel <= LYING_MAX_ANGLE && points.elbow.y > points.shoulder.y;
    },

    // 오답은 모두 지속 판정이다. 0.4초 규칙은 session.js가 적용한다.
    // 반환: events = 항상 빈 배열, holding = 지금 조건이 참인 키 (위·아래 키는 한쪽만 나온다), indicators = 지표
    update(angles, points) {
      const indicators = indicatorsOf(angles, points);
      const holding = indicators.filter((indicator) => indicator.margin < 0).map((indicator) => indicator.errorKey);
      return { events: [], holding, indicators };
    },
  };
}
