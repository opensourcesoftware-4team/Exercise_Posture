import json
import sys
from pathlib import Path

import pytest
from flask import Flask

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))   # 프로젝트 루트를 import 경로에 추가

import storage
from records import records_bp


def create_test_app():
    """테스트 전용 앱. main.py(개발 리드 소유)에 기대지 않고 기록 API만 등록한다."""
    app = Flask(__name__)
    app.register_blueprint(records_bp)
    return app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "RECORDS_FILE", tmp_path / "records.json")
    return create_test_app().test_client()


@pytest.fixture
def example():
    """유효한 기록 1건 (매번 새 복사본)."""
    errors = {
        "squat": dict.fromkeys(["torsoLean", "shinLean", "heelLift", "partialRep", "kneeValgus"], 0),
        "pushup": dict.fromkeys(["coreDrop", "coreHigh", "handForward", "handBackward", "partialRep"], 0),
        "plank": dict.fromkeys(["hipDrop", "hipHigh", "neckDrop", "neckHigh"], 0),
    }
    base = {
        "id": "6f2c1a9e-3b4d-4c8a-9e21-0a1b2c3d4e5f",
        "startedAt": "2026-10-27T19:30:12+09:00",
        "exercise": "squat", "view": "side", "count": 12, "accuracy": 71, "errors": errors,
    }
    return lambda **kw: json.loads(json.dumps({**base, **kw}))
