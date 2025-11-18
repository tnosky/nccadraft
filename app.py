import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, session, request, jsonify, send_file
from flask_socketio import SocketIO, emit
import pandas as pd
import random
import uuid
import os
import io
import csv

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', '11jWaUjKXGmi69szW9FE9rOcGr3eECauNF8YeCHC5Rc')

socketio = SocketIO(app, async_mode='eventlet', manage_session=True, cors_allowed_origins="*")

# Load athlete data
athletes_df = pd.read_csv('Individual_Rankings.csv')
available_athletes = athletes_df.to_dict('records')

# Persistent storage for draft state
users = {}  # Maps user_id to user-specific information: { user_id: { "team_name": "X" } }
teams = []  # List of team names (strings) in join order
draft_order = []
pick_order = []
team_rosters = {}  # Maps team_name to their selected roster (list of athlete dicts)
current_pick_index = 0
draft_started = False
host_id = None  # Stores the session user_id of the draft host


# Helper functions
def create_snake_order(teams_list, rounds):
    order = []
    for rnd in range(rounds):
        order.extend(teams_list if rnd % 2 == 0 else teams_list[::-1])
    return order


def get_user_state(user_id):
    """Return the state of a user for /get_state endpoint."""
    if user_id in users:
        user = users[user_id]
        return {
            "user_id": user_id,
            "team_name": user.get("team_name"),
            "is_host": user_id == host_id,
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


@app.route('/download_rosters')
def download_rosters():
    """Optional CSV download for final rosters: returns CSV of all team rosters."""
    # Build an in-memory CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Team', 'Rank', 'Name', 'TeamOfAthlete', 'Trend'])
    for team, roster in team_rosters.items():
        for a in roster:
            writer.writerow([team, a.get('Rank'), a.get('Name'), a.get('Team'), a.get('Trend')])
    output.seek(0)
    return send_file(io.BytesIO(output.getvalue().encode('utf-8')),
                     mimetype='text/csv',
                     as_attachment=True,
                     download_name='rosters.csv')


# SocketIO Events
@socketio.on('join_draft')
def handle_join_draft(data):
    global host_id
    user_id = session.get('user_id')
    team_name = data.get('team_name')

    if not user_id or not team_name:
        emit('error', {'message': 'Invalid user or team name.'}, room=request.sid)
        return

    # Check if the team name is already taken
    if team_name in teams:
        emit('error', {'message': 'Team name already taken.'}, room=request.sid)
        return

    # Assign the first user to join as the host (if none yet)
    if host_id is None:
        host_id = user_id

    # Save user information
    users[user_id] = {"team_name": team_name}
    teams.append(team_name)
    team_rosters[team_name] = []

    # Notify the joining client
    emit('joined_draft', {"team_name": team_name, "user_id": user_id, "is_host": user_id == host_id}, room=request.sid)

    # Broadcast full updated state to everyone
    send_state_update()


@socketio.on('start_draft')
def handle_start_draft():
    global draft_order, pick_order, draft_started, current_pick_index
    user_id = session.get('user_id')

    # Only the host can start the draft
    if user_id != host_id:
        emit('error', {'message': 'Only the host can start the draft.'}, room=request.sid)
        return

    if draft_started:
        return

    draft_started = True
    draft_order = teams.copy()
    random.shuffle(draft_order)
    pick_order = create_snake_order(draft_order, 7)
    current_pick_index = 0

    # Broadcast that draft started and full state
    emit('draft_started', {'draft_order': draft_order, 'pick_order': pick_order}, broadcast=True)
    send_state_update()


def send_state_update():
    """Send updated state to all users."""
    global current_pick_index
    current_team = None
    next_team = None
    if pick_order:
        current_team = pick_order[current_pick_index] if current_pick_index < len(pick_order) else None
        next_team = pick_order[current_pick_index + 1] if current_pick_index + 1 < len(pick_order) else None

    payload = {
        "teams": teams,
        "team_rosters": team_rosters,
        "available_athletes": available_athletes,
        "current_team": current_team,
        "next_team": next_team,
        "draft_order": draft_order,
        "pick_order": pick_order,
        "current_pick_index": current_pick_index,
        "host_id": host_id,
        "draft_started": draft_started,
    }
    emit('state_update', payload, broadcast=True)


@socketio.on('kick_team')
def handle_kick_team(data):
    global draft_order, pick_order, current_pick_index, host_id
    user_id = session.get('user_id')

    # Ensure only the host can kick a team
    if user_id != host_id:
        emit('error', {'message': 'Only the host can kick teams.'}, room=request.sid)
        return

    team_to_kick = data.get('team_name')
    if team_to_kick and team_to_kick in teams:
        # Remove team and its roster
        teams.remove(team_to_kick)
        if team_to_kick in team_rosters:
            del team_rosters[team_to_kick]

        # Remove any users associated with that team
        remove_user_ids = [uid for uid, u in users.items() if u.get('team_name') == team_to_kick]
        for uid in remove_user_ids:
            del users[uid]

        # Update draft order and pick order (if draft already created)
        draft_order = [team for team in draft_order if team != team_to_kick]
        pick_order = [team for team in pick_order if team != team_to_kick]

        # Adjust current_pick_index if necessary
        if pick_order:
            current_pick_index = min(current_pick_index, len(pick_order) - 1)
        else:
            current_pick_index = 0

        # If host was kicked (shouldn't normally happen because host kicks others) reset host if needed
        if host_id not in users:
            host_id = None
            # assign new host if any users remain (choose first joiner)
            if users:
                host_id = next(iter(users.keys()))

        # Notify all clients and send new state
        emit('team_kicked', {'team_name': team_to_kick, 'teams': teams}, broadcast=True)
        send_state_update()
    else:
        emit('error', {'message': 'Team not found.'}, room=request.sid)


@socketio.on('make_pick')
def handle_make_pick(data):
    global current_pick_index
    user_id = session.get('user_id')
    if user_id not in users:
        return {'success': False, 'error': 'You are not registered in draft.'}

    team_name = users[user_id].get("team_name")

    # Validate turn
    if not team_name or current_pick_index >= len(pick_order) or pick_order[current_pick_index] != team_name:
        return {'success': False, 'error': 'It is not your turn.'}

    athlete_name = data.get('athlete_name')
    athlete = next((a for a in available_athletes if a.get('Name') == athlete_name), None)

    if athlete:
        # Assign athlete to the team
        available_athletes.remove(athlete)
        team_rosters.setdefault(team_name, []).append(athlete)
        current_pick_index += 1

        # If we've completed all picks, you could trigger finalization here
        send_state_update()
        return {'success': True, 'team_rosters': team_rosters}
    else:
        return {'success': False, 'error': 'Athlete not available.'}


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    socketio.run(app, host='0.0.0.0', port=port)
