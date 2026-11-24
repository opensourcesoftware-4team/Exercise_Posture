let myChart = null; // 차트 인스턴스 초기화 캐시

// 운동 종목 코드 한글 변환 매핑 테이블
const EXERCISE_MAP = {
    squat: "스쿼트",
    pushup: "푸시업",
    plank: "플랭크"
};

/*
 외부(moving2.js) 파이프라인에서 완성된 DTO를 수신하여 대시보드 뷰를 총괄하는 진입점
 @param {Object} sessionDTO 
 */
export function initDashboardView(sessionDTO) {
    console.log("[Dashboard] initDashboardView 수신 성공 -> 데이터 바인딩 시작");
    
    document.getElementById('db-empty-state').style.display = 'none';
    document.getElementById('db-populated-state').style.display = 'grid';
    
    const activeExercise = sessionDTO.metadata?.exerciseType || 'squat';

    // 1. 종목별 세부 오답 빈도 패널 업데이트 (현재 종목 데이터 커플링)
    updateStatusPanel(sessionDTO.errors, activeExercise);
    
    // 2. 전체 누적 분석 수행 히스토리 테이블 렌더링
    updateHistoryTable();
    
    // 3. 최근 트렌드 Chart.js 가동
    renderAnalyticsChart(sessionDTO.chartData);
}

/**
 * 사용자가 수행한 종목에 맞는 디테일 오답 항목을 가변 바(Bar) 차트 형태로 동적 드로잉
 * @param {Object} totalErrors - 전체 누적 에러 객체
 * @param {string} currentExerciseType - 현재 수행한 운동 종목 코드
 */
