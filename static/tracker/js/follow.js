// 정답 뼈대 맞춰 보기 (추가 기능 F6). 매 프레임 사용자의 깊이와 발목에 맞춘 체형 맞춤 정답 관절 좌표(F5)를 만들고,
// 바른 자세가 이어지면 정답 뼈대를 잠깐 밝게 보여 줄지 정한다. DOM을 쓰지 않아 Node 테스트를 할 수 있다.
import { MATCH_GLOW_SECONDS, MATCH_HOLD_SECONDS, PUSHUP, SHIN_MAX, SQUAT } from "./config.js";
import { facingOf } from "./geometry.js";
import { createPlankReference, createPushupReference, createSquatReference } from "./reference-pose.js";

const REFERENCES = { squat: createSquatReference, pushup: createPushupReference, plank: createPlankReference };
const DEPTH_ANGLE = { squat: "thigh", pushup: "elbow" }; // 정답 깊이로 쓰는 다듬은 각도. 플랭크는 고정 자세다

// 반복 구간: 반복 시도로 세는 깊이 (판정의 경계와 같다). 플랭크는 판정 중이면 늘 구간 안이다
const IN_REP = {
  squat: (angles) => angles.thigh > SQUAT.ATTEMPT_MIN,
  pushup: (angles) => angles.elbow < PUSHUP.ATTEMPT_MAX,
  plank: () => true,
};

// 측정 때와 반대쪽을 보는 몸. 좌우가 뒤집히면 보는 방향과 뒤꿈치의 x 차이도 부호가 바뀐다
function mirrored(body) {
  const flipped = { ...body, facing: -body.facing };
  if (body.heelOffset !== undefined) flipped.heelOffset = -body.heelOffset;
  return flipped;
}

// 맞춰 보기를 만든다. body: F4 측정값. 몸 길이를 다 잰 뒤 한 번 만든다
export function createReferenceFollow(exercise, body) {
  const create = REFERENCES[exercise];
  // 보는 방향별 F5 계산기. shinMax: 스쿼트 정강이 상한 (푸시업·플랭크 계산기는 쓰지 않는다)
  const build = (shinMax) => ({ [body.facing]: create(body, shinMax), [-body.facing]: create(mirrored(body), shinMax) });
  let references = build(SHIN_MAX);

  // 발목 ankle(px)·보는 방향 facing(±1)·깊이 depth(°)의 정답 관절 좌표(px). 깊이는 F5가 자른다 (스쿼트 0~thetaMax, 푸시업 바닥~180°)
  const poseAt = (ankle, facing, depth) => references[facing].pose(ankle, depth);

  return {
    // 스쿼트: 이 체형의 정답 자세가 갈 수 있는 최대 깊이 (그 밖은 undefined). 정강이 상한을 바꾸면 따라 바뀐다
    get thetaMax() {
      return references[body.facing].thetaMax;
    },
    // 스쿼트 정강이 상한(°)을 바꿔 정답 자세를 다시 만든다 (F9 발목 상한 개인화). null이면 SHIN_MAX로 돌린다
    setShinMax(shinMax) {
      references = build(shinMax ?? SHIN_MAX);
    },
    poseAt, // 따라 하기(F7)도 같은 정답 자세를 쓴다
    // view: session.processFrame 결과. 판정 중인 프레임이면 지금 보는 방향·발목·깊이에 맞춘 정답 관절 좌표(px), 아니면 null
    pose(view) {
      if (!view.points) return null;
      return poseAt(view.points.ankle, facingOf(view.points), view.angles[DEPTH_ANGLE[exercise]]);
    },
  };
}

// 긍정 피드백 (F6): 반복 구간에서 보이는 지표가 모두 초록인 상태가 MATCH_HOLD_SECONDS 이어지면 MATCH_GLOW_SECONDS 동안 밝게.
// 스쿼트·푸시업은 반복마다 한 번(반복 구간을 벗어나야 다시 밝아진다), 플랭크는 초록이 끊겼다가 다시 이어질 때마다 한 번이다
export function createMatchGlow(exercise) {
  let greenSince = null; // 초록이 이어지기 시작한 시각 (ms)
  let glowUntil = -Infinity;
  let ready = true; // 다시 밝아질 수 있는가

  return {
    // 프레임마다 판정 결과와 시각(ms)을 넣으면 지금 정답 뼈대를 밝게 그릴지 돌려준다
    update(view, now) {
      const inRep = view.points !== null && IN_REP[exercise](view.angles);
      const green = inRep && view.indicators.length > 0 && view.indicators.every((item) => item.stage === "good");
      if (exercise === "plank" ? !green : !inRep) ready = true;
      if (!green) greenSince = null;
      else {
        greenSince ??= now;
        if (ready && now - greenSince >= MATCH_HOLD_SECONDS * 1000) {
          glowUntil = now + MATCH_GLOW_SECONDS * 1000;
          ready = false;
        }
      }
      return now < glowUntil;
    },
  };
}
