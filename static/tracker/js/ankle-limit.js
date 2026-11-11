// 발목 상한 개인화 (추가 기능 F9). 스쿼트 연습 중 뒤꿈치를 붙인 채 앉은 프레임의 정강이 기울기를 모아,
// 상위 5% 값이 SHIN_MAX보다 작으면 이 세션의 정답 자세(F5) 정강이 상한으로 쓴다. SHIN_MAX보다 올리지는 않는다.
// 세션 동안만 메모리에 두고 저장하지 않는다. DOM을 쓰지 않아 Node 테스트를 할 수 있다.
import { ANKLE_MIN_ATTEMPTS, ANKLE_PERCENTILE, SHIN_MAX, SQUAT } from "./config.js";

// 값들을 작은 순서로 놓았을 때 ratio 위치의 값 (nearest-rank 백분위수). ratio 0.95면 상위 5% 값이다
export function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(ratio * sorted.length) - 1)];
}

// 스쿼트 연습 세션마다 새로 만든다
export function createAnkleLimit() {
  const shins = []; // 반복 구간에서 뒤꿈치가 붙어 있던 프레임의 정강이 기울기 (°)
  let attempts = 0; // 끝난 반복 시도 수 (범위 미달 포함)
  let widest = -Infinity; // 지금까지 정한 상위 5% 값 중 가장 큰 값 (°, 1° 단위)
  let limit = null; // 이 세션의 정강이 상한 (°, 1° 단위). 적용 전이거나 SHIN_MAX 이상이면 null

  return {
    get limit() {
      return limit;
    },
    // 개발용 패널에 보여 줄 관찰 값: observed(상위 5% 값, 관찰 전이면 null), frames(관찰한 프레임 수), attempts
    get summary() {
      return { observed: shins.length > 0 ? percentile(shins, ANKLE_PERCENTILE) : null, frames: shins.length, attempts };
    },
    // 판정 결과를 프레임마다 넣는다. 반복 시도가 끝난 프레임이면 상한을 다시 정하고 true를 돌려준다
    update(view) {
      if (!view.points) return false;
      // 반복 구간(허벅지 각 35° 초과)에서 뒤꿈치가 붙어 있는 프레임만 본다. 발이 가려져 뒤꿈치를 잴 수 없는 프레임은 뺀다
      const heel = view.indicators.find((indicator) => indicator.key === "heelRise");
      if (view.angles.thigh > SQUAT.ATTEMPT_MIN && heel && heel.value <= SQUAT.HEEL_LIFT_LIMIT) shins.push(view.angles.shin);
      const ended = view.events.filter((event) => event.type === "rep" || event.type === "partialRep").length;
      if (ended === 0) return false;
      attempts += ended;
      if (attempts >= ANKLE_MIN_ATTEMPTS && shins.length > 0) {
        // 한 번 확인한 발목 범위는 줄이지 않는다. 따라 하기(F7)의 얕은 정답 자세를 따라 앉으면 정강이가 덜 기울어,
        // 줄일 수 있게 두면 상한과 정답 깊이가 함께 계속 내려간다
        widest = Math.max(widest, Math.round(percentile(shins, ANKLE_PERCENTILE)));
        limit = widest < SHIN_MAX ? widest : null;
      }
      return true;
    },
  };
}
