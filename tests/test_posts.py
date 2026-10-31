import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

from app import create_app


class PostsTest(unittest.TestCase):
    def setUp(self):
        self.temp = Path(tempfile.gettempdir()) / ('motion-test-' + str(uuid4()))
        self.temp.mkdir()
        self.config = {'TESTING': True, 'DATABASE_PATH': str(self.temp / 'test.sqlite3')}
        self.app = create_app(self.config)
        self.client = self.app.test_client()

    def tearDown(self):
        for name in ('test.sqlite3', 'test.sqlite3-wal', 'test.sqlite3-shm'):
            (self.temp / name).unlink(missing_ok=True)
        self.temp.rmdir()

    def post(self, **overrides):
        values = dict(nickname='유경', title='스쿼트 팁', exercise_type='squat', content='천천히 내려가요.\n호흡도 함께!')
        values.update(overrides)
        return self.client.post('/api/posts', json=values, headers={'Idempotency-Key': str(uuid4())})

    def test_create_read_second_client_restart(self):
        result = self.post()
        self.assertEqual(result.status_code, 201)
        post = result.json['post']
        other = self.app.test_client()
        self.assertEqual(other.get('/api/posts').json['posts'][0], post)
        restarted = create_app(self.config).test_client()
        self.assertEqual(restarted.get(f'/api/posts/{post["id"]}').json['post'], post)
        self.assertTrue(post['created_at'].endswith('+00:00'))
        self.assertNotIn('request_id', post)

    def test_filter_order_pagination(self):
        first = self.post(title='첫 글').json['post']
        second = self.post(title='둘째 글', exercise_type='plank').json['post']
        third = self.post(title='셋째 글').json['post']
        result = self.client.get('/api/posts?exercise_type=squat&page_size=1').json
        self.assertEqual(result['total'], 2)
        self.assertEqual(result['posts'][0]['id'], third['id'])
        result = self.client.get('/api/posts?exercise_type=squat&page_size=1&page=2').json
        self.assertEqual(result['posts'][0]['id'], first['id'])
        self.assertEqual(self.client.get('/api/posts?exercise_type=plank').json['posts'][0]['id'], second['id'])

    def test_invalid_fields(self):
        for values in ({'nickname':'  '}, {'title':'x'*101}, {'content':'x'*5001},
                       {'exercise_type':'running'}, {'exercise_type':[]}, {'nickname':42}, {'content':'\x00'}):
            with self.subTest(values=values):
                self.assertEqual(self.post(**values).status_code, 400)
        self.assertEqual(self.client.get('/api/posts').json['total'], 0)

    def test_unicode_length_and_trim(self):
        post = self.post(nickname='😀'*20, title='  팁  ').json['post']
        self.assertEqual(post['title'], '팁')
        self.assertEqual(self.post(nickname='😀'*21).status_code, 400)

    def test_literal_markup_and_sql(self):
        text = "<img src=x onerror=alert(1)> '); DROP TABLE posts; --"
        result = self.post(content=text)
        self.assertEqual(result.status_code, 201)
        self.assertEqual(self.client.get('/api/posts').json['posts'][0]['content'], text)
        self.assertEqual(self.post().status_code, 201)

    def test_retry_is_idempotent(self):
        data = dict(nickname='테스터', title='한 번만', exercise_type='other', content='테스트')
        headers = {'Idempotency-Key': str(uuid4())}
        first = self.client.post('/api/posts', json=data, headers=headers)
        again = self.client.post('/api/posts', json=data, headers=headers)
        self.assertEqual(first.json['post']['id'], again.json['post']['id'])
        self.assertEqual(again.status_code, 200)
        self.assertEqual(self.client.get('/api/posts').json['total'], 1)
        data['title'] = '다른 내용'
        self.assertEqual(self.client.post('/api/posts', json=data, headers=headers).status_code, 409)

    def test_missing_bad_requests_and_origin(self):
        self.assertEqual(self.client.get('/api/posts/999').status_code, 404)
        for suffix in ['?page=0', '?page=abc', '?page_size=500', '?exercise_type=bad']:
            self.assertEqual(self.client.get('/api/posts'+suffix).status_code, 400)
        self.assertEqual(self.client.post('/api/posts', data='x').status_code, 415)
        self.assertEqual(self.client.post('/api/posts', json=[]).status_code, 400)
        self.assertEqual(self.client.post('/api/posts', json={}, headers={'Origin':'https://other.test'}).status_code, 403)
        self.assertEqual(self.client.post('/api/posts', json={}, headers={'Sec-Fetch-Site':'cross-site'}).status_code, 403)
        self.assertEqual(self.client.post('/api/posts', data='x'*70000, content_type='application/json').status_code, 413)

    def test_parallel_writes(self):
        def write(i):
            with self.app.test_client() as client:
                return client.post('/api/posts', json=dict(nickname='동시시험', title=str(i),
                    exercise_type='pushup', content='여러 기기'), headers={'Idempotency-Key':str(uuid4())}).status_code
        with ThreadPoolExecutor(max_workers=4) as pool:
            self.assertEqual(list(pool.map(write, range(12))), [201]*12)
        self.assertEqual(self.client.get('/api/posts').json['total'], 12)

    def test_static_and_private_files(self):
        with self.client.get('/') as response:
            self.assertEqual(response.status_code, 200)
            self.assertIn('community.js', response.text)
        with self.client.get('/moving2.js') as response:
            self.assertEqual(response.status_code, 200)
        for path in ['/app.py', '/post_storage.py', '/instance/community.sqlite3', '/.env']:
            self.assertEqual(self.client.get(path).status_code, 404)
        self.assertEqual(self.client.get('/api/posts').headers['Cache-Control'], 'no-store')


if __name__ == '__main__':
    unittest.main()
