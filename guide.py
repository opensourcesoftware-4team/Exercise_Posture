"""운동 가이드 API (기능 3 Exercise-Guide 연결).

Exercise-guide.py의 가이드 문구(error_info)와 오답 집계(get_all_errors_info)를
저장된 운동 기록(storage)과 묶어 HTTP로 내보낸다. 가이드 문구는 Exercise-guide.py에서만 고친다.
"""
import importlib.util
from pathlib import Path

from flask import Blueprint, jsonify, request

import storage

ROOT = Path(__file__).resolve().parent


def _load_exercise_guide():
    """Exercise-guide.py를 모듈로 불러온다. 파일 이름에 '-'가 있어 import 문으로는 부를 수 없다."""
    spec = importlib.util.spec_from_file_location("exercise_guide", ROOT / "Exercise-guide.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


exercise_guide = _load_exercise_guide()
guide_bp = Blueprint("guide", __name__)


@guide_bp.get("/api/guide")
def get_guide():
    """종목의 오답별 가이드. 저장된 기록에서 많이 나온 오답부터, 횟수가 같으면 가이드 순서대로."""
    exercise = request.args.get("exercise")
    guides = exercise_guide.error_info.get(exercise)
    if guides is None:
        return jsonify(error="exercise는 squat, pushup, plank 중 하나여야 합니다"), 400
    records = [r for r in storage.load_records() if r["exercise"] == exercise]
    counts = {key: count for (ex, key), count in exercise_guide.get_all_errors_info(records) if ex == exercise}
    items = [
        # videoReady: 가이드 영상 파일이 static/ 아래에 실제로 있는가 (아직 없으면 화면에 '준비 중'으로 보인다)
        {"key": key, "count": counts.get(key, 0), **info, "videoReady": (ROOT / "static" / info["video"]).is_file()}
        for key, info in guides.items()
    ]
    items.sort(key=lambda item: item["count"], reverse=True)
    return jsonify(exercise=exercise, sessions=len(records), guides=items)
