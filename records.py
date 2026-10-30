"""기록 API 라우트 (Flask Blueprint)."""
from datetime import datetime

from flask import Blueprint, jsonify, request

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

