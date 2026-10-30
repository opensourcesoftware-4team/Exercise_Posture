def test_post_then_get(client, example):
    res = client.post("/api/records", json=example())
    assert res.status_code == 201
    assert res.get_json() == {"id": example()["id"]}
    assert len(client.get("/api/records").get_json()) == 1


def test_duplicate_is_409(client, example):
    client.post("/api/records", json=example())
    assert client.post("/api/records", json=example()).status_code == 409


def test_invalid_is_400_with_reason(client, example):
    res = client.post("/api/records", json=example(count=0))
    assert res.status_code == 400
    assert res.get_json()["error"]
    assert client.post("/api/records", data="깨진 JSON", content_type="application/json").status_code == 400


def test_get_is_newest_first(client, example):
    times = ["2026-10-25T10:00:00+09:00", "2026-10-27T10:00:00+09:00", "2026-10-26T01:00:00+00:00"]
    for i, t in enumerate(times):
        client.post("/api/records", json=example(id=f"6f2c1a9e-3b4d-4c8a-9e21-0a1b2c3d4e5{i}", startedAt=t))
    got = [r["startedAt"] for r in client.get("/api/records").get_json()]
    assert got == [times[1], times[2], times[0]]    # 시간대가 섞여도 순서가 맞다


def test_exercise_filter(client, example):
    client.post("/api/records", json=example())
    client.post("/api/records", json=example(id="6f2c1a9e-3b4d-4c8a-9e21-0a1b2c3d4e50", exercise="plank"))
    got = client.get("/api/records?exercise=plank").get_json()
    assert [r["exercise"] for r in got] == ["plank"]


def test_delete(client, example):
    client.post("/api/records", json=example())
    assert client.delete(f"/api/records/{example()['id']}").status_code == 204
    assert client.get("/api/records").get_json() == []
    assert client.delete("/api/records/없는-id").status_code == 404

