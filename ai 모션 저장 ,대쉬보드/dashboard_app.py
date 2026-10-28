"""
운동 기록 대시보드 (Streamlit)
- 기록 저장: receiver.py가 받아서 storage.py가 data/records.json에 저장 / 기록 읽기: records.py (포맷: 세션데이터_해석방법.md)
- 화면은 REFRESH_SECONDS마다 저장된 기록을 다시 읽어서 자동으로 갱신된다.
실행: streamlit run dashboard_app.py
"""
from datetime import datetime

import pandas as pd
import streamlit as st

from records import (
    EXERCISES, EXERCISE_NAMES, UNITS, ERROR_LABELS,
    load_records, of_exercise, session_errors, attempts, correct_reps,
    sum_errors, top_error, average_accuracy,
)
from storage import RECORDS_PATH

DEFAULT_SOURCE = str(RECORDS_PATH)  # storage.py가 저장하는 파일 (data/records.json)
REFRESH_SECONDS = 3                 # 몇 초마다 새 기록을 확인할지

# 오답별 참고 해석 (해석방법.md 6절 '교정 추천을 위한 참고 해석'. 진단이 아니라 참고용)
CAUSE_HINTS = {
    "heelLift": "발목이 덜 굽혀지는(발목 가동성) 경우 자주 나타납니다.",
    "torsoLean": "발목이 덜 굽혀지는(발목 가동성) 경우 자주 나타납니다.",
    "partialRep": "고관절·발목 가동성 부족이나 하체 근력 부족과 관련이 있을 수 있습니다.",
    "coreDrop": "코어 근지구력이 떨어지면 운동 후반에 늘어나는 경향이 있습니다.",
    "hipDrop": "코어 근지구력이 떨어지면 운동 후반에 늘어나는 경향이 있습니다.",
}

# 교정 영상 링크: 기존 웹앱(dashboard.js)에서 쓰던 것을 새 키에 맞춰 옮김. 없는 키는 영상 없음.
VIDEO_LINKS = {
    "torsoLean": "https://www.youtube.com/watch?v=X_CRsLMSeFc",
    "shinLean": "https://www.youtube.com/watch?v=X_CRsLMSeFc",
    "coreDrop": "https://www.youtube.com/watch?v=ynVA81fgR1g",
    "coreHigh": "https://www.youtube.com/watch?v=wYdOomxWMB8",
    "handBackward": "https://www.youtube.com/watch?v=wYdOomxWMB8",
    "handForward": "https://www.youtube.com/watch?v=ZB4VDvVes38",
    "hipDrop": "https://www.youtube.com/watch?v=mUDVAgXyqZg",
    "hipHigh": "https://www.youtube.com/watch?v=mUDVAgXyqZg",
    "neckDrop": "https://www.youtube.com/watch?v=mUDVAgXyqZg",
    "neckHigh": "https://www.youtube.com/watch?v=mUDVAgXyqZg",
}

VIEW_NAMES = {"side": "측면", "front": "정면"}


def fmt_time(r):
    return r["_dt"].strftime("%Y-%m-%d %H:%M")


def fmt_count(r):
    return f"{r['count']}{UNITS[r['exercise']]}"


def grade(avg):
    if avg >= 90:
        return "PERFECT"
    if avg >= 80:
        return "GOOD"
    if avg >= 70:
        return "NORMAL"
    return "개선 필요"


def error_df(exercise, totals):
    labels = ERROR_LABELS[exercise]
    return pd.DataFrame({"항목": [labels[k] for k in totals], "횟수": list(totals.values())}).set_index("항목")


def render_overview(records):
    ex = st.radio("종목", EXERCISES, format_func=EXERCISE_NAMES.get, horizontal=True, key="ov_ex")
    sessions = of_exercise(records, ex)
    if not sessions:
        st.info(f"{EXERCISE_NAMES[ex]} 기록이 아직 없습니다.")
        return

    latest = sessions[-1]
    st.subheader(f"가장 최근 {EXERCISE_NAMES[ex]} 세션")
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("수행량", fmt_count(latest))
    c2.metric("정확도", f"{latest['accuracy']}%")
    n = attempts(latest)
    c3.metric("전체 시도", f"{n}회" if n is not None else "-")
    c4.metric("촬영 방향", VIEW_NAMES.get(latest.get("view"), latest.get("view", "-")))
    st.caption(f"시작 시각: {fmt_time(latest)}")

    errs = {k: v for k, v in session_errors(latest).items() if v > 0}
    if errs:
        st.write("이 세션의 오답: " + ", ".join(f"{ERROR_LABELS[ex][k]} {v}회" for k, v in errs.items()))
    else:
        st.write("이 세션에서 감지된 오답이 없습니다. ✅")

    st.subheader(f"최근 5회 누적 오답 ({EXERCISE_NAMES[ex]})")
    totals = sum_errors(records, ex, 5)
    if sum(totals.values()) == 0:
        st.caption("최근 5회 동안 오답이 없습니다.")
    else:
        st.bar_chart(error_df(ex, totals))


