# NCAA Cross Country Championship Draft

A live fantasy draft for the NCAA cross country championships.

Everyone joins from their device, picks a team name, and takes turns drafting runners in a snake draft. Picks show up for everyone instantly.

## How it works

1. **Join.** Each person enters a team name. The first person to join is the host.
2. **Start.** The host can kick teams from the waiting room, then starts the draft. The team order is shuffled and turned into a 7-round snake draft.
3. **Draft.** On your turn, search the runner table by name or school and click to pick. Every roster updates live for everyone through Socket.IO.

Runners come from `Individual_Rankings.csv`: 411 athletes from the race startlist. I update this for every year.  Swap in a new CSV with the same columns (`Rank, Name, Team, Last Year Finish`) .

## Repo layout

```
app.py                     Flask + Socket.IO server, draft logic and state
templates/index.html       Single-page UI (join, waiting room, draft, results)
static/script.js           Client logic (jQuery + Socket.IO)
static/style.css           Styles
Individual_Rankings.csv    Runner rankings
h.py                       Generates a SECRET_KEY
Procfile, runtime.txt      Deployment config (gunicorn + eventlet, Python 3.11)
```

## Usage

**Run locally**

```bash
pip install -r requirements.txt
python h.py                      # copy the printed key
export SECRET_KEY=your_key
python app.py
```

Open `http://localhost:8080`. Set `PORT` to change the port.

**Deploy.** The `Procfile` runs `gunicorn -k eventlet -w 1 app:app`, so it works on Heroku-style hosts as is. Set `SECRET_KEY` in the host's environment.

Keep it at one worker. Draft state lives in memory, so multiple workers would each have their own separate draft.

## Limitations

- State is in memory only. Restarting the server wipes the draft.
- One draft at a time per server.
- User cannot leave the draft after it has started.
- Rounds are fixed at 7.
- The results screen (final rosters, projected team rankings, roster download) is not wired up on the server yet.
