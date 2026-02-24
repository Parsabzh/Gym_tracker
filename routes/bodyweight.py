from flask import Blueprint, request, jsonify, session
from database import get_db
from datetime import date
from functools import wraps

bodyweight_bp = Blueprint("bodyweight", __name__)


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated


@bodyweight_bp.route("/api/bodyweight", methods=["GET"])
@login_required
def get_bodyweight():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM body_weight WHERE user_id=? ORDER BY logged_at DESC LIMIT 30",
        (session["user_id"],)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@bodyweight_bp.route("/api/bodyweight", methods=["POST"])
@login_required
def log_bodyweight():
    data = request.json
    weight = data.get("weight_kg")
    if not weight:
        return jsonify({"error": "Weight required"}), 400
    conn = get_db()
    conn.execute(
        "INSERT INTO body_weight (user_id, weight_kg, notes, logged_at) VALUES (?,?,?,?)",
        (session["user_id"], weight, data.get("notes", ""), data.get("date", str(date.today())))
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})