def render_trend(records):
    ex = st.radio("종목", EXERCISES, format_func=EXERCISE_NAMES.get, horizontal=True, key="tr_ex")
    sessions = of_exercise(records, ex)
    if not sessions:
        st.info(f"{EXERCISE_NAMES[ex]} 기록이 아직 없습니다.")
    else:
        idx = [r["_dt"].strftime("%m/%d %H:%M") for r in sessions]
        st.subheader(f"수행량 추이 ({UNITS[ex]})")
        st.line_chart(pd.DataFrame({f"수행량({UNITS[ex]})": [r["count"] for r in sessions]}, index=idx))
        st.subheader("정확도 추이 (%)")
        st.line_chart(pd.DataFrame({"정확도(%)": [r["accuracy"] for r in sessions]}, index=idx))

    st.subheader("전체 기록 (최신순)")
    rows = []
    for r in reversed(records):
        top = max(session_errors(r).items(), key=lambda kv: kv[1])
        rows.append({
            "시작 시각": fmt_time(r),
            "종목": EXERCISE_NAMES[r["exercise"]],
            "수행량": fmt_count(r),
            "정확도": f"{r['accuracy']}%",
            "대표 오답": f"{ERROR_LABELS[r['exercise']][top[0]]} {top[1]}회" if top[1] > 0 else "-",
        })
    st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)


def render_tips(records):
    st.caption("종목별 최근 5회 기록에서 가장 많이 나온 오답을 기준으로 보여줍니다.")
    for ex in EXERCISES:
        with st.expander(f"{EXERCISE_NAMES[ex]}", expanded=True):
            avg = average_accuracy(records, ex)
            if avg is None:
                st.caption("아직 기록이 없습니다.")
                continue
            st.write(f"평균 정확도 {avg}점 · {grade(avg)}")
            top = top_error(records, ex, 5)
            if top is None:
                st.write("최근 5회 동안 눈에 띄는 오답이 없습니다. 지금 자세를 유지하세요. ✅")
                continue
            key, count = top
            st.markdown(f"**가장 많은 오답: {ERROR_LABELS[ex][key]} ({count}회)**")
            if key in CAUSE_HINTS:
                st.caption("참고: " + CAUSE_HINTS[key])
            if key in VIDEO_LINKS:
                st.markdown(f"[교정 영상 보러가기]({VIDEO_LINKS[key]})")
            else:
                st.caption("이 오답에 연결된 교정 영상은 아직 없습니다.")


@st.fragment(run_every=REFRESH_SECONDS)
def live_view(source):
    """저장된 기록을 주기적으로 다시 읽어서 화면을 갱신한다. (이 부분만 다시 그려진다)"""
    try:
        records, skipped = load_records(source)
    except FileNotFoundError:
        if source == DEFAULT_SOURCE:
            st.info("아직 수신된 기록이 없습니다. 트래커에서 기록이 넘어오면 자동으로 표시됩니다.")
        else:
            st.error(f"기록 파일을 찾을 수 없습니다: {source}")
        return
    except Exception as e:
        st.error(f"기록을 불러오지 못했습니다: {e}")
        return

    if not records:
        st.info("아직 수신된 기록이 없습니다. 트래커에서 기록이 넘어오면 자동으로 표시됩니다.")
        return

    msg = f"기록 {len(records)}건 · 마지막 확인 {datetime.now():%H:%M:%S} (자동 갱신 {REFRESH_SECONDS}초)"
    if skipped:
        msg += f" · 형식이 맞지 않아 건너뛴 기록 {skipped}건"
    st.caption(msg)

    tab1, tab2, tab3 = st.tabs(["최근 세션", "추이 & 전체 기록", "교정 포인트"])
    with tab1:
        render_overview(records)
    with tab2:
        render_trend(records)
    with tab3:
        render_tips(records)


def main():
    st.set_page_config(page_title="AI Motion Fitness Dashboard", layout="wide")
    st.title("AI Motion Fitness Platform - Dashboard")

    source = st.sidebar.text_input("기록 위치 (JSON 파일 경로 또는 API 주소)", value=DEFAULT_SOURCE)
    st.sidebar.caption("기본값은 receiver.py가 저장하는 파일입니다. API 주소(예: http://localhost:8000/api/records)도 넣을 수 있어요.")
    live_view(source)


if __name__ == "__main__":
    main()
