"""
기록 수신 서버 — 트래커(기능 1)가 보낸 기록을 받아서 저장한다.

  POST /api/records : 기록 1건(JSON 객체) 또는 여러 건(배열)을 받아 storage.py로 저장
  GET  /api/records : 저장된 기록 전체를 최신순으로 돌려줌 (팀 문서의 GET /api/records와 같은 모양)

- 외부 라이브러리 없이 파이썬 기본 기능만 쓴다.
- 실행: python receiver.py          (기본 http://localhost:8000/api/records)
        python receiver.py 9000     (포트 바꾸기)
- 끄려면 검은 창에서 Ctrl+C
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from records import parse_started_at
from storage import RECORDS_PATH, load_all, save_records

RECORDS_FILE = RECORDS_PATH   # 저장 위치 (대시보드가 읽는 파일과 같다)
API_PATH = "/api/records"
MAX_BODY = 1_000_000          # 1MB보다 큰 요청은 거부


def newest_first(records):
    def key(r):
        try:
            return parse_started_at(r["startedAt"])
        except (KeyError, TypeError, ValueError):
            return parse_started_at("1970-01-01T00:00:00+09:00")
    return sorted(records, key=key, reverse=True)


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        # 웹 화면(브라우저)에서 보내는 경우를 위해 허용
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(data)

    def _is_api(self):
        return self.path.split("?")[0].rstrip("/") == API_PATH

    def do_OPTIONS(self):  # 브라우저가 보내기 전에 먼저 물어보는 요청
        self._send(200, {})

    def do_GET(self):
        if not self._is_api():
            return self._send(404, {"error": f"{API_PATH} 로 요청해 주세요"})
        try:
            self._send(200, newest_first(load_all(RECORDS_FILE)))
        except (OSError, ValueError) as e:
            self._send(500, {"error": f"저장 파일을 읽지 못했습니다: {e}"})

    def do_POST(self):
        if not self._is_api():
            return self._send(404, {"error": f"{API_PATH} 로 보내 주세요"})
        try:
            length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            return self._send(400, {"error": "Content-Length가 올바르지 않습니다"})
        if length <= 0:
            return self._send(400, {"error": "보낸 내용이 비어 있습니다"})
        if length > MAX_BODY:
            return self._send(413, {"error": "요청이 너무 큽니다 (1MB 이하로 보내 주세요)"})

        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except ValueError:  # 깨진 JSON, 글자 깨짐
            return self._send(400, {"error": "JSON 형식이 아닙니다"})

        try:
            res = save_records(payload, RECORDS_FILE)
        except (OSError, ValueError) as e:
            print(f"[오류] 저장 실패: {e}")
            return self._send(500, {"error": f"저장하지 못했습니다: {e}"})

        rejected = [{"id": rid, "reason": why} for rid, why in res["rejected"]]
        print(f"[수신] 저장 {res['saved']}건 / 중복 {res['duplicate']}건 / 거부 {len(rejected)}건")
        for item in rejected:
            print(f"   거부: {item['id']} - {item['reason']}")

        if res["saved"]:
            status = 201
        elif rejected and not res["duplicate"]:
            status = 400
        else:
            status = 200  # 전부 이미 저장된 기록
        self._send(status, {"saved": res["saved"], "duplicate": res["duplicate"], "rejected": rejected})

    def log_message(self, *args):  # 기본 접속 로그는 끄고, 위에서 직접 찍는 로그만 사용
        pass


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"기록 수신 서버 시작: http://localhost:{port}{API_PATH}")
    print(f"저장 위치: {RECORDS_FILE}")
    print("끄려면 Ctrl+C")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n서버를 종료합니다.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
