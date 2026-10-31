// MediaPipe Pose 초기화, 카메라, 랜드마크 읽기 (HANDOFF 7.1 좌우 선택·가시성·측면 확인)
import { MIN_VISIBILITY, SIDE_VIEW_MAX_ANGLE } from "./config.js";
import { angleAt, toPixel } from "./geometry.js";

// 버전은 HANDOFF 4장대로 고정한다. 0.10.3은 랜드마크에 visibility가 없어서 0.10.14를 쓴다.
const TASKS_VISION_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
// 모델 크기: lite < full < heavy. heavy가 점이 가장 정확하고 덜 흔들리지만 느리다.
// 화면이 끊기면 MODEL_SIZE를 "full"로 바꾼다.
const MODEL_SIZE = "heavy";
const MODEL_URL = `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${MODEL_SIZE}/float16/1/pose_landmarker_${MODEL_SIZE}.task`;

// MediaPipe 33개 점 중 판정에 쓰는 번호
const NOSE = 0;
const SIDES = {
  left: { ear: 7, shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27, heel: 29, toe: 31 },
  right: { ear: 8, shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28, heel: 30, toe: 32 },
};

// 가시성 평균에 넣는 관절. 발(뒤꿈치·발끝)은 측면에서 자주 가려져 뺀다.
const GATE_JOINTS = ["ear", "shoulder", "elbow", "wrist", "hip", "knee", "ankle"];

function averageVisibility(landmarks, side) {
  const total = GATE_JOINTS.reduce((sum, joint) => sum + landmarks[SIDES[side][joint]].visibility, 0);
  return total / GATE_JOINTS.length;
}

// 랜드마크 33개를 판정용 한쪽 몸의 픽셀 좌표로 바꾼다. 점마다 가시성도 함께 둔다.
// 좌·우 중 평균 가시성이 높은 쪽을 쓰고(같으면 오른쪽), 보이는지와 측면인지도 함께 알려 준다.
export function readBody(landmarks, width, height) {
  const left = averageVisibility(landmarks, "left");
  const right = averageVisibility(landmarks, "right");
  const side = left > right ? "left" : "right";
  const point = (index) => ({ ...toPixel(landmarks[index], width, height), visibility: landmarks[index].visibility });

  const points = { nose: point(NOSE) };
  for (const [joint, index] of Object.entries(SIDES[side])) {
    points[joint] = point(index);
  }

  // 측면이면 양 어깨가 겹쳐 보여서, 코를 꼭짓점으로 한 양 어깨 사잇각이 작다
  const leftShoulder = point(SIDES.left.shoulder);
  const rightShoulder = point(SIDES.right.shoulder);

  return {
    side,
    visible: Math.max(left, right) >= MIN_VISIBILITY,
    sideView: angleAt(leftShoulder, points.nose, rightShoulder) <= SIDE_VIEW_MAX_ANGLE,
    points,
  };
}

// MediaPipe를 불러와 프레임마다 랜드마크를 돌려주는 엔진을 만든다.
// 브라우저에서만 불러오도록 함수 안에서 import한다. 그래서 위의 readBody는 Node 테스트에서도 쓸 수 있다.
export async function createPoseEngine(canvas) {
  const { FilesetResolver, PoseLandmarker, DrawingUtils } = await import(`${TASKS_VISION_URL}/vision_bundle.mjs`);
  const vision = await FilesetResolver.forVisionTasks(`${TASKS_VISION_URL}/wasm`);
  const landmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numPoses: 1,
  });
  const context = canvas.getContext("2d");
  const drawing = new DrawingUtils(context);

  return {
    // 영상 프레임 1장에서 사람 1명의 랜드마크 33개를 찾는다. 사람이 없으면 null
    detect(video, timestampMs) {
      const result = landmarker.detectForVideo(video, timestampMs);
      return result.landmarks[0] ?? null;
    },
    // 캔버스에 관절 연결선과 점을 흐린 흰색으로 그린다. 판정에 쓰는 선분의 색은 overlay.js가 위에 덧칠한다
    draw(landmarks) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (!landmarks) return;
      drawing.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, { color: "rgba(255, 255, 255, 0.5)", lineWidth: 2 });
      drawing.drawLandmarks(landmarks, { color: "rgba(255, 255, 255, 0.9)", radius: 3 });
    },
  };
}

// 카메라를 켜고 영상이 재생될 때까지 기다린다
export async function startCamera(video) {
  // 해상도가 높을수록 MediaPipe가 몸을 잘라 볼 때 화질이 좋아 점이 덜 흔들린다 (안 되면 카메라 기본값)
  const constraints = { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } };
  video.srcObject = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
  await video.play();
}

// 카메라를 끈다
export function stopCamera(video) {
  for (const track of video.srcObject?.getTracks() ?? []) track.stop();
  video.srcObject = null;
}
