import eventlet
eventlet.monkey_patch()  # Must be called before any other imports

from flask import Flask, render_template, session, request, jsonify
from flask_socketio import SocketIO, emit
import pandas as pd
import random
import uuid
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your_secret_key')

socketio = SocketIO(app, async_mode='eventlet', manage_session=True, cors_allowed_origins="*")

# Load athlete data
athletes_df = pd.read_csv('Individual_Rankings.csv')
available_athletes = athletes_df.to_dict('records')

# Persistent storage for draft state
users = {}  # Maps user_id to user-specific information
teams = []  # List of team names
draft_order = []
pick_order = []
team_rosters = {}  # Maps team_name to their selected roster
current_pick_index = 0
draft_started = False

# Helper functions
def create_snake_order(teams, rounds):
    order = []
    for rnd in range(rounds):
        order.extend(teams if rnd % 2 == 0 else teams[::-1])
    return order

def get_user_state(user_id):
    """Return the state of a user."""
    if user_id in users:
        user = users[user_id]
        return {
            "user_id": user_id,
            "team_name": user.get("team_name"),
            "draft_started": draft_started,
            "draft_order": draft_order,
            "team_rosters": team_rosters,
            "pick_order": pick_order,
            "current_pick_index": current_pick_index,
            "available_athletes": available_athletes,
            "teams": teams,
            "current_team": pick_order[current_pick_index] if current_pick_index < len(pick_order) else None,
            "next_team": pick_order[current_pick_index + 1] if current_pick_index + 1 < len(pick_order) else None,
        }
    return {"error": "User not found"}

# Routes
@app.route('/')
def index():
    if 'user_id' not in session:
        session['user_id'] = str(uuid.uuid4())  # Assign a unique ID to each user

    user_id = session['user_id']
    user = users.get(user_id, {})
    team_name = user.get('team_name', None)

    return render_template('index.html', team_name=team_name)

@app.route('/get_state', methods=['GET'])
def get_state():
    """Endpoint to restore user state after a refresh."""
    user_id = session.get('user_id')
    if user_id:
        return jsonify(get_user_state(user_id))
    return jsonify({"error": "User not found"})

# SocketIO Events
@socketio.on('join_draft')
def handle_join_draft(data):
    user_id = session.get('user_id')
    team_name = data.get('team_name')

    if not user_id or not team_name:
        emit('error', {'message': 'Invalid user or team name.'})
        return

    # Check if the team name is already taken
    if team_name in teams:
        emit('error', {'message': 'Team name already taken.'})
        return

    # Save user information
    users[user_id] = {"team_name": team_name}
    teams.append(team_name)
    team_rosters[team_name] = []
    emit('joined_draft', {"team_name": team_name, "user_id": user_id})
    emit('update_teams', {"teams": teams}, broadcast=True)

@socketio.on('start_draft')
def handle_start_draft():
    global draft_order, pick_order, draft_started
    if draft_started:
        return
    draft_started = True
    draft_order = teams.copy()
    random.shuffle(draft_order)
    pick_order = create_snake_order(draft_order, 7)
    emit('draft_started', {'draft_order': draft_order, 'pick_order': pick_order}, broadcast=True)
    send_state_update()

def send_state_update():
    """Send updated state to all users."""
    global current_pick_index
    current_team = pick_order[current_pick_index] if current_pick_index < len(pick_order) else None
    next_team = pick_order[current_pick_index + 1] if current_pick_index + 1 < len(pick_order) else None
    emit('state_update', {
        "team_rosters": team_rosters,
        "available_athletes": available_athletes,
        "current_team": current_team,
        "next_team": next_team,
    }, broadcast=True)

@socketio.on('make_pick')
def handle_make_pick(data):
    global current_pick_index
    user_id = session.get('user_id')
    team_name = users[user_id].get("team_name")

    if not team_name or current_pick_index >= len(pick_order) or pick_order[current_pick_index] != team_name:
        emit('error', {'message': 'It is not your turn.'})
        return

    athlete_name = data.get('athlete_name')
    athlete = next((a for a in available_athletes if a['Name'] == athlete_name), None)

    if athlete:
        available_athletes.remove(athlete)
        team_rosters[team_name].append(athlete)
        current_pick_index += 1
        send_state_update()
    else:
        emit('error', {'message': 'Athlete not available.'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    socketio.run(app, host='0.0.0.0', port=port)
