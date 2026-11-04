// 화면 문구·음성·효과음·정확도 게이지 (HANDOFF 7.1). 문구는 catalog.js에서만 가져온다.
import { ERROR_CUES } from "./catalog.js";
import { VOICE_COOLDOWN_SECONDS } from "./config.js";

const WARNING_HOLD_MS = 3000; // 경고 문구를 최소한 보여 주는 시간 (레거시 값)

// elements: message(문구), panel(경고 색이 바뀌는 상자), count(횟수), accuracyText, accuracyBar,
//           hint(연습 모드 힌트, 영상 위), measure·measureText·measureBar(몸 길이 측정 상자, 영상 위)
export function createFeedback(elements) {
  let audio = null;
  let warningUntil = 0;
  let currentHint = null; // 지금 보이는 연습 모드 힌트
  const lastSpokenAt = new Map(); // 안내 id(연습 힌트는 문구) → 마지막으로 말한 시각(ms)

  function setMessage(text, warning) {
    elements.message.textContent = text;
    elements.panel.classList.toggle("warning", warning);
  }

  return {
    // 브라우저는 사용자가 클릭한 뒤에만 소리를 낼 수 있어서 시작 버튼에서 부른다
    unlockAudio() {
      audio ??= new AudioContext();
      audio.resume();
    },

    // 새 세션을 시작할 때 이전 안내 상태를 지운다
    reset() {
      warningUntil = 0;
      currentHint = null;
      elements.hint.hidden = true;
      elements.measure.hidden = true;
      lastSpokenAt.clear();
      window.speechSynthesis?.cancel();
    },

    // 연습 모드 힌트 (권유형, 한 번에 하나). text가 null이면 숨긴다.
    // voice가 켜져 있으면 문구가 바뀔 때 한 번 말한다 (같은 문구는 2.5초 안에 다시 말하지 않는다)
    hint(text, now, voice) {
      elements.hint.hidden = text === null;
      if (text === currentHint) return;
      currentHint = text;
      elements.hint.textContent = text ?? "";
      if (!text || !voice) return;
      if (now - (lastSpokenAt.get(text) ?? -Infinity) < VOICE_COOLDOWN_SECONDS * 1000) return;
      lastSpokenAt.set(text, now);
      speak([text]);
    },

    // 몸 길이 측정 안내와 진행 막대 (추가 기능 F4). step은 body-measure.js add()의 결과이고, null이면 숨긴다
    measure(step) {
      elements.measure.hidden = step === null;
      if (step === null) return;
      elements.measureText.textContent = step.status;
      elements.measureBar.style.width = `${Math.round(step.progress * 100)}%`;
    },

    // 상태 문구. 경고 문구를 보여 주는 중이면 덮어쓰지 않는다
    status(text, now) {
      if (now >= warningUntil) setMessage(text, false);
    },

    // 오답 안내: 같은 문구를 화면에 띄우고 음성으로도 말한다.
    // 한 프레임에 안내가 여럿이면(예: 한 반복에 오답 2개) 화면에 함께 띄우고 음성은 차례로 말한다.
    cues(exercise, cueIds, now) {
      if (cueIds.length === 0) return;
      setMessage(cueIds.map((cueId) => ERROR_CUES[exercise][cueId]).join(" "), true);
      warningUntil = now + WARNING_HOLD_MS;
      const due = cueIds.filter((cueId) => now - (lastSpokenAt.get(cueId) ?? -Infinity) >= VOICE_COOLDOWN_SECONDS * 1000);
      for (const cueId of due) lastSpokenAt.set(cueId, now);
      speak(due.map((cueId) => ERROR_CUES[exercise][cueId]));
    },

    // 올바른 반복 1회 효과음 (레거시와 같은 두 음)
    success() {
      if (!audio) return;
      playTone(audio, 523.25, audio.currentTime, 0.08);
      playTone(audio, 659.25, audio.currentTime + 0.06, 0.12);
    },

    // 횟수와 실시간 정확도 게이지. accuracy가 null이면 아직 시도가 없다
    progress(countText, accuracy) {
      elements.count.textContent = countText;
      elements.accuracyText.textContent = accuracy === null ? "–" : `${accuracy}%`;
      elements.accuracyBar.style.width = `${accuracy ?? 100}%`;
      elements.accuracyBar.dataset.level = accuracyLevel(accuracy);
    },
  };
}

// 게이지 색 단계 (레거시 기준: 80 미만 빨강, 90 미만 노랑, 그 이상 파랑)
function accuracyLevel(accuracy) {
  if (accuracy === null) return "none";
  if (accuracy < 80) return "low";
  if (accuracy < 90) return "mid";
  return "high";
}

// 문구들을 차례로 말한다. 앞 안내가 남아 있으면 끊고, 지금 화면에 뜬 안내를 말한다.
function speak(texts) {
  if (!window.speechSynthesis || texts.length === 0) return;
  speechSynthesis.cancel();
  for (const text of texts) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ko-KR";
    utterance.rate = 1.05;
    speechSynthesis.speak(utterance);
  }
}

// 짧은 음 하나. 소리를 부드럽게 켜고 꺼서 '딱' 하는 잡음을 막는다
function playTone(audio, frequency, startAt, duration) {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.25, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration);
}
