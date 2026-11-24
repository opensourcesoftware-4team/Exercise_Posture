"""클라우드 실행 진입점: waitress-serve --port=8000 wsgi:app (main.py의 통합 앱)"""
from main import create_app

app = create_app()
