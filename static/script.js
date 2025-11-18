$(document).ready(function () {
    var socket = io();
    var userState = null;
    var isMyTurn = false;

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
            // If user not found, simply stay on join screen
            console.log(data.error);
        } else {
            userState = data;
            initializeUserState(userState);
        }
    });

    function initializeUserState(state) {
        if (state.team_name) {
            // User has already joined the draft
            teamNameEntry.addClass('hidden');
            waitingRoom.removeClass('hidden');
            if (state.draft_started) {
                waitingRoom.addClass('hidden');
                draftInterface.removeClass('hidden');
            }
        }

        updateTeamList(state.teams || []);
        updateDraftInterface(state);

        // Show "Start Draft" button if the user is the host
        if (state.is_host) {
            startDraftBtn.removeClass('hidden');
        }
    }

    function updateTeamList(teams) {
        teamList.empty();
        teams.forEach(function (team) {
            var listItem = $('<li>' + team + '</li>');
            if (userState && userState.is_host) {
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

        // Restore isMyTurn based on the current team and user's team name
        // Safety check if state.team_name exists
        if (state.team_name) {
            isMyTurn = currentTeam === state.team_name;
        } else {
            isMyTurn = false;
        }

        // Calculate picks away
        var picksAway = -1;
        if (state.pick_order && state.team_name) {
             picksAway = state.pick_order.indexOf(state.team_name) - state.current_pick_index;
        }
        
        var pickMessage = '';
        if (picksAway === 0) {
            pickMessage = 'It is Your Pick!';
        } else if (picksAway === 1) {
            pickMessage = 'You are picking next.';
        } else if (picksAway > 1) {
            pickMessage = 'You are ' + picksAway + ' picks away.';
        }

        // Update UI elements
        currentTeamLabel.text('Current Team: ' + (currentTeam || 'None'));
        nextTeamLabel.text('Next Team: ' + (nextTeam || 'None'));
        draftOrderLabel.html('<strong>Draft Order:</strong> ' + (state.draft_order || []).join(', '));
        $('#picks-away-label').text(pickMessage);

        // Update athlete table and team roster
        updateAthleteTable();
        if (state.team_name) {
            teamRoster = allTeamRosters[state.team_name] || [];
            updateRosterTable();
        }

        // Update all team rosters
        updateAllTeamRosters();
    }

    searchBar.on('input', function () {
        updateAthleteTable();
    });

    function updateAthleteTable() {
        var searchTerm = searchBar.val().toLowerCase(); // Get the search term
        athleteTableBody.empty(); // Clear existing rows

        // Filter athletes by Name or Team
        availableAthletes.forEach(function (athlete) {
            if (
                athlete.Name.toLowerCase().includes(searchTerm) || // Match name
                athlete.Team.toLowerCase().includes(searchTerm)    // Match team
            ) {
                var row = $('<tr></tr>');
                row.append('<td>' + athlete.Rank + '</td>');
                row.append('<td>' + athlete.Name + '</td>');
                row.append('<td>' + athlete.Team + '</td>');
                row.append('<td>' + athlete.Trend + '</td>');

                // Allow selection if it's the user's turn
                if (isMyTurn) {
                    row.on('click touchend', function () {
                        if (confirm('Select ' + athlete.Name + '?')) {
                            makePick(athlete.Name);
                        }
                    });
                }

                athleteTableBody.append(row); // Add the row to the table
            }
        });
    }

    function updateRosterTable() {
        rosterTableBody.empty();
        teamRoster.forEach(function (athlete) {
            rosterTableBody.append(
                '<tr><td>' +
                    athlete.Rank +
                    '</td><td>' +
                    athlete.Name +
                    '</td><td>' +
                    athlete.Team +
                    '</td><td>' +
                    athlete.Trend +
                    '</td></tr>'
            );
        });
    }

    function updateAllTeamRosters() {
        var container = $('#all-team-rosters-container');
        container.empty();

        for (var team in allTeamRosters) {
            var roster = allTeamRosters[team];
            var table = $('<table></table>');
            table.append('<thead><tr><th>Rank</th><th>Name</th><th>Team</th><th>Trend</th></tr></thead>');
            var tbody = $('<tbody></tbody>');
            roster.forEach(function (athlete) {
                tbody.append(
                    '<tr><td>' +
                        athlete.Rank +
                        '</td><td>' +
                        athlete.Name +
                        '</td><td>' +
                        athlete.Team +
                        '</td><td>' +
                        athlete.Trend +
                        '</td></tr>'
                );
            });
            table.append(tbody);

            container.append('<h4>' + team + '</h4>');
            container.append(table);
        }
    }


    // Join Draft
    joinDraftBtn.click(function () {
        var teamName = teamNameInput.val().trim();
        if (teamName) {
            socket.emit('join_draft', { team_name: teamName });
        } else {
            alert('Please enter a team name.');
        }
    });

    socket.on('joined_draft', function (data) {
        // Update local userState to prevent null errors in updateTeamList
        if (!userState) userState = {};
        userState.is_host = data.is_host;
        userState.team_name = data.team_name;

        teamNameEntry.addClass('hidden');
        waitingRoom.removeClass('hidden');
        
        // Update team list immediately
        updateTeamList(data.teams || []);

        if (data.is_host) {
            startDraftBtn.removeClass('hidden'); // Show "Start Draft" button for host
        }
    });

    socket.on('update_teams', function (data) {
        updateTeamList(data.teams);
    });

    // Start Draft
    startDraftBtn.click(function () {
        socket.emit('start_draft');
    });

    socket.on('draft_started', function (data) {
        draftStarted = true;
        waitingRoom.addClass('hidden');
        draftInterface.removeClass('hidden');
        draftOrderLabel.text('Draft Order: ' + data.draft_order.join(', '));
    });

    // State Update
    socket.on('state_update', function (data) {
        availableAthletes = data.available_athletes;
        allTeamRosters = data.team_rosters;
        currentTeam = data.current_team;
        nextTeam = data.next_team;

        currentTeamLabel.text('Current Team: ' + (currentTeam || 'Draft Completed'));
        nextTeamLabel.text('Next Team: ' + (nextTeam || 'None'));

        // Safety check
        if (userState && userState.team_name) {
             isMyTurn = currentTeam === userState.team_name;
             teamRoster = allTeamRosters[userState.team_name] || [];
             updateRosterTable();
        }

        updateAthleteTable();
        updateAllTeamRosters();

        if (!currentTeam) {
            socket.emit('get_draft_results');
        }
    });

    socket.on('draft_results', function (data) {
        draftInterface.addClass('hidden');
        draftResults.removeClass('hidden');

        displayAllTeamRosters(data.team_rosters);
        displayProjectedRankings(data.projected_rankings);

        // Show download button - ensure we don't duplicate if event fires twice
        $('#download-rosters-btn').remove();
        const downloadButton = $('<button id="download-rosters-btn">Download Rosters</button>');
        downloadButton.click(function () {
            window.location.href = '/download_rosters';
        });
        draftResults.append(downloadButton);
    });

    // Add event listener for kicking teams
    $(document).on('click', '.kick-team-btn', function () {
        var teamName = $(this).data('team-name');
        if (confirm('Are you sure you want to remove ' + teamName + ' from the draft?')) {
            socket.emit('kick_team', { team_name: teamName });
        }
    });

    // Handle team kicked event
    socket.on('team_kicked', function (data) {
        // If I was kicked, alert and reload to reset
        if (userState && userState.team_name === data.team_name) {
            alert('You have been removed from the draft.');
            location.reload();
        } else {
            // Only alert if explicitly needed, or just update UI
            // alert('Team ' + data.team_name + ' has been removed.');
        }
        // The server sends state_update which refreshes the lists, so manual updateTeamList here isn't strictly necessary if update_teams is broadcast, but let's be safe.
    });
    
    // Add this listener for errors
    socket.on('error', function(data) {
        alert(data.message);
    });

    function makePick(athleteName) {
        if (isMyTurn) {
            socket.emit('make_pick', { athlete_name: athleteName }, function (response) {
                if (response && response.error) {
                    alert(response.error);
                }
            });
        }
    }

    function displayAllTeamRosters(teamRosters) {
        allTeamRostersDiv.empty();
        for (var team in teamRosters) {
            var roster = teamRosters[team];
            var table = $('<table></table>');
            table.append('<thead><tr><th>Rank</th><th>Name</th><th>Team</th><th>Trend</th></tr></thead>');
            var tbody = $('<tbody></tbody>');
            roster.forEach(function (athlete) {
                tbody.append(
                    '<tr><td>' +
                        athlete.Rank +
                        '</td><td>' +
                        athlete.Name +
                        '</td><td>' +
                        athlete.Team +
                        '</td><td>' +
                        athlete.Trend +
                        '</td></tr>'
                );
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
