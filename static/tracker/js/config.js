// 판정 엔진의 모든 수치 (HANDOFF 7장). 수치를 바꿀 때는 이 파일만 고친다.

// 7.1 공통 처리
export const MIN_VISIBILITY = 0.7; // 좌·우 관절 묶음 평균 가시성 하한
export const SIDE_VIEW_MAX_ANGLE = 50; // 코-양 어깨 각이 이보다 크면 정면 (LearnOpenCV OFFSET_THRESH)
export const LYING_MAX_ANGLE = 45; // 푸시업·플랭크 진입 조건: 몸 수평 각 상한 (팀 설정값)
export const SMOOTHING_FRAMES = 7; // 각도 이동 중앙값에 쓰는 프레임 수 (30fps에서 약 0.23초. 3프레임까지 튀는 값을 걸러 낸다)
export const ERROR_HOLD_SECONDS = 0.4; // 같은 오답 조건이 이만큼 이어지면 1회
export const VOICE_COOLDOWN_SECONDS = 2.5; // 같은 안내의 음성 반복 금지 시간 (레거시 값)
export const MAX_FRAME_GAP_SECONDS = 1; // 프레임 간격이 이보다 길면(탭 전환 등) 그 시간은 세지 않는다

// 추가 기능 F2: 기준까지 이 각도 이내로 다가가면 "주의"(주황)로 보여 준다
export const STAGE_WARN_MARGIN = 5;

// 추가 기능 F4: 몸 길이 측정. 가시성 기준은 MIN_VISIBILITY를 관절마다 적용한다
export const MEASURE_FRAMES = 60; // 한 번에 재는 프레임 수 (30fps에서 약 2초)
export const MEASURE_MIN_VALID = 30; // 이 중 유효 프레임이 이보다 적으면 처음부터 다시 잰다
export const MEASURE_STANCE_MIN = 1.0; // 스쿼트: 두 발목 사이 거리가 어깨 너비의 이 배 이상일 때만 잰다 (3D 추정 좌표)
export const MEASURE_TURN_MAX = 15; // 스쿼트: 몸이 정측면(카메라와 90°)에서 이 각도(°) 이내로 돌아가 있을 때만 잰다 (3D 추정 좌표)

// 추가 기능 F5: 체형 맞춤 정답 자세 (스쿼트). 푸시업 정답 자세는 PUSHUP.BOTTOM_MAX까지 내려간다
export const DEPTH_TARGET = 90; // 정답 동작이 보여 주는 최대 허벅지-수직 각 (허벅지 수평)
export const SHIN_MAX = 30; // 정답 자세의 정강이 기울기 상한 (팀 설정값)
export const TRUNK_EXTRA_MAX = 10; // 정강이 상한에 걸렸을 때 상체를 정강이보다 더 숙일 수 있는 한도
// 무게중심 계산용 분절 질량비 (Winter): 머리·팔·몸통 / 허벅지 양쪽 / 정강이 양쪽. 발은 바닥에 있어 뺀다
export const MASS_HAT = 0.678;
export const MASS_THIGH = 0.2;
export const MASS_SHANK = 0.093;

// 추가 기능 F6: 정답 뼈대 맞춰 보기
export const REFERENCE_ALPHA = 0.45; // 정답 뼈대 불투명도
export const REFERENCE_GLOW_ALPHA = 0.9; // 맞았을 때 밝게 보여 주는 불투명도 (팀 설정값)
export const MATCH_HOLD_SECONDS = 1; // 반복 구간에서 지표가 모두 초록인 상태가 이만큼 이어지면 정답 뼈대를 밝게
export const MATCH_GLOW_SECONDS = 1; // 밝게 보여 주는 시간

// 7.6 세션 흐름
export const COUNTDOWN_SECONDS = 10; // 준비 카운트다운 (레거시 값)

// 7.3 반복 측정, 7.4 오답 (각도 단위: 도)
// 오답 기준은 "문헌·프로토콜 값 + 측정 여유"다. 웹캠 2D 좌표와 MediaPipe 점 오차 때문에
// 문헌 값 그대로는 바른 자세도 오답이 되어(카메라 실측 10/27) 여유를 더했다. 괄호 안이 문헌 값이다.
export const SQUAT = {
  STAND_MAX: 30, // 서기: 허벅지-수직 각 이하 (진입 조건에도 쓴다)
  ATTEMPT_MIN: 35, // 반복 시도: 초과
  PASS_MIN: 70, // 통과: 이상
  TORSO_SHIN_LIMIT: 25, // torsoLean은 +25 초과, shinLean은 -25 미만 (10 + 여유 15)
  HEEL_LIFT_LIMIT: 15, // heelLift: 앉은 구간 발 각도 중앙값이 선 자세 중앙값보다 이만큼 넘게 큼 (10 + 여유 5)
};

export const PUSHUP = {
  ATTEMPT_MAX: 125, // 반복 시도: 팔꿈치 각 미만. 바닥을 찍은 뒤 이 각을 넘었다가 다시 내려가면 범위 미달 ②
  BOTTOM_MAX: 90, // 바닥: 이하
  TOP_MIN: 160, // 팔 펴짐: 이상
  ALIGN_MIN: 160, // 몸통 정렬 각 하한 (170 - 여유 10)
  ARM_LEAN_LIMIT: 15, // 팔을 폈을 때 팔 기울기가 +15° 초과면 handForward, -15° 미만이면 handBackward (10 + 여유 5)
};

export const PLANK = {
  ALIGN_MIN: 160, // 몸통 정렬 각 하한 (170 - 여유 10)
  NECK_MIN: 145, // 목 정렬 각 하한 (팀 설정값 155 - 여유 10)
};
