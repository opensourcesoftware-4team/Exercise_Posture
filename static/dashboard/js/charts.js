// Chart.js 그리기 (전역 Chart는 dashboard.html에서 4.4.1로 불러옴)
const GRID = "rgba(255, 255, 255, 0.03)";
const TICK = "#64748b";
let trendChart = null;

export function drawTrend(canvas, stats) {
  trendChart?.destroy();            // 다시 그리기 전에 반드시 이전 차트를 지운다
  trendChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: stats.trend.map((t) => t.label),
      datasets: [
        {
          type: "bar", label: `수행량(${stats.unit})`, yAxisID: "y",
          data: stats.trend.map((t) => t.count),
          backgroundColor: "rgba(14, 165, 233, 0.35)", borderColor: "#0ea5e9",
          borderWidth: 1, borderRadius: 6,
        },
        {
          type: "line", label: "정확도(%)", yAxisID: "y1",
          data: stats.trend.map((t) => t.accuracy),
          borderColor: "#38bdf8", borderWidth: 3, tension: 0.3,
          backgroundColor: "rgba(14, 165, 233, 0.08)",
          pointBackgroundColor: "#f43f5e", pointHoverBackgroundColor: "#10b981",
          pointRadius: 5, pointHoverRadius: 7,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: GRID }, ticks: { color: TICK, font: { weight: 600 } } },
        y: {
          beginAtZero: true, grid: { color: GRID }, ticks: { color: TICK },
          title: { display: true, text: stats.unit, color: "#94a3b8" },
        },
        y1: {
          position: "right", min: 0, max: 100, ticks: { color: TICK },
          grid: { drawOnChartArea: false },
          title: { display: true, text: "%", color: "#94a3b8" },
        },
      },
      plugins: { legend: { labels: { color: "#94a3b8", font: { size: 11, weight: 600 } } } },
    },
  });
}

export function destroyTrend() {
  trendChart?.destroy();
  trendChart = null;
}
