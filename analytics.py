from flask import Blueprint, jsonify, session, request
from database import get_db
from functools import wraps

analytics_bp = Blueprint("analytics", __name__)

def login_required(f):
    @wraps(f)
    def d(*a, **kw):
        if "user_id" not in session:
            return jsonify({"error":"Unauthorized"}), 401
        return f(*a, **kw)
    return d

@analytics_bp.route("/api/analytics/overview")
@login_required
def overview():
    uid = session["user_id"]
    conn = get_db()

    totals = conn.execute("""
        SELECT COUNT(DISTINCT s.id) as total_sessions,
               COUNT(ws.id)         as total_sets,
               SUM(ws.reps * COALESCE(ws.weight_kg,0)) as total_volume,
               SUM(s.calories_burned) as total_calories
        FROM workout_session s
        LEFT JOIN workout_set ws ON ws.session_id = s.id
        WHERE s.user_id=?
    """, (uid,)).fetchone()

    cardio_totals = conn.execute("""
        SELECT SUM(distance_km) as total_distance,
               SUM(duration_min) as total_duration,
               COUNT(*) as total_cardio
        FROM cardio_log WHERE user_id=?
    """, (uid,)).fetchone()

    # Weekly volume (last 12 weeks)
    weekly_volume = conn.execute("""
        SELECT strftime('%Y-W%W', s.session_date) as week,
               SUM(ws.reps * COALESCE(ws.weight_kg,0)) as volume
        FROM workout_session s
        LEFT JOIN workout_set ws ON ws.session_id = s.id
        WHERE s.user_id=? AND s.session_date >= date('now','-84 days')
        GROUP BY week ORDER BY week
    """, (uid,)).fetchall()

    # Per-exercise weight progression (max weight per session, per exercise)
    exercise_progress = conn.execute("""
        SELECT e.id, e.name, e.muscle_group,
               s.session_date,
               MAX(ws.weight_kg) as max_weight,
               MAX(ws.reps)      as max_reps
        FROM workout_set ws
        JOIN exercise e ON e.id = ws.exercise_id
        JOIN workout_session s ON s.id = ws.session_id
        WHERE s.user_id=? AND ws.weight_kg IS NOT NULL
        GROUP BY e.id, s.session_date
        ORDER BY e.name, s.session_date
    """, (uid,)).fetchall()

    # Group into dict by exercise name
    ex_dict = {}
    for r in exercise_progress:
        name = r["name"]
        if name not in ex_dict:
            ex_dict[name] = {"muscle": r["muscle_group"], "data": []}
        ex_dict[name]["data"].append({
            "date": r["session_date"],
            "max_weight": r["max_weight"],
            "max_reps": r["max_reps"]
        })

    # Cardio history: distance + pace per activity per session
    cardio_history = conn.execute("""
        SELECT cl.activity_type, s.session_date,
               cl.distance_km, cl.duration_min, cl.avg_pace_min_km, cl.avg_heart_rate
        FROM cardio_log cl
        JOIN workout_session s ON s.id = cl.session_id
        WHERE cl.user_id=?
        ORDER BY cl.activity_type, s.session_date
    """, (uid,)).fetchall()

    # Group cardio by activity type
    cardio_dict = {}
    for r in cardio_history:
        act = r["activity_type"]
        if act not in cardio_dict:
            cardio_dict[act] = []
        cardio_dict[act].append({
            "date": r["session_date"],
            "distance_km": r["distance_km"],
            "duration_min": r["duration_min"],
            "avg_pace_min_km": r["avg_pace_min_km"],
            "avg_heart_rate": r["avg_heart_rate"]
        })

    # Body weight trend (last 90 days)
    bw_trend = conn.execute("""
        SELECT logged_at as date, weight_kg
        FROM body_weight WHERE user_id=? AND logged_at >= date('now','-90 days')
        ORDER BY logged_at
    """, (uid,)).fetchall()

    # Heatmap (last 6 months)
    heatmap = conn.execute("""
        SELECT session_date as date, COUNT(*) as count
        FROM workout_session WHERE user_id=? AND session_date >= date('now','-180 days')
        GROUP BY session_date
    """, (uid,)).fetchall()

    # Calories burned per session (last 30 days)
    calories_timeline = conn.execute("""
        SELECT session_date as date, COALESCE(calories_burned,0) as calories
        FROM workout_session
        WHERE user_id=? AND session_date >= date('now','-30 days')
              AND calories_burned IS NOT NULL
        ORDER BY session_date
    """, (uid,)).fetchall()

    conn.close()
    return jsonify({
        "totals": dict(totals),
        "cardio_totals": dict(cardio_totals),
        "weekly_volume": [dict(r) for r in weekly_volume],
        "exercise_progress": ex_dict,
        "cardio_by_activity": cardio_dict,
        "bw_trend": [dict(r) for r in bw_trend],
        "heatmap": [dict(r) for r in heatmap],
        "calories_timeline": [dict(r) for r in calories_timeline],
    })
