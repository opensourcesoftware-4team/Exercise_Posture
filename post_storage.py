"""게시글 저장소. 화면/API와 분리해 다른 DB로 이전하기 쉽게 유지한다."""
import sqlite3
from contextlib import contextmanager
from pathlib import Path


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

    def create(self, values, request_id, created_at, record=None):
        """게시글 저장. record는 첨부할 운동 기록(dict) 또는 None."""
        with self.connect() as db:
            cursor = db.execute(
                """INSERT INTO posts
                   (nickname,title,exercise_type,content,created_at,request_id)
                   VALUES (?,?,?,?,?,?) ON CONFLICT(request_id) DO NOTHING""",
                (values['nickname'], values['title'], values['exercise_type'],
                 values['content'], created_at, request_id),
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
