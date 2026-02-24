from flask import Blueprint, render_template, request, jsonify, session, redirect, url_for
from database import get_db
from datetime import date
from functools import wraps

workout_bp = Blueprint("workout", __name__)

def login_required(f):
    @wraps(f)
    def d(*a, **kw):
        if "user_id" not in session:
            return jsonify({"error": "Unauthorized"}), 401
        return f(*a, **kw)
    return d

@workout_bp.route("/app")
def app_page():
    if "user_id" not in session:
        return redirect(url_for("auth.login"))
    return render_template("app.html", username=session["username"])

# ── Exercises ─────────────────────────────────────────────────────────────────
@workout_bp.route("/api/exercises")
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
    name = data.get("name","").strip()
    if not name: return jsonify({"error":"Name required"}), 400
    conn = get_db()
    if conn.execute(
        "SELECT id FROM exercise WHERE name=? AND (is_global=1 OR user_id=?)",
        (name, session["user_id"])
    ).fetchone():
        conn.close()
        return jsonify({"error":"Already exists"}), 409
    cur = conn.execute(
        "INSERT INTO exercise (name,muscle_group,equipment,user_id,is_global) VALUES(?,?,?,?,0)",
        (name, data.get("muscle_group",""), data.get("equipment",""), session["user_id"])
    )
    conn.commit(); ex_id = cur.lastrowid; conn.close()
    return jsonify({"ok":True,"id":ex_id})

# ── Sessions ──────────────────────────────────────────────────────────────────
@workout_bp.route("/api/sessions")
@login_required
def get_sessions():
    conn = get_db()
    rows = conn.execute("""
        SELECT s.*,
               COUNT(DISTINCT ws.id)  as total_sets,
               COUNT(DISTINCT cl.id)  as total_cardio,
               SUM(ws.reps * COALESCE(ws.weight_kg,0)) as total_volume
        FROM workout_session s
        LEFT JOIN workout_set ws ON ws.session_id = s.id
        LEFT JOIN cardio_log cl  ON cl.session_id = s.id
        WHERE s.user_id=?
        GROUP BY s.id ORDER BY s.session_date DESC LIMIT 40
    """, (session["user_id"],)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@workout_bp.route("/api/sessions", methods=["POST"])
@login_required
def create_session():
    data = request.json
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO workout_session (user_id,session_date,notes) VALUES(?,?,?)",
        (session["user_id"], data.get("date", str(date.today())), data.get("notes",""))
    )
    conn.commit(); sid = cur.lastrowid; conn.close()
    return jsonify({"id": sid})

@workout_bp.route("/api/sessions/<int:sid>")
@login_required
def get_session(sid):
    conn = get_db()
    s = conn.execute(
        "SELECT * FROM workout_session WHERE id=? AND user_id=?",
        (sid, session["user_id"])
    ).fetchone()
    if not s: conn.close(); return jsonify({"error":"Not found"}), 404
    sets = conn.execute("""
        SELECT ws.*, e.name as exercise_name, e.muscle_group
        FROM workout_set ws JOIN exercise e ON e.id=ws.exercise_id
        WHERE ws.session_id=? ORDER BY ws.exercise_id, ws.set_number
    """, (sid,)).fetchall()
    cardio = conn.execute(
        "SELECT * FROM cardio_log WHERE session_id=? ORDER BY logged_at", (sid,)
    ).fetchall()
    conn.close()
    r = dict(s)
    r["sets"]   = [dict(x) for x in sets]
    r["cardio"] = [dict(x) for x in cardio]
    return jsonify(r)

@workout_bp.route("/api/sessions/<int:sid>/end", methods=["POST"])
@login_required
def end_session(sid):
    data = request.json or {}
    conn = get_db()
    conn.execute(
        "UPDATE workout_session SET ended_at=datetime('now'), calories_burned=? WHERE id=? AND user_id=?",
        (data.get("calories_burned"), sid, session["user_id"])
    )
    conn.commit(); conn.close()
    return jsonify({"ok": True})

# ── Sets ──────────────────────────────────────────────────────────────────────
@workout_bp.route("/api/sets", methods=["POST"])
@login_required
def log_set():
    data = request.json
    conn = get_db()
    if not conn.execute(
        "SELECT id FROM workout_session WHERE id=? AND user_id=?",
        (data["session_id"], session["user_id"])
    ).fetchone():
        conn.close(); return jsonify({"error":"Forbidden"}), 403
    conn.execute("""
        INSERT INTO workout_set
            (session_id,exercise_id,set_number,reps,weight_kg,rest_seconds,rpe,notes)
        VALUES(?,?,?,?,?,?,?,?)
    """, (data["session_id"], data["exercise_id"], data["set_number"],
          data.get("reps"), data.get("weight_kg"), data.get("rest_seconds"),
          data.get("rpe"), data.get("notes","")))
    conn.commit(); conn.close()
    return jsonify({"ok": True})

@workout_bp.route("/api/sets/<int:set_id>", methods=["DELETE"])
@login_required
def delete_set(set_id):
    conn = get_db()
    conn.execute("""
        DELETE FROM workout_set WHERE id=? AND session_id IN
        (SELECT id FROM workout_session WHERE user_id=?)
    """, (set_id, session["user_id"]))
    conn.commit(); conn.close()
    return jsonify({"ok": True})

# ── Cardio (inside session) ───────────────────────────────────────────────────
@workout_bp.route("/api/cardio", methods=["POST"])
@login_required
def log_cardio():
    data = request.json
    sid = data.get("session_id")
    if not sid: return jsonify({"error":"session_id required"}), 400
    conn = get_db()
    if not conn.execute(
        "SELECT id FROM workout_session WHERE id=? AND user_id=?",
        (sid, session["user_id"])
    ).fetchone():
        conn.close(); return jsonify({"error":"Forbidden"}), 403

    dist = data.get("distance_km")
    dur  = data.get("duration_min")
    pace = round(dur/dist, 2) if dist and dur and dist > 0 else None

    conn.execute("""
        INSERT INTO cardio_log
            (session_id,user_id,activity_type,distance_km,duration_min,
             avg_pace_min_km,avg_heart_rate,elevation_m,notes)
        VALUES(?,?,?,?,?,?,?,?,?)
    """, (sid, session["user_id"], data.get("activity_type","running"),
          dist, dur, pace,
          data.get("avg_heart_rate"), data.get("elevation_m"),
          data.get("notes","")))
    conn.commit(); conn.close()
    return jsonify({"ok": True, "avg_pace_min_km": pace})

@workout_bp.route("/api/cardio/<int:cid>", methods=["DELETE"])
@login_required
def delete_cardio(cid):
    conn = get_db()
    conn.execute("DELETE FROM cardio_log WHERE id=? AND user_id=?", (cid, session["user_id"]))
    conn.commit(); conn.close()
    return jsonify({"ok": True})
