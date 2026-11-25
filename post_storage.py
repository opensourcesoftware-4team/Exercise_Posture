"""게시글 저장소. 화면/API와 분리해 다른 DB로 이전하기 쉽게 유지한다."""
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from werkzeug.security import check_password_hash, generate_password_hash

# 삭제 PIN을 이 횟수만큼 틀리면 그 글은 PIN으로 삭제할 수 없게 잠근다. (4자리 = 1만 가지라 추측 방지 필요)
MAX_PIN_FAILURES = 5


class PostStore:
    def __init__(self, path):
        self.path = str(Path(path).resolve())
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS posts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nickname TEXT NOT NULL,
                    title TEXT NOT NULL,
                    exercise_type TEXT NOT NULL
                        CHECK(exercise_type IN ('squat','pushup','plank','other')),
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    request_id TEXT NOT NULL UNIQUE
                );
                CREATE INDEX IF NOT EXISTS posts_exercise_id
                    ON posts(exercise_type, id DESC);
                CREATE TABLE IF NOT EXISTS comments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    post_id INTEGER NOT NULL
                        REFERENCES posts(id) ON DELETE CASCADE,
                    nickname TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    request_id TEXT NOT NULL UNIQUE
                );
                CREATE INDEX IF NOT EXISTS comments_post_id
                    ON comments(post_id, id);
                -- 게시글에 첨부한 운동 기록. 등록 시점의 값을 복사해 두어 원본 기록이 지워져도 유지된다.
                CREATE TABLE IF NOT EXISTS post_records (
                    post_id INTEGER PRIMARY KEY
                        REFERENCES posts(id) ON DELETE CASCADE,
                    record_id TEXT NOT NULL,
                    exercise TEXT NOT NULL CHECK(exercise IN ('squat','pushup','plank')),
                    view TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    count INTEGER NOT NULL,
                    accuracy INTEGER NOT NULL
                );
            """)
            self.migrate(db)

    @staticmethod
    def migrate(db):
        """삭제 PIN 열 추가. 이미 있는 DB도 서버를 켜면 열이 생기고, 기존 글은 PIN 없음(NULL)이 된다."""
        columns = {row['name'] for row in db.execute('PRAGMA table_info(posts)')}
        if 'delete_pin_hash' not in columns:
            db.execute('ALTER TABLE posts ADD COLUMN delete_pin_hash TEXT')
        if 'delete_failures' not in columns:
            db.execute('ALTER TABLE posts ADD COLUMN delete_failures INTEGER NOT NULL DEFAULT 0')

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        # SQLite는 연결마다 외래 키 검사를 켜야 한다. 댓글이 없는 게시글에 붙지 않게 한다.
        db.execute('PRAGMA foreign_keys=ON')
        try:
            with db:
                yield db
        finally:
            db.close()

    # 게시글과 첨부 기록을 한 번에 읽는다. 첨부가 없으면 r_ 열이 NULL.
    SELECT_POSTS = """SELECT posts.*, r.record_id AS r_record_id, r.exercise AS r_exercise,
                               r.view AS r_view, r.started_at AS r_started_at,
                               r.count AS r_count, r.accuracy AS r_accuracy
                        FROM posts LEFT JOIN post_records r ON r.post_id = posts.id"""

    def create(self, values, request_id, created_at, record=None, delete_pin=None):
        """게시글 저장. record는 첨부할 운동 기록(dict) 또는 None.
        delete_pin은 숫자 4자리 문자열 또는 None. 평문은 저장하지 않고 해시만 저장한다."""
        pin_hash = generate_password_hash(delete_pin) if delete_pin else None
        with self.connect() as db:
            cursor = db.execute(
                """INSERT INTO posts
                   (nickname,title,exercise_type,content,created_at,request_id,delete_pin_hash)
                   VALUES (?,?,?,?,?,?,?) ON CONFLICT(request_id) DO NOTHING""",
                (values['nickname'], values['title'], values['exercise_type'],
                 values['content'], created_at, request_id, pin_hash),
            )
            created = cursor.rowcount == 1
            if created and record:
                db.execute(
                    """INSERT INTO post_records
                       (post_id,record_id,exercise,view,started_at,count,accuracy)
                       VALUES (?,?,?,?,?,?,?)""",
                    (cursor.lastrowid, record['id'], record['exercise'], record['view'],
                     record['startedAt'], record['count'], record['accuracy']),
                )
            row = db.execute(self.SELECT_POSTS + ' WHERE posts.request_id=?', (request_id,)).fetchone()
            if (any(row[key] != values[key] for key in values) or
                    row['r_record_id'] != (record['id'] if record else None)):
                raise ValueError('같은 요청 번호에 서로 다른 입력이 사용되었습니다.')
            return self.public(row), created

    @staticmethod
    def public(row):
        post = {key: row[key] for key in
                ('id', 'nickname', 'title', 'exercise_type', 'content', 'created_at')}
        # 원본 기록 id는 공개하지 않는다. (기록 API로 남의 기록을 지우는 데 쓰일 수 있음)
        post['record'] = None if row['r_record_id'] is None else {
            'exercise': row['r_exercise'], 'view': row['r_view'], 'started_at': row['r_started_at'],
            'count': row['r_count'], 'accuracy': row['r_accuracy'],
        }
        # PIN 해시와 실패 횟수는 공개하지 않는다. 화면은 PIN 입력칸을 보여 줄지만 알면 된다.
        post['has_delete_pin'] = row['delete_pin_hash'] is not None
        return post

    def get(self, post_id):
        with self.connect() as db:
            row = db.execute(self.SELECT_POSTS + ' WHERE posts.id=?', (post_id,)).fetchone()
            return self.public(row) if row else None

    def list(self, exercise, page, page_size):
        where, params = (' WHERE exercise_type=?', [exercise]) if exercise else ('', [])
        with self.connect() as db:
            total = db.execute('SELECT COUNT(*) FROM posts' + where, params).fetchone()[0]
            rows = db.execute(
                self.SELECT_POSTS + where + ' ORDER BY posts.id DESC LIMIT ? OFFSET ?',
                params + [page_size, (page - 1) * page_size],
            ).fetchall()
            return [self.public(row) for row in rows], total

    def delete(self, post_id, delete_pin=None, admin=False):
        """게시글 삭제. 댓글과 첨부 기록은 ON DELETE CASCADE로 함께 지워진다.

        admin=True(서버 PC)는 PIN 없이 삭제한다. 그 외에는 PIN이 맞아야 한다.
        결과: ('deleted', None) / ('not_found', None) / ('no_pin', None)
              / ('locked', None) / ('wrong', 남은 시도 횟수)
        """
        with self.connect() as db:
            # 쓰기 잠금을 먼저 잡아 동시에 들어온 PIN 시도를 한 줄로 세운다.
            # (동시에 여러 번 보내 실패 횟수 제한을 건너뛰는 것을 막는다)
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT delete_pin_hash, delete_failures FROM posts WHERE id=?',
                             (post_id,)).fetchone()
            if row is None:
                return 'not_found', None
            if not admin:
                if row['delete_pin_hash'] is None:
                    return 'no_pin', None
                if row['delete_failures'] >= MAX_PIN_FAILURES:
                    return 'locked', None
                if not check_password_hash(row['delete_pin_hash'], delete_pin or ''):
                    failures = row['delete_failures'] + 1
                    db.execute('UPDATE posts SET delete_failures=? WHERE id=?', (failures, post_id))
                    return ('locked', None) if failures >= MAX_PIN_FAILURES else \
                        ('wrong', MAX_PIN_FAILURES - failures)
            db.execute('DELETE FROM posts WHERE id=?', (post_id,))
            return 'deleted', None

    # ---- 댓글 ----
    @staticmethod
    def public_comment(row):
        return {key: row[key] for key in ('id', 'post_id', 'nickname', 'content', 'created_at')}

    def create_comment(self, post_id, values, request_id, created_at):
        """댓글 저장. 게시글이 없으면 None, 있으면 (댓글, 새로 저장했는지)."""
        with self.connect() as db:
            if not db.execute('SELECT 1 FROM posts WHERE id=?', (post_id,)).fetchone():
                return None
            cursor = db.execute(
                """INSERT INTO comments (post_id,nickname,content,created_at,request_id)
                   VALUES (?,?,?,?,?) ON CONFLICT(request_id) DO NOTHING""",
                (post_id, values['nickname'], values['content'], created_at, request_id),
            )
            row = db.execute('SELECT * FROM comments WHERE request_id=?', (request_id,)).fetchone()
            if row['post_id'] != post_id or any(row[key] != values[key] for key in values):
                raise ValueError('같은 요청 번호에 서로 다른 입력이 사용되었습니다.')
            return self.public_comment(row), cursor.rowcount == 1

    def list_comments(self, post_id):
        """게시글의 댓글을 작성 순으로. 게시글이 없으면 None."""
        with self.connect() as db:
            if not db.execute('SELECT 1 FROM posts WHERE id=?', (post_id,)).fetchone():
                return None
            rows = db.execute('SELECT * FROM comments WHERE post_id=? ORDER BY id',
                              (post_id,)).fetchall()
            return [self.public_comment(row) for row in rows]
