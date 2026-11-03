// 마네킹 모양 (추가 기능 F8). 관절 좌표로 양 끝이 둥근 굵은 막대(분절)와 머리 원을 정한다. DOM을 쓰지 않아 Node 테스트를 할 수 있다.
// 굵기는 그 뼈대의 몸통(엉덩이–어깨) 길이에 비례한다. 정답 뼈대는 몸통이 F4 측정값 그대로라 "측정 몸통 길이의 몇 %"가 된다
import { MANNEQUIN_HEAD_RATIO, MANNEQUIN_WIDTHS } from "./config.js";

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const middle = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// points: 한쪽 몸의 관절 좌표(px). 없는 관절의 분절은 뺀다 (스쿼트 정답 자세는 팔, 엎드린 정답 자세는 발이 없다).
// 엎드린 정답 자세는 무릎도 없어서 엉덩이–발목의 가운데를 무릎으로 본다.
// 반환: bars(분절 [{ part, from, to, width }], 몸통·허벅지·정강이·발·위팔·아래팔 순), head(머리 원 { center, radius })
export function mannequinParts(points) {
  const torso = distance(points.hip, points.shoulder);
  const knee = points.knee ?? middle(points.hip, points.ankle);
  const bars = [];
  const add = (part, from, to, ratio) => bars.push({ part, from, to, width: torso * ratio });
  add("torso", points.hip, points.shoulder, MANNEQUIN_WIDTHS.torso);
  add("thigh", points.hip, knee, MANNEQUIN_WIDTHS.thigh);
  add("shank", knee, points.ankle, MANNEQUIN_WIDTHS.limb);
  if (points.heel && points.toe) add("foot", points.heel, points.toe, MANNEQUIN_WIDTHS.limb);
  if (points.elbow && points.wrist) {
    add("upperArm", points.shoulder, points.elbow, MANNEQUIN_WIDTHS.limb);
    add("forearm", points.elbow, points.wrist, MANNEQUIN_WIDTHS.limb);
  }
  const head = { center: points.ear, radius: distance(points.shoulder, points.ear) * MANNEQUIN_HEAD_RATIO };
  return { bars, head };
}
