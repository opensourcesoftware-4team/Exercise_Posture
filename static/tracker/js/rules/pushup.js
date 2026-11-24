// 푸시업 판정 규칙 (HANDOFF 7.1 진입 조건, 7.3 반복 측정, 7.4 오답)
import { LYING_MAX_ANGLE, PUSHUP } from "../config.js";
import { isBelowLine } from "../geometry.js";

// 지금 프레임의 지표. 화면 색·패널·연습 힌트와 지속 오답 판정이 이 값 하나를 함께 쓴다.
// margin = 기준까지 남은 여유(도). 음수면 기준을 넘은 상태이고, 그때 errorKey가 지속 오답 후보가 된다.
// 위·아래(앞·뒤) 키는 한쪽만 나오므로 같은 순간에 함께 기록되지 않는다.
function indicatorsOf(angles, points) {
  const indicators = [
    {
      key: "bodyLine",
      value: angles.bodyLine,
      margin: angles.bodyLine - PUSHUP.ALIGN_MIN,
      errorKey: isBelowLine(points.hip, points.shoulder, points.ankle) ? "coreDrop" : "coreHigh",
    },
  ];
  if (angles.elbow >= PUSHUP.TOP_MIN) {
    // 손 위치는 팔을 편 위쪽 자세에서만 본다
    indicators.push({
      key: "armLean",
      value: angles.armLean,
      margin: PUSHUP.ARM_LEAN_LIMIT - Math.abs(angles.armLean),
      errorKey: angles.armLean > 0 ? "handForward" : "handBackward",
    });
  }
  return indicators;
}

function newAttempt(elbow) {
  return { elbowMin: elbow, elbowMax: null, bottom: elbow <= PUSHUP.BOTTOM_MAX, rose: false };
}

// 개발용 화면에 보이는 판정 값: 가장 굽힌 각, 바닥을 찍은 뒤 가장 편 각
function measuresOf(attempt) {
  return { elbowMin: attempt.elbowMin, elbowMax: attempt.elbowMax };
}

// 세션마다 새로 만든다. 판정에 필요한 상태는 이 안에만 둔다.
export function createPushupRule() {
  let attempt = null; // 진행 중인 반복 시도. 팔을 편 위쪽 자세면 null

  // 팔꿈치 각으로 반복을 잰다 (7.3). 반환: 이번 프레임에 끝난 반복 또는 범위 미달, 없으면 null
  // 위쪽 → 125° 미만: 시도 시작 → 90° 이하: 바닥 → 160° 이상: 1회
  function trackRep(elbow) {
    if (!attempt) {
      if (elbow < PUSHUP.ATTEMPT_MAX) attempt = newAttempt(elbow);
      return null;
    }
    attempt.elbowMin = Math.min(attempt.elbowMin, elbow);
    if (elbow <= PUSHUP.BOTTOM_MAX) attempt.bottom = true;
    if (attempt.bottom) attempt.elbowMax = Math.max(attempt.elbowMax ?? elbow, elbow);

    if (elbow >= PUSHUP.TOP_MIN) {
      // 팔을 끝까지 폈다: 바닥을 찍었으면 1회, 아니면 범위 미달 ① (덜 내려감)
      const event = attempt.bottom
        ? { type: "rep", errors: [], measures: measuresOf(attempt) }
        : { type: "partialRep", cue: "partialRepShallow", measures: measuresOf(attempt) };
      attempt = null;
      return event;
    }
    if (attempt.bottom && elbow > PUSHUP.ATTEMPT_MAX) attempt.rose = true;
    if (attempt.rose && elbow < PUSHUP.ATTEMPT_MAX) {
      // 바닥을 찍고 올라오다 끝까지 펴지 않고 다시 내려갔다: 범위 미달 ②, 지금부터 새 시도다
      const event = { type: "partialRep", cue: "partialRepLockout", measures: measuresOf(attempt) };
      attempt = newAttempt(elbow);
      return event;
    }
    return null;
  }

  return {
    // 진입 조건: 누운 자세(몸 수평 각 45° 이하)이고 손목이 어깨보다 아래
    isInPosition(angles, points) {
      return angles.bodyLevel <= LYING_MAX_ANGLE && points.wrist.y > points.shoulder.y;
    },

    // 반환: events = 이번 프레임에 끝난 반복·범위 미달, holding = 지금 조건이 참인 지속 오답 키,
    //       indicators = 지금 프레임의 지표
    update(angles, points) {
      const event = trackRep(angles.elbow);
      const indicators = indicatorsOf(angles, points);
      const holding = indicators.filter((indicator) => indicator.margin < 0).map((indicator) => indicator.errorKey);
      return { events: event ? [event] : [], holding, indicators };
    },
  };
}
