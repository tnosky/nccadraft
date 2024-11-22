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
            alert(data.error);
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

    function addKickButtonForHost(teamName) {
        // Add a "Kick" button next to each team name for the host
        if (userState.is_host) {
            return `<button class="kick-team-btn" data-team="${teamName}">Kick</button>`;
        }
        return '';
    }

    function updateTeamList(teams) {
        teamList.empty();
        teams.forEach(function (team) {
            teamList.append(
                `<li>${team} ${addKickButtonForHost(team)}</li>`
            );
        });

        // Attach click event for kicking teams
        $('.kick-team-btn').click(function () {
            const teamName = $(this).data('team');
            socket.emit('kick_team', { team_name: teamName });
        });
    }


    function updateDraftInterface(state) {
        draftStarted = state.draft_started;
        availableAthletes = state.available_athletes || [];
        allTeamRosters = state.team_rosters || {};
        currentTeam = state.current_team;
        nextTeam = state.next_team;

        isMyTurn = currentTeam === state.team_name;

        const userIndex = state.draft_order.indexOf(state.team_name);
        const currentIndex = state.draft_order.indexOf(currentTeam);
        const picksAway = currentIndex > userIndex ? currentIndex - userIndex : userIndex - currentIndex;

        // Update dynamic pick notifications
        if (isMyTurn) {
            currentTeamLabel.text('It is Your Pick!');
        } else if (picksAway === 1) {
            currentTeamLabel.text('You are picking next.');
        } else {
            currentTeamLabel.text(`You are ${picksAway} picks away.`);
        }

        nextTeamLabel.text('Next Team: ' + (nextTeam || 'None'));
        draftOrderLabel.text('Draft Order: ' + (state.draft_order || []).join(', '));

        updateAthleteTable();
        if (state.team_name) {
            teamRoster = allTeamRosters[state.team_name] || [];
            updateRosterTable();
        }
        updateAllTeamRosters();
    }

    function updateAthleteTable() {
        var searchTerm = searchBar.val().toLowerCase(); // Get the search term and make it lowercase
        athleteTableBody.empty(); // Clear the table before populating it again

        // Filter athletes based on search term
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

                // Add click/touch event for selecting an athlete
                if (isMyTurn) {
                    row.on('click touchend', function () {
                        if (confirm('Select ' + athlete.Name + '?')) {
                            makePick(athlete.Name);
                        }
                    });
                }

                athleteTableBody.append(row); // Add the row to the table body
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
        teamNameEntry.addClass('hidden');
        waitingRoom.removeClass('hidden');
        updateTeamList(data.teams);

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

        isMyTurn = currentTeam === userState.team_name;

        updateAthleteTable();
        teamRoster = allTeamRosters[userState.team_name] || [];
        updateRosterTable();
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
    });

    socket.on('draft_results', function (data) {
        draftInterface.addClass('hidden');
        draftResults.removeClass('hidden');

        displayAllTeamRosters(data.team_rosters);
        displayProjectedRankings(data.projected_rankings);

        // Show download button
        const downloadButton = $('<button>Download Rosters</button>');
        downloadButton.click(function () {
            window.location.href = '/download_rosters';
        });
        draftResults.append(downloadButton);
    });

    function makePick(athleteName) {
        if (isMyTurn) {
            socket.emit('make_pick', { athlete_name: athleteName });
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