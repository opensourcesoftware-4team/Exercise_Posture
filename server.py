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
        addresses = sorted({item[4][0] for item in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)})
        for address in addresses:
            if not address.startswith('127.'):
                print(f'LAN candidate: http://{address}:{port}/#community', flush=True)
    except OSError:
        pass
    print('Choose the Wi-Fi IPv4 address shown by ipconfig. Ctrl+C stops the server.', flush=True)
    print(f'Database: {app.config["DATABASE_PATH"]}', flush=True)
    serve(app, host=host, port=port, threads=4, max_request_body_size=65536)
