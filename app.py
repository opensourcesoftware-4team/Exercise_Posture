import ipaddress
import os
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from uuid import UUID

from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException

import storage
from post_storage import MAX_PIN_FAILURES, PostStore

ROOT = Path(__file__).resolve().parent
EXERCISES = {'squat', 'pushup', 'plank', 'other'}
COMMENT_FIELDS = [('nickname', '닉네임', 20), ('content', '댓글', 1000)]

def text_fields(payload, specs):
    """문자열 입력 검증: 앞뒤 공백 제거 후 1~limit자, NUL 문자 금지. (오류, 정리된 값)을 돌려준다."""
    fields, values = {}, {}
    for key, label, limit in specs:
        raw = payload.get(key)
        value = raw.strip() if isinstance(raw, str) else ''
        if not value or len(value) > limit or '\x00' in value:
            fields[key] = f'{label}은(는) 공백을 제외한 1~{limit:,}자로 입력해 주세요.'
        values[key] = value
    return fields, values


def valid_pin(value):
    """삭제 PIN: 숫자(0-9) 정확히 4자리 문자열. 전각 숫자 등 다른 문자는 거부한다."""
    return isinstance(value, str) and re.fullmatch(r'[0-9]{4}', value) is not None


def is_local_request():
    """요청이 서버 PC 자신(127.0.0.1, ::1)에서 왔는지. 운동 기록은 서버 PC 사용자의 것으로 본다."""
    try:
        return ipaddress.ip_address(request.remote_addr or '').is_loopback
    except ValueError:
        return False


def find_record(record_id):
    """운동 기록 저장소(data/records.json)에서 id로 기록 하나를 찾는다. 없으면 None."""
    return next((r for r in storage.load_records() if r.get('id') == record_id), None)


def idempotency_key():
    """Idempotency-Key 헤더를 UUID 문자열로. 없거나 형식이 틀리면 None."""
    try:
        return str(UUID(request.headers.get('Idempotency-Key', '')))
    except (ValueError, AttributeError):
        return None