function updateStatusPanel(totalErrors, currentExerciseType) {
    // 오답 리스트를 꽂아넣을 부모 컨테이너 DOM 추적 
    // (HTML 내 좌측 패널 영역에 id="error-list-container" 분실 금지)
    const container = document.getElementById('error-list-container');
    if (!container) {
        console.error("[Dashboard Error] 'error-list-container' 엘리먼트가 HTML에 존재하지 않습니다.");
        return;
    }

    // 1. 현재 선택 종목에 매핑되는 세부 에러 레이블 및 데이터 바인딩 스펙 배열 생성
    let errorSpecs = [];
    const exerciseErrors = totalErrors[currentExerciseType] || {};

    if (currentExerciseType === "squat") {
        errorSpecs = [
            { key: "buttWink", label: "골반 말림 (Butt Wink)", count: exerciseErrors.buttWink || 0 },
            { key: "kneeForward", label: "무릎 과진전 (Knee Forward)", count: exerciseErrors.kneeForward || 0 },
            { key: "hipOnly", label: "엉덩이 과신전 (Hip Only)", count: exerciseErrors.hipOnly || 0 }
        ];
    } else if (currentExerciseType === "pushup") {
        errorSpecs = [
            { key: "coreDrop", label: "코어 처짐 (Core Drop)", count: exerciseErrors.coreDrop || 0 },
            { key: "coreHigh", label: "엉덩이 솟구침 (Core High)", count: exerciseErrors.coreHigh || 0 },
            { key: "elbowBack", label: "팔꿈치 과후진 (Elbow Back)", count: exerciseErrors.elbowBack || 0 },
            { key: "elbowForward", label: "팔꿈치 과전진 (Elbow Forward)", count: exerciseErrors.elbowForward || 0 }
        ];
    } else if (currentExerciseType === "plank") {
        errorSpecs = [
            { key: "hipDrop", label: "엉덩이 처짐 (Hip Drop)", count: exerciseErrors.hipDrop || 0 },
            { key: "hipHigh", label: "엉덩이 솟구침 (Hip High)", count: exerciseErrors.hipHigh || 0 },
            { key: "neckDrop", label: "경추 굴곡 (Neck Drop)", count: exerciseErrors.neckDrop || 0 },
            { key: "neckHigh", label: "목 과신전 (Neck High)", count: exerciseErrors.neckHigh || 0 }
        ];
    }

    // 데이터 시각화 비율 산정을 위한 최댓값 추출 (0 나누기 방어)
    const maxCount = Math.max(...errorSpecs.map(spec => spec.count), 1);
    const krName = EXERCISE_MAP[currentExerciseType] || "종목별";

    // 2. 동적 DOM 스키마 인젝션 수행
    container.innerHTML = `
        <h3 style="font-size: 1.25rem; font-weight: 800; color: #38bdf8; margin-bottom: 1.5rem;">
            ${krName} 오답 자세 지적 누적 횟수 (가장 최근 수행 종목)
        </h3>
        <div style="display: flex; flex-direction: column; gap: 1.25rem;">
            ${errorSpecs.map(item => {
                const percentage = Math.min((item.count / maxCount) * 100, 100);
                const barColor = item.count > 0 ? '#f43f5e' : '#475569';
                return `
                    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                        <div style="display: flex; justify-content: space-between; font-size: 0.9rem; font-weight: 600;">
                            <span style="color: #f8fafc;">${item.label}</span>
                            <span style="color: ${item.count > 0 ? '#f43f5e' : '#94a3b8'}; font-weight: 800;">${item.count}회</span>
                        </div>
                        <div style="width: 100%; height: 8px; background: rgba(255,255,255,0.05); border-radius: 999px; overflow: hidden;">
                            <div style="width: ${percentage}%; height: 100%; background: ${barColor}; transition: width 0.4s ease-out; border-radius: 999px;"></div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

/**
 * LocalStorage 저장 공간을 직접 역직렬화하여 최신 회차 순으로 역정렬한 데이터 테이블 출력
 */
function updateHistoryTable() {
    const tableBody = document.getElementById('history-table-body');
    if (!tableBody) {
        console.error("[Dashboard Error] 'history-table-body' 엘리먼트가 HTML에 존재하지 않습니다.");
        return;
    }

    try {
        // DB 소스 로드 및 안전 예외 가드
        const history = JSON.parse(localStorage.getItem("workoutHistory")) || [];
        
        if (history.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#64748b; padding: 20px;">분석 이력이 존재하지 않습니다.</td></tr>`;
            return;
        }

        // 최신 수행 이력이 테이블 최상단으로 오도록 배열을 역순 처리 (Immutable Slice)
        const displayHistory = history.slice().reverse();

        // 테이블 행(Row) 루프 인젝션 생성
        tableBody.innerHTML = displayHistory.map(session => {
            const exerciseName = EXERCISE_MAP[session.exercise] || session.exercise.toUpperCase();
            
            // 볼륨 단위 바인딩 분기 (플랭크일 때는 초 단위를 접미사로 결합)
            const volumeDisplay = session.exercise === "plank" ? `${session.count}초` : `${session.count}개`;
            
            // 정확도 수치에 따른 위기 상황 경고 색상 제어 스케일링
            let accuracyColor = "#38bdf8"; // 보통/좋음 블루
            if (session.accuracy >= 90) accuracyColor = "#10b981"; // 에메랄드 퍼펙트
            else if (session.accuracy < 70) accuracyColor = "#f43f5e"; // 로즈 경고 고위험군

            return `
                <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05); text-align: center; font-size: 0.9rem;">
                    <td style="padding: 14px 8px; color: #94a3b8; font-weight: 500;">
                        ${session.date}<br><span style="font-size:0.75rem; color:#64748b;">${session.time}</span>
                    </td>
                    <td style="padding: 14px 8px; color: #f8fafc; font-weight: 700;">${exerciseName}</td>
                    <td style="padding: 14px 8px; color: #e2e8f0; font-weight: 600;">${volumeDisplay}</td>
                    <td style="padding: 14px 8px; color: ${accuracyColor}; font-weight: 800; font-size: 1rem;">
                        ${session.accuracy}%
                    </td>
                </tr>
            `;
        }).join('');

    } catch (storageError) {
        console.error("[Dashboard Crash] 히스토리 테이블 파싱 예외 발생:", storageError);
    }
}

/**
 * Chart.js 렌더링 엔진 (동적 데이터 플롯팅)
 * @param {Object} chartData 
 */
function renderAnalyticsChart(chartData) {
    const chartCanvas = document.getElementById('analyticsChart');
    if (!chartCanvas) return;
    
    const ctx = chartCanvas.getContext('2d');
    
    // SPA 컴포넌트 재생성 충돌 버그 방어: 캐시 인스턴스 소멸 처리
    if (myChart !== null) {
        myChart.destroy();
    }

    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: '최근 회차별 수행 볼륨 트렌드',
                data: chartData.values,
                backgroundColor: 'rgba(14, 165, 233, 0.08)',
                borderColor: '#0ea5e9',
                borderWidth: 3,
                pointBackgroundColor: '#f43f5e',
                pointHoverBackgroundColor: '#10b981',
                pointRadius: 5,
                pointHoverRadius: 7,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { grid: { color: 'rgba(255, 255, 255, 0.03)' }, ticks: { color: '#64748b', font: { weight: 600 } } },
                y: { grid: { color: 'rgba(255, 255, 255, 0.03)' }, ticks: { color: '#64748b' } }
            },
            plugins: { 
                legend: { labels: { color: '#94a3b8', font: { size: 11, weight: 600 } } } 
            }
        }
    });
}


/**
 * [통합 엔진] 로컬 스토리지 데이터를 기반으로 대시보드 전체를 새로고침하는 진입점
 */
