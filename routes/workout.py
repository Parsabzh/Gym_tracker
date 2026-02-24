from flask import Blueprint, render_template, request, jsonify, session, redirect, url_for
from database import get_db
from datetime import date
from functools import wraps

workout_bp = Blueprint("workout", __name__)


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated


@workout_bp.route("/app")
def app_page():
    if "user_id" not in session:
        return redirect(url_for("auth.login"))
    return render_template("app.html", username=session["username"])


# ── Exercises ────────────────────────────────────────────────────────────────
@workout_bp.route("/api/exercises", methods=["GET"])
@login_required
def get_exercises():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM exercise WHERE is_global=1 OR user_id=? ORDER BY name",
        (session["user_id"],)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@workout_bp.route("/api/exercises", methods=["POST"])
@login_required
def add_exercise():
    data = request.json
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "Name required"}), 400
    conn = get_db()
    # Check no duplicate for this user
    exists = conn.execute(
        "SELECT id FROM exercise WHERE name=? AND (is_global=1 OR user_id=?)",
        (name, session["user_id"])
    ).fetchone()
    if exists:
        conn.close()
        return jsonify({"error": "Exercise already exists"}), 409
    cur = conn.execute(
        "INSERT INTO exercise (name, muscle_group, equipment, user_id, is_global) VALUES (?,?,?,?,0)",
        (name, data.get("muscle_group", ""), data.get("equipment", ""), session["user_id"])
    )
    conn.commit()
    ex_id = cur.lastrowid
    conn.close()
    return jsonify({"ok": True, "id": ex_id})


# ── Sessions ─────────────────────────────────────────────────────────────────
@workout_bp.route("/api/sessions", methods=["GET"])
@login_required
def get_sessions():
    conn = get_db()
    rows = conn.execute("""
        SELECT s.*, COUNT(DISTINCT ws.id) as total_sets,
               SUM(ws.reps * COALESCE(ws.weight_kg, 0)) as total_volume
        FROM workout_session s
        LEFT JOIN workout_set ws ON ws.session_id = s.id
        WHERE s.user_id = ?
        GROUP BY s.id ORDER BY s.session_date DESC LIMIT 30
    """, (session["user_id"],)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@workout_bp.route("/api/sessions", methods=["POST"])
@login_required
def create_session():
    data = request.json
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO workout_session (user_id, session_date, notes) VALUES (?,?,?)",
        (session["user_id"], data.get("date", str(date.today())), data.get("notes", ""))
    )
    conn.commit()
    session_id = cur.lastrowid
    conn.close()
    return jsonify({"id": session_id})


@workout_bp.route("/api/sessions/<int:session_id>", methods=["GET"])
@login_required
def get_session(session_id):
    conn = get_db()
    s = conn.execute(
        "SELECT * FROM workout_session WHERE id=? AND user_id=?",
        (session_id, session["user_id"])
    ).fetchone()
    if not s:
        conn.close()
        return jsonify({"error": "Not found"}), 404
    sets = conn.execute("""
        SELECT ws.*, e.name as exercise_name, e.muscle_group
        FROM workout_set ws
        JOIN exercise e ON e.id = ws.exercise_id
        WHERE ws.session_id = ?
        ORDER BY ws.exercise_id, ws.set_number
    """, (session_id,)).fetchall()
    conn.close()
    result = dict(s)
    result["sets"] = [dict(r) for r in sets]
    return jsonify(result)


# ── Sets ─────────────────────────────────────────────────────────────────────
@workout_bp.route("/api/sets", methods=["POST"])
@login_required
def log_set():
    data = request.json
    # Verify session belongs to user
    conn = get_db()
    s = conn.execute(
        "SELECT id FROM workout_session WHERE id=? AND user_id=?",
        (data["session_id"], session["user_id"])
    ).fetchone()
    if not s:
        conn.close()
        return jsonify({"error": "Forbidden"}), 403
    conn.execute("""
        INSERT INTO workout_set
            (session_id, exercise_id, set_number, reps, weight_kg, rest_seconds, rpe, notes)
        VALUES (?,?,?,?,?,?,?,?)
    """, (data["session_id"], data["exercise_id"], data["set_number"],
          data.get("reps"), data.get("weight_kg"), data.get("rest_seconds"),
          data.get("rpe"), data.get("notes", "")))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@workout_bp.route("/api/sets/<int:set_id>", methods=["DELETE"])
@login_required
def delete_set(set_id):
    conn = get_db()
    conn.execute("""
        DELETE FROM workout_set WHERE id=? AND session_id IN
        (SELECT id FROM workout_session WHERE user_id=?)
    """, (set_id, session["user_id"]))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})
