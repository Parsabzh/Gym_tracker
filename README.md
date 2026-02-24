# IronLog 🏋️

> A clean, mobile-first gym tracking web app built with Python and Flask.

---

## Features

- **User accounts** — secure signup and login, each user's data is fully isolated
- **Workout sessions** — start a session, log sets with exercise, reps, weight, RPE, and rest time
- **Custom exercises** — add your own exercises on top of 15 built-in ones
- **Body weight log** — track daily body weight with notes
- **Session history** — browse past workouts with total sets and volume
- **Motivational splash** — an energetic quote animates in on every visit
- **Mobile-first UI** — works great on your phone and desktop

## Tech Stack

- **Backend** — Python, Flask, SQLite
- **Frontend** — Vanilla JS, CSS (no frameworks)
- **Auth** — Session-based with hashed passwords via Werkzeug

## Getting Started

```bash
# 1. Clone the repo
git clone https://github.com/yourusername/ironlog.git
cd ironlog

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run
python app.py
```

Open **http://localhost:5000** in your browser.

To use on your phone, find your local IP and open `http://YOUR_LOCAL_IP:5000` while on the same WiFi.

## Project Structure

```
ironlog/
├── app.py              # Entry point
├── database.py         # Schema & DB connection
├── requirements.txt
├── routes/
│   ├── auth.py         # Login, signup, logout
│   ├── workout.py      # Sessions, sets, exercises
│   └── bodyweight.py   # Body weight logging
├── templates/
│   ├── base.html
│   ├── login.html
│   ├── signup.html
│   └── app.html
└── static/
    ├── css/main.css
    └── js/
        ├── main.js
        └── app.js
```

## Database Schema

| Table | Key Columns |
|---|---|
| `user` | `id`, `username`, `email`, `password_hash` |
| `workout_session` | `id`, `user_id`, `session_date`, `notes` |
| `workout_set` | `id`, `session_id`, `exercise_id`, `set_number`, `reps`, `weight_kg`, `rpe`, `rest_seconds` |
| `exercise` | `id`, `user_id`, `name`, `muscle_group`, `equipment`, `is_global` |
| `body_weight` | `id`, `user_id`, `logged_at`, `weight_kg`, `notes` |

## Roadmap

- [ ] Progress charts (weight lifted over time per exercise)
- [ ] 1RM estimation
- [ ] Personal records detection
- [ ] Weekly volume summary
- [ ] Body weight trend graph
- [ ] Export data to CSV

## License

This project is licensed under the terms of the MIT license.
