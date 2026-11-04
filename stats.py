"""대시보드용 집계 — 기록 목록을 받아 딕셔너리를 돌려주는 순수 함수."""
from datetime import datetime, timedelta

ERROR_ORDER = {
    "squat":  ["torsoLean", "shinLean", "heelLift", "partialRep", "kneeValgus"],
    "pushup": ["coreDrop", "coreHigh", "handForward", "handBackward", "partialRep"],
    "plank":  ["hipDrop", "hipHigh", "neckDrop", "neckHigh"],
}
UNITS = {"squat": "회", "pushup": "회", "plank": "초"}


def _round_half_up(x: float) -> int:
    return int(x + 0.5)


def build_stats(records, exercise, last=7, days=None, now=None):
    mine = [r for r in records if r["exercise"] == exercise]
    mine.sort(key=lambda r: datetime.fromisoformat(r["startedAt"]))   # 오래된 순

    if days is not None:
        now = now or datetime.now().astimezone()
        since = now - timedelta(days=days)
        picked = [r for r in mine if datetime.fromisoformat(r["startedAt"]) >= since]
    else:
        picked = mine[-last:]

    trend = [
        {
            "id": r["id"],
            "label": datetime.fromisoformat(r["startedAt"]).strftime("%m/%d %H:%M"),
            "count": r["count"],
            "accuracy": r["accuracy"],
        }
        for r in picked
    ]

    error_totals = {k: 0 for k in ERROR_ORDER[exercise]}
    for r in picked:
        for k, v in r["errors"][exercise].items():
            error_totals[k] += v
    top_key, top_val = max(error_totals.items(), key=lambda kv: kv[1])

    return {
        "exercise": exercise,
        "unit": UNITS[exercise],
        "sessions": len(picked),
        "trend": trend,
        "summary": {
            "avgAccuracy": _round_half_up(sum(r["accuracy"] for r in picked) / len(picked)) if picked else None,
            "bestCount": max((r["count"] for r in picked), default=0),
            "totalCount": sum(r["count"] for r in picked),
        },
        "errorTotals": error_totals,
        "topError": top_key if top_val > 0 else None,
        "hasFrontView": any(r["view"] == "front" for r in picked),
    }
