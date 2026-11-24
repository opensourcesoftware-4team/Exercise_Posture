"""기록 파일(data/records.json) 읽기·쓰기·검증.

- 쓰기는 임시 파일에 쓴 뒤 os.replace로 교체 (쓰는 도중 꺼져도 기존 파일이 깨지지 않음)
- 읽고-추가하고-쓰는 과정은 threading.Lock으로 감쌈
- 파일 경로는 환경변수 RECORDS_FILE로 바꿀 수 있음
"""
import json
import os
import threading
import uuid
from datetime import datetime
from pathlib import Path

RECORDS_FILE = Path(os.environ.get("RECORDS_FILE", "data/records.json"))
_lock = threading.Lock()

ERROR_KEYS = {
    "squat":  {"torsoLean", "shinLean", "heelLift", "partialRep", "kneeValgus"},
    "pushup": {"coreDrop", "coreHigh", "handForward", "handBackward", "partialRep"},
    "plank":  {"hipDrop", "hipHigh", "neckDrop", "neckHigh"},
}
FIELDS = {"id", "startedAt", "exercise", "view", "count", "accuracy", "errors"}


class DuplicateRecordError(Exception):
    """같은 id의 기록이 이미 있을 때."""


def load_records() -> list[dict]:
    if not RECORDS_FILE.exists():
        return []
    with RECORDS_FILE.open(encoding="utf-8") as f:
        return json.load(f)


def _save_records(records: list[dict]) -> None:
    RECORDS_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = RECORDS_FILE.with_suffix(".json.tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    os.replace(tmp, RECORDS_FILE)   # 한 번에 교체


def add_record(record: dict) -> None:
    with _lock:
        records = load_records()
        if any(r["id"] == record["id"] for r in records):
            raise DuplicateRecordError(record["id"])
        records.append(record)
        _save_records(records)


def delete_record(record_id: str) -> bool:
    with _lock:
        records = load_records()
        kept = [r for r in records if r["id"] != record_id]
        if len(kept) == len(records):
            return False
        _save_records(kept)
        return True


def _is_int(x) -> bool:
    # True/False도 int라서 bool은 따로 걸러낸다
    return isinstance(x, int) and not isinstance(x, bool)


def validate_record(data) -> str | None:
    """문제가 있으면 사유 문자열, 없으면 None. (지침서 4.1절 표 순서)"""
    if not isinstance(data, dict):
        return "기록은 JSON 객체여야 합니다"

    missing = FIELDS - data.keys()
    extra = data.keys() - FIELDS
    if missing:
        return f"필드가 빠졌습니다: {', '.join(sorted(missing))}"
    if extra:
        return f"허용되지 않는 필드가 있습니다: {', '.join(sorted(extra))}"

    try:
        uuid.UUID(data["id"])
    except (ValueError, AttributeError, TypeError):
        return "id가 UUID 형식이 아닙니다"

    try:
        started = datetime.fromisoformat(data["startedAt"])
    except (ValueError, TypeError):
        return "startedAt이 ISO 8601 형식이 아닙니다"
    if started.tzinfo is None:
        return "startedAt에 시간대 정보(+09:00)가 없습니다"

    exercise = data["exercise"]
    if exercise not in ERROR_KEYS:
        return "exercise는 squat, pushup, plank 중 하나여야 합니다"
    if data["view"] not in ("side", "front"):
        return "view는 side 또는 front여야 합니다"

    if not _is_int(data["count"]) or data["count"] < 1:
        return "count는 1 이상의 정수여야 합니다"
    if not _is_int(data["accuracy"]) or not 0 <= data["accuracy"] <= 100:
        return "accuracy는 0~100 사이의 정수여야 합니다"

    errors = data["errors"]
    if not isinstance(errors, dict) or errors.keys() != ERROR_KEYS.keys():
        return "errors의 키는 squat, pushup, plank여야 합니다"
    for ex, keys in ERROR_KEYS.items():
        part = errors[ex]
        if not isinstance(part, dict) or part.keys() != keys:
            return f"errors.{ex}의 키가 명세와 다릅니다"
        if not all(_is_int(v) and v >= 0 for v in part.values()):
            return f"errors.{ex}의 값은 0 이상의 정수여야 합니다"
    return None
