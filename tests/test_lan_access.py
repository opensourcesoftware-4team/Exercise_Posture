"""같은 Wi-Fi의 다른 기기: 커뮤니티는 함께 쓰고, 서버 PC의 운동 기록은 보거나 첨부할 수 없다."""
import pytest

import main
import storage
from test_main import TRACKER_RECORD

LAN = {"REMOTE_ADDR": "192.168.0.23"}
POST = dict(nickname="유경", title="오늘 스쿼트", exercise_type="squat", content="정확도가 올랐어요")


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "RECORDS_FILE", storage.RECORDS_FILE)   # create_app이 바꾼 경로를 테스트 뒤 되돌린다
    return main.create_app({"TESTING": True, "DATABASE_PATH": str(tmp_path / "community.sqlite3"),
                            "RECORDS_FILE": str(tmp_path / "records.json")})


@pytest.fixture
def server_pc(app):
    client = app.test_client()
    assert client.post("/api/records", json=TRACKER_RECORD).status_code == 201
    return client


@pytest.fixture
def other_device(app):
    client = app.test_client()
    client.environ_base.update(LAN)
    return client


def write(client, key, **extra):
    return client.post("/api/posts", json={**POST, **extra}, headers={"Idempotency-Key": key})


def test_server_pc_uses_records_and_attaches(server_pc):
    assert len(server_pc.get("/api/records").get_json()) == 1
    assert server_pc.get("/api/stats?exercise=squat").status_code == 200
    assert server_pc.get("/api/guide?exercise=squat").status_code == 200
    res = write(server_pc, "6f2c1a9e-0000-4000-8000-000000000001", record_id=TRACKER_RECORD["id"])
    assert res.status_code == 201
    assert res.get_json()["post"]["record"]["accuracy"] == 71


@pytest.mark.parametrize("method, path", [
    ("get", "/api/records"), ("get", "/api/stats?exercise=squat"), ("get", "/api/guide?exercise=squat"),
    ("delete", f"/api/records/{TRACKER_RECORD['id']}"),
])
def test_other_device_cannot_read_or_delete_records(server_pc, other_device, method, path):
    res = getattr(other_device, method)(path)
    assert res.status_code == 403
    assert "서버 PC" in res.get_json()["error"]
    assert len(server_pc.get("/api/records").get_json()) == 1      # 기록은 그대로


def test_other_device_cannot_save_records(other_device, server_pc):
    record = {**TRACKER_RECORD, "id": "6f2c1a9e-4b7d-4e3a-9c51-2d8e7f0b3a65"}
    assert other_device.post("/api/records", json=record).status_code == 403
    assert len(server_pc.get("/api/records").get_json()) == 1


def test_other_device_cannot_attach_record(other_device, server_pc):
    res = write(other_device, "6f2c1a9e-0000-4000-8000-000000000002", record_id=TRACKER_RECORD["id"])
    assert res.status_code == 400
    assert "서버 PC" in res.get_json()["error"]["fields"]["record_id"]
    assert server_pc.get("/api/posts").get_json()["total"] == 0


def test_other_device_shares_community(server_pc, other_device):
    write(server_pc, "6f2c1a9e-0000-4000-8000-000000000003", record_id=TRACKER_RECORD["id"])
    res = write(other_device, "6f2c1a9e-0000-4000-8000-000000000004")
    assert res.status_code == 201
    post_id = res.get_json()["post"]["id"]
    assert other_device.post(f"/api/posts/{post_id}/comments", json={"nickname": "승희", "content": "좋아요"},
                             headers={"Idempotency-Key": "6f2c1a9e-0000-4000-8000-000000000005"}).status_code == 201
    posts = other_device.get("/api/posts").get_json()["posts"]
    assert len(posts) == 2
    # 서버 PC 사용자가 직접 첨부한 기록 요약은 다른 기기에서도 보인다
    assert [p["record"] is not None for p in posts] == [False, True]
    assert other_device.get("/").status_code == 200
