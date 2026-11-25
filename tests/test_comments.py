import sqlite3
from contextlib import closing
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

from app import create_app


class CommentsTest(unittest.TestCase):
    def setUp(self):
        self.temp = Path(tempfile.gettempdir()) / ('motion-test-' + str(uuid4()))
        self.temp.mkdir()
        self.config = {'TESTING': True, 'DATABASE_PATH': str(self.temp / 'test.sqlite3')}
        self.app = create_app(self.config)
        self.client = self.app.test_client()
        self.post_id = self.make_post()

    def tearDown(self):
        for name in ('test.sqlite3', 'test.sqlite3-wal', 'test.sqlite3-shm'):
            (self.temp / name).unlink(missing_ok=True)
        self.temp.rmdir()

    def make_post(self, title='스쿼트 팁'):
        result = self.client.post('/api/posts', json=dict(
            nickname='유경', title=title, exercise_type='squat', content='천천히 내려가요.'),
            headers={'Idempotency-Key': str(uuid4())})
        return result.json['post']['id']

    def comment(self, post_id=None, key=None, **overrides):
        values = dict(nickname='댓글러', content='저도 해볼게요!\n좋은 팁 감사합니다.')
        values.update(overrides)
        return self.client.post(f'/api/posts/{post_id or self.post_id}/comments', json=values,
                                headers={'Idempotency-Key': key or str(uuid4())})

    def comments(self, post_id=None):
        return self.client.get(f'/api/posts/{post_id or self.post_id}/comments')

    def test_create_and_list(self):
        self.assertEqual(self.comments().json, {'comments': [], 'total': 0})
        result = self.comment()
        self.assertEqual(result.status_code, 201)
        comment = result.json['comment']
        self.assertEqual(comment['post_id'], self.post_id)
        self.assertEqual(comment['content'], '저도 해볼게요!\n좋은 팁 감사합니다.')
        self.assertTrue(comment['created_at'].endswith('+00:00'))
        self.assertNotIn('request_id', comment)
        listed = self.comments().json
        self.assertEqual(listed['total'], 1)
        self.assertEqual(listed['comments'][0], comment)

    def test_oldest_first(self):
        ids = [self.comment(content=f'{i}번째').json['comment']['id'] for i in range(3)]
        self.assertEqual([c['id'] for c in self.comments().json['comments']], ids)

    def test_comments_belong_to_their_post(self):
        other_post = self.make_post('다른 글')
        self.comment(content='첫 글 댓글')
        self.comment(post_id=other_post, content='둘째 글 댓글')
        self.assertEqual([c['content'] for c in self.comments().json['comments']], ['첫 글 댓글'])
        self.assertEqual([c['content'] for c in self.comments(other_post).json['comments']], ['둘째 글 댓글'])

    def test_persists_across_clients_and_restart(self):
        comment = self.comment().json['comment']
        self.assertEqual(self.app.test_client().get(
            f'/api/posts/{self.post_id}/comments').json['comments'], [comment])
        restarted = create_app(self.config).test_client()
        self.assertEqual(restarted.get(f'/api/posts/{self.post_id}/comments').json['comments'], [comment])

    def test_missing_post(self):
        self.assertEqual(self.comments(999).status_code, 404)
        self.assertEqual(self.comment(post_id=999).status_code, 404)
        with closing(sqlite3.connect(self.config['DATABASE_PATH'])) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM comments').fetchone()[0], 0)

    def test_foreign_key_enforced_in_db(self):
        store = self.app.extensions['post_store']
        with self.assertRaises(sqlite3.IntegrityError):
            with store.connect() as db:
                db.execute("INSERT INTO comments (post_id,nickname,content,created_at,request_id) "
                           "VALUES (999,'a','b','t',?)", (str(uuid4()),))

    def test_invalid_fields(self):
        cases = ({'nickname': '  '}, {'nickname': 'x' * 21}, {'nickname': 42}, {'content': ''},
                 {'content': '   \n '}, {'content': 'x' * 1001}, {'content': None}, {'content': 'a\x00b'})
        for values in cases:
            with self.subTest(values=values):
                result = self.comment(**values)
                self.assertEqual(result.status_code, 400)
                self.assertTrue(result.json['error']['fields'])
        self.assertEqual(self.comments().json['total'], 0)

    def test_trim_and_unicode_length(self):
        comment = self.comment(nickname='  운동러  ', content='😀' * 1000).json['comment']
        self.assertEqual(comment['nickname'], '운동러')
        self.assertEqual(self.comment(content='😀' * 1001).status_code, 400)

    def test_literal_markup_and_sql(self):
        text = "<script>alert(1)</script> '); DROP TABLE comments; --"
        self.assertEqual(self.comment(content=text).status_code, 201)
        self.assertEqual(self.comments().json['comments'][0]['content'], text)
        self.assertEqual(self.comment().status_code, 201)

    def test_retry_is_idempotent(self):
        key = str(uuid4())
        first = self.comment(key=key)
        again = self.comment(key=key)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(again.status_code, 200)
        self.assertEqual(first.json['comment']['id'], again.json['comment']['id'])
        self.assertEqual(self.comments().json['total'], 1)
        self.assertEqual(self.comment(key=key, content='다른 내용').status_code, 409)
        self.assertEqual(self.comment(post_id=self.make_post('다른 글'), key=key).status_code, 409)

    def test_bad_requests_and_origin(self):
        path = f'/api/posts/{self.post_id}/comments'
        self.assertEqual(self.client.post(path, json={'nickname': 'a', 'content': 'b'}).status_code, 400)
        self.assertEqual(self.client.post(path, json={'nickname': 'a', 'content': 'b'},
                                          headers={'Idempotency-Key': 'nope'}).status_code, 400)
        self.assertEqual(self.client.post(path, data='x').status_code, 415)
        self.assertEqual(self.client.post(path, json=[]).status_code, 400)
        self.assertEqual(self.client.post(path, json={}, headers={'Origin': 'https://other.test'}).status_code, 403)
        self.assertEqual(self.client.post(path, json={}, headers={'Sec-Fetch-Site': 'cross-site'}).status_code, 403)
        self.assertEqual(self.client.get('/api/posts/abc/comments').status_code, 404)
        self.assertEqual(self.client.get(path).headers['Cache-Control'], 'no-store')

    def test_parallel_writes(self):
        def write(i):
            with self.app.test_client() as client:
                return client.post(f'/api/posts/{self.post_id}/comments',
                                   json=dict(nickname='동시시험', content=str(i)),
                                   headers={'Idempotency-Key': str(uuid4())}).status_code
        with ThreadPoolExecutor(max_workers=4) as pool:
            self.assertEqual(list(pool.map(write, range(12))), [201] * 12)
        self.assertEqual(self.comments().json['total'], 12)

    def test_existing_db_without_comments_table(self):
        """댓글 기능 이전에 만든 DB 파일도 서버 재시작만으로 댓글 테이블이 추가된다."""
        old = self.temp / 'old.sqlite3'
        with sqlite3.connect(old) as db:
            db.execute("""CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, nickname TEXT NOT NULL,
                title TEXT NOT NULL, exercise_type TEXT NOT NULL, content TEXT NOT NULL,
                created_at TEXT NOT NULL, request_id TEXT NOT NULL UNIQUE)""")
            db.execute("INSERT INTO posts VALUES (1,'a','기존 글','squat','본문','2026-11-01T00:00:00+00:00','r1')")
        db.close()
        try:
            client = create_app({'TESTING': True, 'DATABASE_PATH': str(old)}).test_client()
            self.assertEqual(client.get('/api/posts/1/comments').json['total'], 0)
            self.assertEqual(client.post('/api/posts/1/comments', json={'nickname': 'b', 'content': 'c'},
                                         headers={'Idempotency-Key': str(uuid4())}).status_code, 201)
        finally:
            for suffix in ('', '-wal', '-shm'):
                Path(str(old) + suffix).unlink(missing_ok=True)


if __name__ == '__main__':
    unittest.main()
