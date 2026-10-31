// 테스트용 가짜 MediaPipe 랜드마크 (카메라 없이 판정 흐름을 확인하려고 쓴다)

export const WIDTH = 1280;
export const HEIGHT = 720;

const INDEX = {
  left: { ear: 7, shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27, heel: 29, toe: 31 },
  right: { ear: 8, shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28, heel: 30, toe: 32 },
};

// 카메라 쪽 몸의 정규화 좌표로 33개 점을 만든다.
// 반대쪽 몸은 x를 조금 옮기고 가시성을 낮춘다(측면 촬영에서 가려진 쪽). hidden에 적은 관절은 가려진 것으로 만든다.
export function fakeLandmarks(body, { nearSide = "right", near = 0.9, far = 0.3, hidden = [] } = {}) {
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: far }));
  const farSide = nearSide === "right" ? "left" : "right";
  landmarks[0] = { ...body.nose, z: 0, visibility: near };
  for (const [joint, index] of Object.entries(INDEX[nearSide])) {
    landmarks[index] = { ...body[joint], z: 0, visibility: hidden.includes(joint) ? far : near };
  }
  for (const [joint, index] of Object.entries(INDEX[farSide])) {
    landmarks[index] = { x: body[joint].x + 0.01, y: body[joint].y, z: 0, visibility: far };
  }
  return landmarks;
}

// 옆으로 선 자세
export const STANDING_BODY = {
  nose: { x: 0.53, y: 0.15 },
  ear: { x: 0.5, y: 0.14 },
  shoulder: { x: 0.5, y: 0.25 },
  elbow: { x: 0.5, y: 0.38 },
  wrist: { x: 0.5, y: 0.5 },
  hip: { x: 0.5, y: 0.5 },
  knee: { x: 0.5, y: 0.7 },
  ankle: { x: 0.5, y: 0.9 },
  heel: { x: 0.48, y: 0.92 },
  toe: { x: 0.56, y: 0.92 },
};

const radians = (degrees) => (degrees * Math.PI) / 180;

// 옆에서 본 스쿼트 자세(오른쪽을 보는 사람). 각도는 HANDOFF 7.2 정의 그대로 들어가도록 픽셀 단위로 만든다.
// thigh: 허벅지-수직 각, torso: 몸통 기울기, shin: 정강이 기울기, heelRaise: 뒤꿈치를 든 높이(px)
export function squatBody(thigh, { torso = 30, shin = 25, heelRaise = 0 } = {}) {
  const ankle = { x: 640, y: 640 };
  const knee = { x: ankle.x + 180 * Math.sin(radians(shin)), y: ankle.y - 180 * Math.cos(radians(shin)) };
  const hip = { x: knee.x - 180 * Math.sin(radians(thigh)), y: knee.y - 180 * Math.cos(radians(thigh)) };
  const shoulder = { x: hip.x + 220 * Math.sin(radians(torso)), y: hip.y - 220 * Math.cos(radians(torso)) };
  const ear = { x: shoulder.x + 50 * Math.sin(radians(torso)), y: shoulder.y - 50 * Math.cos(radians(torso)) };
  const pixels = {
    ankle,
    knee,
    hip,
    shoulder,
    ear,
    nose: { x: ear.x + 25, y: ear.y + 5 },
    elbow: { x: shoulder.x + 60, y: shoulder.y + 60 },
    wrist: { x: shoulder.x + 120, y: shoulder.y + 60 },
    heel: { x: ankle.x - 25, y: ankle.y + 15 - heelRaise },
    toe: { x: ankle.x + 55, y: ankle.y + 15 },
  };
  return Object.fromEntries(
    Object.entries(pixels).map(([joint, { x, y }]) => [joint, { x: x / WIDTH, y: y / HEIGHT }]),
  );
}

// 엎드려 손바닥을 짚은 자세(오른쪽이 머리). 푸시업과 하이 플랭크에 쓴다.
// elbow: 팔꿈치 각, armLean: 팔 기울기(머리 쪽 +), sag: 엉덩이를 내린 높이(px, 음수면 올림),
// headDrop: 귀를 내린 높이(px, 음수면 올림)
export function proneBody({ elbow = 180, armLean = 0, sag = 0, headDrop = 0 } = {}) {
  const arm = 130; // 위팔·아래팔 길이(px)
  const lean = radians(armLean);
  const wrist = { x: 800, y: 600 };
  const reach = 2 * arm * Math.sin(radians(elbow / 2)); // 어깨~손목 거리
  const shoulder = { x: wrist.x - reach * Math.sin(lean), y: wrist.y - reach * Math.cos(lean) };
  const bend = arm * Math.cos(radians(elbow / 2)); // 팔꿈치가 발 쪽으로 나온 거리
  const elbowPoint = {
    x: (shoulder.x + wrist.x) / 2 - bend * Math.cos(lean),
    y: (shoulder.y + wrist.y) / 2 + bend * Math.sin(lean),
  };
  const ankle = { x: shoulder.x - Math.sqrt(600 ** 2 - (580 - shoulder.y) ** 2), y: 580 }; // 어깨~발목 600px
  const toHead = { x: (shoulder.x - ankle.x) / 600, y: (shoulder.y - ankle.y) / 600 };
  const hip = { x: (shoulder.x + ankle.x) / 2, y: (shoulder.y + ankle.y) / 2 + sag };
  const ear = { x: shoulder.x + 60 * toHead.x, y: shoulder.y + 60 * toHead.y + headDrop };
  const pixels = {
    shoulder,
    elbow: elbowPoint,
    wrist,
    hip,
    knee: { x: (hip.x + ankle.x) / 2, y: (hip.y + ankle.y) / 2 },
    ankle,
    heel: { x: ankle.x - 15, y: ankle.y - 10 },
    toe: { x: ankle.x + 10, y: ankle.y + 20 },
    ear,
    nose: { x: ear.x + 25 * toHead.x, y: ear.y + 25 * toHead.y + 8 },
  };
  return Object.fromEntries(
    Object.entries(pixels).map(([joint, { x, y }]) => [joint, { x: x / WIDTH, y: y / HEIGHT }]),
  );
}

// 팔꿈치를 대고 엎드린 플랭크 자세 (머리와 몸통이 일직선)
export const PLANK_BODY = {
  nose: { x: 0.17, y: 0.5 },
  ear: { x: 0.2, y: 0.495 },
  shoulder: { x: 0.25, y: 0.5 },
  elbow: { x: 0.25, y: 0.65 },
  wrist: { x: 0.32, y: 0.65 },
  hip: { x: 0.5, y: 0.52 },
  knee: { x: 0.68, y: 0.54 },
  ankle: { x: 0.85, y: 0.56 },
  heel: { x: 0.87, y: 0.55 },
  toe: { x: 0.86, y: 0.6 },
};
