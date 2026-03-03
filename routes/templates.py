from flask import Blueprint, request, jsonify, session
from database import get_db
from functools import wraps

templates_bp = Blueprint("templates", __name__)

def login_required(f):
    @wraps(f)
    def d(*a, **kw):
        if "user_id" not in session:
            return jsonify({"error": "Unauthorized"}), 401
        return f(*a, **kw)
    return d


# ── List all templates ────────────────────────────────────────────────────────
@templates_bp.route("/api/templates")
@login_required
def get_templates():
    conn = get_db()
    rows = conn.execute("""
        SELECT t.*,
               COUNT(DISTINCT te.id) as exercise_count,
               COUNT(DISTINCT tc.id) as cardio_count,
               MAX(ws.session_date)  as last_used
        FROM session_template t
        LEFT JOIN template_exercise te ON te.template_id = t.id
        LEFT JOIN template_cardio   tc ON tc.template_id = t.id
        LEFT JOIN workout_session   ws ON ws.template_id = t.id AND ws.user_id = t.user_id
        WHERE t.user_id = ?
        GROUP BY t.id ORDER BY t.created_at DESC
    """, (session["user_id"],)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


# ── Get single template — exercises enriched with last-session actuals ─────────
@templates_bp.route("/api/templates/<int:tid>")
@login_required
def get_template(tid):
    conn = get_db()
    t = conn.execute(
        "SELECT * FROM session_template WHERE id=? AND user_id=?",
        (tid, session["user_id"])
    ).fetchone()
    if not t:
        conn.close()
        return jsonify({"error": "Not found"}), 404

    # Base template exercises (static targets)
    exercises = conn.execute("""
        SELECT te.*, e.name as exercise_name, e.muscle_group, e.equipment
        FROM template_exercise te
        JOIN exercise e ON e.id = te.exercise_id
        WHERE te.template_id = ?
        ORDER BY te.sort_order
    """, (tid,)).fetchall()

    # Find the most recent session that used this template
    last_session = conn.execute("""
        SELECT id FROM workout_session
        WHERE template_id = ? AND user_id = ?
        ORDER BY session_date DESC, started_at DESC
        LIMIT 1
    """, (tid, session["user_id"])).fetchone()

    # Build a map: exercise_id → list of sets from last session, ordered by set_number
    last_sets = {}
    if last_session:
        rows = conn.execute("""
            SELECT exercise_id, set_number, reps, weight_kg, rpe, rest_seconds
            FROM workout_set
            WHERE session_id = ?
            ORDER BY exercise_id, set_number
        """, (last_session["id"],)).fetchall()
        for r in rows:
            eid = r["exercise_id"]
            if eid not in last_sets:
                last_sets[eid] = []
            last_sets[eid].append(dict(r))

    # Enrich each template exercise with last-session actuals
    result_exercises = []
    for ex in exercises:
        ex_dict = dict(ex)
        eid = ex_dict["exercise_id"]
        if eid in last_sets:
            ex_dict["last_sets"] = last_sets[eid]
        else:
            ex_dict["last_sets"] = []
        result_exercises.append(ex_dict)

    # Cardio targets + last session actuals
    cardio_tpl = conn.execute(
        "SELECT * FROM template_cardio WHERE template_id=?", (tid,)
    ).fetchall()

    last_cardio = []
    if last_session:
        last_cardio = conn.execute(
            "SELECT * FROM cardio_log WHERE session_id=? ORDER BY logged_at",
            (last_session["id"],)
        ).fetchall()

    conn.close()

    result = dict(t)
    result["exercises"]   = result_exercises
    result["cardio"]      = [dict(c) for c in cardio_tpl]
    result["last_cardio"] = [dict(c) for c in last_cardio]
    result["has_history"] = last_session is not None
    return jsonify(result)


# ── Start a session from a template (records the link) ────────────────────────
@templates_bp.route("/api/templates/<int:tid>/start", methods=["POST"])
@login_required
def start_from_template(tid):
    """Creates a new workout_session linked to this template. Returns session id."""
    from datetime import date as dt
    conn = get_db()
    t = conn.execute(
        "SELECT * FROM session_template WHERE id=? AND user_id=?",
        (tid, session["user_id"])
    ).fetchone()
    if not t:
        conn.close()
        return jsonify({"error": "Template not found"}), 404

    cur = conn.execute(
        "INSERT INTO workout_session (user_id, session_date, template_id, notes) VALUES (?,?,?,?)",
        (session["user_id"], str(dt.today()), tid, "")
    )
    conn.commit()
    sid = cur.lastrowid
    conn.close()
    return jsonify({"ok": True, "session_id": sid})


# ── Create template from scratch ──────────────────────────────────────────────
@templates_bp.route("/api/templates", methods=["POST"])
@login_required
def create_template():
    data = request.json
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "Name required"}), 400

    conn = get_db()
    cur  = conn.execute(
        "INSERT INTO session_template (user_id, name, notes) VALUES (?,?,?)",
        (session["user_id"], name, data.get("notes", ""))
    )
    tid = cur.lastrowid

    for i, ex in enumerate(data.get("exercises", [])):
        conn.execute("""
            INSERT INTO template_exercise
                (template_id, exercise_id, sort_order, target_sets, target_reps, target_weight_kg)
            VALUES (?,?,?,?,?,?)
        """, (tid, ex["exercise_id"], i,
              ex.get("target_sets"), ex.get("target_reps"), ex.get("target_weight_kg")))

    for c in data.get("cardio", []):
        conn.execute("""
            INSERT INTO template_cardio
                (template_id, activity_type, target_distance_km, target_duration_min)
            VALUES (?,?,?,?)
        """, (tid, c["activity_type"], c.get("target_distance_km"), c.get("target_duration_min")))

    conn.commit()
    conn.close()
    return jsonify({"ok": True, "id": tid})


