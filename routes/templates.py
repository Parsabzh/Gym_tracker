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
               COUNT(DISTINCT tc.id) as cardio_count
        FROM session_template t
        LEFT JOIN template_exercise te ON te.template_id = t.id
        LEFT JOIN template_cardio   tc ON tc.template_id = t.id
        WHERE t.user_id = ?
        GROUP BY t.id ORDER BY t.created_at DESC
    """, (session["user_id"],)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

# ── Get single template with full detail ─────────────────────────────────────
@templates_bp.route("/api/templates/<int:tid>")
@login_required
def get_template(tid):
    conn = get_db()
    t = conn.execute(
        "SELECT * FROM session_template WHERE id=? AND user_id=?",
        (tid, session["user_id"])
    ).fetchone()
    if not t: conn.close(); return jsonify({"error": "Not found"}), 404

    exercises = conn.execute("""
        SELECT te.*, e.name as exercise_name, e.muscle_group, e.equipment
        FROM template_exercise te
        JOIN exercise e ON e.id = te.exercise_id
        WHERE te.template_id = ?
        ORDER BY te.sort_order
    """, (tid,)).fetchall()

    cardio = conn.execute(
        "SELECT * FROM template_cardio WHERE template_id=?", (tid,)
    ).fetchall()

    conn.close()
    result = dict(t)
    result["exercises"] = [dict(e) for e in exercises]
    result["cardio"]    = [dict(c) for c in cardio]
    return jsonify(result)

# ── Create template from scratch ──────────────────────────────────────────────
@templates_bp.route("/api/templates", methods=["POST"])
@login_required
def create_template():
    data = request.json
    name = data.get("name", "").strip()
    if not name: return jsonify({"error": "Name required"}), 400

    conn = get_db()
    cur = conn.execute(
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

    conn.commit(); conn.close()
    return jsonify({"ok": True, "id": tid})

# ── Save existing session AS a template ───────────────────────────────────────
@templates_bp.route("/api/templates/from-session/<int:sid>", methods=["POST"])
@login_required
def template_from_session(sid):
    data = request.json
    name = data.get("name", "").strip()
    if not name: return jsonify({"error": "Template name required"}), 400

    conn = get_db()
    s = conn.execute(
        "SELECT * FROM workout_session WHERE id=? AND user_id=?",
        (sid, session["user_id"])
    ).fetchone()
    if not s: conn.close(); return jsonify({"error": "Session not found"}), 404

    # Create template
    cur = conn.execute(
        "INSERT INTO session_template (user_id, name, notes) VALUES (?,?,?)",
        (session["user_id"], name, s["notes"] or "")
    )
    tid = cur.lastrowid

    # Copy unique exercises (deduplicated, preserving order of first appearance)
    sets = conn.execute("""
        SELECT DISTINCT exercise_id,
               MAX(weight_kg) as best_weight,
               MAX(reps)      as best_reps,
               COUNT(*)       as set_count,
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

    # Copy cardio entries
    cardio = conn.execute(
        "SELECT * FROM cardio_log WHERE session_id=?", (sid,)
    ).fetchall()
    for c in cardio:
        conn.execute("""
            INSERT INTO template_cardio
                (template_id, activity_type, target_distance_km, target_duration_min)
            VALUES (?,?,?,?)
        """, (tid, c["activity_type"], c["distance_km"], c["duration_min"]))

    conn.commit(); conn.close()
    return jsonify({"ok": True, "id": tid})

# ── Delete template ───────────────────────────────────────────────────────────
@templates_bp.route("/api/templates/<int:tid>", methods=["DELETE"])
@login_required
def delete_template(tid):
    conn = get_db()
    conn.execute("DELETE FROM session_template WHERE id=? AND user_id=?",
                 (tid, session["user_id"]))
    conn.commit(); conn.close()
    return jsonify({"ok": True})
