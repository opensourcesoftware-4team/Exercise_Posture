"""MOTION AI 게시판: 정적 화면과 JSON API를 같은 주소에서 제공한다."""
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from uuid import UUID

from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException

from storage import PostStore

ROOT = Path(__file__).resolve().parent
EXERCISES = {'squat', 'pushup', 'plank', 'other'}


def create_app(config=None):
    app = Flask(__name__, static_folder=str(ROOT / 'static'), static_url_path='')
    app.config.update(
        DATABASE_PATH=os.environ.get('DATABASE_PATH', str(ROOT / 'instance' / 'community.sqlite3')),
        MAX_CONTENT_LENGTH=64 * 1024,
    )
    if config:
        app.config.update(config)
    store = PostStore(app.config['DATABASE_PATH'])
    app.extensions['post_store'] = store

    def fail(message, status=400, fields=None):
        return jsonify(error={'message': message, 'fields': fields or {}}), status

    @app.before_request
    def protect_write():
        if request.path.startswith('/api/') and request.method == 'POST':
            # JSON만 받고 다른 사이트에서 브라우저를 통한 글 등록은 막는다.
            origin = request.headers.get('Origin')
            if (request.headers.get('Sec-Fetch-Site') == 'cross-site' or
                    (origin and urlsplit(origin).netloc != request.host)):
                return fail('다른 사이트에서는 게시글을 등록할 수 없습니다.', 403)
            if not request.is_json:
                return fail('JSON 형식으로 요청해 주세요.', 415)

    @app.after_request
    def response_headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'same-origin'
        response.headers['X-Frame-Options'] = 'SAMEORIGIN'
        if request.path.startswith('/api/'):
            response.headers['Cache-Control'] = 'no-store'
        return response

    @app.get('/')
    def index():
        return app.send_static_file('index.html')

    @app.get('/api/health')
    def health():
        with store.connect() as db:
            db.execute('SELECT 1').fetchone()
        return jsonify(status='ok')

    @app.get('/api/posts')
    def list_posts():
        exercise = request.args.get('exercise_type', '')
        if exercise and exercise not in EXERCISES:
            return fail('지원하지 않는 운동 종류입니다.')
        try:
            page = int(request.args.get('page', '1'))
            page_size = int(request.args.get('page_size', '12'))
            if not (1 <= page <= 1000000 and 1 <= page_size <= 50):
                raise ValueError
        except ValueError:
            return fail('페이지 범위를 확인해 주세요.')
        posts, total = store.list(exercise, page, page_size)
        return jsonify(posts=posts, total=total, page=page, page_size=page_size)

    @app.get('/api/posts/<int:post_id>')
    def get_post(post_id):
        post = store.get(post_id)
        return jsonify(post=post) if post else fail('게시글을 찾을 수 없습니다.', 404)

    @app.post('/api/posts')
    def create_post():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return fail('입력 내용을 확인해 주세요.')
        fields, values = {}, {}
        for key, label, limit in [('nickname', '닉네임', 20), ('title', '제목', 100),
                                  ('content', '내용', 5000)]:
            raw = payload.get(key)
            value = raw.strip() if isinstance(raw, str) else ''
            if not value or len(value) > limit or '\x00' in value:
                fields[key] = f'{label}은(는) 공백을 제외한 1~{limit:,}자로 입력해 주세요.'
            values[key] = value
        exercise = payload.get('exercise_type')
        if not isinstance(exercise, str) or exercise not in EXERCISES:
            fields['exercise_type'] = '운동 종류를 선택해 주세요.'
        values['exercise_type'] = exercise
        if fields:
            return fail('입력 항목을 확인해 주세요.', fields=fields)
        try:
            request_id = str(UUID(request.headers.get('Idempotency-Key', '')))
        except (ValueError, AttributeError):
            return fail('등록 요청 번호가 없습니다. 화면을 새로고침해 주세요.')
        try:
            post, created = store.create(values, request_id, datetime.now(timezone.utc).isoformat())
        except ValueError:
            return fail('이미 사용한 요청 번호입니다. 새 등록을 시도해 주세요.', 409)
        return jsonify(post=post), 201 if created else 200

    @app.errorhandler(sqlite3.Error)
    def database_error(error):
        app.logger.exception('게시글 DB 오류')
        return fail('저장소에 연결할 수 없습니다. 입력을 유지한 채 잠시 후 다시 시도해 주세요.', 503)

    @app.errorhandler(HTTPException)
    def http_error(error):
        messages = {404: '요청한 페이지를 찾을 수 없습니다.',
                    405: '지원하지 않는 요청입니다.', 413: '입력 내용이 너무 큽니다.'}
        return fail(messages.get(error.code, '요청을 처리할 수 없습니다.'), error.code)

    return app
