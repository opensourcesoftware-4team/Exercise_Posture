"""
운동 기록 읽기 전용 로더
- 기록 포맷: 세션데이터_해석방법.md 참고 (운동 1번 = JSON 객체 1건)
- 기록은 AI 트래커(기능 1)가 쓰고, 대시보드는 읽기만 한다.
- 기록 위치: JSON 파일 경로(예: data/sample-records.json) 또는 API 주소(예: http://.../api/records)
"""
import json
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

EXERCISES = ["squat", "pushup", "plank"]
EXERCISE_NAMES = {"squat": "스쿼트", "pushup": "푸시업", "plank": "플랭크"}
UNITS = {"squat": "회", "pushup": "회", "plank": "초"}  # 같은 count라도 단위가 다름

# 오답 키 → 화면 표시 이름 (해석방법.md 4.3절)
ERROR_LABELS = {
    "squat": {
        "torsoLean": "상체 과다 숙임",
        "shinLean": "정강이 과다 기울기",
        "heelLift": "뒤꿈치 들림",
        "partialRep": "깊이 부족",
        "kneeValgus": "무릎 안쪽 모임",
    },
    "pushup": {
        "coreDrop": "허리 처짐",
        "coreHigh": "엉덩이 솟음",
        "handForward": "손이 너무 앞",
        "handBackward": "손이 너무 뒤",
        "partialRep": "가동범위 부족",
    },
    "plank": {
        "hipDrop": "엉덩이 처짐",
        "hipHigh": "엉덩이 솟음",
        "neckDrop": "고개 숙임",
        "neckHigh": "고개 듦",
    },
}


KST = timezone(timedelta(hours=9))


def parse_started_at(text):
    """startedAt(ISO 8601)을 datetime으로. 시간대가 없으면 한국 시간(+09:00)으로 본다.
    (시간대 있는 값과 없는 값이 섞여도 정렬이 깨지지 않게 하려는 처리)"""
    dt = datetime.fromisoformat(text)
    return dt if dt.tzinfo else dt.replace(tzinfo=KST)


def _read_json_file(path, tries=3):
    """저장 파일을 읽는다. 다른 프로그램이 쓰는 순간과 겹치면 잠깐 기다렸다 다시 읽는다."""
    for i in range(tries):
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (PermissionError, json.JSONDecodeError):
            if i == tries - 1:
                raise
            time.sleep(0.1)


def load_records(source: str):
    """기록을 불러와 (기록 리스트[오래된 순], 건너뛴 개수)를 돌려준다.
    - source가 http(s)로 시작하면 API, 아니면 JSON 파일 경로
    - JSON이 배열이면 여러 건, 객체 하나면 1건으로 처리
    - 필수 필드가 없거나 종목이 이상한 기록은 건너뛴다."""
    if source.startswith(("http://", "https://")):
        with urllib.request.urlopen(source, timeout=5) as res:
            raw = json.loads(res.read().decode("utf-8"))
    else:
        raw = _read_json_file(Path(source))

    if isinstance(raw, dict):
        raw = [raw]

    records, skipped = [], 0
    for r in raw:
        try:
            if r["exercise"] not in EXERCISES:
                raise ValueError("unknown exercise")
            r = dict(r)
            r["_dt"] = parse_started_at(r["startedAt"])  # +09:00 포함 ISO 8601
            r["count"] = r["count"]
            r["accuracy"] = r["accuracy"]
            r.setdefault("errors", {})
            records.append(r)
        except (KeyError, ValueError, TypeError):
            skipped += 1

    records.sort(key=lambda x: x["_dt"])  # 정렬 기준은 startedAt
    return records, skipped


def of_exercise(records, exercise):
    return [r for r in records if r["exercise"] == exercise]


def session_errors(record):
    """그 기록의 '해당 종목' 오답만 꺼낸다 (다른 종목 칸은 항상 0이라 읽지 않음)."""
    ex = record["exercise"]
    labels = ERROR_LABELS[ex]
    errs = record.get("errors", {}).get(ex, {})
    return {k: errs.get(k, 0) for k in labels}


def attempts(record):
    """전체 시도 횟수. 스쿼트·푸시업: count + partialRep, 플랭크: 해당 없음(None)."""
    if record["exercise"] == "plank":
        return None
    return record["count"] + session_errors(record).get("partialRep", 0)


def correct_reps(record):
    """오답 없이 끝난 반복 수(근사치). accuracy가 반올림 값이라 근사."""
    n = attempts(record)
    if n is None:
        return None
    return round(record["accuracy"] * n / 100)


def sum_errors(records, exercise, recent_n=5):
    """해당 종목 최근 N개 세션의 오답 합계."""
    sessions = of_exercise(records, exercise)[-recent_n:]
    totals = {k: 0 for k in ERROR_LABELS[exercise]}
    for s in sessions:
        for k, v in session_errors(s).items():
            totals[k] += v
    return totals


def top_error(records, exercise, recent_n=5):
    """최근 N개 세션에서 가장 많이 나온 오답 (key, 횟수). 오답이 없으면 None."""
    totals = sum_errors(records, exercise, recent_n)
    key, count = max(totals.items(), key=lambda kv: kv[1])
    return (key, count) if count > 0 else None


def average_accuracy(records, exercise):
    """종목별 평균 정확도. 기록이 없으면 None. (종목끼리 섞어서 평균내지 않는다)"""
    sessions = of_exercise(records, exercise)
    if not sessions:
        return None
    return round(sum(s["accuracy"] for s in sessions) / len(sessions))
