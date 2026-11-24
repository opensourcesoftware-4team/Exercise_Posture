from datetime import datetime, timedelta, timezone

from stats import build_stats

KST = timezone(timedelta(hours=9))
NOW = datetime(2026, 10, 28, 12, 0, tzinfo=KST)


def make(example, n, days_ago, count, accuracy, **errs):
    r = example(id=f"6f2c1a9e-3b4d-4c8a-9e21-0a1b2c3d4e{n:02d}", count=count, accuracy=accuracy,
                startedAt=(NOW - timedelta(days=days_ago)).isoformat(timespec="seconds"))
    r["errors"]["squat"].update(errs)
    return r


def test_last_n_sessions(example):
    recs = [make(example, 1, 40, 8, 50, heelLift=5),
            make(example, 2, 3, 10, 60, heelLift=3, partialRep=4),
            make(example, 3, 2, 11, 64, torsoLean=2, partialRep=4),
            make(example, 4, 1, 12, 71, heelLift=3)]
    s = build_stats(recs, "squat", last=3, now=NOW)
    assert s["sessions"] == 3
    assert [t["count"] for t in s["trend"]] == [10, 11, 12]        # 오래된 순
    assert s["summary"] == {"avgAccuracy": 65, "bestCount": 12, "totalCount": 33}
    assert s["errorTotals"] == {"torsoLean": 2, "shinLean": 0, "heelLift": 6, "partialRep": 8, "kneeValgus": 0}
    assert s["topError"] == "partialRep"
    assert s["unit"] == "회" and s["hasFrontView"] is False


def test_last_30_days_excludes_old(example):
    recs = [make(example, 1, 40, 8, 50), make(example, 2, 29, 9, 60), make(example, 3, 1, 12, 70)]
    s = build_stats(recs, "squat", days=30, now=NOW)
    assert s["sessions"] == 2


def test_no_errors_gives_null(example):
    s = build_stats([make(example, 1, 1, 12, 100)], "squat", now=NOW)
    assert s["topError"] is None


def test_other_exercise_is_ignored_and_plank_unit(example):
    recs = [make(example, 1, 1, 12, 100), example(id="6f2c1a9e-3b4d-4c8a-9e21-0a1b2c3d4e99", exercise="plank", count=45)]
    s = build_stats(recs, "plank", now=NOW)
    assert s["sessions"] == 1 and s["unit"] == "초" and s["summary"]["bestCount"] == 45


def test_front_view_and_label(example):
    r = make(example, 1, 1, 12, 70); r["view"] = "front"
    s = build_stats([r], "squat", now=NOW)
    assert s["hasFrontView"] is True
    assert s["trend"][0]["label"] == "10/27 12:00"


def test_empty(example):
    s = build_stats([], "squat", now=NOW)
    assert s["sessions"] == 0 and s["summary"]["avgAccuracy"] is None and s["topError"] is None
