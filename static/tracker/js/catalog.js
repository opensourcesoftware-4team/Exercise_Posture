// 화면과 음성이 함께 쓰는 문구 (HANDOFF 7.4). 화면과 음성이 다른 말을 하지 않도록 문구는 여기에만 둔다.

export const EXERCISE_NAMES = { squat: "스쿼트", pushup: "푸시업", plank: "플랭크" };

// 오답 키와 이름. 이 키 목록이 그대로 기록 양식(6장)의 errors가 된다 (3종목 14개 키).
export const ERROR_NAMES = {
  squat: {
    torsoLean: "상체 과다 숙임",
    shinLean: "정강이 과다 기울기",
    heelLift: "뒤꿈치 들림",
    partialRep: "범위 미달",
    kneeValgus: "무릎 모임 (정면 모드 예약)",
  },
  pushup: {
    coreDrop: "허리 처짐",
    coreHigh: "엉덩이 솟음",
    handForward: "손이 너무 앞",
    handBackward: "손이 너무 뒤",
    partialRep: "범위 미달",
  },
  plank: {
    hipDrop: "엉덩이 처짐",
    hipHigh: "엉덩이 솟음",
    neckDrop: "고개 숙임",
    neckHigh: "고개 듦",
  },
};

// 오답 안내 문구. 안내 id는 오답 키와 같고, 푸시업 범위 미달만 안내가 둘이다.
export const ERROR_CUES = {
  squat: {
    torsoLean: "상체가 너무 숙여졌어요. 가슴을 조금 더 세워 주세요.",
    shinLean: "무릎이 상체보다 많이 나갔어요. 엉덩이를 조금 더 뒤로 빼 주세요.",
    heelLift: "뒤꿈치가 들렸어요. 발바닥 전체로 바닥을 눌러 주세요.",
    partialRep: "조금 더 깊이 앉아 주세요.",
  },
  pushup: {
    coreDrop: "허리가 처졌어요. 배에 힘을 주고 몸을 일직선으로 만들어 주세요.",
    coreHigh: "엉덩이가 너무 높아요. 몸을 일직선으로 내려 주세요.",
    handForward: "손이 어깨보다 앞에 있어요. 손을 어깨 바로 아래에 두세요.",
    handBackward: "손이 어깨보다 뒤에 있어요. 손을 어깨 바로 아래에 두세요.",
    partialRepShallow: "가슴을 조금 더 내려 주세요.",
    partialRepLockout: "팔을 끝까지 펴 주세요.",
  },
  plank: {
    hipDrop: "엉덩이가 처졌어요. 배와 엉덩이에 힘을 주세요.",
    hipHigh: "엉덩이가 너무 높아요. 몸을 일직선으로 내려 주세요.",
    neckDrop: "고개가 떨어졌어요. 시선을 바닥 조금 앞쪽에 두세요.",
    neckHigh: "고개를 너무 들었어요. 목을 몸과 일직선으로 두세요.",
  },
};

// 개발용 화면에 보이는 반복별 판정 값의 이름 (단위: 도)
export const MEASURE_LABELS = {
  depth: "깊이",
  torsoShin: "몸통-정강이",
  heelRise: "발 각도 변화",
  elbowMin: "팔꿈치 최소",
  elbowMax: "바닥 이후 팔꿈치 최대",
};

// 지표 이름 (추가 기능 F2 패널)
export const INDICATOR_LABELS = {
  torsoShin: "상체–정강이 차",
  heelRise: "뒤꿈치",
  bodyLine: "몸통 정렬",
  armLean: "팔 기울기",
  neck: "목 정렬",
};

// 연습 모드 권유형 힌트 (추가 기능 F1). 위에 있을수록 먼저 보여 주고, 한 번에 하나만 보인다.
// keys: 이 힌트를 띄우는 오답 키 또는 안내 id (주황 이상인 지표, 방금 끝난 범위 미달)
export const PRACTICE_HINTS = {
  squat: [
    { keys: ["heelLift"], text: "뒤꿈치를 바닥에 붙여 볼까요?" },
    { keys: ["torsoLean"], text: "가슴을 조금만 세워 볼까요?" },
    { keys: ["shinLean"], text: "엉덩이를 조금 뒤로 빼 볼까요?" },
    { keys: ["partialRep"], text: "조금만 더 앉아 볼까요?" },
  ],
  pushup: [
    { keys: ["coreDrop", "coreHigh"], text: "배에 힘을 주고 몸을 일직선으로 만들어 볼까요?" },
    { keys: ["handForward", "handBackward"], text: "손을 어깨 바로 아래에 두어 볼까요?" },
    { keys: ["partialRepShallow"], text: "가슴을 조금 더 내려 볼까요?" },
    { keys: ["partialRepLockout"], text: "팔을 끝까지 펴 볼까요?" },
  ],
  plank: [
    { keys: ["hipDrop", "hipHigh"], text: "엉덩이를 몸과 일직선으로 맞춰 볼까요?" },
    { keys: ["neckDrop", "neckHigh"], text: "시선을 바닥 조금 앞쪽에 두어 볼까요?" },
  ],
};

// 몸 길이 측정 자세 안내 (추가 기능 F4). 스쿼트는 선 자세, 푸시업은 팔을 편 시작 자세, 플랭크는 플랭크 자세에서 잰다
export const MEASURE_TEXT = {
  squat: "옆으로 서서 잠깐 기다려 주세요.",
  pushup: "팔을 편 푸시업 시작 자세로 잠깐 멈춰 주세요.",
  plank: "플랭크 자세로 잠깐 멈춰 주세요.",
};

// 모드별 화면 문구 (추가 기능 F1)
export const MODE_TEXT = {
  finishRecord: "종료하고 저장",
  finishPractice: "연습 끝내기",
  practiceEnd: "연습은 기록되지 않았어요.",
};

// 상태 안내 (화면에만 표시)
export const STATUS = {
  loading: "AI 모델을 불러오는 중이에요...",
  loadError: "AI 모델을 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.",
  ready: "종목을 고르고 시작을 눌러 주세요.",
  cameraError: "카메라를 켜지 못했어요. 브라우저의 카메라 권한을 확인해 주세요.",
  countdown: (seconds) => `운동 시작 ${seconds}초 전... 자세를 잡으세요!`,
  notVisible: "몸 전체가 보이도록 서 주세요.",
  notSideView: "옆에서 촬영해 주세요.",
  notInPosition: "운동 자세를 잡아 주세요.",
  measuring: "측정 중이에요. 계속하세요!",
  noRecord: "기록할 운동이 없어요.",
};
