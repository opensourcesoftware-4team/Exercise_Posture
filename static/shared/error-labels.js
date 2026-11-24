// 오답 키 → 화면 표시 이름 (session-record-format.md 4.3절과 동일)
export const ERROR_LABELS = {
  torsoLean: "상체 과다 숙임", shinLean: "정강이 과다 기울기", heelLift: "뒤꿈치 들림",
  partialRep: "가동범위 부족", kneeValgus: "무릎 안쪽 모임",
  coreDrop: "허리 처짐", coreHigh: "엉덩이 솟음", handForward: "손이 너무 앞", handBackward: "손이 너무 뒤",
  hipDrop: "엉덩이 처짐", hipHigh: "엉덩이 솟음", neckDrop: "고개 숙임", neckHigh: "고개 듦",
};

// partialRep은 종목마다 표시가 다르다 (스쿼트: 깊이 부족, 푸시업: 가동범위 부족)
export function errorLabel(exercise, key) {
  if (key === "partialRep" && exercise === "squat") return "깊이 부족";
  return ERROR_LABELS[key] ?? key;
}

// 종목별 오답 키 표시 순서 (기록 양식 4.2절, stats.py의 ERROR_ORDER와 동일)
export const ERROR_ORDER = {
  squat: ["torsoLean", "shinLean", "heelLift", "partialRep", "kneeValgus"],
  pushup: ["coreDrop", "coreHigh", "handForward", "handBackward", "partialRep"],
  plank: ["hipDrop", "hipHigh", "neckDrop", "neckHigh"],
};

export const EXERCISE_NAMES = { squat: "스쿼트", pushup: "푸시업", plank: "플랭크" };
