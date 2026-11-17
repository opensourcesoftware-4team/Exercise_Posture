"""Motion AI MVP 통합 실행 파일. `python main.py` 하나로 네 기능을 한 서버에서 띄운다.

| 기능 | 담당 | 화면 | API |
| --- | --- | --- | --- |
| 1. AI 실시간 자세 분석 | 김원빈 | /tracker/ (static/tracker/) | 종료 시 POST /api/records |
| 2. 운동 기록 저장·대시보드 | 김성재 | /dashboard/ (static/dashboard/) | /api/records, /api/stats (records.py) |
| 3. 운동 가이드 | 전승희 | /guide/ (static/guide/) | /api/guide (guide.py → Exercise-guide.py) |
| 4. 운동 공유 커뮤니티 | 민유경 | /#community (static/index.html) | /api/posts (app.py) |

각 기능의 코드는 그대로 두고, 이 파일은 한 앱으로 묶고 실행하는 일만 한다.
환경변수: HOST(기본 0.0.0.0), PORT(기본 8000), RECORDS_FILE(운동 기록 파일), DATABASE_PATH(게시글 DB)
"""
import os
import socket
import sys
from pathlib import Path

import storage
from app import create_app as create_community_app
from guide import guide_bp
from records import records_bp

ROOT = Path(__file__).resolve().parent

# 기능 화면 주소 → static/ 아래 파일. 화면 안의 상대 경로(css, js)가 맞도록 주소는 '/'로 끝난다
PAGES = {
    "tracker": "tracker/tracker.html",
    "dashboard": "dashboard/dashboard.html",
    "guide": "guide/guide.html",
}


def create_app(config=None):
    """네 기능을 등록한 Flask 앱. 바탕은 커뮤니티 앱(app.py)이라 정적 파일 제공과 보안 헤더, 쓰기 보호를 함께 쓴다."""
    config = config or {}
    # 운동 기록 파일: 실행 위치와 상관없이 프로젝트의 data/records.json (RECORDS_FILE이 있으면 그 경로)
    storage.RECORDS_FILE = Path(config.get("RECORDS_FILE") or os.environ.get("RECORDS_FILE") or ROOT / "data" / "records.json")
    app = create_community_app(config)
    app.register_blueprint(records_bp)
    app.register_blueprint(guide_bp)

    for name, page in PAGES.items():
        app.add_url_rule(f"/{name}/", f"{name}_page", lambda page=page: app.send_static_file(page))

    # 대시보드 화면 메뉴가 쓰는 /static/... 주소도 같은 정적 파일로 응답한다 (이 앱은 정적 파일을 / 아래에서 제공한다)
    @app.get("/static/<path:filename>")
    def static_alias(filename):
        return app.send_static_file(filename)

    return app


def lan_addresses():
    """같은 Wi-Fi의 다른 기기가 접속할 수 있는 이 PC의 IPv4 주소 후보"""
    try:
        infos = socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)
    except OSError:
        return []
    return sorted({info[4][0] for info in infos if not info[4][0].startswith("127.")})


def main():
    # 한글 안내가 파이프·파일·IDE 출력 창에서도 깨지지 않게 (콘솔 창은 원래 그대로 보인다)
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    app = create_app()
    local = f"http://127.0.0.1:{port}"
    print(f"Motion AI: {local}/", flush=True)
    print(f"  AI 자세 분석   {local}/tracker/", flush=True)
    print(f"  기록 대시보드  {local}/dashboard/", flush=True)
    print(f"  운동 가이드    {local}/guide/", flush=True)
    print(f"  커뮤니티       {local}/#community", flush=True)
    if host == "0.0.0.0":
        for address in lan_addresses():
            print(f"LAN 후보: http://{address}:{port}/ (카메라는 이 PC의 127.0.0.1 주소에서만 켜진다)", flush=True)
    print(f"운동 기록: {storage.RECORDS_FILE}", flush=True)
    print(f"게시글 DB: {app.config['DATABASE_PATH']}", flush=True)
    print("Ctrl+C로 종료합니다.", flush=True)
    try:
        from waitress import serve
    except ImportError:
        print("waitress가 없어 Flask 개발 서버로 실행합니다. (설치: pip install -r requirements.txt)", flush=True)
        app.run(host=host, port=port, threaded=True)
        return
    serve(app, host=host, port=port, threads=4, max_request_body_size=65536)


if __name__ == "__main__":
    main()
