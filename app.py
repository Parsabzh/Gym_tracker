from flask import Flask
import os
from database import init_db
from routes.auth import auth_bp
from routes.workout import workout_bp
from routes.bodyweight import bodyweight_bp

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "templates"),
    static_folder=os.path.join(BASE_DIR, "static"),
)

app.secret_key = "ironlog-secret-change-in-production-2026"

# Register blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(workout_bp)
app.register_blueprint(bodyweight_bp)

if __name__ == "__main__":
    init_db()
    app.run(debug=True, host="0.0.0.0", port=5000)
