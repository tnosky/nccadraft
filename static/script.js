let ws = new WebSocket("wss://yourserver"); 
let teamName = "";
let isHost = false;
let myId = null;
let draftState = null;

// ---------------- JOIN ----------------
function joinDraft() {
    teamName = document.getElementById("teamName").value.trim();
    if (!teamName) return;

    ws.send(JSON.stringify({ type: "join", team: teamName }));

    document.getElementById("join-section").style.display = "none";
    document.getElementById("draft-section").style.display = "block";
}

// ---------------- WEBSOCKET ----------------
ws.onmessage = (msg) => {
    let data = JSON.parse(msg.data);

    if (data.type === "joined") {
        myId = data.id;
        isHost = data.isHost;
        updateTeams(data.teams);
        updateAthletes(data.athletes);
        updateRoster(data.roster);

        if (isHost) document.getElementById("host-controls").style.display = "block";
    }

    if (data.type === "update") {
        draftState = data;
        updateTeams(data.teams);
        updateAthletes(data.athletes);
        updateRoster(data.roster);
        updateStatus();
    }
};

// ---------------- START DRAFT ----------------
function startDraft() {
    ws.send(JSON.stringify({ type: "start" }));
}

// ---------------- KICK TEAM ----------------
function kickTeam(id) {
    ws.send(JSON.stringify({ type: "kick", id }));
}

// ---------------- MAKE PICK ----------------
function pickAthlete(id) {
    if (!draftState) return;

    if (draftState.currentTeam !== myId) return; // Not your pick

    ws.send(JSON.stringify({ type: "pick", athlete: id }));
}

// ---------------- UPDATE UI ----------------
function updateTeams(teams) {
    let ul = document.getElementById("teamList");
    ul.innerHTML = "";

    teams.forEach(t => {
        let li = document.createElement("li");
        li.textContent = t.name + (t.id === myId ? " (You)" : "");

        if (isHost && t.id !== myId) {
            let btn = document.createElement("button");
            btn.className = "kickBtn";
            btn.textContent = "Kick";
            btn.onclick = () => kickTeam(t.id);
            li.appendChild(btn);
        }

        ul.appendChild(li);
    });
}

function updateAthletes(list) {
    let ul = document.getElementById("athleteList");
    ul.innerHTML = "";

    list.forEach(a => {
        let li = document.createElement("li");
        li.textContent = `${a.name} — ${a.team}`;
        li.onclick = () => pickAthlete(a.id);
        ul.appendChild(li);
    });
}

function updateRoster(roster) {
    let ul = document.getElementById("rosterList");
    ul.innerHTML = "";

    roster.forEach(a => {
        let li = document.createElement("li");
        li.textContent = `${a.name} — ${a.team}`;
        ul.appendChild(li);
    });
}

// ---------------- STATUS TEXT ----------------
function updateStatus() {
    if (!draftState) return;

    let s = document.getElementById("statusText");
    let c = document.getElementById("pickCountdown");

    let order = draftState.order;
    let currentIndex = draftState.pickIndex;
    let currentTeam = draftState.currentTeam;

    // If it's your pick
    if (currentTeam === myId) {
        s.textContent = "IT IS YOUR PICK!";
        c.textContent = "";
        return;
    }

    // Find how many picks until you
    let myPos = order.indexOf(myId);
    let picksAway = myPos - currentIndex;

    if (picksAway < 0) picksAway += order.length;

    if (picksAway === 1) {
        s.textContent = "You are picking NEXT";
    } else {
        s.textContent = `You are ${picksAway} picks away`;
    }

    c.textContent = `Current Pick: ${draftState.teams.find(t => t.id === currentTeam).name}`;
}

// --------------- SEARCH -----------------
function filterAthletes() {
    let q = document.getElementById("searchBar").value.toLowerCase();

    [...document.querySelectorAll("#athleteList li")].forEach(li => {
        let t = li.textContent.toLowerCase();
        li.style.display = t.includes(q) ? "" : "none";
    });
}
