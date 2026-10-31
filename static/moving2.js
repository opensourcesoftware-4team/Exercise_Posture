import {
    PoseLandmarker,
    FilesetResolver,
    DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

import { initDashboardView } from './dashboard.js';

const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const enableWebcamButton = document.getElementById("enableWebcamButton");
const exerciseSelect = document.getElementById("exercise-select");

const countDisplay = document.getElementById("count-display");
const feedbackMsg = document.getElementById("feedback-msg");
const statBox = document.getElementById("stat-box");

// 전역 오디오 및 상태 추적 변수 고정
let audioCtx = null;
let lastWarningState = false;
let lastRepCount = 0;
let myChart = null;

let isWarning = false;
let repCount = 0;

let warningTimeout = null;     // 경고 유지 타이머를 담을 변수
let isWarningActive = false;   // 현재 화면에 경고가 강제 유지 중인지 여부

// 시작 후 세팅 시간 관련 함수
let isReadyMode = false; 
let countdownTimer = null;

// AI 모델 및 상태 변수
let poseLandmarker = undefined;
let runningMode = "VIDEO";
let webcamRunning = false;
let lastVideoTime = -1;

// 운동 카운터 및 상태 머신 변수
let currentExercise = "squat";
let exerciseState = "up"; // "up" or "down"

// 1. 삼각함수 기반 관절 사잇각 계산 함수
function calculateAngle(a, b, c) {
    let radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) {
        angle = 360 - angle;
    }
    return angle;
}

// 프레임 노이즈 방지용 연속 에러 버퍼 및 타이머 변수
let squatStartHipY = 0;
let squatStartKneeX = 0;
let plankTotalTime = 0;
let lastFrameTime = performance.now();

const errorBuffers = {
    squatRatio: 0,
    buttWink: 0,
    pushupForearm: 0,
    plankLine: 0,
    neck: 0
};

// AI 구동 중 실시간으로 축적할 로컬 버퍼 변수들
let angleBuffer = []; 
let validCount = 0;
let totalAttempts = 0;
let squatErrors = 0;
let pushupErrors = 0;
let plankErrors = 0;

// A. 스쿼트 디테일 에러 변수 및 락 플래그
let errSquatButtWink = 0;
let errSquatKneeForward = 0;
let errSquatHipOnly = 0;
let isSquatButtWinkActive = false;
let isSquatKneeActive = false;
let isSquatHipActive = false;

// B. 푸시업 디테일 에러 변수 및 락 플래그
let errPushupCoreDrop = 0;
let errPushupCoreHigh = 0;
let errPushupElbowBack = 0;
let errPushupElbowForward = 0;
let isPushupDropActive = false;
let isPushupHighActive = false;
let isPushupElbowBackActive = false;
let isPushupElbowForwardActive = false;

// C. 플랭크 디테일 에러 변수 및 락 플래그
let errPlankHipDrop = 0;
let errPlankHipHigh = 0;
let errPlankNeckDrop = 0;
let errPlankNeckHigh = 0;
let isPlankHipDropActive = false;
let isPlankHipHighActive = false;
let isPlankNeckDropActive = false;
let isPlankNeckHighActive = false;

// 헬퍼 함수 - 점과 직선 사이의 거리 및 기준선 Y 좌표 계산 수식
function getPointToLineDistance(pt, lineStart, lineEnd) {
    const A = lineStart.y - lineEnd.y;
    const B = lineEnd.x - lineStart.x;
    const C = lineStart.x * lineEnd.y - lineEnd.x * lineStart.y;
    
    // 점과 직선 사이의 수직 거리 계산
    const distance = Math.abs(A * pt.x + B * pt.y + C) / Math.sqrt(A * A + B * B);
    
    // 현재 X 좌표에서 기준 직선이 위치해야 할 이론적인 Y 좌표 계산 (처짐/솟구침 판정용)
    const expectedLineY = lineStart.y + (pt.x - lineStart.x) * (lineEnd.y - lineStart.y) / (lineEnd.x - lineStart.x);
    
    return { distance, expectedLineY };
}

