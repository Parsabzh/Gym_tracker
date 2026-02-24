from flask import Blueprint, render_template, request, redirect, url_for, session, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from database import get_db

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/")
def index():
    if "user_id" in session:
        return redirect(url_for("workout.app_page"))
    return redirect(url_for("auth.login"))


@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    if "user_id" in session:
        return redirect(url_for("workout.app_page"))
    error = None
    if request.method == "POST":
        data = request.get_json(silent=True) or request.form
        username = data.get("username", "").strip()
        password = data.get("password", "")
        conn = get_db()
        user = conn.execute(
            "SELECT * FROM user WHERE username = ?", (username,)
        ).fetchone()
        conn.close()
        if user and check_password_hash(user["password_hash"], password):
            session["user_id"] = user["id"]
            session["username"] = user["username"]
            if request.is_json:
                return jsonify({"ok": True, "redirect": url_for("workout.app_page")})
            return redirect(url_for("workout.app_page"))
        else:
            error = "Invalid username or password."
            if request.is_json:
                return jsonify({"ok": False, "error": error}), 401
    return render_template("login.html", error=error)


@auth_bp.route("/signup", methods=["GET", "POST"])
def signup():
    if "user_id" in session:
        return redirect(url_for("workout.app_page"))
    error = None
    if request.method == "POST":
        data = request.get_json(silent=True) or request.form
        username = data.get("username", "").strip()
        email = data.get("email", "").strip()
        password = data.get("password", "")
        if not username or not email or not password:
            error = "All fields are required."
        elif len(password) < 6:
            error = "Password must be at least 6 characters."
        else:
            conn = get_db()
            existing = conn.execute(
                "SELECT id FROM user WHERE username=? OR email=?", (username, email)
            ).fetchone()
            if existing:
                error = "Username or email already taken."
                conn.close()
            else:
                conn.execute(
                    "INSERT INTO user (username, email, password_hash) VALUES (?,?,?)",
                    (username, email, generate_password_hash(password)),
                )
                conn.commit()
                user = conn.execute(
                    "SELECT * FROM user WHERE username=?", (username,)
                ).fetchone()
                conn.close()
                session["user_id"] = user["id"]
                session["username"] = user["username"]
                if request.is_json:
                    return jsonify({"ok": True, "redirect": url_for("workout.app_page")})
                return redirect(url_for("workout.app_page"))
        if request.is_json:
            return jsonify({"ok": False, "error": error}), 400
    return render_template("signup.html", error=error)


@auth_bp.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("auth.login"))
