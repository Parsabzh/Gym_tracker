import sqlite3
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "gym.db")


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

        CREATE TABLE IF NOT EXISTS workout_session (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
            session_date DATE    NOT NULL DEFAULT (date('now')),
            started_at   DATETIME NOT NULL DEFAULT (datetime('now')),
            ended_at     DATETIME,
            notes        TEXT
        );

        CREATE TABLE IF NOT EXISTS workout_set (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id      INTEGER NOT NULL REFERENCES workout_session(id) ON DELETE CASCADE,
            exercise_id     INTEGER NOT NULL REFERENCES exercise(id),
            set_number      INTEGER NOT NULL,
            reps            INTEGER,
            weight_kg       REAL,
            rest_seconds    INTEGER,
            rpe             REAL,
            notes           TEXT,
            logged_at       DATETIME NOT NULL DEFAULT (datetime('now'))
        );

        INSERT OR IGNORE INTO exercise (name, muscle_group, equipment, is_global) VALUES
            ('Bench Press',      'Chest',     'Barbell',    1),
            ('Squat',            'Legs',      'Barbell',    1),
            ('Deadlift',         'Back',      'Barbell',    1),
            ('Overhead Press',   'Shoulders', 'Barbell',    1),
            ('Barbell Row',      'Back',      'Barbell',    1),
            ('Pull Up',          'Back',      'Bodyweight', 1),
            ('Dumbbell Curl',    'Biceps',    'Dumbbell',   1),
            ('Tricep Pushdown',  'Triceps',   'Cable',      1),
            ('Leg Press',        'Legs',      'Machine',    1),
            ('Lat Pulldown',     'Back',      'Cable',      1),
            ('Incline Press',    'Chest',     'Dumbbell',   1),
            ('Romanian Deadlift','Hamstrings','Barbell',    1),
            ('Face Pull',        'Shoulders', 'Cable',      1),
            ('Dumbbell Row',     'Back',      'Dumbbell',   1),
            ('Cable Fly',        'Chest',     'Cable',      1);
    """)
    conn.commit()
    conn.close()
