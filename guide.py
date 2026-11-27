"""운동 가이드 API (기능 3 Exercise-Guide 연결).

Exercise-guide.py가 읽는 오답 콘텐츠(data/error_content.json)·가이드 영상 목록(data/videos.json)과
오답 집계(get_all_errors_info)·횟수별 교정 루틴(get_routine_by_count)을 저장된 운동 기록(storage)과 묶어 HTTP로 내보낸다.
가이드 문구·루틴·영상은 Exercise-guide.py와 그 데이터 파일에서만 고친다. 파일은 요청마다 읽으므로 고치면 바로 반영된다.
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


def _guide_item(key, info, count, videos):
    """오답 하나의 가이드. routine은 그 오답이 나온 횟수(1회 / 2~4회 / 5회 이상)에 맞춘 교정 루틴이고, 나온 적 없으면 None.
    video는 유튜브 임베드 주소가 있는 가이드 영상이고, 없으면 None (화면에 '가이드 영상 준비 중')."""
    video = videos.get(info.get("video_id"))
    return {
        "key": key,
        "count": count,
        "description": info["description"],
        "cause": info["cause"],
        "solution": info["solution"],
        "reference": info.get("reference", ""),
        "routine": exercise_guide.get_routine_by_count(info, count) if count > 0 else None,
        "video": {"title": video["title"], "embedUrl": video["embed_url"]} if video and video["embed_url"] else None,
    }


@guide_bp.get("/api/guide")
def get_guide():
    """종목의 오답별 가이드. 저장된 기록에서 많이 나온 오답부터, 횟수가 같으면 가이드 순서대로."""
    exercise = request.args.get("exercise")
    guides = exercise_guide.load_error_content().get(exercise)
    if guides is None:
        return jsonify(error="exercise는 squat, pushup, plank 중 하나여야 합니다"), 400
    videos = exercise_guide.load_videos_catalog()
    records = [r for r in storage.load_records() if r["exercise"] == exercise]
    counts = {key: count for (ex, key), count in exercise_guide.get_all_errors_info(records) if ex == exercise}
    items = [_guide_item(key, info, counts.get(key, 0), videos) for key, info in guides.items()]
    items.sort(key=lambda item: item["count"], reverse=True)
    return jsonify(exercise=exercise, sessions=len(records), guides=items)
