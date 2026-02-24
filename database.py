import sqlite3, os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH  = os.path.join(BASE_DIR, "gym.db")

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

        CREATE TABLE IF NOT EXISTS exercise (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER REFERENCES user(id) ON DELETE CASCADE,
            name         TEXT    NOT NULL,
            muscle_group TEXT,
            equipment    TEXT,
            is_global    INTEGER NOT NULL DEFAULT 0
        );

        -- A session groups everything done that day
        CREATE TABLE IF NOT EXISTS workout_session (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
            session_date    DATE    NOT NULL DEFAULT (date('now')),
            started_at      DATETIME NOT NULL DEFAULT (datetime('now')),
            ended_at        DATETIME,
            calories_burned REAL,   -- manual entry on session end
            notes           TEXT
        );

        -- Strength sets inside a session
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

        -- Cardio entries inside a session (running, walking, etc.)
        CREATE TABLE IF NOT EXISTS cardio_log (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id      INTEGER NOT NULL REFERENCES workout_session(id) ON DELETE CASCADE,
            user_id         INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
            activity_type   TEXT    NOT NULL,   -- running, walking, cycling, rowing, other
            distance_km     REAL,
            duration_min    REAL,
            avg_pace_min_km REAL,               -- auto-calculated: duration/distance
            avg_heart_rate  INTEGER,
            elevation_m     REAL,
            notes           TEXT,
            logged_at       DATETIME NOT NULL DEFAULT (datetime('now'))
        );

        INSERT OR IGNORE INTO exercise (name, muscle_group, equipment, is_global) VALUES
            ('Bench Press',       'Chest',      'Barbell',    1),
            ('Squat',             'Legs',       'Barbell',    1),
            ('Deadlift',          'Back',       'Barbell',    1),
            ('Overhead Press',    'Shoulders',  'Barbell',    1),
            ('Barbell Row',       'Back',       'Barbell',    1),
            ('Pull Up',           'Back',       'Bodyweight', 1),
            ('Dumbbell Curl',     'Biceps',     'Dumbbell',   1),
            ('Tricep Pushdown',   'Triceps',    'Cable',      1),
            ('Leg Press',         'Legs',       'Machine',    1),
            ('Lat Pulldown',      'Back',       'Cable',      1),
            ('Incline Press',     'Chest',      'Dumbbell',   1),
            ('Romanian Deadlift', 'Hamstrings', 'Barbell',    1),
            ('Face Pull',         'Shoulders',  'Cable',      1),
            ('Dumbbell Row',      'Back',       'Dumbbell',   1),
            ('Cable Fly',         'Chest',      'Cable',      1),
            ('Hip Thrust',        'Glutes',     'Barbell',    1),
            ('Dips',              'Triceps',    'Bodyweight', 1),
            ('Leg Curl',          'Hamstrings', 'Machine',    1);
    """)

    # Safe migrations for existing DBs
    for table, col, typ in [
        ("workout_session", "calories_burned", "REAL"),
        ("workout_session", "ended_at",        "DATETIME"),
    ]:
        try:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {typ}")
        except Exception:
            pass

    conn.commit()
    conn.close()