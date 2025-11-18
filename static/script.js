$(document).ready(function () {
    var socket = io();
    var userState = null; // filled by /get_state
    var isMyTurn = false;
    var isHost = false;

    // Elements
    var teamNameEntry = $('#team-name-entry');
    var teamNameInput = $('#team-name-input');
    var joinDraftBtn = $('#join-draft-btn');

    var waitingRoom = $('#waiting-room');
    var teamList = $('#team-list');
    var startDraftBtn = $('#start-draft-btn');

    var draftInterface = $('#draft-interface');
    var currentTeamLabel = $('#current-team-label');
    var nextTeamLabel = $('#next-team-label');
    var draftOrderLabel = $('#draft-order-label');
    var picksAwayLabel = $('#picks-away-label');
    var searchBar = $('#search-bar');
    var athleteTableBody = $('#athlete-table tbody');
    var rosterTableBody = $('#roster-table tbody');

    var draftResults = $('#draft-results');
    var allTeamRostersDiv = $('#all-team-rosters');
    var projectedRankingsTableBody = $('#projected-rankings-table tbody');

    var availableAthletes = [];
    var teamRoster = [];
    var allTeamRosters = {};
    var currentTeam = null;
    var nextTeam = null;
    var draftStarted = false;

    // Restore state on page load
    $.get('/get_state', function (data) {
        if (data.error) {
            // Not yet joined; leave UI at join screen
            userState = null;
        } else {
            userState = data;
            initializeUserState(userState);
        }
    });

    function initializeUserState(state) {
        // Save state client-side
        userState = state;

        // If user already joined, show waiting/draft UI
        if (state.team_name) {
            teamNameEntry.addClass('hidden');
            waitingRoom.removeClass('hidden');
            if (state.draft_started) {
                waitingRoom.addClass('hidden');
                draftInterface.removeClass('hidden');
            }
        }

        // Host visible?
        isHost = state.is_host === true;

        updateTeamList(state.teams || []);
        updateDraftInterface(state);

        // Show start button for host (if no draft started)
        if (isHost && !state.draft_started) {
            startDraftBtn.removeClass('hidden');
        } else {
            startDraftBtn.addClass('hidden');
        }
    }

    function updateTeamList(teamsArr) {
        teamList.empty();
        teamsArr.forEach(function (team) {
            var listItem = $('<li></li>');
            listItem.text(team);

            if (isHost) {
                var kickBtn = $('<button class="kick-team-btn" data-team-name="' + team + '">Kick</button>');
                listItem.append(' ').append(kickBtn);
            }
            teamList.append(listItem);
        });
    }

    function updateDraftInterface(state) {
        draftStarted = state.draft_started;
        availableAthletes = state.available_athletes || [];
        allTeamRosters = state.team_rosters || {};
        currentTeam = state.current_team;
        nextTeam = state.next_team;

        // Recompute isHost if host changed
        if (userState && userState.user_id) {
            isHost = (userState.user_id === state.host_id);
            userState.is_host = isHost;
        }

        // Restore isMyTurn based on the current team and user's team name
        isMyTurn = (userState && userState.team_name) ? (currentTeam === userState.team_name) : false;

        // Calculate picks away if pick_order info exists
        var pickMessage = '';
        if (state.pick_order && userState && userState.team_name) {
            var idx = state.pick_order.indexOf(userState.team_name);
            if (idx === -1) {
                pickMessage = ''; // user not in pick order
            } else {
                var picksAway = idx - state.current_pick_index;
                if (picksAway <= 0 && currentTeam === userState.team_name) {
                    pickMessage = 'It is Your Pick!';
                } else if (picksAway === 1) {
                    pickMessage = 'You are picking next.';
                } else if (picksAway > 1) {
                    pickMessage = 'You are ' + picksAway + ' picks away.';
                } else if (picksAway < 0) {
                    pickMessage = ''; // already passed
                }
            }
        }

        // Update UI elements
        currentTeamLabel.text('Current Team: ' + (currentTeam || 'None'));
        nextTeamLabel.text('Next Team: ' + (nextTeam || 'None'));
        draftOrderLabel.html('<strong>Draft Order:</strong> ' + (state.draft_order || []).join(', '));
        picksAwayLabel.text(pickMessage);

        // Show/hide start button
        if (isHost && !state.draft_started) startDraftBtn.removeClass('hidden');
        else startDraftBtn.addClass('hidden');

        // Update athlete table and team roster
        updateAthleteTable();
        if (userState && userState.team_name) {
            teamRoster = allTeamRosters[userState.team_name] || [];
            updateRosterTable();
        }

        // Update all team rosters display
        updateAllTeamRosters();
    }

    // Search updates
    searchBar.on('input', function () {
        updateAthleteTable();
    });

    function sanitizeText(t) {
        return (t || '').toString().toLowerCase();
    }

    function updateAthleteTable() {
        var searchTerm = sanitizeText(searchBar.val());
        athleteTableBody.empty();

        availableAthletes.forEach(function (athlete) {
            var name = sanitizeText(athlete.Name);
            var team = sanitizeText(athlete.Team);

            // If search term is empty or matches name or team, display
            if (!searchTerm || name.includes(searchTerm) || team.includes(searchTerm)) {
                var row = $('<tr></tr>');
                row.append('<td>' + athlete.Rank + '</td>');
                row.append('<td>' + athlete.Name + '</td>');
                row.append('<td>' + athlete.Team + '</td>');
                row.append('<td>' + athlete.Trend + '</td>');

                if (isMyTurn) {
                    // Use both click & touchend for mobile compatibility
                    row.on('click touchend', function (ev) {
                        ev.preventDefault();
                        if (confirm('Select ' + athlete.Name + '?')) {
                            // Use ack callback to get server response
                            socket.emit('make_pick', { athlete_name: athlete.Name }, function (response) {
                                if (response && response.success) {
                                    // server already broadcasted state_update; optionally update local copy
                                    // but we can refresh UI when state_update arrives
                                } else {
                                    alert(response.error || 'Failed to pick athlete.');
                                }
                            });
                        }
                    });
                }

                athleteTableBody.append(row);
            }
        });
    }

    function updateRosterTable() {
        rosterTableBody.empty();
        teamRoster.forEach(function (athlete) {
            rosterTableBody.append(
                '<tr><td>' +
                    (athlete.Rank || '') +
                    '</td><td>' +
                    (athlete.Name || '') +
                    '</td><td>' +
                    (athlete.Team || '') +
                    '</td><td>' +
                    (athlete.Trend || '') +
                    '</td></tr>'
            );
        });
    }

    function updateAllTeamRosters() {
        var container = $('#all-team-rosters-container');
        container.empty();

        for (var team in allTeamRosters) {
            var roster = allTeamRosters[team] || [];
            var table = $('<table></table>');
            table.append('<thead><tr><th>Rank</th><th>Name</th><th>Team</th><th>Trend</th></tr></thead>');
            var tbody = $('<tbody></tbody>');
            roster.forEach(function (ath) {
                tbody.append('<tr><td>' + (ath.Rank || '') + '</td><td>' + (ath.Name || '') + '</td><td>' + (ath.Team || '') + '</td><td>' + (ath.Trend || '') + '</td></tr>');
            });
            table.append(tbody);
            container.append('<h4>' + team + '</h4>');
            container.append(table);
        }
    }

    // JOIN
    joinDraftBtn.click(function () {
        var teamName = teamNameInput.val().trim();
        if (!teamName) return alert('Please enter a team name.');
        socket.emit('join_draft', { team_name: teamName });
    });

    // joined_draft: confirm join; server also calls send_state_update which will push full state
    socket.on('joined_draft', function (data) {
        // immediate UI for joining client
        teamNameEntry.addClass('hidden');
        waitingRoom.removeClass('hidden');

        // update userState minimally; full state will come via /get_state or state_update
        if (!userState) userState = {};
        userState.user_id = data.user_id;
        userState.team_name = data.team_name;
        userState.is_host = data.is_host === true;

        // show start button if host
        if (userState.is_host) {
            startDraftBtn.removeClass('hidden');
        }

        // request fresh state (just to be safe)
        $.get('/get_state', function (s) {
            if (!s.error) {
                userState = s;
                initializeUserState(userState);
            }
        });
    });

    socket.on('update_teams', function (data) {
        updateTeamList(data.teams || []);
    });

    // draft started
    socket.on('draft_started', function (data) {
        draftStarted = true;
        waitingRoom.addClass('hidden');
        draftInterface.removeClass('hidden');
        if (data && data.draft_order) {
            draftOrderLabel.text('Draft Order: ' + data.draft_order.join(', '));
        }
    });

    // full state update
    socket.on('state_update', function (data) {
        // update local available lists
        availableAthletes = data.available_athletes || [];
        allTeamRosters = data.team_rosters || {};
        currentTeam = data.current_team;
        nextTeam = data.next_team;
        draftStarted = data.draft_started;

        // update computed flags
        if (userState && userState.user_id) {
            userState.is_host = (userState.user_id === data.host_id);
        }
        isHost = userState && userState.is_host;
        isMyTurn = userState && userState.team_name ? (currentTeam === userState.team_name) : false;

        // show/hide UI sections
        if (draftStarted) {
            waitingRoom.addClass('hidden');
            draftInterface.removeClass('hidden');
        } else {
            waitingRoom.removeClass('hidden');
            draftInterface.addClass('hidden');
        }

        // update team list (kick buttons depend on isHost)
        updateTeamList(data.teams || []);

        // compute picks away message
        var pickMsg = '';
        if (data.pick_order && userState && userState.team_name) {
            var idx = data.pick_order.indexOf(userState.team_name);
            if (idx !== -1) {
                var picksAway = idx - data.current_pick_index;
                if (picksAway <= 0 && currentTeam === userState.team_name) pickMsg = 'It is Your Pick!';
                else if (picksAway === 1) pickMsg = 'You are picking next.';
                else if (picksAway > 1) pickMsg = 'You are ' + picksAway + ' picks away.';
            }
        }

        currentTeamLabel.text('Current Team: ' + (currentTeam || 'None'));
        nextTeamLabel.text('Next Team: ' + (nextTeam || 'None'));
        draftOrderLabel.html('<strong>Draft Order:</strong> ' + (data.draft_order || []).join(', '));
        picksAwayLabel.text(pickMsg);

        // update athlete table + roster displays
        updateAthleteTable();
        teamRoster = (userState && userState.team_name) ? (allTeamRosters[userState.team_name] || []) : [];
        updateRosterTable();
        updateAllTeamRosters();
    });

    socket.on('team_kicked', function (data) {
        alert('Team ' + data.team_name + ' has been removed from the draft.');
        updateTeamList(data.teams || []);
    });

    socket.on('error', function (data) {
        if (data && data.message) alert(data.message);
    });

    socket.on('draft_results', function (data) {
        draftInterface.addClass('hidden');
        draftResults.removeClass('hidden');
        displayAllTeamRosters(data.team_rosters);
        displayProjectedRankings(data.projected_rankings);
    });

    // Kick button handler (delegated)
    $(document).on('click', '.kick-team-btn', function () {
        var teamName = $(this).data('team-name');
        if (!teamName) return;
        if (!confirm('Are you sure you want to remove ' + teamName + ' from the draft?')) return;
        socket.emit('kick_team', { team_name: teamName });
    });

    // Download button handler (if present)
    $(document).on('click', '#download-rosters-btn', function () {
        window.location.href = '/download_rosters';
    });

    function displayAllTeamRosters(teamRosters) {
        allTeamRostersDiv.empty();
        for (var team in teamRosters) {
            var roster = teamRosters[team] || [];
            var table = $('<table></table>');
            table.append('<thead><tr><th>Rank</th><th>Name</th><th>Team</th><th>Trend</th></tr></thead>');
            var tbody = $('<tbody></tbody>');
            roster.forEach(function (ath) {
                tbody.append('<tr><td>' + (ath.Rank || '') + '</td><td>' + (ath.Name || '') + '</td><td>' + (ath.Team || '') + '</td><td>' + (ath.Trend || '') + '</td></tr>');
            });
            table.append(tbody);
            allTeamRostersDiv.append('<h4>' + team + '</h4>');
            allTeamRostersDiv.append(table);
        }
    }

    function displayProjectedRankings(projectedRankings) {
        projectedRankingsTableBody.empty();
        projectedRankings.forEach(function (item) {
            projectedRankingsTableBody.append('<tr><td>' + item.team + '</td><td>' + item.points + '</td></tr>');
        });
    }
});
