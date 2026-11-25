"""게시글 삭제: 서버 PC는 PIN 없이, 다른 기기는 작성할 때 정한 PIN(숫자 4자리)으로 삭제한다."""
import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
from uuid import uuid4

from app import create_app
from post_storage import MAX_PIN_FAILURES

LAN = {'REMOTE_ADDR': '192.168.0.23'}   # 같은 Wi-Fi의 다른 기기
PIN = '4821'
RECORD = {'id': str(uuid4()), 'exercise': 'squat', 'view': 'side',
          'startedAt': '2026-11-20T10:00:00+09:00', 'count': 12, 'accuracy': 80}


class PostDeleteTest(unittest.TestCase):
    def setUp(self):
        self.temp = Path(tempfile.gettempdir()) / ('motion-test-' + str(uuid4()))
        self.temp.mkdir()
        self.config = {'TESTING': True, 'DATABASE_PATH': str(self.temp / 'test.sqlite3')}
        self.app = create_app(self.config)
        self.server_pc = self.app.test_client()      # 테스트 클라이언트 기본 주소는 127.0.0.1
        self.other = self.device()

    def tearDown(self):
        for name in ('test.sqlite3', 'test.sqlite3-wal', 'test.sqlite3-shm'):
            (self.temp / name).unlink(missing_ok=True)
        self.temp.rmdir()

    def device(self):
        client = self.app.test_client()
        client.environ_base.update(LAN)
        return client

    def write(self, client=None, **overrides):
        values = dict(nickname='유경', title='스쿼트 팁', exercise_type='squat',
                      content='천천히 내려가요.', delete_pin=PIN)
        values.update(overrides)
        return (client or self.other).post('/api/posts', json=values,
                                           headers={'Idempotency-Key': str(uuid4())})

    def delete(self, post_id, client=None, **body):
        return (client or self.other).delete(f'/api/posts/{post_id}', json=body)

    def db(self):
        return closing(sqlite3.connect(self.config['DATABASE_PATH']))

    def count(self, table):
        with self.db() as db:
            return db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]

    # ---- 정상 삭제 ----
    def test_author_deletes_with_pin_from_other_device(self):
        post = self.write().json['post']
        result = self.delete(post['id'], delete_pin=PIN)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json, {'deleted': True, 'id': post['id']})
        self.assertEqual(self.other.get(f'/api/posts/{post["id"]}').status_code, 404)
        self.assertEqual(self.other.get('/api/posts').json['total'], 0)

    def test_server_pc_deletes_without_pin(self):
        post = self.write().json['post']
        self.assertEqual(self.delete(post['id'], client=self.server_pc).status_code, 200)
        self.assertEqual(self.server_pc.get(f'/api/posts/{post["id"]}').status_code, 404)

    def test_comments_and_attached_record_are_deleted_together(self):
        store = self.app.extensions['post_store']
        values = dict(nickname='유경', title='기록 공유', exercise_type='squat', content='오늘 기록')
        post, _ = store.create(values, str(uuid4()), '2026-11-25T00:00:00+00:00', RECORD, PIN)
        comment = self.other.post(f'/api/posts/{post["id"]}/comments',
                                  json={'nickname': '민', 'content': '좋아요'},
                                  headers={'Idempotency-Key': str(uuid4())})
        self.assertEqual(comment.status_code, 201)
        self.assertEqual(self.delete(post['id'], delete_pin=PIN).status_code, 200)
        for table in ('posts', 'comments', 'post_records'):
            self.assertEqual(self.count(table), 0, table)

    def test_only_target_post_is_deleted(self):
        keep = self.write(title='남길 글').json['post']
        gone = self.write(title='지울 글').json['post']
        self.assertEqual(self.delete(gone['id'], delete_pin=PIN).status_code, 200)
        posts = self.other.get('/api/posts').json['posts']
        self.assertEqual([p['id'] for p in posts], [keep['id']])

    # ---- 오류 처리 ----
    def test_missing_post_returns_404(self):
        self.assertEqual(self.delete(999, delete_pin=PIN).status_code, 404)
        self.assertEqual(self.delete(999, client=self.server_pc).status_code, 404)

    def test_second_delete_returns_404(self):
        post = self.write().json['post']
        self.assertEqual(self.delete(post['id'], delete_pin=PIN).status_code, 200)
        self.assertEqual(self.delete(post['id'], delete_pin=PIN).status_code, 404)

    def test_wrong_pin_keeps_post_and_shows_remaining(self):
        post = self.write().json['post']
        result = self.delete(post['id'], delete_pin='0000')
        self.assertEqual(result.status_code, 403)
        self.assertIn(f'남은 시도 {MAX_PIN_FAILURES - 1}번', result.json['error']['fields']['delete_pin'])
        self.assertEqual(self.other.get(f'/api/posts/{post["id"]}').status_code, 200)

    def test_bad_pin_format_is_rejected_and_not_counted(self):
        post = self.write().json['post']
        for pin in (None, '', '123', '12345', 'abcd', 1234, '１２３４', ' 4821'):
            with self.subTest(pin=pin):
                self.assertEqual(self.delete(post['id'], delete_pin=pin).status_code, 400)
        with self.db() as db:
            self.assertEqual(db.execute('SELECT delete_failures FROM posts').fetchone()[0], 0)
        self.assertEqual(self.delete(post['id'], delete_pin=PIN).status_code, 200)

    def test_post_without_pin_only_server_pc_can_delete(self):
        post = self.write(delete_pin=None).json['post']
        self.assertFalse(post['has_delete_pin'])
        result = self.delete(post['id'], delete_pin=PIN)
        self.assertEqual(result.status_code, 403)
        self.assertIn('서버 PC', result.json['error']['message'])
        self.assertEqual(self.delete(post['id'], client=self.server_pc).status_code, 200)

    # ---- 추측 방지 (시도 횟수 제한) ----
    def test_locked_after_max_failures_even_with_correct_pin(self):
        post = self.write().json['post']
        codes = [self.delete(post['id'], delete_pin=f'{n:04d}').status_code
                 for n in range(MAX_PIN_FAILURES)]
        self.assertEqual(codes, [403] * (MAX_PIN_FAILURES - 1) + [423])
        self.assertEqual(self.delete(post['id'], delete_pin=PIN).status_code, 423)
        self.assertEqual(self.other.get(f'/api/posts/{post["id"]}').status_code, 200)
        # 잠긴 글도 서버 PC는 삭제할 수 있다.
        self.assertEqual(self.delete(post['id'], client=self.server_pc).status_code, 200)

    def test_lock_survives_server_restart(self):
        post = self.write().json['post']
        for n in range(MAX_PIN_FAILURES):
            self.delete(post['id'], delete_pin=f'{n:04d}')
        restarted = create_app(self.config).test_client()
        restarted.environ_base.update(LAN)
        self.assertEqual(self.delete(post['id'], client=restarted, delete_pin=PIN).status_code, 423)

    def test_parallel_guesses_cannot_exceed_limit(self):
        post = self.write().json['post']
        guesses = [f'{n:04d}' for n in range(20)]   # 정답(4821)은 없음
        with ThreadPoolExecutor(max_workers=8) as pool:
            codes = list(pool.map(lambda pin: self.delete(post['id'], client=self.device(),
                                                          delete_pin=pin).status_code, guesses))
        self.assertEqual(codes.count(403), MAX_PIN_FAILURES - 1)
        self.assertEqual(codes.count(423), len(guesses) - (MAX_PIN_FAILURES - 1))
        with self.db() as db:
            self.assertEqual(db.execute('SELECT delete_failures FROM posts').fetchone()[0], MAX_PIN_FAILURES)

    # ---- PIN 보관·노출 ----
    def test_pin_is_hashed_and_never_returned(self):
        created = self.write()
        post = created.json['post']
        responses = [created.get_data(as_text=True),
                     self.other.get('/api/posts').get_data(as_text=True),
                     self.other.get(f'/api/posts/{post["id"]}').get_data(as_text=True)]
        for text in responses:
            self.assertNotIn(PIN, text)
            self.assertNotIn('delete_pin_hash', text)
            self.assertNotIn('delete_failures', text)
        self.assertTrue(post['has_delete_pin'])
        with self.db() as db:
            stored = db.execute('SELECT delete_pin_hash FROM posts').fetchone()[0]
        self.assertNotEqual(stored, PIN)
        self.assertNotIn(PIN, stored)

    def test_invalid_pin_on_create(self):
        for pin in ('123', '12345', 'abcd', 1234, '１２３４', ['1234']):
            with self.subTest(pin=pin):
                result = self.write(delete_pin=pin)
                self.assertEqual(result.status_code, 400)
                self.assertIn('delete_pin', result.json['error']['fields'])
        self.assertEqual(self.count('posts'), 0)

    def test_detail_tells_whether_viewer_is_server_pc(self):
        post = self.write().json['post']
        self.assertTrue(self.server_pc.get(f'/api/posts/{post["id"]}').json['can_admin_delete'])
        self.assertFalse(self.other.get(f'/api/posts/{post["id"]}').json['can_admin_delete'])

    # ---- 요청 보호 ----
    def test_cross_site_and_non_json_delete_blocked(self):
        post = self.write().json['post']
        cross = self.other.delete(f'/api/posts/{post["id"]}', json={'delete_pin': PIN},
                                  headers={'Origin': 'https://evil.example'})
        self.assertEqual(cross.status_code, 403)
        plain = self.other.delete(f'/api/posts/{post["id"]}', data=f'delete_pin={PIN}')
        self.assertEqual(plain.status_code, 415)
        self.assertEqual(self.other.get(f'/api/posts/{post["id"]}').status_code, 200)

    # ---- 기존 DB 이전 ----
    def test_existing_database_gets_pin_columns(self):
        legacy = self.temp / 'legacy.sqlite3'
        with closing(sqlite3.connect(legacy)) as db, db:
            db.execute("""CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, nickname TEXT NOT NULL,
                          title TEXT NOT NULL, exercise_type TEXT NOT NULL, content TEXT NOT NULL,
                          created_at TEXT NOT NULL, request_id TEXT NOT NULL UNIQUE)""")
            db.execute("INSERT INTO posts (nickname,title,exercise_type,content,created_at,request_id) "
                       "VALUES ('옛 글','제목','squat','내용','2026-11-01T00:00:00+00:00','old-1')")
        try:
            app = create_app({'TESTING': True, 'DATABASE_PATH': str(legacy)})
            server_pc, other = app.test_client(), app.test_client()
            other.environ_base.update(LAN)
            post = other.get('/api/posts').json['posts'][0]
            self.assertFalse(post['has_delete_pin'])
            self.assertEqual(other.delete(f'/api/posts/{post["id"]}', json={'delete_pin': PIN}).status_code, 403)
            self.assertEqual(server_pc.delete(f'/api/posts/{post["id"]}', json={}).status_code, 200)
        finally:
            for suffix in ('', '-wal', '-shm'):
                Path(str(legacy) + suffix).unlink(missing_ok=True)


if __name__ == '__main__':
    unittest.main()