export function refreshDashboardFromStorage() {
    console.log("[Dashboard] 종합 리포트 엔진 가동");
    
    try {
        const history = JSON.parse(localStorage.getItem("workoutHistory")) || [];
        
        if (history.length === 0) {
            document.getElementById('db-empty-state').style.display = 'block';
            document.getElementById('db-populated-state').style.display = 'none';
            return;
        }
        
        document.getElementById('db-empty-state').style.display = 'none';
        document.getElementById('db-populated-state').style.display = 'grid';
        
        const latestSession = history[history.length - 1];
        const activeExercise = latestSession.exercise || 'squat';
        const recentHistory = history.slice(-7);
        
        // 1. [보완·확장] 3가지 운동 종목 각각의 독립적 평균 점수 연산 파이프라인
        const filterAndMemoAvg = (exName) => {
            const sessions = history.filter(item => item.exercise === exName);
            if (sessions.length === 0) return -1; // 데이터가 아예 없는 상태 가드
            const sum = sessions.reduce((acc, cur) => acc + (cur.accuracy || 0), 0);
            return Math.round(sum / sessions.length);
        };

        const avgAccuracyDTO = {
            squat: filterAndMemoAvg('squat'),
            pushup: filterAndMemoAvg('pushup'),
            plank: filterAndMemoAvg('plank')
        };
        
        // 2. 글로벌 에러 누적 DTO 조립 (11차원 정밀 변수)
        const totalErrorsDTO = {
            squat: {
                buttWink: history.reduce((acc, cur) => acc + (cur.detailedErrors?.squat?.buttWink || 0), 0),
                kneeForward: history.reduce((acc, cur) => acc + (cur.detailedErrors?.squat?.kneeForward || 0), 0),
                hipOnly: history.reduce((acc, cur) => acc + (cur.detailedErrors?.squat?.hipOnly || 0), 0)
            },
            pushup: {
                coreDrop: history.reduce((acc, cur) => acc + (cur.detailedErrors?.pushup?.coreDrop || 0), 0),
                coreHigh: history.reduce((acc, cur) => acc + (cur.detailedErrors?.pushup?.coreHigh || 0), 0),
                elbowBack: history.reduce((acc, cur) => acc + (cur.detailedErrors?.pushup?.elbowBack || 0), 0),
                elbowForward: history.reduce((acc, cur) => acc + (cur.detailedErrors?.pushup?.elbowForward || 0), 0)
            },
            plank: {
                hipDrop: history.reduce((acc, cur) => acc + (cur.detailedErrors?.plank?.hipDrop || 0), 0),
                hipHigh: history.reduce((acc, cur) => acc + (cur.detailedErrors?.plank?.hipHigh || 0), 0),
                neckDrop: history.reduce((acc, cur) => acc + (cur.detailedErrors?.plank?.neckDrop || 0), 0),
                neckHigh: history.reduce((acc, cur) => acc + (cur.detailedErrors?.plank?.neckHigh || 0), 0)
            }
        };
        
        const chartDataDTO = {
            labels: recentHistory.map(item => {
                const shortDate = item.date.replace(/^\d{4}\.\s?/, ''); 
                return `${shortDate} (${item.exercise.toUpperCase()})`;
            }),
            values: recentHistory.map(item => item.count)
        };
        
        // 3. 기존 UI 컴포넌트 동기화
        updateStatusPanel(totalErrorsDTO, activeExercise);
        updateHistoryTable();
        renderAnalyticsChart(chartDataDTO);
        if (typeof renderLatestSessionEvaluation === 'function') {
       
            renderLatestSessionEvaluation(history); 
        }

        
        buildTripleRecommendationHub(totalErrorsDTO, avgAccuracyDTO);
        
        console.log("[Dashboard] 3대 종목 독립 솔루션 및 비디오 빌드 완결");
    } catch (error) {
        console.error("[Dashboard Critical Error] 파이프라인 Crash:", error);
    }
}

/**
 * [마스터 컴포넌트] 3가지 운동 종목 각각의 솔루션 카드를 동적으로 3개 생성하여 주입
 */
