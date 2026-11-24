// 따라 하기 (추가 기능 F7). 체형 맞춤 정답 뼈대(F5)가 반복 동작을 천천히 재생한다. DOM을 쓰지 않아 Node 테스트를 할 수 있다.
import { PLAYBACK_PERIOD_SECONDS, PUSHUP } from "./config.js";
import { facingOf } from "./geometry.js";

// 깊이 비율(0 시작 자세 ~ 1 가장 깊은 곳)에 맞는 종목별 깊이(°). 플랭크는 정지 자세라 재생하지 않는다 (명세 8장)
const DEPTHS = {
  squat: (fraction, thetaMax) => thetaMax * fraction, // 허벅지 각 0 → thetaMax (F5에서 이미 DEPTH_TARGET 이하)
  pushup: (fraction) => 180 - (180 - PUSHUP.BOTTOM_MAX) * fraction, // 팔꿈치 각 180 → 바닥(90°)
};

// 재생할 수 있는 종목인가
export const hasPlayback = (exercise) => exercise in DEPTHS;

// 반복 위치 phase(반복 수)의 깊이 비율 (1 − cos 2π·phase) / 2: 시작 자세 0 → 반 바퀴에서 가장 깊은 1 → 한 바퀴에서 다시 0
export function depthFraction(phase) {
  return (1 - Math.cos(2 * Math.PI * phase)) / 2;
}

// 따라 하기 재생기를 만든다. follow: 맞춰 보기(F6)의 체형 맞춤 정답 자세, speed: 배속, now: 재생을 시작하는 시각(ms).
// 몸 길이를 다 잰 뒤 만들고, 시작 자세부터 바로 재생한다
export function createPlayback(exercise, follow, speed, now) {
  let phase = 0; // 마지막으로 멈추거나 배속을 바꾼 때의 반복 위치 (반복 수)
  let since = now; // 재생 중이면 phase를 잰 시각(ms), 일시정지 중이면 null
  let place = null; // 그릴 곳: 마지막으로 판정한 프레임의 발목과 보는 방향 { ankle, facing }

  // 1배속 한 바퀴가 PLAYBACK_PERIOD_SECONDS다 (앞 절반 내려가기, 뒤 절반 올라오기)
  const phaseAt = (time) =>
    since === null ? phase : phase + ((time - since) * speed) / (PLAYBACK_PERIOD_SECONDS * 1000);
  const depth = (time) => DEPTHS[exercise](depthFraction(phaseAt(time)), follow.thetaMax);

  return {
    get playing() {
      return since !== null;
    },
    // 시작 자세부터 다시 재생한다
    restart(time) {
      phase = 0;
      since = time;
    },
    play(time) {
      since ??= time;
    },
    // 지금 자세에서 멈춘다. 다시 재생하면 여기서 이어진다
    pause(time) {
      phase = phaseAt(time);
      since = null;
    },
    // 배속을 바꿔도 지금 자세에서 이어진다
    setSpeed(value, time) {
      phase = phaseAt(time);
      if (since !== null) since = time;
      speed = value;
    },
    depth, // 시각 time(ms)의 재생 깊이 (°)
    // 프레임마다: 판정 중인 프레임이면 사용자 자리를 기억한다. 다른 보기를 쓰는 동안에도 불러 둔다
    see(view) {
      if (view.points) place = { ankle: view.points.ankle, facing: facingOf(view.points) };
    },
    // 기억한 자리에 맞춘 시각 time(ms)의 정답 관절 좌표(px). 사용자가 화면에서 빠져도 마지막 자리에 그린다. 자리를 모르면 null
    pose(time) {
      return place && follow.poseAt(place.ankle, place.facing, depth(time));
    },
  };
}
