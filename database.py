import sqlite3, os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH  = os.path.join(BASE_DIR, "gym.db")

GLOBAL_EXERCISES = [
    ('Bench Press',       'Chest',      'Barbell'),
    ('Squat',             'Legs',       'Barbell'),
    ('Deadlift',          'Back',       'Barbell'),
    ('Overhead Press',    'Shoulders',  'Barbell'),
    ('Barbell Row',       'Back',       'Barbell'),
    ('Pull Up',           'Back',       'Bodyweight'),
    ('Dumbbell Curl',     'Biceps',     'Dumbbell'),
    ('Tricep Pushdown',   'Triceps',    'Cable'),
    ('Leg Press',         'Legs',       'Machine'),
    ('Lat Pulldown',      'Back',       'Cable'),
    ('Incline Press',     'Chest',      'Dumbbell'),
    ('Romanian Deadlift', 'Hamstrings', 'Barbell'),
    ('Face Pull',         'Shoulders',  'Cable'),
    ('Dumbbell Row',      'Back',       'Dumbbell'),
    ('Cable Fly',         'Chest',      'Cable'),
    ('Hip Thrust',        'Glutes',     'Barbell'),
    ('Dips',              'Triceps',    'Bodyweight'),
    ('Leg Curl',          'Hamstrings', 'Machine'),
]

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS user (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT    NOT NULL UNIQUE,
            email         TEXT    NOT NULL UNIQUE,
            password_hash TEXT    NOT NULL,
            created_at    DATETIME NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS body_weight (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
            logged_at   DATE    NOT NULL DEFAULT (date('now')),
            weight_kg   REAL    NOT NULL,
            notes       TEXT
        );

        -- Unique constraint on (name, user_id, is_global) prevents duplicates.
        -- Global exercises have user_id=NULL and is_global=1.
        -- User exercises have user_id=<id> and is_global=0.
        CREATE TABLE IF NOT EXISTS exercise (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER REFERENCES user(id) ON DELETE CASCADE,
            name         TEXT    NOT NULL,
            muscle_group TEXT,
            equipment    TEXT,
            is_global    INTEGER NOT NULL DEFAULT 0,
            UNIQUE(name, is_global, user_id)
        );

        CREATE TABLE IF NOT EXISTS workout_session (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
            session_date    DATE    NOT NULL DEFAULT (date('now')),
            started_at      DATETIME NOT NULL DEFAULT (datetime('now')),
            ended_at        DATETIME,
            calories_burned REAL,
            template_id     INTEGER REFERENCES session_template(id) ON DELETE SET NULL,
            notes           TEXT
        );

        CREATE TABLE IF NOT EXISTS workout_set (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id   INTEGER NOT NULL REFERENCES workout_session(id) ON DELETE CASCADE,
            exercise_id  INTEGER NOT NULL REFERENCES exercise(id),
            set_number   INTEGER NOT NULL,
            reps         INTEGER,
            weight_kg    REAL,
            rest_seconds INTEGER,
            rpe          REAL,
            notes        TEXT,
            logged_at    DATETIME NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS cardio_log (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id      INTEGER NOT NULL REFERENCES workout_session(id) ON DELETE CASCADE,
            user_id         INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
            activity_type   TEXT    NOT NULL,
            distance_km     REAL,
            duration_min    REAL,
            avg_pace_min_km REAL,
            avg_heart_rate  INTEGER,
            elevation_m     REAL,
            notes           TEXT,
            logged_at       DATETIME NOT NULL DEFAULT (datetime('now'))
        );

        -- Session templates
        CREATE TABLE IF NOT EXISTS session_template (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
            name       TEXT    NOT NULL,
            notes      TEXT,
            created_at DATETIME NOT NULL DEFAULT (datetime('now'))
        );

        -- Exercises inside a template (ordered)
        CREATE TABLE IF NOT EXISTS template_exercise (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id     INTEGER NOT NULL REFERENCES session_template(id) ON DELETE CASCADE,
            exercise_id     INTEGER NOT NULL REFERENCES exercise(id),
            sort_order      INTEGER NOT NULL DEFAULT 0,
            target_sets     INTEGER,
            target_reps     INTEGER,
            target_weight_kg REAL
        );

        -- Cardio inside a template
        CREATE TABLE IF NOT EXISTS template_cardio (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id          INTEGER NOT NULL REFERENCES session_template(id) ON DELETE CASCADE,
            activity_type        TEXT    NOT NULL,
            target_distance_km   REAL,
            target_duration_min  REAL
        );
    """)

    # ── Seed global exercises safely (no duplicates ever) ──────────────────
    # Delete exact duplicate globals (name appears more than once with is_global=1)
    conn.execute("""
        DELETE FROM exercise
        WHERE is_global = 1
          AND id NOT IN (
              SELECT MIN(id) FROM exercise
              WHERE is_global = 1
              GROUP BY LOWER(name)
          )
    """)

    # Insert any missing globals
    for name, muscle, equip in GLOBAL_EXERCISES:
        conn.execute("""
            INSERT INTO exercise (name, muscle_group, equipment, is_global, user_id)
            SELECT ?, ?, ?, 1, NULL
            WHERE NOT EXISTS (
                SELECT 1 FROM exercise
                WHERE LOWER(name) = LOWER(?) AND is_global = 1
            )
        """, (name, muscle, equip, name))

    # ── Safe column migrations ─────────────────────────────────────────────
    for table, col, typ in [
        ("workout_session", "calories_burned", "REAL"),
        ("workout_session", "ended_at",        "DATETIME"),
        ("workout_session", "template_id",     "INTEGER"),
    ]:
        try:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {typ}")
        except Exception:
            pass

    conn.commit()
    conn.close()