function buildTripleRecommendationHub(totalErrorsDTO, avgAccuracyDTO) {
    const masterContainer = document.getElementById('recommend-master-container');
    if (!masterContainer) return;

    // 1. 11가지 상세 에러 및 종목 타이틀 메타 데이터 딕셔너리
    const solutionDB = {
        buttWink: { title: "골반 말림(Butt Wink) 요추 보호 가이드", badge: "고관절 가동성", videoId: "WEseEJBi92U", desc: "요추 유연성 및 대둔근 타이트함이 주원인입니다. 하강 시 요추 정렬 유지 훈련을 시청하십시오." },
        kneeForward: { title: "스쿼트 무게중심 제어 및 미드풋 고정", badge: "발목 가동성", videoId: "X_CRsLMSeFc", desc: "체중이 지나치게 전방으로 쏠려 무릎에 과부하가 걸립니다. 뒤꿈치를 지면에 밀착시키는 정렬 드릴 영상입니다." },
        hipOnly: { title: "엉덩이 선행 신전(Squat Morning) 교정", badge: "하체 협응력", videoId: "X_CRsLMSeFc", desc: "상승 시 대둔근이 먼저 솟구치면 허리 부상을 유발합니다. 상하체의 확장 타이밍을 일치시키십시오." },
        
        coreDrop: { title: "푸시업 코어 처짐 방지 및 골반 중립 확보", badge: "복압 브레이싱", videoId: "ynVA81fgR1g", desc: "전거근과 전방 복부 텐션이 풀리면 요추가 과전만됩니다. 척추를 일직선으로 단단히 잠그는 코어 브레이싱 영상입니다." },
        coreHigh: { title: "푸시업 엉덩이 상승(Hip Pike) 무너짐 방지", badge: "척추 일직선", videoId: "wYdOomxWMB8", desc: "상체 근력이 부족하여 골반을 위로 밀어내는 편법입니다. 머리부터 발끝까지 수평 정렬을 유지하십시오." },
        elbowBack: { title: "상완 삼두근 및 팔꿈치 과후방 밀림 방지", badge: "관절 보호", videoId: "wYdOomxWMB8", desc: "팔꿈치가 손목 수직선보다 뒤로 빠지면 회전근개에 큰 전단력이 가해집니다. 수직 각도를 사수하세요." },
        elbowForward: { title: "팔꿈치 전방 과전시 및 손목 부상 방지", badge: "손목 정렬", videoId: "ZB4VDvVes38", desc: "상체가 과도하게 전방으로 쏠려 손목 압착이 일어납니다. 지면 수직 가속 포지션을 세팅하세요." },
        
        hipDrop: { title: "플랭크 골반 처짐 및 둔근 텐션 확보", badge: "골반 중립", videoId: "mUDVAgXyqZg", desc: "중력에 의해 골반이 바닥으로 낙하하면 요추 압착이 일어납니다. 복하부와 복횡근을 강하게 쥐어짜십시오." },
        hipHigh: { title: "플랭크 엉덩이 솟구침 방지 및 전신 홀딩", badge: "전신 긴장도", videoId: "mUDVAgXyqZg", desc: "코어 피로 증가로 인해 체중을 발끝으로 도피시키는 현상입니다. 복부 수축을 유지하며 수평을 복원하세요." },
        neckDrop: { title: "플랭크 경추 숙임(Neck Drop) 예방 정석 정렬", badge: "경추 정렬", videoId: "mUDVAgXyqZg", desc: "시선이 수직 아래로 완벽히 떨어지면 목 관절에 큰 하중이 집중됩니다. 턱을 가볍게 당겨주세요." },
        neckHigh: { title: "경추 과신전(Neck High) 방지 및 시선 제어", badge: "시선 정렬", videoId: "mUDVAgXyqZg", desc: "턱을 과하게 들어 정면을 보면 흉추 정렬까지 왜곡됩니다. 손바닥 앞 15cm 지점 바닥을 응시하세요." },

        default: { title: "정석 자세 리마인딩 가이드", badge: "Perfect Form", videoId: "30N6sz4WE7I", desc: "해당 종목은 지적된 결함이 없거나 완벽한 포스처 마진을 유지하고 있습니다. 지속적인 볼륨 훈련을 권장합니다." }
    };

    const exList = [
        { key: 'squat', title: 'SQUAT PRECISE REPORT' },
        { key: 'pushup', title: 'PUSH-UP PRECISE REPORT' },
        { key: 'plank', title: 'PLANK PRECISE REPORT' }
    ];

    // 2. 루프를 돌며 3가지 종목의 개별 컴포넌트 뷰 생성
    let combinedHTML = '';

    exList.forEach(ex => {
        const avgScore = avgAccuracyDTO[ex.key];
        
        // 데이터 누락 종목 예외 가드 (사용자가 스쿼트만 하고 푸시업은 안 했을 경우 대비)
        if (avgScore === -1) {
            combinedHTML += `
                <div style="border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 1.5rem; color: var(--text-muted); font-size: 0.9rem;">
                    <h4 style="color: #64748b; font-size: 1.05rem; font-weight: 800; margin-bottom: 0.5rem;">${ex.title}</h4>
                    <i class="fa-solid fa-folder-open"></i> 아직 이 운동에 대한 누적 유효 데이터가 존재하지 않습니다. AI 측정을 완료하십시오.
                </div>
            `;
            return;
        }

        // 3. 해당 단일 종목 내에서 가장 많이 터진 Max Error 탐색
        const currentErrors = totalErrorsDTO[ex.key] || {};
        let maxKey = '';
        let maxCount = -1;
        for (const [key, val] of Object.entries(currentErrors)) {
            if (val > maxCount) {
                maxCount = val;
                maxKey = key;
            }
        }

        let target = solutionDB[maxKey] || solutionDB['default'];
        if (maxCount <= 0) target = solutionDB['default'];

        // 4. 평균 점수대 기반 4분기 스크립팅 연산
        let formTitle = '', formDesc = '', formColor = '';
        if (avgScore >= 90) { formTitle = "PERFECT"; formDesc = "카메라 종료 노이즈를 배제하면 거의 정석에 수렴합니다. 세트 볼륨을 높이세요."; formColor = "#34d399"; }
        else if (avgScore >= 80) { formTitle = "GOOD"; formDesc = "훌륭한 정렬 상태이나, 미세한 임계 이탈이 감지됩니다. 약점 교정에 집중하세요."; formColor = "#38bdf8"; }
        else if (avgScore >= 70) { formTitle = "NORMAL"; formDesc = "자세 흔들림이 자주 포착됩니다. 수행 속도를 낮추고 비전 가이드를 준수하십시오."; formColor = "#fbbf24"; }
        else { formTitle = "BAD (개선 시급)"; formDesc = "부상 임계점을 자주 위반합니다. 아래 배핑된 처방 비디오를 필독하고 재트레이닝 하세요."; formColor = "#f43f5e"; }

        // 5. 2분할 템플릿 스트링 누적 빌드 (좌측 텍스트 정보 + 우측 개별 영상 프레임)
        combinedHTML += `
            <div style="border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 1.5rem; display: flex; flex-direction: column; gap: 0.75rem;">
                <h4 style="color: #cbd5e1; font-size: 1.1rem; font-weight: 800; margin: 0; font-family: 'Urbanist'; letter-spacing: 0.5px;">${ex.title}</h4>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.25rem; margin-top: 0.25rem;">
                    <div style="background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.03); border-radius: 12px; padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between; gap: 0.75rem;">
                        <div>
                            <div style="display: flex; gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
                                <span style="background: ${formColor}15; color: ${formColor}; font-size: 0.7rem; font-weight: 900; padding: 5px 10px; border-radius: 999px; border: 1px solid ${formColor}30; font-family: 'Urbanist';">
                                    ★ ${formTitle} (${avgScore}점)
                                </span>
                                <span style="background: rgba(255,255,255,0.02); color: #94a3b8; font-size: 0.7rem; font-weight: 700; padding: 5px 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.04);">
                                    ⚠️ 최다 약점: ${target.badge}
                                </span>
                            </div>
                            
                            <h5 style="color: #f8fafc; font-size: 1.1rem; font-weight: 800; margin: 0 0 6px 0;">${target.title}</h5>
                            <p style="color: #94a3b8; font-size: 0.9rem; margin: 0 0 0.75rem 0; line-height: 1.5;">${formDesc}</p>
                            <p style="color: var(--text-muted); font-size: 0.8rem; margin: 0; line-height: 1.4; border-left: 2px solid #38bdf8; padding-left: 6px;">
                                <strong>클리닉 가이드:</strong> ${target.desc}
                            </p>
                        </div>
                    </div>

                    <div style="width: 100%; min-height: 190px; background: #000; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.04); position: relative;">
                        <iframe 
                            style="position: absolute; top:0; left:0; width:100%; height:100%; border:none;"
                            src="https://www.youtube.com/embed/${target.videoId}" 
                            title="${target.title}"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                            allowfullscreen>
                        </iframe>
                    </div>
                </div>
            </div>
        `;
    });

    // 마스터 돔에 한 번에 인젝션 (렌더링 가속화)
    masterContainer.innerHTML = combinedHTML;
}

