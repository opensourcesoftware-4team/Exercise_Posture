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
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def create(self, values, request_id, created_at):
        with self.connect() as db:
            cursor = db.execute(
                """INSERT INTO posts
                   (nickname,title,exercise_type,content,created_at,request_id)
                   VALUES (?,?,?,?,?,?) ON CONFLICT(request_id) DO NOTHING""",
                (values['nickname'], values['title'], values['exercise_type'],
                 values['content'], created_at, request_id),
            )
            row = db.execute("SELECT * FROM posts WHERE request_id=?", (request_id,)).fetchone()
            if any(row[key] != values[key] for key in values):
                raise ValueError('같은 요청 번호에 서로 다른 입력이 사용되었습니다.')
            return self.public(row), cursor.rowcount == 1

    @staticmethod
    def public(row):
        return {key: row[key] for key in
                ('id', 'nickname', 'title', 'exercise_type', 'content', 'created_at')}

    def get(self, post_id):
        with self.connect() as db:
            row = db.execute('SELECT * FROM posts WHERE id=?', (post_id,)).fetchone()
            return self.public(row) if row else None

    def list(self, exercise, page, page_size):
        where, params = (' WHERE exercise_type=?', [exercise]) if exercise else ('', [])
        with self.connect() as db:
            total = db.execute('SELECT COUNT(*) FROM posts' + where, params).fetchone()[0]
            rows = db.execute(
                'SELECT * FROM posts' + where + ' ORDER BY id DESC LIMIT ? OFFSET ?',
                params + [page_size, (page - 1) * page_size],
            ).fetchall()
            return [self.public(row) for row in rows], total
