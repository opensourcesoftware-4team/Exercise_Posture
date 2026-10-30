"""Windows/LAN에서도 개발 디버거 없이 Waitress로 실행한다."""
import os
import socket
from waitress import serve
from app import create_app


if __name__ == '__main__':
    host = os.environ.get('HOST', '0.0.0.0')
    port = int(os.environ.get('PORT', '8000'))
    app = create_app()
    print(f'Local: http://127.0.0.1:{port}/#community', flush=True)
    try:
        # 1. 현재 컴퓨터의 호스트 이름을 바탕으로 사용 가능한 모든 IPv4 주소를 수집한 뒤,
        # 중복을 제거(set)하고 오름차순으로 정렬(sorted)합니다.
        addresses = sorted({item[4][0] for item in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)})
        
        # 2. 수집된 IP 주소 목록을 하나씩 확인합니다.
        for address in addresses:
            # 3. 자기 자신을 가리키는 루프백 주소(127.0.0.1 등)는 외부 접속용이 아니므로 제외합니다.
            if not address.startswith('127.'):
                # 4. 다른 기기(스마트폰 등)에서 접속할 수 있는 실제 LAN IP 후보와 포트, 경로를 조합해 즉시 출력합니다.
                print(f'LAN candidate: http://{address}:{port}/#community', flush=True)
    except OSError:
        pass
    print('Choose the Wi-Fi IPv4 address shown by ipconfig. Ctrl+C stops the server.', flush=True)
    print(f'Database: {app.config["DATABASE_PATH"]}', flush=True)
    serve(app, host=host, port=port, threads=4, max_request_body_size=65536)
