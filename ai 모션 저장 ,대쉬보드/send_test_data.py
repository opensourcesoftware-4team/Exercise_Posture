"""
트래커가 기록을 보내는 상황을 흉내내는 테스트용 스크립트.
receiver.py가 켜져 있어야 한다. 실행할 때마다 새 기록(랜덤)을 만들어서 보낸다.

  python send_test_data.py        → 기록 1건 전송
  python send_test_data.py 5      → 기록 5건 전송
"""
import json
import random
import sys
import urllib.error
import urllib.request
import uuid
from datetime import datetime

from records import ERROR_LABELS

URL = "http://localhost:8000/api/records"


def make_record():
    """해석방법.md 포맷에 맞는 랜덤 기록 1건."""
    ex = random.choice(["squat", "pushup", "plank"])
    errors = {e: {k: 0 for k in labels} for e, labels in ERROR_LABELS.items()}
    measurable = [k for k in ERROR_LABELS[ex] if k != "kneeValgus"]  # kneeValgus는 정면 모드 전용(항상 0)
    for k in random.sample(measurable, random.randint(0, 2)):
        errors[ex][k] = random.randint(1, 3)
    count = random.randint(20, 90) if ex == "plank" else random.randint(5, 20)
    accuracy = max(40, 100 - 6 * sum(errors[ex].values()) - random.randint(0, 5))
    return {
        "id": str(uuid.uuid4()),
        "startedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "exercise": ex,
        "view": "side",
        "count": count,
        "accuracy": accuracy,
        "errors": errors,
    }


def send(record, url=URL):
    req = urllib.request.Request(
        url,
        data=json.dumps(record).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            return res.status, json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:  # 400 등: 서버가 이유를 알려준 경우
        return e.code, json.loads(e.read().decode("utf-8"))


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    for _ in range(n):
        record = make_record()
        try:
            status, body = send(record)
        except urllib.error.URLError:
            print("보내지 못했습니다. receiver.py(기록 수신 서버)가 켜져 있는지 확인하세요.")
            return
        print(f"전송: {record['exercise']} {record['count']} / 정확도 {record['accuracy']}% → 응답 {status} {body}")


if __name__ == "__main__":
    main()
