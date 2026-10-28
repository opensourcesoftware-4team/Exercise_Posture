// 스쿼트 판정 규칙 (HANDOFF 7.1 진입 조건, 7.3 반복 측정, 7.4 오답)
import { MIN_VISIBILITY, SQUAT } from "../config.js";
import { median } from "../geometry.js";

// 뒤꿈치·발끝이 모두 보이는가. 발이 가려진 프레임은 heelLift 비교에서 뺀다.
function feetVisible(points) {
  return points.heel.visibility >= MIN_VISIBILITY && points.toe.visibility >= MIN_VISIBILITY;
}

// 시도가 끝났을 때(다시 섰을 때)의 판정. 반복당 오답은 여기서 한 번에 정한다.
// 점이 몇 프레임 튀어도 흔들리지 않도록 값은 모두 중앙값으로 잰다. measures는 개발용 화면에도 보인다.
function judgeAttempt(attempt) {
  const passed = attempt.torsoShin.length > 0; // 통과 구간(70° 이상)을 지났는가
  const measures = {
    depth: attempt.depth,
    torsoShin: passed ? median(attempt.torsoShin) : null,
    heelRise: attempt.feet.length > 0 && attempt.standingFoot !== null ? median(attempt.feet) - attempt.standingFoot : null,
  };
  if (!passed) return { type: "partialRep", measures };

  const errors = [];
  if (measures.torsoShin > SQUAT.TORSO_SHIN_LIMIT) errors.push("torsoLean");
  if (measures.torsoShin < -SQUAT.TORSO_SHIN_LIMIT) errors.push("shinLean");
  if (measures.heelRise !== null && measures.heelRise > SQUAT.HEEL_LIFT_LIMIT) errors.push("heelLift");
  return { type: "rep", errors, measures };
}

// 세션마다 새로 만든다. 판정에 필요한 상태는 이 안에만 둔다.
export function createSquatRule() {
  let standingSeen = false;
  let standingFeet = []; // 지금 서 있는 동안의 발 각도들. 중앙값이 다음 반복의 heelLift 기준이 된다
  let attempt = null; // 진행 중인 반복 시도. 서 있으면 null

  return {
    // 진입 조건: 서기 상태(허벅지-수직 각 30° 이하)를 한 번 거친 뒤부터 측정한다
    isInPosition(angles) {
      if (angles.thigh <= SQUAT.STAND_MAX) standingSeen = true;
      return standingSeen;
    },

    // 서 있음 → 35° 초과: 시도 시작 → 70° 이상: 통과 구간 → 30° 이하로 돌아옴: 판정
    // 반환: events = 이번 프레임에 끝난 반복·범위 미달, holding = 스쿼트는 지속 오답이 없어 항상 빈 배열
    update(angles, points) {
      const footSeen = feetVisible(points);
      if (!attempt) {
        if (footSeen) standingFeet.push(angles.foot);
        if (angles.thigh > SQUAT.ATTEMPT_MIN) {
          const standingFoot = standingFeet.length > 0 ? median(standingFeet) : null;
          attempt = { depth: angles.thigh, standingFoot, torsoShin: [], feet: [] };
        }
        return { events: [], holding: [] };
      }

      attempt.depth = Math.max(attempt.depth, angles.thigh);
      if (angles.thigh >= SQUAT.PASS_MIN) {
        attempt.torsoShin.push(angles.torsoShin);
        if (footSeen) attempt.feet.push(angles.foot);
      }
      if (angles.thigh > SQUAT.STAND_MAX) return { events: [], holding: [] };

      const event = judgeAttempt(attempt);
      attempt = null;
      standingFeet = []; // 다음 반복의 기준은 다시 선 뒤에 새로 잰다
      return { events: [event], holding: [] };
    },
  };
}
