import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, session, request, redirect, url_for
from flask_socketio import SocketIO, emit
import pandas as pd
import random
import os
from datetime import timedelta

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('11jWaUjKXGmi69szW9FE9rOcGr3eECauNF8YeCHC5Rc', 'RerBcfpnSMIUJX--SODVH0yU0HOv1kTL1iIU2gwaKuE')
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)

# Set manage_session=True to enable session management in Socket.IO
socketio = SocketIO(app, async_mode='eventlet', manage_session=True, cors_allowed_origins="*")

# Load athlete data
athletes_df = pd.read_csv('Individual_Rankings.csv')
athletes_df['Name'] = athletes_df['Name'].astype(str)
available_athletes = athletes_df.to_dict('records')

# Global variables to manage state
teams = []
draft_order = []
pick_order = []
team_rosters = {}
current_pick_index = 0
draft_started = False

@app.route('/')
def index():
    team_name = session.get('team_name')
    return render_template('index.html', team_name=team_name)

@socketio.on('join_draft')
def handle_join_draft(data):
    global teams
    team_name = data['team_name']
    if team_name in teams:
        emit('error', {'message': 'Team name already taken.'})
        return
    teams.append(team_name)
    team_rosters[team_name] = []
    session['team_name'] = team_name
    session.permanent = True
    emit('joined_draft', {'team_name': team_name})
    emit('update_teams', {'teams': teams}, broadcast=True)

@socketio.on('rejoin_draft')
def handle_rejoin_draft(data):
    team_name = session.get('team_name')
    if not team_name or team_name != data['team_name']:
        emit('error', {'message': 'You are not part of the draft.'})
        return
    # Send acknowledgment to the client
    emit('rejoined_draft', {'draft_started': draft_started})
    # Update the client with the current state
    send_state_update()

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

def create_snake_order(teams, rounds):
    order = []
    for rnd in range(rounds):
        order.extend(teams if rnd % 2 == 0 else teams[::-1])
    return order

def send_state_update():
    global current_pick_index
    if current_pick_index < len(pick_order):
        current_team = pick_order[current_pick_index]
        next_team = pick_order[current_pick_index + 1] if current_pick_index + 1 < len(pick_order) else None
    else:
        current_team = None
        next_team = None
    emit('state_update', {
        'team_rosters': team_rosters,
        'available_athletes': available_athletes,
        'current_team': current_team,
        'next_team': next_team
    }, broadcast=True)

@socketio.on('make_pick')
def handle_make_pick(data):
    global current_pick_index
    team_name = session.get('team_name')
    if not team_name:
        emit('error', {'message': 'You are not part of the draft.'})
        return
    if current_pick_index >= len(pick_order):
        emit('error', {'message': 'Draft is already completed.'})
        return
    if pick_order[current_pick_index] != team_name:
        emit('error', {'message': 'It is not your turn.'})
        return
    athlete_name = data['athlete_name']
    # Find and remove athlete from available athletes
    athlete = next((a for a in available_athletes if a['Name'] == athlete_name), None)
    if athlete:
        available_athletes.remove(athlete)
        team_rosters[team_name].append(athlete)
        current_pick_index += 1
        send_state_update()
    else:
        emit('error', {'message': 'Athlete not available.'})

@socketio.on('get_draft_results')
def handle_get_draft_results():
    # Calculate projected finish
    team_points = {}
    for team, roster in team_rosters.items():
        sorted_roster = sorted(roster, key=lambda x: int(x['Rank']))
        top_five = sorted_roster[:5]
        total_points = sum(int(a['Rank']) for a in top_five)
        team_points[team] = total_points
    sorted_teams = sorted(team_points.items(), key=lambda x: x[1])

    projected_rankings = [{'team': team, 'points': points} for team, points in sorted_teams]

    emit('draft_results', {
        'team_rosters': team_rosters,
        'projected_rankings': projected_rankings
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port)