/**
  3대 운동 종목별 가장 최신 세션을 각각 트래킹하여 화면에 독립 바인딩
 */
export function renderLatestSessionEvaluation(history) {
    const container = document.getElementById('latest-evaluations-container');
    if (!container) return;

    if (!history || history.length === 0) {
        container.innerHTML = `
            <div style="color: var(--text-muted); font-size: 0.9rem; text-align: center; padding: 2rem;">
                <i class="fa-solid fa-database" style="margin-bottom: 8px; display: block; font-size: 1.5rem;"></i>
                누적된 운동 기록이 존재하지 않습니다. 첫 측정을 시작하세요.
            </div>
        `;
        return;
    }

    // 1. 순회 타겟 종목 스펙 명시
    const targetExercises = [
        { key: 'squat', title: '🏋️‍♂️ SQUAT LATEST EVALUATION' },
        { key: 'pushup', title: '💪 PUSH-UP LATEST EVALUATION' },
        { key: 'plank', title: '🧘 PLANK LATEST EVALUATION' }
    ];

    let combinedHTML = '';

    // 2. 종목별 루프 가동하여 최신 세션 단독 스캔
    targetExercises.forEach(ex => {
        // 해당 운동 종목의 세션들만 필터링
        const exSessions = history.filter(item => item.exercise === ex.key);
        
        // 데이터가 없는 종목 가드 락
        if (exSessions.length === 0) {
            combinedHTML += `
                <div style="background: rgba(255,255,255,0.01); border: 1px dashed rgba(255,255,255,0.04); border-radius: 12px; padding: 1.25rem; display: flex; justify-content: space-between; align-items: center; color: #475569;">
                    <span style="font-size: 0.9rem; font-weight: 700; color: #475569;">${ex.title}</span>
                    <span style="font-size: 0.8rem; font-weight: 600;"><i class="fa-solid fa-ban"></i> 이력 없음</span>
                </div>
            `;
            return;
        }

        // 해당 종목 배열의 가장 마지막 원소(최신 세션) 추출
        const latestSession = exSessions[exSessions.length - 1];
        const errors = latestSession.detailedErrors?.[ex.key] || {};
        
        // 3. 11차원 세부 오답 한글 매핑 딕셔너리
        const labelMap = {
            buttWink: "골반 말림 (Butt Wink)", kneeForward: "무릎 과진전 (Knee Forward)", hipOnly: "엉덩이 선행 (Hip Rise)",
            coreDrop: "코어 처짐 (Core Drop)", coreHigh: "엉덩이 솟구침 (Core High)", elbowBack: "팔꿈치 밀림", elbowForward: "팔꿈치 쏠림",
            hipDrop: "골반 처짐", hipHigh: "골반 솟구침", neckDrop: "경추 숙임 (Neck Drop)", neckHigh: "경추 들림"
        };

        const totalErrorCount = Object.values(errors).reduce((a, b) => a + b, 0);
        let breakdownHTML = '';

        // 4. 세부 오답 영역 HTML 렌더링 분기
        if (Object.keys(errors).length === 0 || totalErrorCount === 0) {
            breakdownHTML = `
                <div style="height: 100%; display: flex; align-items: center; justify-content: center; color: #34d399; font-size: 0.85rem; font-weight: 600; background: rgba(52, 211, 153, 0.02); border: 1px dashed rgba(52, 211, 153, 0.15); border-radius: 8px; padding: 0.75rem 1rem;">
                    <i class="fa-solid fa-circle-check" style="margin-right: 6px;"></i> 이 세션에서 감지된 디테일 자세 오답이 없습니다.
                </div>
            `;
        } else {
            // 가변 그리드 레이아웃으로 오답 리스트 배치
            breakdownHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.5rem; width: 100%;">
                    ${Object.entries(errors).map(([errorKey, count]) => {
                        return `
                            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.01); border-radius: 6px; padding: 0.5rem 0.75rem; border-left: 3px solid ${count > 0 ? '#f43f5e' : '#334155'};">
                                <span style="font-size: 0.85rem; color: #cbd5e1; font-weight: 500;">${labelMap[errorKey] || errorKey}</span>
                                <span style="font-size: 0.85rem; font-weight: 800; color: ${count > 0 ? '#f43f5e' : '#475569'};">${count}회 지적</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }

        // 5. 단일 종목 종합 스펙 구조 조립 (반응형 2분할 가변 그리드)
        combinedHTML += `
            <div style="background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.03); border-radius: 12px; padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem;">
                
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 0.5rem; flex-wrap: wrap; gap: 0.5rem;">
                    <h4 style="font-size: 1rem; font-weight: 800; color: #f8fafc; margin: 0; font-family: 'Urbanist'; letter-spacing: 0.5px;">
                        ${ex.title}
                    </h4>
                    <span style="font-size: 0.8rem; color: var(--text-muted); font-family: 'Urbanist'; font-weight: 500;">
                        평가 런타임: ${latestSession.date} ${latestSession.time}
                    </span>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1.25rem; align-items: center;">
                    
                    <div style="background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.02); border-radius: 10px; padding: 1rem; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;">
                        <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 800; letter-spacing: 0.5px; margin-bottom: 2px;">SESSION ACCURACY</span>
                        <div style="font-size: 2.2rem; font-weight: 900; color: ${latestSession.accuracy >= 80 ? '#38bdf8' : '#f43f5e'}; font-family: 'Urbanist'; text-shadow: 0 0 15px ${latestSession.accuracy >= 80 ? 'rgba(56,189,248,0.1)' : 'rgba(244,63,94,0.1)'};">
                            ${latestSession.accuracy}%
                        </div>
                        <div style="font-size: 0.8rem; color: #e2e8f0; font-weight: 600; margin-top: 4px;">
                            볼륨: <span style="color: #38bdf8; font-weight: 800;">${latestSession.count}</span> ${latestSession.exercise === 'plank' ? '초' : '회'}
                        </div>
                    </div>

                    <div style="display: flex; align-items: center; width: 100%;">
                        ${breakdownHTML}
                    </div>
                </div>

            </div>
        `;
    });

    // 마스터 랙에 최종 무결성 인젝션
    container.innerHTML = combinedHTML;
}
/*
 평균 정확도 기준 분기 및 유튜브 연동 추천 엔진
 */
export function injectRecommendationWithVideo(totalErrorsDTO, activeExercise, avgAccuracy) {
    const container = document.getElementById('recommend-split-container');
    if (!container) return;

    // 1. 유튜브 매핑 아키텍처 및 스트레칭 DB 규격화 (유튜브 고유 비디오 ID 매핑)
    const solutionDB = {
            // ==========================================
            // A. SQUAT DOMAIN (3종 에러)
            // ==========================================
            buttWink: { 
                title: "골반 말림(Butt Wink) 요추 보호 가이드", 
                badge: "고관절 가동성", 
                videoId: "WEseEJBi92U", 
                desc: "요추 유연성 밀 둔근 타이트함이 주원인입니다. 하강 시 요추 정렬을 유지하는 고관절 가동성 훈련을 시청하십시오." 
            },
            kneeForward: { 
                title: "스쿼트 무게중심 제어 및 미드풋 고정", 
                badge: "발목 가동성 및 체간 제어", 
                videoId: "Bhm0QnFvsLQ", 
                desc: "체중이 지나치게 전방으로 쏠려 무릎에 과부하가 걸립니다. 몸통의 중심이 다리 사이 일직선 상으로 수행하십시오." 
            },
            hipOnly: { 
                title: "엉덩이 선행 신전(Squat Morning) 교정", 
                badge: "하체 협응력", 
                videoId: "K_uEF505enE", 
                desc: "하강 후 상승 시 대둔근이 먼저 솟구치면 허리 부상을 유발합니다. 상하체의 확장 타이밍을 일치시키는 스쿼트 큐잉입니다." 
            },

            // ==========================================
            // B. PUSHUP DOMAIN (4종 에러)
            // ==========================================
            coreDrop: { 
                title: "푸시업 코어 처짐 방지 및 골반 중립 확보", 
                badge: "복압 브레이싱", 
                videoId: "wYdOomxWMB8", 
                desc: "전거근과 전방 복부 텐션이 풀리면 요추가 과전만됩니다. 척추를 일직선으로 단단히 잠그는 코어 브레이싱 영상입니다." 
            },
            coreHigh: { 
                title: "푸시업 엉덩이 상승(Hip Pike) 자세 무너짐 방지", 
                badge: "척추 일직선", 
                videoId: "wYdOomxWMB8", 
                desc: "상체 다단 근력이 부족하여 대둔근을 위로 밀어내 편법을 쓰고 있습니다. 머리부터 발끝까지 플랭크 정렬을 리마인드하십시오." 
            },
            elbowBack: { 
                title: "상완 삼두근 및 팔꿈치 과후방 밀림 방지", 
                badge: "관절 보호", 
                videoId: "wYdOomxWMB8", 
                desc: "팔꿈치가 손목 수직선보다 뒤로 빠지면 회전근개와 전면 삼각근에 무리한 전단력이 가해집니다. 전완은 언제나 수직이어야 합니다." 
            },
            elbowForward: { 
                title: "팔꿈치 전방 과전시 및 손목 부상 방지", 
                badge: "손목 정렬", 
                videoId: "wYdOomxWMB8", 
                desc: "상체가 지나치게 앞 방향으로 쏠려 손목 관절에 압착이 일어납니다. 지면을 수직 가속으로 밀어낼 수 있는 포지션을 세팅하세요." 
            },

            // ==========================================
            // C. PLANK DOMAIN (4종 에러)
            // ==========================================
            hipDrop: { 
                title: "플랭크 골반 처짐 및 골반 후방경사 유도 훈련", 
                badge: "골반 중립", 
                videoId: "cH3J2mHHD1o", 
                desc: "중력에 의해 골반이 바닥으로 낙하하면 척추 기립근이 비정상적으로 압착됩니다. 둔근과 하복부에 강한 텐션을 주어 잠그십시오." 
            },
            hipHigh: { 
                title: "플랭크 엉덩이 솟구침 방지 및 전신 홀딩", 
                badge: "전신 긴장도", 
                videoId: "cH3J2mHHD1o", 
                desc: "코어 피로도가 증가함에 따라 체중을 발끝으로 도피시키는 현상입니다. 복횡근의 수축 상태를 유지하며 수평을 복원하세요." 
            },
            neckDrop: { 
                title: "플랭크 경추 숙임(Neck Drop) 예방 정석 정렬", 
                badge: "경추 정렬", 
                videoId: "cH3J2mHHD1o", 
                desc: "시선이 수직 아래로 완벽히 떨어지면 목 관절에 큰 하중이 집중됩니다. 턱을 가볍게 당겨 경추 후면을 확장 정렬하세요." 
            },
            neckHigh: { 
                title: "경추 과신전(Neck High) 방지 및 시선 제어", 
                badge: "시선 정렬", 
                videoId: "cH3J2mHHD1o", 
                desc: "턱을 과하게 들어 정면을 보면 흉추 정렬까지 함께 왜곡됩니다. 손바닥 앞 15~20cm 지점의 바닥을 바라보는 페이싱이 필요합니다." 
            },

            // ==========================================
            // D. DEFAULT RECOVERY SYSTEM (자세가 완벽한 경우)
            // ==========================================
            default: { 
                title: "종합 전신 코어 밸런스 및 정석 리마인딩 가이드", 
                badge: "Perfect Form", 
                videoId: "JmD_v73Y44s", 
                desc: "지적된 결함이 없거나 노이즈 마진 이내입니다. 훌륭한 수준의 랜드마크 고도 정렬을 유지하며 수축 템포에만 집중하십시오." 
            }
        };

    // 2. 가장 심각한 누적 오답 원인(Max Error) 선별
    const currentErrors = totalErrorsDTO[activeExercise] || {};
    let maxKey = '';
    let maxCount = -1;
    for (const [key, val] of Object.entries(currentErrors)) {
        if (val > maxCount) {
            maxCount = val;
            maxKey = key;
        }
    }

    let target = solutionDB[maxKey] || solutionDB['default'];
    if (maxCount <= 0) target = solutionDB['default'];

    // 3. [보완책 구현] 평균 정확도 기반 뱃지 타이틀 및 처방 문구 스크립트 분기
    let formTitle = '';
    let formDesc = '';
    let formColor = '';

    if (avgAccuracy >= 90) {
        formTitle = "PERFECT FORM";
        formDesc = "현재 누적 데이터상 특별한 자세 무너짐이 없습니다. 카메라 종료 시의 일시적 노이즈를 제외하면 완벽한 정렬을 유지하고 있으니, 세트 수와 볼륨을 안전하게 늘려보세요.";
        formColor = "#34d399"; // 그린
    } else if (avgAccuracy >= 80) {
        formTitle = "GOOD FORM";
        formDesc = "조금만 개선하면 완벽한 자세입니다. 카메라 진입 및 종료 시점의 노이즈를 배제하더라도 훌륭한 수준이나, 아래 매핑된 약점 자세 솔루션을 공략하여 완벽에 가까워지세요.";
        formColor = "#38bdf8"; // 스카이블루
    } else if (avgAccuracy >= 70) {
        formTitle = "NORMAL FORM";
        formDesc = "보통 수준의 자세 정렬 상태입니다. 특정 임계 구간에서 관절 각도가 흔들리는 경향이 감지되므로, 무리하게 속도를 내기보다 측면 비전 센서에 잡히는 동작의 정밀도에 신경 쓰십시오.";
        formColor = "#fbbf24"; // 옐로우
    } else {
        formTitle = "NEED IMPROVEMENT";
        formDesc = "자세 개선이 시급한 상태입니다. 관절 가동 범위가 임계값 피드백 가이드라인을 자주 벗어나며 부상 위험도가 높습니다. 아래 처방된 교정 훈련 영상을 반드시 반복 숙지하고 재수행하십시오.";
        formColor = "#f43f5e"; // 로즈
    }

    // 4. 구조적 2분할 뷰 동적 결합 인젝션 (좌측 텍스트 & 우측 유동 유튜브 프레임)
    container.innerHTML = `
        <div style="background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.03); border-radius: 14px; padding: 1.5rem; display: flex; flex-direction: column; justify-content: space-between; gap: 1rem;">
            <div>
                <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap;">
                    <span style="background: ${formColor}20; color: ${formColor}; font-size: 0.75rem; font-weight: 900; padding: 6px 12px; border-radius: 999px; font-family: 'Urbanist'; border: 1px solid ${formColor}40;">
                        ★ ${formTitle} (${avgAccuracy}점)
                    </span>
                    <span style="background: rgba(148, 163, 184, 0.1); color: #cbd5e1; font-size: 0.75rem; font-weight: 700; padding: 6px 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.05);">
                        <i class="fa-solid fa-triangle-exclamation" style="margin-right: 4px; color: #fbbf24;"></i> 약점: ${target.badge}
                    </span>
                </div>
                
                <h4 style="color: #f8fafc; font-size: 1.25rem; font-weight: 800; margin: 0 0 10px 0; font-family: 'Urbanist';">
                    ${target.title}
                </h4>
                <p style="color: #cbd5e1; font-size: 0.95rem; margin: 0 0 1rem 0; line-height: 1.6; font-weight: 500;">
                    ${formDesc}
                </p>
                <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0; line-height: 1.5; border-left: 2px solid rgba(56, 189, 248, 0.4); padding-left: 8px;">
                    <strong>교정 처방 리포트:</strong> ${target.desc}
                </p>
            </div>
            
        </div>

        <div style="width: 100%; min-height: 220px; background: #000; border-radius: 14px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05); position: relative;">
            <iframe 
                style="position: absolute; top:0; left:0; width:100%; height:100%; border:none;"
                src="https://www.youtube.com/embed/${target.videoId}" 
                title="${target.title}"
                allow="accelerometer; compute-pressure"; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                allowfullscreen>
            </iframe>
        </div>
    `;
}

// 글로벌 바인딩
if (typeof window !== 'undefined') {
    window.refreshDashboardFromStorage = refreshDashboardFromStorage;
}