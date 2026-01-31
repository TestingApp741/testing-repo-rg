from __future__ import annotations

import json
import os
from datetime import datetime
from functools import wraps
from typing import Any, Dict, List

from flask import Flask, jsonify, redirect, render_template, request, session
from werkzeug.security import check_password_hash, generate_password_hash

DATA_FILE = "data.json"

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET", "dev-secret-change-me")


def _now_iso() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def _load_data() -> Dict[str, Any]:
    if not os.path.exists(DATA_FILE):
        return {"users": [], "rides": [], "bookings": []}
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_data(data: Dict[str, Any]) -> None:
    tmp = DATA_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, DATA_FILE)


def _next_id(items: List[Dict[str, Any]]) -> int:
    return (max((item.get("id", 0) for item in items), default=0) + 1) if items else 1


def _require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify({"error": "auth_required"}), 401
        return fn(*args, **kwargs)

    return wrapper


def _public_user(user: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user.get("name") or "",
        "created_at": user.get("created_at"),
    }


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/api/signup")
def signup():
    payload = request.get_json(force=True)
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    name = (payload.get("name") or "").strip()

    if not email or not password:
        return jsonify({"error": "email_and_password_required"}), 400
    if len(password) < 6:
        return jsonify({"error": "password_too_short"}), 400

    data = _load_data()
    if any(u["email"] == email for u in data["users"]):
        return jsonify({"error": "email_exists"}), 409

    user = {
        "id": _next_id(data["users"]),
        "email": email,
        "password_hash": generate_password_hash(password),
        "name": name,
        "created_at": _now_iso(),
    }
    data["users"].append(user)
    _save_data(data)

    session["user_id"] = user["id"]
    return jsonify({"user": _public_user(user)})


@app.post("/api/login")
def login():
    payload = request.get_json(force=True)
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""

    data = _load_data()
    user = next((u for u in data["users"] if u["email"] == email), None)
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "invalid_credentials"}), 401

    session["user_id"] = user["id"]
    return jsonify({"user": _public_user(user)})


@app.post("/api/logout")
def logout():
    session.pop("user_id", None)
    return jsonify({"ok": True})


@app.get("/api/me")
def me():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"user": None})
    data = _load_data()
    user = next((u for u in data["users"] if u["id"] == user_id), None)
    if not user:
        session.pop("user_id", None)
        return jsonify({"user": None})
    return jsonify({"user": _public_user(user)})


@app.get("/api/rides")
def list_rides():
    data = _load_data()
    rides = data["rides"]

    search = (request.args.get("search") or "").strip().lower()
    origin = (request.args.get("origin") or "").strip().lower()
    destination = (request.args.get("destination") or "").strip().lower()
    date = (request.args.get("date") or "").strip()

    def matches(ride: Dict[str, Any]) -> bool:
        if search:
            blob = f"{ride.get('origin','')} {ride.get('destination','')} {ride.get('notes','')}".lower()
            if search not in blob:
                return False
        if origin and origin not in (ride.get("origin") or "").lower():
            return False
        if destination and destination not in (ride.get("destination") or "").lower():
            return False
        if date and ride.get("date") != date:
            return False
        return True

    result = [r for r in rides if matches(r)]
    result.sort(key=lambda r: (r.get("date") or "", r.get("time") or ""))
    return jsonify({"rides": result})


@app.post("/api/rides")
@_require_auth
def create_ride():
    payload = request.get_json(force=True)
    origin = (payload.get("origin") or "").strip()
    destination = (payload.get("destination") or "").strip()
    date = (payload.get("date") or "").strip()
    time = (payload.get("time") or "").strip()
    seats = int(payload.get("seats") or 0)
    price = float(payload.get("price") or 0)
    notes = (payload.get("notes") or "").strip()

    if not origin or not destination or not date or not time or seats <= 0:
        return jsonify({"error": "missing_fields"}), 400

    data = _load_data()
    ride = {
        "id": _next_id(data["rides"]),
        "driver_id": session["user_id"],
        "origin": origin,
        "destination": destination,
        "date": date,
        "time": time,
        "seats_total": seats,
        "seats_available": seats,
        "price": round(price, 2),
        "notes": notes,
        "created_at": _now_iso(),
    }
    data["rides"].append(ride)
    _save_data(data)
    return jsonify({"ride": ride})


@app.post("/api/rides/<int:ride_id>/join")
@_require_auth
def join_ride(ride_id: int):
    data = _load_data()
    ride = next((r for r in data["rides"] if r["id"] == ride_id), None)
    if not ride:
        return jsonify({"error": "ride_not_found"}), 404
    if ride["driver_id"] == session["user_id"]:
        return jsonify({"error": "cannot_join_own_ride"}), 400
    if ride.get("seats_available", 0) <= 0:
        return jsonify({"error": "no_seats_left"}), 400
    if any(b for b in data["bookings"] if b["ride_id"] == ride_id and b["user_id"] == session["user_id"] and b["status"] == "active"):
        return jsonify({"error": "already_joined"}), 409

    booking = {
        "id": _next_id(data["bookings"]),
        "ride_id": ride_id,
        "user_id": session["user_id"],
        "status": "active",
        "created_at": _now_iso(),
    }
    ride["seats_available"] = max(0, ride["seats_available"] - 1)
    data["bookings"].append(booking)
    _save_data(data)
    return jsonify({"booking": booking, "ride": ride})


@app.post("/api/rides/<int:ride_id>/cancel")
@_require_auth
def cancel_booking(ride_id: int):
    data = _load_data()
    booking = next((b for b in data["bookings"] if b["ride_id"] == ride_id and b["user_id"] == session["user_id"] and b["status"] == "active"), None)
    if not booking:
        return jsonify({"error": "booking_not_found"}), 404

    ride = next((r for r in data["rides"] if r["id"] == ride_id), None)
    if ride:
        ride["seats_available"] = min(ride.get("seats_total", 0), ride.get("seats_available", 0) + 1)

    booking["status"] = "cancelled"
    booking["cancelled_at"] = _now_iso()
    _save_data(data)
    return jsonify({"booking": booking, "ride": ride})


@app.delete("/api/rides/<int:ride_id>")
@_require_auth
def delete_ride(ride_id: int):
    data = _load_data()
    ride = next((r for r in data["rides"] if r["id"] == ride_id), None)
    if not ride:
        return jsonify({"error": "ride_not_found"}), 404
    if ride["driver_id"] != session["user_id"]:
        return jsonify({"error": "not_driver"}), 403

    data["rides"] = [r for r in data["rides"] if r["id"] != ride_id]
    data["bookings"] = [b for b in data["bookings"] if b["ride_id"] != ride_id]
    _save_data(data)
    return jsonify({"ok": True})


@app.get("/api/my/rides")
@_require_auth
def my_rides():
    data = _load_data()
    user_id = session["user_id"]
    driver_rides = [r for r in data["rides"] if r["driver_id"] == user_id]
    passenger_bookings = [b for b in data["bookings"] if b["user_id"] == user_id and b["status"] == "active"]
    passenger_rides = [r for r in data["rides"] if r["id"] in {b["ride_id"] for b in passenger_bookings}]

    return jsonify({"driver": driver_rides, "passenger": passenger_rides})


if __name__ == "__main__":
    app.run(debug=True)
