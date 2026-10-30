// 세션 모드 (추가 기능 F1). 판정 엔진은 두 모드가 똑같고, 화면에 무엇을 보여 주고 무엇을 저장할지만 다르다.
// 모드에 따른 차이는 이 표 하나에만 둔다. 판정 코드(session.js, rules/)에는 모드 분기가 없다.
import { PRACTICE_HINTS } from "./catalog.js";

export const MODES = {
  // 수행: 기록을 남기는 운동
  record: {
    showNumbers: true, // 횟수·시간·정확도를 보여 준다
    sounds: true, // 올바른 반복 효과음
    voice: true, // 음성 안내
    redStage: true, // 빨강(수정) 단계를 그대로 보여 준다
    practiceHints: false, // 오답별 교정 문구(catalog.js ERROR_CUES)를 쓴다
    save: true, // 종료하면 기록을 저장한다
    badge: false, // "연습 중" 배지
    measureBody: false, // 카운트다운 뒤 판정 전에 몸 길이를 잰다 (F4)
  },
  // 연습: 저장하지 않고 숫자도 보이지 않는다. 음성은 체크박스로 켤 수 있다
  practice: {
    showNumbers: false,
    sounds: false,
    voice: false,
    redStage: false, // 빨강 조건도 주황으로 보여 준다
    practiceHints: true, // 권유형 힌트를 한 번에 하나만 보여 준다
    save: false,
    badge: true,
    measureBody: true,
  },
};

// 화면에 보일 단계. 연습 모드는 빨강 대신 주황이다
export function displayStage(stage, mode) {
  return stage === "bad" && !mode.redStage ? "warn" : stage;
}

// 연습 모드 힌트: 지금 걸린 키 중 우선순위가 가장 높은 힌트 하나의 문구 (없으면 null)
// activeKeys: 주황 이상인 지표의 오답 키와, 방금 끝난 범위 미달의 안내 id
export function pickPracticeHint(exercise, activeKeys) {
  const hint = PRACTICE_HINTS[exercise].find(({ keys }) => keys.some((key) => activeKeys.includes(key)));
  return hint ? hint.text : null;
}
