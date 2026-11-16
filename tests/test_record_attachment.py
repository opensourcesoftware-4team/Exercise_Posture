import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from uuid import uuid4

import storage
from app import create_app


def make_record(**overrides):
    errors = {
        'squat': dict.fromkeys(['torsoLean', 'shinLean', 'heelLift', 'partialRep', 'kneeValgus'], 0),
        'pushup': dict.fromkeys(['coreDrop', 'coreHigh', 'handForward', 'handBackward', 'partialRep'], 0),
        'plank': dict.fromkeys(['hipDrop', 'hipHigh', 'neckDrop', 'neckHigh'], 0),
    }
    record = {'id': str(uuid4()), 'startedAt': '2026-11-10T19:30:12+09:00', 'exercise': 'squat',
              'view': 'side', 'count': 12, 'accuracy': 71, 'errors': errors}
    record.update(overrides)
    return record


class RecordAttachmentTest(unittest.TestCase):
    def setUp(self):
        self.temp = Path(tempfile.mkdtemp(prefix='motion-test-'))
        self.old_records_file = storage.RECORDS_FILE
        storage.RECORDS_FILE = self.temp / 'records.json'
        self.squat = make_record()
        self.plank = make_record(exercise='plank', view='side', count=45, accuracy=88,
                                 startedAt='2026-11-11T08:00:00+09:00')
        self.private = make_record(exercise='pushup', view='front', count=20, accuracy=33)
        storage.RECORDS_FILE.write_text(json.dumps([self.squat, self.plank, self.private]), encoding='utf-8')
        self.config = {'TESTING': True, 'DATABASE_PATH': str(self.temp / 'test.sqlite3')}
        self.app = create_app(self.config)
        self.client = self.app.test_client()

    def tearDown(self):
        storage.RECORDS_FILE = self.old_records_file
        for path in self.temp.iterdir():
            path.unlink()
        self.temp.rmdir()

    def post(self, key=None, **overrides):
        values = dict(nickname='유경', title='오늘 스쿼트', exercise_type='squat', content='정확도가 올랐어요')
        values.update(overrides)
        return self.client.post('/api/posts', json=values,
                                headers={'Idempotency-Key': key or str(uuid4())})

    def test_attach_record_and_read_back(self):
        result = self.post(record_id=self.squat['id'])
        self.assertEqual(result.status_code, 201)
        expected = {'exercise': 'squat', 'view': 'side', 'started_at': '2026-11-10T19:30:12+09:00',
                    'count': 12, 'accuracy': 71}
        self.assertEqual(result.json['post']['record'], expected)
        post_id = result.json['post']['id']
        # 다른 사용자(다른 클라이언트)도 상세·목록에서 같은 첨부를 본다
        other = self.app.test_client()
        self.assertEqual(other.get(f'/api/posts/{post_id}').json['post']['record'], expected)
        self.assertEqual(other.get('/api/posts').json['posts'][0]['record'], expected)

    def test_plank_record_keeps_seconds(self):
        record = self.post(record_id=self.plank['id'], exercise_type='plank').json['post']['record']
        self.assertEqual((record['exercise'], record['count'], record['accuracy']), ('plank', 45, 88))

    def test_post_without_record(self):
        for extra in ({}, {'record_id': None}, {'record_id': ''}):
            with self.subTest(extra=extra):
                result = self.post(**extra)
                self.assertEqual(result.status_code, 201)
                self.assertIsNone(result.json['post']['record'])

    def test_only_selected_record_is_public(self):
        post_id = self.post(record_id=self.squat['id']).json['post']['id']
        self.post()
        texts = [json.dumps(self.client.get(f'/api/posts/{post_id}').json),
                 json.dumps(self.client.get('/api/posts').json)]
        for text in texts:
            self.assertNotIn(self.private['id'], text)
            self.assertNotIn(self.plank['id'], text)
            # 원본 기록 id와 세부 오류 횟수도 노출하지 않는다
            self.assertNotIn(self.squat['id'], text)
            self.assertNotIn('torsoLean', text)

    def test_unknown_or_malformed_record_rejected(self):
        for record_id in (str(uuid4()), 'not-a-uuid', 123, ['x'], {'id': self.squat['id']}):
            with self.subTest(record_id=record_id):
                result = self.post(record_id=record_id)
                self.assertEqual(result.status_code, 400)
                self.assertIn('record_id', result.json['error']['fields'])
        self.assertEqual(self.client.get('/api/posts').json['total'], 0)

    def test_client_cannot_forge_record_values(self):
        """화면이 수치를 함께 보내도 무시하고 서버에 저장된 기록 값을 쓴다."""
        result = self.post(record_id=self.squat['id'], record={'accuracy': 100, 'count': 999})
        self.assertEqual(result.json['post']['record']['accuracy'], 71)
        self.assertEqual(result.json['post']['record']['count'], 12)

    def test_snapshot_survives_record_deletion_and_restart(self):
        post_id = self.post(record_id=self.squat['id']).json['post']['id']
        self.assertTrue(storage.delete_record(self.squat['id']))
        restarted = create_app(self.config).test_client()
        self.assertEqual(restarted.get(f'/api/posts/{post_id}').json['post']['record']['accuracy'], 71)

    def test_retry_is_idempotent_and_record_change_conflicts(self):
        key = str(uuid4())
        first = self.post(key=key, record_id=self.squat['id'])
        again = self.post(key=key, record_id=self.squat['id'])
        self.assertEqual((first.status_code, again.status_code), (201, 200))
        self.assertEqual(first.json['post'], again.json['post'])
        self.assertEqual(self.post(key=key, record_id=self.plank['id']).status_code, 409)
        self.assertEqual(self.post(key=key).status_code, 409)
        self.assertEqual(self.client.get('/api/posts').json['total'], 1)
        with sqlite3.connect(self.config['DATABASE_PATH']) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM post_records').fetchone()[0], 1)

    def test_broken_records_file(self):
        storage.RECORDS_FILE.write_text('{broken', encoding='utf-8')
        self.assertEqual(self.post(record_id=self.squat['id']).status_code, 503)
        self.assertEqual(self.post().status_code, 201)   # 첨부 없는 글은 계속 등록 가능

    def test_existing_db_gets_attachment_table(self):
        old = self.temp / 'old.sqlite3'
        with sqlite3.connect(old) as db:
            db.execute("""CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, nickname TEXT NOT NULL,
                title TEXT NOT NULL, exercise_type TEXT NOT NULL, content TEXT NOT NULL,
                created_at TEXT NOT NULL, request_id TEXT NOT NULL UNIQUE)""")
            db.execute("INSERT INTO posts VALUES (1,'a','기존 글','squat','본문','2026-11-01T00:00:00+00:00','r1')")
        db.close()
        client = create_app({'TESTING': True, 'DATABASE_PATH': str(old)}).test_client()
        self.assertIsNone(client.get('/api/posts/1').json['post']['record'])


if __name__ == '__main__':
    unittest.main()
