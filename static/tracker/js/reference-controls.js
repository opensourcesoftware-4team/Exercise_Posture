// 정답 뼈대 보기 선택(끄기·맞춰 보기·따라 하기, 추가 기능 F6·F7)과 따라 하기의 재생·일시정지·배속 조작 (정보 레이어 HTML)
import { PLAYBACK_SPEED_DEFAULT, PLAYBACK_SPEEDS } from "./config.js";
import { hasPlayback } from "./playback.js";

// elements: box(조작 전체), playbackChoice(따라 하기 선택지), playbackBox(재생 조작 상자),
//           toggle(재생·일시정지 버튼), speeds(배속 선택지를 넣을 상자)
export function createReferenceControls(elements) {
  let playback = null; // 따라 하기 재생기 (playback.js). 몸 길이를 재기 전에는 null

  const checked = (name) => elements.box.querySelector(`input[name="${name}"]:checked`);
  const view = () => checked("reference-view").value; // "off" | "follow" | "playback"

  // 배속 선택지는 config.js 값으로 만든다
  for (const speed of PLAYBACK_SPEEDS) {
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "playback-speed";
    input.value = String(speed);
    input.checked = speed === PLAYBACK_SPEED_DEFAULT;
    const label = document.createElement("label");
    label.append(input, ` ${speed}배`);
    elements.speeds.append(label);
  }

  // 재생 조작은 따라 하기를 골랐을 때만 보이고, 재생기가 생기기 전(몸 길이 측정 전)에는 누를 수 없다
  function refresh() {
    elements.playbackBox.hidden = view() !== "playback";
    elements.toggle.disabled = !playback;
    elements.toggle.textContent = playback && !playback.playing ? "재생" : "일시정지";
  }

  elements.box.addEventListener("change", (event) => {
    const now = performance.now();
    if (event.target.name === "reference-view" && view() === "playback") playback?.restart(now); // 시작 자세부터
    if (event.target.name === "playback-speed") playback?.setSpeed(Number(event.target.value), now);
    refresh();
  });
  elements.toggle.addEventListener("click", () => {
    const now = performance.now();
    if (playback.playing) playback.pause(now);
    else playback.play(now);
    refresh();
  });

  return {
    view,
    speed: () => Number(checked("playback-speed").value),

    // 세션 시작: 정답 뼈대를 쓰는 모드에서만 보인다. 재생이 없는 종목(플랭크)은 따라 하기를 감추고 맞춰 보기로 돌린다
    setup(exercise, mode) {
      playback = null;
      elements.box.hidden = !mode.referencePose;
      elements.playbackChoice.hidden = !hasPlayback(exercise);
      if (!hasPlayback(exercise) && view() === "playback") {
        elements.box.querySelector('input[name="reference-view"][value="follow"]').checked = true;
      }
      refresh();
    },

    // 몸 길이를 다 재서 재생기를 만들었을 때 (재생이 없는 종목은 null)
    attach(nextPlayback) {
      playback = nextPlayback;
      refresh();
    },

    // 세션 종료
    hide() {
      elements.box.hidden = true;
    },
  };
}