// 2. MediaPipe Pose 초기화
const createPoseLandmarker = async () => {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task`,
            delegate: "GPU"
        },
        runningMode: runningMode,
        numPoses: 1
    });
    enableWebcamButton.innerText = "시작 준비 완료! 클릭하세요.";
};
createPoseLandmarker();


//미디어 스트림 안전 셧다운 
const stopCamera = () => {
    webcamRunning = false;
    enableWebcamButton.innerText = "AI 시작";

    // 카운트다운 타이머 인터셉트 후 정지
    if (countdownTimer) {
        clearInterval(countdownTimer);
    }
    isReadyMode = false;

    // 미디어 트랙 완전 자원 해제
    if (video.srcObject) {
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        video.srcObject = null;
    }
    console.log("[Camera Engine] 미디어 스트림 비활성화 완료 - 세션 데이터는 보존됨");
};


const enableCam = async () => {
    if (!poseLandmarker) {
        console.log("AI 모델이 아직 로드되지 않았습니다.");
        return;
    }
    
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
    }
    
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    // [분기 1] AI 구동 중 버튼을 누른 경우 ➔ 영속화 없이 "단순 일시정지"
    if (webcamRunning === true) {
        stopCamera(); // 카메라만 끄고 카운트/에러 데이터는 메모리에 그대로 킵(Keep)
        setFeedback("AI 추적이 일시 중지되었습니다. 'AI 시작'을 누르면 이어서 진행합니다.", false);
        return;
    }

    // [분기 2] AI 정지 상태에서 버튼을 누른 경우 ➔ "카메라 활성화 및 세션 이어하기"
    webcamRunning = true;
    enableWebcamButton.innerText = "AI 추적 중지";

    const constraints = { video: { facingMode: "user" } };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    
    // 10초 카운트다운 가동
    isReadyMode = true;
    let secondsLeft = 10;
    setFeedback(`운동 시작 ${secondsLeft}초 전... 자세를 잡으세요!`, false);

    countdownTimer = setInterval(() => {
        secondsLeft--;
        if (secondsLeft > 0) {
            setFeedback(`운동 시작 ${secondsLeft}초 전... 자세를 잡으세요!`, false);
        } else {
            clearInterval(countdownTimer);
            isReadyMode = false; // 실시간 카운팅 파이프라인 결합
            setFeedback("운동 시작! 이어서 파이팅!", false);
        }
    }, 1000);
    
    video.addEventListener("loadeddata", predictWebcam);
};

enableWebcamButton.addEventListener("click", enableCam);


// 4. 종목 변경 이벤트
exerciseSelect.addEventListener("change", (e) => {
    currentExercise = e.target.value;
    document.getElementById("current-ex").innerText = e.target.options[e.target.selectedIndex].text;
    repCount = 0;
    lastRepCount = 0;
    plankTotalTime = 0;
    countDisplay.innerText = "0";
    exerciseState = "up";
    isWarningActive = false;
    if (warningTimeout) clearTimeout(warningTimeout);
    setFeedback("운동을 시작하세요.", false);
    changeEvent();
});

// 피드백 UI 업데이트 
function setFeedback(msg, isWarning) {
    if (isWarning) {
        isWarningActive = true;
        feedbackMsg.innerText = msg;
        statBox.classList.add("warning");
        document.getElementById("video-container").style.borderColor = "#ff0000";

        if (warningTimeout) {
            clearTimeout(warningTimeout);
        }

        warningTimeout = setTimeout(() => {
            isWarningActive = false; 
            feedbackMsg.innerText = "좋은 자세입니다. 유지하세요!";
            statBox.classList.remove("warning");
            document.getElementById("video-container").style.borderColor = "#444";
        }, 3000);

    } else {
        // 3초 강제 경고 유지 락이 풀려있을 때만 평시 정상 메시지로 교체 가능
        if (!isWarningActive) {
            feedbackMsg.innerText = msg;
            statBox.classList.remove("warning");
            document.getElementById("video-container").style.borderColor = "#444";
        }
    }
}

// 5. 실시간 매 프레임 마다 분석을 루프 (코어 컨트롤러 역할)
const predictWebcam = async () => {
    if (video.videoWidth === 0 || video.videoHeight === 0) {
        if (webcamRunning) {
            window.requestAnimationFrame(predictWebcam);
        }
        return; 
    }
    
    canvasElement.width = video.videoWidth;
    canvasElement.height = video.videoHeight;
    canvasElement.style.width = video.videoWidth;
    canvasElement.style.height = video.videoHeight;

    let startTimeMs = performance.now();
    if (lastVideoTime !== video.currentTime) {
        lastVideoTime = video.currentTime;
        
        poseLandmarker.detectForVideo(video, startTimeMs, (result) => {
            canvasCtx.save();
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

            const drawingUtils = new DrawingUtils(canvasCtx);

            if (result.landmarks && result.landmarks.length > 0) {
                const landmarks = result.landmarks[0]; 

                drawingUtils.drawLandmarks(landmarks, { radius: 3, color: "#FF0000" });
                drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, { color: "#00FF00", lineWidth: 2 });

                try {
                    const resultData = analyzePosture(landmarks);

                    if (resultData) {
                        triggerAudioFeedback(resultData.isWarning, resultData.repCount);
                    }
                } catch (error) {
                    console.error("비즈니스 로직 에러 수집:", error);
                }
            }
            canvasCtx.restore();
        });
    }

    if (webcamRunning) {
        window.requestAnimationFrame(predictWebcam);
    }
};

// 자세 분석 엔진
function analyzePosture(landmarks) {
    const rightNose = landmarks[0];
    const rightEar = landmarks[8];
    const rightShoulder = landmarks[12];
    const rightElbow = landmarks[14];
    const rightWrist = landmarks[16];
    const rightHip = landmarks[24];
    const rightKnee = landmarks[26];
    const rightAnkle = landmarks[28];
    
    const MIN_CONFIDENCE = 0.7;
    if (
        !rightShoulder || !rightHip || !rightKnee || !rightAnkle || 
        rightShoulder.visibility < MIN_CONFIDENCE || 
        rightHip.visibility < MIN_CONFIDENCE || 
        rightKnee.visibility < MIN_CONFIDENCE || 
        rightAnkle.visibility < MIN_CONFIDENCE
    ) {
        setFeedback("화면에 전신이 나오도록 뒤로 물러서 주세요.", false);
        return { isWarning: false, repCount: repCount }; 
    }

    const currentTime = performance.now();
    const deltaTime = (currentTime - lastFrameTime) / 1000;
    lastFrameTime = currentTime;

    isWarning = false;
    let currentMsg = "좋습니다! 정석 자세 유지 중.";

    if (isReadyMode) {
        return { isWarning: false, repCount: repCount };
    }


    // CASE 1: 맨몸 스쿼트 분석 
    if (currentExercise === "squat") {
        const kneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);

        if (exerciseState === "up" && kneeAngle < 100) {
            exerciseState = "down";
            squatStartHipY = rightHip.y;
            squatStartKneeX = rightKnee.x;
        } else if (exerciseState === "down" && kneeAngle > 150) {
            exerciseState = "up";
            repCount++;
            countDisplay.innerText = repCount;
        }

        if (exerciseState === "down") {
            const deltaYHip = Math.abs(rightHip.y - squatStartHipY);
            const deltaXKnee = Math.abs(rightKnee.x - squatStartKneeX);
            
            if (deltaXKnee > 0.01) { 
                const ratio = deltaYHip / deltaXKnee;
                
                if (ratio > 1.8) { // 엉덩이만 빠지는 오답 범주
                    errorBuffers.squatRatio++;
                    if (errorBuffers.squatRatio > 12) {
                        isWarning = true;
                        currentMsg = "경고: 엉덩이만 빠집니다! 무릎을 동시에 접으세요.";
                        AudioCueEngine.triggerErrorCue('hipOnly');
                        if (!isSquatHipActive) { errSquatHipOnly++; isSquatHipActive = true; }
                    }
                    isSquatKneeActive = false; // 상호 배제 에러 해제
                } else if (ratio < 0.5) { // 무릎만 앞으로 밀리는 오답 범주
                    errorBuffers.squatRatio++;
                    if (errorBuffers.squatRatio > 12) {
                        isWarning = true;
                        currentMsg = "경고: 무릎만 앞으로 밀립니다! 체중을 뒤로 분산하세요.";
                        AudioCueEngine.triggerErrorCue('kneeForward');
                        if (!isSquatKneeActive) { errSquatKneeForward++; isSquatKneeActive = true; }
                    }
                    isSquatHipActive = false; 
                } else {
                    errorBuffers.squatRatio = 0;
                    isSquatHipActive = false;
                    isSquatKneeActive = false;
                }
            }

            // 요추 말림 (Butt Wink) 정밀 분석 영역
            if (kneeAngle < 95 && rightHip.x > rightShoulder.x + 0.04) {
                errorBuffers.buttWink++;
                if (errorBuffers.buttWink > 10) {
                    isWarning = true;
                    currentMsg = "경고: 요추 말림(Butt Wink) 발생! 골반 중립이 무너졌습니다.";
                    AudioCueEngine.triggerErrorCue('buttWink');
                    if (!isSquatButtWinkActive) { errSquatButtWink++; isSquatButtWinkActive = true; }
                }
            } else {
                errorBuffers.buttWink = 0;
                isSquatButtWinkActive = false;
            }
        }

    // CASE 2: 푸시업 분석 
    } else if (currentExercise === "pushup") {
        const elbowAngle = calculateAngle(rightShoulder, rightElbow, rightWrist);

        if (exerciseState === "up" && elbowAngle < 95) {
            exerciseState = "down";
        } else if (exerciseState === "down" && elbowAngle > 155) {
            exerciseState = "up";
            repCount++;
            countDisplay.innerText = repCount;
        }

        // 코어 정렬 상태 분석 (직선 거리 연산 기반)
        const lineData = getPointToLineDistance(rightHip, rightShoulder, rightAnkle);
        if (lineData.distance > 0.07) {
            errorBuffers.plankLine++;
            if (errorBuffers.plankLine > 10) {
                isWarning = true;
                if (rightHip.y > lineData.expectedLineY) {
                    currentMsg = "경고: 코어 복압 해제! 엉덩이가 아래로 처졌습니다.";
                    AudioCueEngine.triggerErrorCue('coreDrop');
                    if (!isPushupDropActive) { errPushupCoreDrop++; isPushupDropActive = true; }
                    isPushupHighActive = false;
                } else {
                    currentMsg = "경고: 엉덩이가 위로 솟구쳤습니다.";
                    AudioCueEngine.triggerErrorCue('coreHigh');
                    if (!isPushupHighActive) { errPushupCoreHigh++; isPushupHighActive = true; }
                    isPushupDropActive = false;
                }
            }
        } else {
            errorBuffers.plankLine = 0;
            isPushupDropActive = false;
            isPushupHighActive = false;
        }

        // 전완 각도 분석 (팔꿈치-손목 수직 정렬)
        if (elbowAngle < 110) {
            const forearmDrift = Math.abs(rightElbow.x - rightWrist.x);
            if (forearmDrift > 0.05) {
                errorBuffers.pushupForearm++;
                if (errorBuffers.pushupForearm > 12) {
                    isWarning = true;
                    if (rightElbow.x > rightWrist.x) {
                        currentMsg = "경고: 팔꿈치가 손목 뒤로 빠졌습니다! 체중을 전방으로 이동하세요.";
                         AudioCueEngine.triggerErrorCue('elbowBack');
                        if (!isPushupElbowBackActive) { errPushupElbowBack++; isPushupElbowBackActive = true; }
                        isPushupElbowForwardActive = false;
                    } else {
                        currentMsg = "경고: 팔꿈치가 과도하게 앞에 있습니다! 팔꿈치를 몸통쪽으로 붙이세요";
                        AudioCueEngine.triggerErrorCue('elbowForward');
                        if (!isPushupElbowForwardActive) { errPushupElbowForward++; isPushupElbowForwardActive = true; }
                        isPushupElbowBackActive = false;
                    }
                }
            } else {
                errorBuffers.pushupForearm = 0;
                isPushupElbowBackActive = false;
                isPushupElbowForwardActive = false;
            }
        } else {
            errorBuffers.pushupForearm = 0;
            isPushupElbowBackActive = false;
            isPushupElbowForwardActive = false;
        }


    // CASE 3: 플랭크 분석 
    } else if (currentExercise === "plank") {
        const lineDataPlank = getPointToLineDistance(rightHip, rightShoulder, rightAnkle);
        
        // 플랭크 골반 라인 무너짐 분석
        if (lineDataPlank.distance > 0.06) {
            errorBuffers.plankLine++;
            if (errorBuffers.plankLine > 10) {
                isWarning = true;
                if (rightHip.y > lineDataPlank.expectedLineY) {
                    currentMsg = "타이머 일시정지: 엉덩이 처짐 발생!";
                    AudioCueEngine.triggerErrorCue('hipDrop');
                    if (!isPlankHipDropActive) { errPlankHipDrop++; isPlankHipDropActive = true; }
                    isPlankHipHighActive = false;
                } else {
                    currentMsg = "타이머 일시정지: 엉덩이 솟구침!";
                    AudioCueEngine.triggerErrorCue('hipHigh');
                    if (!isPlankHipHighActive) { errPlankHipHigh++; isPlankHipHighActive = true; }
                    isPlankHipDropActive = false;
                }
            }
        } else {
            errorBuffers.plankLine = 0;
            isPlankHipDropActive = false;
            isPlankHipHighActive = false;
        }

        // 플랭크 경추/목 정렬 분석
        const neckAngle = calculateAngle(rightNose, rightEar, rightShoulder);
        if (neckAngle < 135) {
            errorBuffers.neck++;
            if (errorBuffers.neck > 15) {
                isWarning = true;
                if (rightNose.y > rightEar.y) {
                    currentMsg = "타이머 일시정지: 고개가 주저앉았습니다!";
                    AudioCueEngine.triggerErrorCue('neckDrop');
                    if (!isPlankNeckDropActive) { errPlankNeckDrop++; isPlankNeckDropActive = true; }
                    isPlankNeckHighActive = false;
                } else {
                    currentMsg = "타이머 일시정지: 목 과신전! 바닥을 보세요.";
                    AudioCueEngine.triggerErrorCue('neckHigh');
                    if (!isPlankNeckHighActive) { errPlankNeckHigh++; isPlankNeckHighActive = true; }
                    isPlankNeckDropActive = false;
                }
            }
        } else {
            errorBuffers.neck = 0;
            isPlankNeckDropActive = false;
            isPlankNeckHighActive = false;
        }

        // 플랭크 정석 상태 유지 시에만 시간 측정 가동
        if (!isWarning) {
            plankTotalTime += deltaTime;
            countDisplay.innerText = plankTotalTime.toFixed(1) + " 초";
        }
    }
    

    const activeExercise = typeof currentExercise !== 'undefined' ? currentExercise : 'squat';
    const validCount = typeof repCount !== 'undefined' ? repCount : 0;
    const pTotalTime = typeof plankTotalTime !== 'undefined' ? plankTotalTime : 0;

    const sButtWink = typeof errSquatButtWink !== 'undefined' ? errSquatButtWink : 0;
    const sKneeForward = typeof errSquatKneeForward !== 'undefined' ? errSquatKneeForward : 0;
    const sHipOnly = typeof errSquatHipOnly !== 'undefined' ? errSquatHipOnly : 0;

    const pCoreDrop = typeof errPushupCoreDrop !== 'undefined' ? errPushupCoreDrop : 0;
    const pCoreHigh = typeof errPushupCoreHigh !== 'undefined' ? errPushupCoreHigh : 0;
    const pElbowBack = typeof errPushupElbowBack !== 'undefined' ? errPushupElbowBack : 0;
    const pElbowForward = typeof errPushupElbowForward !== 'undefined' ? errPushupElbowForward : 0;

    const lHipDrop = typeof errPlankHipDrop !== 'undefined' ? errPlankHipDrop : 0;
    const lHipHigh = typeof errPlankHipHigh !== 'undefined' ? errPlankHipHigh : 0;
    const lNeckDrop = typeof errPlankNeckDrop !== 'undefined' ? errPlankNeckDrop : 0;
    const lNeckHigh = typeof errPlankNeckHigh !== 'undefined' ? errPlankNeckHigh : 0;

    const totalErrors = sButtWink + sKneeForward + sHipOnly +
                        pCoreDrop + pCoreHigh + pElbowBack + pElbowForward +
                        lHipDrop + lHipHigh + lNeckDrop + lNeckHigh;

    const totalAttempts = validCount + totalErrors;
    const accuracyRatio = totalAttempts > 0 ? Math.round((validCount / totalAttempts) * 100) : 0;

    updateRealTimeAccuracyUI(accuracyRatio);

    setFeedback(currentMsg, isWarning);

    // [최종 반환] 여기서 리턴된 오답 플래그와 카운트 수치가 위의 predictWebcam으로 전달되어 효과음을 제어함
    return { isWarning: isWarning, repCount: repCount };
}


// 경고음 연속 발생을 물리적으로 제한하기 위한 타임스탬프
let lastWarningSoundTime = 0;
const WARNING_SOUND_COOLDOWN = 2500; // 경고음은 최소 2.5초 간격으로만 재생

/**
 실시간 프레임 이벤트 사운드 트리거 엔진
 */
function triggerAudioFeedback(isWarning, currentRepCount) {
    if (!audioCtx) return;

    // 1. 카운트 상승 성공음 발동 조건 (Edge Trigger)
    if (currentRepCount > lastRepCount) {
        console.log(`[Audio] 카운트 성공음 재생: ${lastRepCount} -> ${currentRepCount}`);
        
        playTone(523.25, "sine", 0.08); 
        setTimeout(() => {
            playTone(659.25, "sine", 0.12); 
        }, 60);

        lastRepCount = currentRepCount;
    }

    if (isWarning) {
        if (!lastWarningState) {
            const now = performance.now();
            

            if (now - lastWarningSoundTime > WARNING_SOUND_COOLDOWN) {
                console.log("[Audio] 자세 경고음 재생 트리거");
                
                playTone(180, "triangle", 0.35); 
                
                lastWarningSoundTime = now;
                lastWarningState = true;
            }
        }
    } else {
        lastWarningState = false;
    }
}
//효과음 생성기
function playTone(freq = 440, type = "sine", duration = 0.1) {
    if (!audioCtx) return; 

    // 브라우저 오디오 오토플레이 서스펜드 락 해제
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    try {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.type = type;            
        oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime); 

        const now = audioCtx.currentTime;
        
        gainNode.gain.setValueAtTime(gainNode.gain.value, now); 
        gainNode.gain.linearRampToValueAtTime(0.25, now + 0.01); 
        gainNode.gain.exponentialRampToValueAtTime(0.00001, now + duration); 

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        // 정밀 타임스탬프 예약 가동
        oscillator.start(now);
        oscillator.stop(now + duration);
        
        // 메모리 누수 방지를 위한 가비지 컬렉션 유도 (자원 반납 예약)
        oscillator.onended = () => {
            oscillator.disconnect();
            gainNode.disconnect();
        };

    } catch (e) {
        console.error("[Audio Engine Error] 노드 생성 실패가 감지되었습니다 : ", e);
    }
}

//실시간 에러 발생 시 TTS 음성 출력
const AudioCueEngine = {
    isSpeaking: false,
    cooldownTime: 3500, // 3.5초 연속 큐잉 방지 락 (브라우저 버벅임 방지 가드)

    speak(text) {
        if (!('speechSynthesis' in window) || this.isSpeaking) return;

        this.isSpeaking = true;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ko-KR';
        utterance.rate = 1.05; // 전달력을 위해 살짝 빠른 템포 세팅
        utterance.pitch = 1.0;

        // 발음 종료 후 쿨다운 대기 처리
        utterance.onend = () => {
            setTimeout(() => { this.isSpeaking = false; }, this.cooldownTime);
        };
        utterance.onerror = () => { this.isSpeaking = false; };

        window.speechSynthesis.speak(utterance);
    },

    /**
     11가지 트리거 인터페이스
     */
    triggerErrorCue(errorKey) {
        const cueMap = {
            // 스쿼트
            buttWink: "허리가 말렸습니다. 골반 정렬에 신경 쓰세요.",
            kneeForward: "무릎이 발끝 앞으로 과도하게 나갔습니다. 체중을 뒤꿈치로 이동하세요.",
            hipOnly: "엉덩이가 먼저 올라옵니다. 상체와 하체를 동시에 세우세요.",
            // 푸시업
            coreDrop: "코어가 처졌습니다. 복부에 힘을 주고 골반을 올리세요.",
            coreHigh: "엉덩이가 솟구쳤습니다. 머리부터 발끝까지 일직선을 맞추세요.",
            elbowBack: "팔꿈치가 뒤로 밀렸습니다. 전완의 수직 각도를 유지하세요.",
            elbowForward: "팔꿈치가 앞으로 과하게 쏠렸습니다. 손목 부상에 주의하세요.",
            // 플랭크
            hipDrop: "골반이 바닥으로 떨어졌습니다. 복압을 유지하세요.",
            hipHigh: "엉덩이가 위로 올라갔습니다. 수평 정렬을 복원하세요.",
            neckDrop: "고개가 아래로 처졌습니다. 턱을 당겨 목을 일직선으로 만드세요.",
            neckHigh: "턱을 과하게 들었습니다. 손앞 바닥을 바라보세요."
        };

        if (cueMap[errorKey]) {
            this.speak(cueMap[errorKey]);
        }
    }
};

//실시간 UI 매니저 (정확도 스위칭 갱신 루프)
function updateRealTimeAccuracyUI(accuracy) {
    const bar = document.getElementById('rt-accuracy-bar');
    const text = document.getElementById('rt-accuracy-text');
    if (!bar || !text) return;

    // 1. 값 및 텍스트 렌더링
    text.innerText = `${accuracy}%`;
    bar.style.width = `${accuracy}%`;

    // 2. 점수대 기반 조건부 컬러 스위칭 (80점 미만 크리티컬 로즈 변환)
    if (accuracy < 80) {
        bar.style.backgroundColor = '#f43f5e'; // 크리티컬 로즈 (위험/오답 누적)
        text.style.color = '#f43f5e';
    } else if (accuracy < 90) {
        bar.style.backgroundColor = '#fbbf24'; // 워닝 옐로우 (주의)
        text.style.color = '#fbbf24';
    } else {
        bar.style.backgroundColor = '#38bdf8'; // 네온 스카이블루 (정상/안전)
        text.style.color = '#38bdf8';
    }
}


// 에러 매핑 
function saveExerciseSession() {
    console.log("[Pipeline] saveExerciseSession 가동 - 고도화된 정밀 세션 영속화 시작");

    try {
        // 1. 런타임 전역 변수 안전성 확보 가드 (Undefined 방어)
        const activeExercise = typeof currentExercise !== 'undefined' ? currentExercise : 'squat';
        const validCount = typeof repCount !== 'undefined' ? repCount : 0;
        const pTotalTime = typeof plankTotalTime !== 'undefined' ? plankTotalTime : 0;

        // A. 스쿼트 세부 에러 변수 바인딩
        const sButtWink = typeof errSquatButtWink !== 'undefined' ? errSquatButtWink : 0;
        const sKneeForward = typeof errSquatKneeForward !== 'undefined' ? errSquatKneeForward : 0;
        const sHipOnly = typeof errSquatHipOnly !== 'undefined' ? errSquatHipOnly : 0;

        // B. 푸시업 세부 에러 변수 바인딩
        const pCoreDrop = typeof errPushupCoreDrop !== 'undefined' ? errPushupCoreDrop : 0;
        const pCoreHigh = typeof errPushupCoreHigh !== 'undefined' ? errPushupCoreHigh : 0;
        const pElbowBack = typeof errPushupElbowBack !== 'undefined' ? errPushupElbowBack : 0;
        const pElbowForward = typeof errPushupElbowForward !== 'undefined' ? errPushupElbowForward : 0;

        // C. 플랭크 세부 에러 변수 바인딩
        const lHipDrop = typeof errPlankHipDrop !== 'undefined' ? errPlankHipDrop : 0;
        const lHipHigh = typeof errPlankHipHigh !== 'undefined' ? errPlankHipHigh : 0;
        const lNeckDrop = typeof errPlankNeckDrop !== 'undefined' ? errPlankNeckDrop : 0;
        const lNeckHigh = typeof errPlankNeckHigh !== 'undefined' ? errPlankNeckHigh : 0;
        
        if (activeExercise === "plank") {
            if (pTotalTime <= 0) {
                alert("측정된 플랭크 유지 시간이 없어 세션 기록을 저장하지 않고 대시보드로 이동합니다.");
                console.warn("[Pipeline Cancel] 플랭크 수행 시간 0초 카운트 - 영속화 스킵");
                
                // 저장 없이 뷰만 대시보드로 즉시 전환
                triggerDashboardRoutingOnly();
                return;
            }
        } else {
            if (validCount <= 0) {
                alert(`측정된 ${activeExercise === "squat" ? "스쿼트" : "푸시업"} 수행 횟수가 0회이므로 기록을 무시합니다.`);
                console.warn(`[Pipeline Cancel] ${activeExercise} 수행 횟수 0회 - 영속화 스킵`);
                
                // 저장 없이 뷰만 대시보드로 즉시 전환
                triggerDashboardRoutingOnly();
                return;
            }
        }

        // 2. 통합 에러 총합 및 정확도 연산 (0 나누기 방어)
        const totalErrors = sButtWink + sKneeForward + sHipOnly +
                            pCoreDrop + pCoreHigh + pElbowBack + pElbowForward +
                            lHipDrop + lHipHigh + lNeckDrop + lNeckHigh;

        const totalAttempts = validCount + totalErrors;
        const accuracyRatio = totalAttempts > 0 ? Math.round((validCount / totalAttempts) * 100) : 0;

        // 3. LocalStorage 스펙 규격화 (도메인별 객체 분리)
        const sessionData = {
            date: new Date().toLocaleDateString('ko-KR'),
            time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
            exercise: activeExercise,
            count: activeExercise === "plank" ? parseFloat(pTotalTime.toFixed(1)) : validCount,
            accuracy: accuracyRatio,
            // 대시보드 다이내믹 렌더링을 위해 스펙을 구조화된 트리 형태로 변경
            detailedErrors: {
                squat: { buttWink: sButtWink, kneeForward: sKneeForward, hipOnly: sHipOnly },
                pushup: { coreDrop: pCoreDrop, coreHigh: pCoreHigh, elbowBack: pElbowBack, elbowForward: pElbowForward },
                plank: { hipDrop: lHipDrop, hipHigh: lHipHigh, neckDrop: lNeckDrop, neckHigh: lNeckHigh }
            }
        };

        // 4. 로컬스토리지 적재
        let history = JSON.parse(localStorage.getItem("workoutHistory")) || [];
        history.push(sessionData);
        localStorage.setItem("workoutHistory", JSON.stringify(history));
        console.log("[Pipeline] LocalStorage 정밀 덤프 완료:", history);

        // 5. 전역 뷰 매니저 실행
        if (typeof window.route === 'function') {
            window.route('dashboard-section');
        } else if (typeof route === 'function') {
            route('dashboard-section');
        } else {
            console.error("[Router Critical] 전역 라우터 route()를 찾을 수 없습니다.");
        }

        // 6. 대시보드 컴포넌트 데이터 조립 (SessionDTO 스펙 바인딩)
        const recentHistory = history.slice(-7); // 최근 7회차 데이터 플롯 추출
        
        const sessionDTO = {
            metadata: {
                sessionId: "SESS_" + Date.now(),
                timestamp: `${sessionData.date} ${sessionData.time}`,
                exerciseType: activeExercise
            },
            metrics: {
                validCount: sessionData.count,
                totalAttempts: totalAttempts,
                accuracyRatio: accuracyRatio
            },
            
            errors: {
                squat: {
                    buttWink: history.reduce((acc, cur) => acc + (cur.detailedErrors?.squat?.buttWink || cur.errors?.buttWink || 0), 0),
                    kneeForward: history.reduce((acc, cur) => acc + (cur.detailedErrors?.squat?.kneeForward || 0), 0),
                    hipOnly: history.reduce((acc, cur) => acc + (cur.detailedErrors?.squat?.hipOnly || 0), 0)
                },
                pushup: {
                    coreDrop: history.reduce((acc, cur) => acc + (cur.detailedErrors?.pushup?.coreDrop || cur.errors?.coreDrop || 0), 0),
                    coreHigh: history.reduce((acc, cur) => acc + (cur.detailedErrors?.pushup?.coreHigh || 0), 0),
                    elbowBack: history.reduce((acc, cur) => acc + (cur.detailedErrors?.pushup?.elbowBack || 0), 0),
                    elbowForward: history.reduce((acc, cur) => acc + (cur.detailedErrors?.pushup?.elbowForward || 0), 0)
                },
                plank: {
                    hipDrop: history.reduce((acc, cur) => acc + (cur.detailedErrors?.plank?.hipDrop || 0), 0),
                    hipHigh: history.reduce((acc, cur) => acc + (cur.detailedErrors?.plank?.hipHigh || 0), 0),
                    neckDrop: history.reduce((acc, cur) => acc + (cur.detailedErrors?.plank?.neckDrop || cur.errors?.neckFlex || 0), 0),
                    neckHigh: history.reduce((acc, cur) => acc + (cur.detailedErrors?.plank?.neckHigh || 0), 0)
                }
            },
            chartData: {
                labels: recentHistory.map(item => {
                    const shortDate = item.date.replace(/^\d{4}\.\s?/, ''); 
                    return `${shortDate} (${item.exercise.toUpperCase()})`;
                }),
                values: recentHistory.map(item => item.count)
            }
        };

        // 7. 브라우저 리렌더링 사이클 동기화 호출
        requestAnimationFrame(() => {
            if (typeof initDashboardView === 'function') {
                initDashboardView(sessionDTO);
                console.log("[Pipeline] 대시보드 렌더러로 정밀 DTO 송신 완료");
            } else {
                console.error("[Import Error] dashboard.js의 initDashboardView 인터페이스가 누락되었습니다.");
            }
        });
        
        triggerDashboardRoutingOnly();

    } catch (pipelineError) {
        console.error("[Pipeline Crash] 프로세스 처리 중 치명적 예외 발생:", pipelineError);
    }
}

// 버튼 이벤트 리스너 바인딩 
const finishButton = document.getElementById('finishSessionButton');
if (finishButton) {
    finishButton.addEventListener('click', (e) => {
        e.preventDefault(); 
        console.log("[Click] 분석 종료 및 저장 파이프라인 최종 트리거");

        // 1. 유효 데이터 적재 여부 무결성 검사 가드
        let hasData = false;
        if (currentExercise === "plank") {
            hasData = (plankTotalTime > 5); 
        } else if (currentExercise === "squat" || currentExercise === "pushup") {
            hasData = (repCount > 0); 
        }

        // 2. 예외 처리: 저장할 유효 데이터가 없는 경우 가드 락
        if (!hasData) {
            console.warn("[Pipeline Cancel] 저장할 유효한 운동 볼륨이 없음 - 저장 무시");
            alert("측정된 운동 기록(스쿼트/푸시업 1회 이상, 플랭크 5초 초과)이 없어 세션을 저장하지 않습니다.");
            
            // 데이터가 없더라도 버튼을 눌렀으니 켜져있던 카메라는 꺼주는 것이 상식적인 UX
            if (webcamRunning) stopCamera();
            triggerDashboardRoutingOnly();
            return;
        }

        // 3. 실행 단계: 추적 중이면 카메라 자원 반납
        if (webcamRunning) {
            stopCamera();
        }

        // 4. 저장 단계: 딱 1회 로컬스토리지 영속화 이그젝션
        saveExerciseSession(); 

        // 5. 초기화 단계: 저장이 끝난 즉시 버퍼를 밀어버려 "연속 클릭 시 중복 저장" 원천 차단
        resetSessionBuffers();
        
        alert("운동 세션 데이터가 대시보드에 성공적으로 기록되었습니다!");
    });
}


if (typeof window !== 'undefined') {
    window.saveExerciseSession = saveExerciseSession;
}

// 라우팅 및 화면 갱신만 처리해 주는 헬퍼 함수
function triggerDashboardRoutingOnly() {
    if (typeof window.route === 'function') window.route('dashboard-section');
    else if (typeof route === 'function') route('dashboard-section');
    
    // 저장된 데이터가 없더라도 기존 대시보드 데이터 레이아웃 동기화는 실행
    if (typeof window.refreshDashboardFromStorage === 'function') {
        window.refreshDashboardFromStorage();
    }
}

// 데이터 중복 저장 차단
const resetSessionBuffers = () => {
    // 횟수 및 시간 스택 덤프
    repCount = 0;
    plankTotalTime = 0;
    lastRepCount = 0; 
    lastWarningState = false;

    // 11차원 실시간 에러 변수 오염방지 일괄 리셋
    if (typeof sButtWink !== 'undefined') {
        sButtWink = 0; sKneeForward = 0; sHipOnly = 0;
        pCoreDrop = 0; pCoreHigh = 0; pElbowBack = 0; pElbowForward = 0;
        lHipDrop = 0; lHipHigh = 0; lNeckDrop = 0; lNeckHigh = 0;
    }

    // 도큐먼트 패널 스펙 동기화
    countDisplay.innerText = "0";
    setFeedback("세션이 안전하게 종료되었습니다. 새로운 운동을 선택하거나 대시보드를 확인하세요.", false);

    // 실시간 정확도 게이지 프로그레스 바 마스터 리셋
    const rtText = document.getElementById('rt-accuracy-text');
    const rtBar = document.getElementById('rt-accuracy-bar');
    if (rtText && rtBar) {
        rtText.innerText = "100%";
        rtBar.style.width = "100%";
        rtBar.style.backgroundColor = '#38bdf8';
        rtText.style.color = '#38bdf8';
    }
    console.log("[State Engine] 세션 데이터 버퍼 및 실시간 렌더러 초기화 완료");
};

//종목 변경 시 버퍼 초기회
const changeEvent = () => {
    // 횟수 및 시간 스택 덤프
    repCount = 0;
    plankTotalTime = 0;
    lastRepCount = 0; 
    lastWarningState = false;

    // 11차원 실시간 에러 변수 오염방지 일괄 리셋
    if (typeof sButtWink !== 'undefined') {
        sButtWink = 0; sKneeForward = 0; sHipOnly = 0;
        pCoreDrop = 0; pCoreHigh = 0; pElbowBack = 0; pElbowForward = 0;
        lHipDrop = 0; lHipHigh = 0; lNeckDrop = 0; lNeckHigh = 0;
    }

    // 도큐먼트 패널 스펙 동기화
    countDisplay.innerText = "0";

    // 실시간 정확도 게이지 프로그레스 바 마스터 리셋
    const rtText = document.getElementById('rt-accuracy-text');
    const rtBar = document.getElementById('rt-accuracy-bar');
    if (rtText && rtBar) {
        rtText.innerText = "100%";
        rtBar.style.width = "100%";
        rtBar.style.backgroundColor = '#38bdf8';
        rtText.style.color = '#38bdf8';
    }
    console.log("[State Engine] 종목 변경 및 세션 데이터 버퍼 초기화 완료");
};



