"""통합 서버(main.py): 네 기능이 한 앱에서 함께 동작하는지 확인한다."""
import pytest

import main
import storage

# 트래커(static/tracker/js/session.js buildRecord)가 만드는 기록. tests/js/session.test.js의 기록 양식 테스트와 같은 값이다
TRACKER_RECORD = {
    "id": "6f2c1a9e-4b7d-4e3a-9c51-2d8e7f0b3a64",
    "startedAt": "2026-10-27T19:30:12+09:00",
    "exercise": "squat",
    "view": "side",
    "count": 12,
    "accuracy": 71,
    "errors": {
        "squat": {"torsoLean": 1, "shinLean": 0, "heelLift": 1, "partialRep": 2, "kneeValgus": 0},
        "pushup": {"coreDrop": 0, "coreHigh": 0, "handForward": 0, "handBackward": 0, "partialRep": 0},
        "plank": {"hipDrop": 0, "hipHigh": 0, "neckDrop": 0, "neckHigh": 0},
    },
}


@pytest.fixture
def make_app(tmp_path, monkeypatch):
    """임시 기록 파일·게시글 DB를 쓰는 통합 앱. create_app이 바꾼 기록 파일 경로는 테스트가 끝나면 되돌린다"""
    monkeypatch.setattr(storage, "RECORDS_FILE", storage.RECORDS_FILE)

    def make(**config):
        return main.create_app({"TESTING": True, "DATABASE_PATH": str(tmp_path / "community.sqlite3"), **config})

    return make


@pytest.fixture
def client(make_app, tmp_path):
    return make_app(RECORDS_FILE=str(tmp_path / "records.json")).test_client()


def test_feature_pages_are_served(client):
    for path, marker in [
        ("/", "community.js"),
        ("/tracker/", "js/tracker.js"),
        ("/dashboard/", "js/main.js"),
        ("/guide/", "guide.js"),
        ("/static/dashboard/dashboard.html", "js/main.js"),  # 대시보드 화면 메뉴가 쓰는 주소
    ]:
        response = client.get(path)
        assert response.status_code == 200, path
        assert marker in response.text, path
    assert client.get("/tracker").status_code == 308  # '/'를 붙인 주소로 보낸다 (화면 안의 상대 경로가 맞게)


def test_main_page_links_every_feature(client):
    html = client.get("/").text
    for path in ["/tracker/", "/dashboard/", "/guide/", "community-nav"]:
        assert path in html
    assert "moving2.js" not in html  # 옛 트래커 엔진은 더 이상 불러오지 않는다


def test_tracker_record_reaches_dashboard_and_guide(client):
    assert storage.validate_record(TRACKER_RECORD) is None
    response = client.post("/api/records", json=TRACKER_RECORD)  # 같은 출처 JSON이라 커뮤니티 쓰기 보호를 통과한다
    assert response.status_code == 201
    assert [r["id"] for r in client.get("/api/records?exercise=squat").get_json()] == [TRACKER_RECORD["id"]]
    stats = client.get("/api/stats?exercise=squat").get_json()
    assert (stats["sessions"], stats["topError"]) == (1, "partialRep")
    guide = client.get("/api/guide?exercise=squat").get_json()
    assert guide["sessions"] == 1
    assert [(g["key"], g["count"]) for g in guide["guides"]] == [
        ("partialRep", 2), ("torsoLean", 1), ("heelLift", 1), ("shinLean", 0), ("kneeValgus", 0),
    ]


def test_guide_covers_every_error_key(client):
    for exercise, keys in storage.ERROR_KEYS.items():
        guide = client.get(f"/api/guide?exercise={exercise}").get_json()
        assert guide["sessions"] == 0
        assert {g["key"] for g in guide["guides"]} == keys
        for g in guide["guides"]:
            assert g["count"] == 0
            assert g["description"] and g["cause"] and g["solution"]
            assert g["videoReady"] is False  # 가이드 영상 파일은 아직 없다
    assert client.get("/api/guide?exercise=lunge").status_code == 400
    assert client.get("/api/guide").status_code == 400


def test_record_writes_from_other_sites_are_blocked(client):
    blocked = client.post("/api/records", json=TRACKER_RECORD, headers={"Origin": "https://other.test"})
    assert blocked.status_code == 403
    assert client.get("/api/records").get_json() == []


def test_community_and_records_share_one_server(client):
    post = client.post(
        "/api/posts",
        json={"nickname": "원빈", "title": "통합 확인", "exercise_type": "squat", "content": "한 서버에서 돈다"},
        headers={"Idempotency-Key": "8a0d2c4e-1f3b-4c5d-9e6f-7a8b9c0d1e2f"},
    )
    assert post.status_code == 201
    assert client.get("/api/health").get_json() == {"status": "ok"}
    assert client.get("/api/records").status_code == 200


def test_records_file_defaults_to_project_data(make_app, monkeypatch):
    monkeypatch.delenv("RECORDS_FILE", raising=False)
    make_app()
    assert storage.RECORDS_FILE == main.ROOT / "data" / "records.json"
    monkeypatch.setenv("RECORDS_FILE", "elsewhere.json")
    make_app()
    assert str(storage.RECORDS_FILE) == "elsewhere.json"


def test_private_files_are_not_served(client):
    for path in ["/main.py", "/guide.py", "/Exercise-guide.py", "/static/../main.py", "/data/records.json"]:
        assert client.get(path).status_code == 404, path
