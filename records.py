"""기록·통계 API 라우트 (Flask Blueprint)."""
from datetime import datetime

from flask import Blueprint, jsonify, request

import stats
import storage

records_bp = Blueprint("records", __name__)


@records_bp.post("/api/records")
def create_record():
    data = request.get_json(silent=True)
    reason = storage.validate_record(data)
    if reason:
        return jsonify(error=reason), 400
    try:
        storage.add_record(data)
    except storage.DuplicateRecordError:
        return jsonify(error="이미 저장된 기록입니다"), 409
    return jsonify(id=data["id"]), 201


@records_bp.get("/api/records")
def list_records():
    records = storage.load_records()
    exercise = request.args.get("exercise")
    if exercise:
        records = [r for r in records if r["exercise"] == exercise]
    records.sort(key=lambda r: datetime.fromisoformat(r["startedAt"]), reverse=True)
    return jsonify(records)


@records_bp.delete("/api/records/<record_id>")
def remove_record(record_id):
    if storage.delete_record(record_id):
        return "", 204
    return jsonify(error="기록을 찾을 수 없습니다"), 404


def _positive_int(name):
    """쿼리 파라미터를 1 이상 정수로. 없으면 None, 잘못되면 ValueError."""
    raw = request.args.get(name)
    if raw is None:
        return None
    try:
        value = int(raw)
    except ValueError:
        raise ValueError(f"{name}는 정수여야 합니다") from None
    if value < 1:
        raise ValueError(f"{name}는 1 이상이어야 합니다")
    return value


@records_bp.get("/api/stats")
def get_stats():
    exercise = request.args.get("exercise")
    if exercise not in storage.ERROR_KEYS:
        return jsonify(error="exercise는 squat, pushup, plank 중 하나여야 합니다"), 400
    try:
        last = _positive_int("last") or 7
        days = _positive_int("days")
    except ValueError as e:
        return jsonify(error=str(e)), 400
    return jsonify(stats.build_stats(storage.load_records(), exercise, last=last, days=days))