# Flask 앱 초기화 (정적 파일 경로, DB 경로 및 PostStore 등록)
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

    # 보안 및 가드레일 모듈 
    # CSRF 방어 및 타입 검사 
    @app.before_request
    def protect_write():
        # 게시글 삭제(DELETE /api/posts/<id>)도 등록과 같은 검사를 받는다.
        writing = request.method == 'POST' or (
            request.method == 'DELETE' and request.path.startswith('/api/posts/'))
        if request.path.startswith('/api/') and writing:
            # JSON만 받고 다른 사이트에서 브라우저를 통한 글 등록·삭제는 막는다.
            origin = request.headers.get('Origin')
            if (request.headers.get('Sec-Fetch-Site') == 'cross-site' or
                    (origin and urlsplit(origin).netloc != request.host)):
                return fail('다른 사이트에서는 게시글·댓글을 등록하거나 삭제할 수 없습니다.', 403)
            if not request.is_json:
                return fail('JSON 형식으로 요청해 주세요.', 415)

    # 보안 헤더 및 캐시 제어 
    @app.after_request
    def response_headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'same-origin'
        response.headers['X-Frame-Options'] = 'SAMEORIGIN'
        if request.path.startswith('/api/'):
            response.headers['Cache-Control'] = 'no-store'
        return response

    
    # 엔드포인트 api 라우터 
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
        if not post:
            return fail('게시글을 찾을 수 없습니다.', 404)
        # 서버 PC에서 보는 경우 화면이 PIN 없이 삭제 버튼을 보여 줄 수 있게 알려 준다.
        return jsonify(post=post, can_admin_delete=is_local_request())

    @app.post('/api/posts')
    def create_post():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return fail('입력 내용을 확인해 주세요.')
        fields, values = text_fields(payload, [('nickname', '닉네임', 20), ('title', '제목', 100),
                                               ('content', '내용', 5000)])
        exercise = payload.get('exercise_type')
        if not isinstance(exercise, str) or exercise not in EXERCISES:
            fields['exercise_type'] = '운동 종류를 선택해 주세요.'
        values['exercise_type'] = exercise
        # 운동 기록 첨부(선택): 화면이 보낸 수치는 믿지 않고, 서버에 저장된 기록을 id로 찾아 복사한다.
        record, record_id = None, payload.get('record_id')
        if record_id not in (None, '') and not is_local_request():
            fields['record_id'] = '운동 기록 첨부는 서버 PC에서 접속한 경우에만 할 수 있어요.'
        elif record_id not in (None, ''):
            try:
                record_id = str(UUID(record_id))
            except (ValueError, TypeError, AttributeError):
                record_id = None
            if record_id:
                try:
                    record = find_record(record_id)
                except (OSError, ValueError):   # 파일 읽기 실패·JSON 손상
                    return fail('운동 기록을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.', 503)
            if record is None:
                fields['record_id'] = '선택한 운동 기록을 찾을 수 없습니다. 목록을 새로 불러와 주세요.'
        # 삭제 PIN(선택): 숫자 4자리. 없으면 그 글은 서버 PC에서만 삭제할 수 있다.
        delete_pin = payload.get('delete_pin')
        if delete_pin in (None, ''):
            delete_pin = None
        elif not valid_pin(delete_pin):
            fields['delete_pin'] = '삭제 PIN은 숫자 4자리로 입력해 주세요.'
        if fields:
            return fail('입력 항목을 확인해 주세요.', fields=fields)
        request_id = idempotency_key()
        if not request_id:
            return fail('등록 요청 번호가 없습니다. 화면을 새로고침해 주세요.')
        try:
            post, created = store.create(values, request_id, datetime.now(timezone.utc).isoformat(),
                                         record, delete_pin)
        except ValueError:
            return fail('이미 사용한 요청 번호입니다. 새 등록을 시도해 주세요.', 409)
        return jsonify(post=post), 201 if created else 200

    @app.delete('/api/posts/<int:post_id>')
    def delete_post(post_id):
        """게시글 삭제. 서버 PC는 PIN 없이, 다른 기기는 작성할 때 정한 PIN으로 삭제한다."""
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return fail('입력 내용을 확인해 주세요.')
        admin = is_local_request()
        delete_pin = payload.get('delete_pin')
        if not admin and not valid_pin(delete_pin):
            # 형식이 틀린 입력은 실패 횟수에 넣지 않는다.
            return fail('입력 항목을 확인해 주세요.',
                        fields={'delete_pin': '삭제 PIN은 숫자 4자리로 입력해 주세요.'})
        result, remaining = store.delete(post_id, None if admin else delete_pin, admin)
        if result == 'deleted':
            return jsonify(deleted=True, id=post_id)
        if result == 'not_found':
            return fail('게시글을 찾을 수 없습니다.', 404)
        if result == 'no_pin':
            return fail('삭제 PIN 없이 작성된 글은 서버 PC에서만 삭제할 수 있어요.', 403)
        if result == 'locked':
            return fail(f'삭제 PIN을 {MAX_PIN_FAILURES}번 틀려 이 글의 PIN 삭제가 잠겼어요. '
                        '서버 PC에서 삭제해 주세요.', 423)
        return fail('삭제 PIN이 맞지 않아요.', 403,
                    fields={'delete_pin': f'삭제 PIN이 맞지 않아요. (남은 시도 {remaining}번)'})

    @app.get('/api/posts/<int:post_id>/comments')
    def list_comments(post_id):
        comments = store.list_comments(post_id)
        if comments is None:
            return fail('게시글을 찾을 수 없습니다.', 404)
        return jsonify(comments=comments, total=len(comments))

    @app.post('/api/posts/<int:post_id>/comments')
    def create_comment(post_id):
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return fail('입력 내용을 확인해 주세요.')
        fields, values = text_fields(payload, COMMENT_FIELDS)
        if fields:
            return fail('입력 항목을 확인해 주세요.', fields=fields)
        request_id = idempotency_key()
        if not request_id:
            return fail('등록 요청 번호가 없습니다. 화면을 새로고침해 주세요.')
        try:
            result = store.create_comment(post_id, values, request_id,
                                          datetime.now(timezone.utc).isoformat())
        except ValueError:
            return fail('이미 사용한 요청 번호입니다. 새 등록을 시도해 주세요.', 409)
        if result is None:
            return fail('게시글을 찾을 수 없습니다.', 404)
        comment, created = result
        return jsonify(comment=comment), 201 if created else 200

    # 에러 핸들러 (전역 예외 처리)
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
