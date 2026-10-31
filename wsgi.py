"""클라우드 실행 진입점: waitress-serve --port=8000 wsgi:app"""
from app import create_app

app = create_app()