# ── Save existing session AS a template ───────────────────────────────────────
@templates_bp.route("/api/templates/from-session/<int:sid>", methods=["POST"])
@login_required
def template_from_session(sid):
    data = request.json
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "Template name required"}), 400

    conn = get_db()
    s = conn.execute(
        "SELECT * FROM workout_session WHERE id=? AND user_id=?",
        (sid, session["user_id"])
    ).fetchone()
    if not s:
        conn.close()
        return jsonify({"error": "Session not found"}), 404

    cur = conn.execute(
        "INSERT INTO session_template (user_id, name, notes) VALUES (?,?,?)",
        (session["user_id"], name, s["notes"] or "")
    )
    tid = cur.lastrowid

    # Link the source session to this template so its numbers become "last session"
    conn.execute(
        "UPDATE workout_session SET template_id=? WHERE id=?", (tid, sid)
    )

    # Copy unique exercises, keeping per-set detail as targets
    sets = conn.execute("""
        SELECT exercise_id,
               COUNT(*)       as set_count,
               MAX(reps)      as best_reps,
               MAX(weight_kg) as best_weight,
               MIN(logged_at) as first_seen
        FROM workout_set WHERE session_id=?
        GROUP BY exercise_id ORDER BY first_seen
    """, (sid,)).fetchall()

    for i, row in enumerate(sets):
        conn.execute("""
            INSERT INTO template_exercise
                (template_id, exercise_id, sort_order, target_sets, target_reps, target_weight_kg)
            VALUES (?,?,?,?,?,?)
        """, (tid, row["exercise_id"], i,
              row["set_count"], row["best_reps"], row["best_weight"]))

    # Copy cardio
    for c in conn.execute(
        "SELECT * FROM cardio_log WHERE session_id=?", (sid,)
    ).fetchall():
        conn.execute("""
            INSERT INTO template_cardio
                (template_id, activity_type, target_distance_km, target_duration_min)
            VALUES (?,?,?,?)
        """, (tid, c["activity_type"], c["distance_km"], c["duration_min"]))

    conn.commit()
    conn.close()
    return jsonify({"ok": True, "id": tid})


# ── Delete template ───────────────────────────────────────────────────────────
@templates_bp.route("/api/templates/<int:tid>", methods=["DELETE"])
@login_required
def delete_template(tid):
    conn = get_db()
    conn.execute(
        "DELETE FROM session_template WHERE id=? AND user_id=?",
        (tid, session["user_id"])
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})
