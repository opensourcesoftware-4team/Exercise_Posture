"""
운동 기록 저장소
- 트래커(기능 1)에서 오는 기록(JSON 1건 = 운동 1번)을 검사해서 data/records.json 에 저장한다.
- 기록 포맷: 세션데이터_해석방법.md
- 저장된 기록을 읽는 건 records.py(load_records)가 한다.

사용 예:
    from storage import save_records
    result = save_records(record_dict_or_list)   # {"saved": 1, "duplicate": 0, "rejected": []}

터미널에서 파일로 저장:
    python storage.py session-example.json
"""
import json
import os
import sys
import tempfile
import threading
import time
from datetime import datetime
from pathlib import Path

from records import EXERCISES, ERROR_LABELS

RECORDS_PATH = Path(__file__).parent / "data" / "records.json"
_LOCK = threading.Lock()  # 기록이 동시에 여러 건 들어와도 저장이 꼬이지 않게


def validate(record):
    """문제가 없으면 None, 있으면 이유(문자열)를 돌려준다."""
    if not isinstance(record, dict):
        return "기록이 JSON 객체가 아님"
    for key in ("id", "startedAt", "exercise", "count", "accuracy"):
        if key not in record:
            return f"'{key}' 필드가 없음"

    if not isinstance(record["id"], str) or not record["id"]:
        return "id가 비어 있거나 문자열이 아님"
    try:
        datetime.fromisoformat(record["startedAt"])
    except (TypeError, ValueError):
        return "startedAt이 ISO 8601 형식이 아님"
    if record["exercise"] not in EXERCISES:
        return f"exercise가 squat/pushup/plank 중 하나가 아님: {record['exercise']!r}"

    count = record["count"]
    if isinstance(count, bool) or not isinstance(count, (int, float)) or count < 1:
        return "count는 1 이상의 숫자여야 함 (0인 운동은 저장하지 않는 규칙)"
    acc = record["accuracy"]
    if isinstance(acc, bool) or not isinstance(acc, (int, float)) or not 0 <= acc <= 100:
        return "accuracy는 0~100 숫자여야 함"
    if not isinstance(record.get("errors", {}), dict):
        return "errors가 객체가 아님"
    return None


def normalize(record):
    """errors에 3종목 칸이 항상 있도록 빠진 키를 0으로 채운다. (알 수 없는 키는 그대로 둠)"""
    r = dict(record)
    given = r.get("errors") or {}
    errors = {}
    for ex, labels in ERROR_LABELS.items():
        ex_errs = dict(given.get(ex) or {})
        for key in labels:
            ex_errs.setdefault(key, 0)
        errors[ex] = ex_errs
    r["errors"] = errors
    return r


def _read_all(path):
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        return []
    data = json.loads(text)  # 파일이 깨져 있으면 에러를 그대로 올려서, 덮어써서 날리는 일을 막는다
    return data if isinstance(data, list) else [data]


def _write_all(path, records):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    for i in range(5):  # 대시보드가 파일을 읽는 순간과 겹치면(윈도우) 잠깐 기다렸다 다시 시도
        try:
            os.replace(tmp, path)  # 쓰다가 꺼져도 기존 파일이 반쪽으로 남지 않게 통째로 교체
            return
        except PermissionError:
            if i == 4:
                raise
            time.sleep(0.1)


def save_records(records, path=RECORDS_PATH):
    """기록 1건(dict) 또는 여러 건(list)을 저장한다. 규칙과 반환값은 _save_records 참고."""
    with _LOCK:
        return _save_records(records, path)


def load_all(path=RECORDS_PATH):
    """저장된 기록 전체(list)를 돌려준다. 파일이 없으면 빈 리스트."""
    with _LOCK:
        return _read_all(Path(path))


def _save_records(records, path):
    """기록 1건(dict) 또는 여러 건(list)을 저장한다.
    - 형식이 틀린 기록은 저장하지 않고 이유를 알려준다.
    - 이미 있는 id는 건너뛴다 (한 번 저장된 기록은 고치지 않음).
    돌려주는 값: {"saved": 저장 건수, "duplicate": 중복 건수, "rejected": [(id, 이유), ...]}"""
    path = Path(path)
    if isinstance(records, dict):
        records = [records]

    existing = _read_all(path)
    ids = {r.get("id") for r in existing}
    saved, duplicate, rejected = 0, 0, []

    for r in records:
        reason = validate(r)
        if reason:
            rejected.append((r.get("id", "?") if isinstance(r, dict) else "?", reason))
            continue
        if r["id"] in ids:
            duplicate += 1
            continue
        existing.append(normalize(r))
        ids.add(r["id"])
        saved += 1

    if saved:
        _write_all(path, existing)
    return {"saved": saved, "duplicate": duplicate, "rejected": rejected}


def save_json_text(text, path=RECORDS_PATH):
    """JSON 문자열(객체 1개 또는 배열)을 받아 저장한다."""
    return save_records(json.loads(text), path)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("사용법: python storage.py 기록파일.json [더있으면 계속]")
        sys.exit(1)
    for file in sys.argv[1:]:
        try:
            res = save_json_text(Path(file).read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            print(f"{file}: 저장 실패 - {e}")
            continue
        print(f"{file}: 저장 {res['saved']}건, 중복 {res['duplicate']}건, 거부 {len(res['rejected'])}건")
        for rid, reason in res["rejected"]:
            print(f"   - {rid}: {reason}")
