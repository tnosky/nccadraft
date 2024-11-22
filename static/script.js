// script.js

$(document).ready(function() {
    var socket = io();
    var teamName = existingTeamName || null;
    var isMyTurn = false;
    var draftOrder = [];
    var pickOrder = [];
    var availableAthletes = [];
    var teamRoster = [];
    var allTeamRosters = {};
    var currentTeam = null;
    var nextTeam = null;
    var draftStarted = false;

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

    // On page load, hide other sections
    waitingRoom.addClass('hidden');
    draftInterface.addClass('hidden');
    draftResults.addClass('hidden');

    if (teamName) {
        // User has already joined
        teamNameEntry.addClass('hidden');
        socket.emit('rejoin_draft', {'team_name': teamName});
    }

    // Join Draft
    joinDraftBtn.click(function() {
        teamName = teamNameInput.val().trim();
        if (teamName) {
            socket.emit('join_draft', {'team_name': teamName});
        } else {
            alert('Please enter a team name.');
        }
    });

    // On successful join
    socket.on('joined_draft', function(data) {
        teamNameEntry.addClass('hidden');
        waitingRoom.removeClass('hidden');
    });

    // On rejoin
    socket.on('rejoined_draft', function(data) {
        teamNameEntry.addClass('hidden');
        draftStarted = data.draft_started;

        if (draftStarted) {
            waitingRoom.addClass('hidden');
            draftInterface.removeClass('hidden');
        } else {
            waitingRoom.removeClass('hidden');
        }
    });

    // Update Team List
    socket.on('update_teams', function(data) {
        var teams = data.teams;
        teamList.empty();
        teams.forEach(function(team) {
            teamList.append('<li>' + team + '</li>');
        });
        if (teams.length > 1 && !draftStarted) {
            if (teamName === teams[0]) {
                startDraftBtn.removeClass('hidden');
            }
        }
    });

    // Start Draft Button
    startDraftBtn.click(function() {
        socket.emit('start_draft');
    });

    // Draft Started
    socket.on('draft_started', function(data) {
        draftStarted = true;
        draftOrder = data.draft_order;
        pickOrder = data.pick_order;
        waitingRoom.addClass('hidden');
        draftInterface.removeClass('hidden');
        draftOrderLabel.text('Draft Order: ' + draftOrder.join(', '));
    });

    // State Update
    socket.on('state_update', function(data) {
        availableAthletes = data.available_athletes;
        allTeamRosters = data.team_rosters;
        currentTeam = data.current_team;
        nextTeam = data.next_team;

        // Update current and next team labels
        currentTeamLabel.text('Current Team: ' + (currentTeam || 'Draft Completed'));
        nextTeamLabel.text('Next Team: ' + (nextTeam || 'None'));

        // Check if it's my turn
        isMyTurn = currentTeam === teamName;

        // Update athlete table
        updateAthleteTable();

        // Update your team roster
        teamRoster = allTeamRosters[teamName] || [];
        updateRosterTable();

        // Update all team rosters at the top
        updateAllTeamRosters();

        // If draft is over, show results
        if (!currentTeam) {
            socket.emit('get_draft_results');
        }
    });

    // Error Handling
    socket.on('error', function(data) {
        if (data.message === 'You are not part of the draft.') {
            alert('Your session has expired. Please re-enter your team name.');
            teamNameEntry.removeClass('hidden');
            waitingRoom.addClass('hidden');
            draftInterface.addClass('hidden');
            draftResults.addClass('hidden');
        } else {
            alert(data.message);
        }
    });

    // Draft Results
    socket.on('draft_results', function(data) {
        draftInterface.addClass('hidden');
        draftResults.removeClass('hidden');

        // Display all team rosters
        displayAllTeamRosters(data.team_rosters);

        // Display projected rankings
        displayProjectedRankings(data.projected_rankings);
    });

    // Search Athletes
    searchBar.on('input', function() {
        updateAthleteTable();
    });

    // Functions
    function updateAthleteTable() {
        var searchTerm = searchBar.val().toLowerCase();
        athleteTableBody.empty();
        availableAthletes.forEach(function(athlete) {
            if (athlete.Name.toLowerCase().includes(searchTerm) || athlete.Team.toLowerCase().includes(searchTerm)) {
                var row = $('<tr></tr>');
                row.append('<td>' + athlete.Rank + '</td>');
                row.append('<td>' + athlete.Name + '</td>');
                row.append('<td>' + athlete.Team + '</td>');
                row.append('<td>' + athlete.Trend + '</td>');
                if (isMyTurn) {
                    row.click(function() {
                        if (confirm('Select ' + athlete.Name + '?')) {
                            makePick(athlete.Name);
                        }
                    });
                }
                athleteTableBody.append(row);
            }
        });
    }

    function updateRosterTable() {
        rosterTableBody.empty();
        teamRoster.forEach(function(athlete) {
            rosterTableBody.append('<tr><td>' + athlete.Rank + '</td><td>' + athlete.Name + '</td><td>' + athlete.Team + '</td><td>' + athlete.Trend + '</td></tr>');
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
            roster.forEach(function(athlete) {
                tbody.append('<tr><td>' + athlete.Rank + '</td><td>' + athlete.Name + '</td><td>' + athlete.Team + '</td><td>' + athlete.Trend + '</td></tr>');
            });
            table.append(tbody);
            container.append('<h4>' + team + '</h4>');
            container.append(table);
        }
    }

    function makePick(athleteName) {
        if (isMyTurn) {
            socket.emit('make_pick', {'athlete_name': athleteName});
        }
    }

    function displayAllTeamRosters(teamRosters) {
        allTeamRostersDiv.empty();
        for (var team in teamRosters) {
            var roster = teamRosters[team];
            var table = $('<table></table>');
            table.append('<thead><tr><th>Rank</th><th>Name</th><th>Team</th><th>Trend</th></tr></thead>');
            var tbody = $('<tbody></tbody>');
            roster.forEach(function(athlete) {
                tbody.append('<tr><td>' + athlete.Rank + '</td><td>' + athlete.Name + '</td><td>' + athlete.Team + '</td><td>' + athlete.Trend + '</td></tr>');
            });
            table.append(tbody);
            allTeamRostersDiv.append('<h4>' + team + '</h4>');
            allTeamRostersDiv.append(table);
        }
    }

    function displayProjectedRankings(projectedRankings) {
        projectedRankingsTableBody.empty();
        projectedRankings.forEach(function(item) {
            projectedRankingsTableBody.append('<tr><td>' + item.team + '</td><td>' + item.points + '</td></tr>');
        });
    }
});
