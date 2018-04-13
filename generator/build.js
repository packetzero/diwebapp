
var mapChallenges={};
var mapRooms={};

var schoolList = [];
var schoolMap = {};


var emoBalance = "&#x2696;";
var emoHourglass = "&#x23F3;";
var emoAction = "&#x1F3AC;";
var emoLightbulb = "&#x1F4A1;";
var emoPage = "&#x1F4C4;";
var emoMap = "&#x1F5FA;";

// ref: http://stackoverflow.com/a/1293163/2343
// This will parse a delimited string into an array of
// arrays. The default delimiter is the comma, but this
// can be overriden in the second argument.
function CSVToArray( strData, strDelimiter ){
    // Check to see if the delimiter is defined. If not,
    // then default to comma.
    strDelimiter = (strDelimiter || ",");

    // Create a regular expression to parse the CSV values.
    var objPattern = new RegExp(
        (
            // Delimiters.
            "(\\" + strDelimiter + "|\\r?\\n|\\r|^)" +

            // Quoted fields.
            "(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|" +

            // Standard fields.
            "([^\"\\" + strDelimiter + "\\r\\n]*))"
        ),
        "gi"
    );


    // Create an array to hold our data. Give the array
    // a default empty first row.
    var arrData = [[]];

    // Create an array to hold our individual pattern
    // matching groups.
    var arrMatches = null;


    // Keep looping over the regular expression matches
    // until we can no longer find a match.
    while (arrMatches = objPattern.exec( strData )){

        // Get the delimiter that was found.
        var strMatchedDelimiter = arrMatches[ 1 ];

        // Check to see if the given delimiter has a length
        // (is not the start of string) and if it matches
        // field delimiter. If id does not, then we know
        // that this delimiter is a row delimiter.
        if (
            strMatchedDelimiter.length &&
            strMatchedDelimiter !== strDelimiter
        ){

            // Since we have reached a new row of data,
            // add an empty row to our data array.
            arrData.push( [] );

        }

        var strMatchedValue;

        // Now that we have our delimiter out of the way,
        // let's check to see which kind of value we
        // captured (quoted or unquoted).
        if (arrMatches[ 2 ]){

            // We found a quoted value. When we capture
            // this value, unescape any double quotes.
            strMatchedValue = arrMatches[ 2 ].replace(
                new RegExp( "\"\"", "g" ),
                "\""
            );

        } else {

            // We found a non-quoted value.
            strMatchedValue = arrMatches[ 3 ];

        }


        // Now that we have our value string, let's add
        // it to the data array.
        arrData[ arrData.length - 1 ].push( strMatchedValue );
    }

    // Return the parsed data.
    return( arrData );
}


var fs = require('fs');

function sortByTCTime(a, b) {
    return a.tctime - b.tctime;
}

function sortByTCTimeDesc(a, b) {
    return b.tctime - a.tctime;
}

function sortByEventTime(a,b) { return a.timeVal - b.timeVal; }



function parseTime(str)
{
    if (str == 'undefined' || str == null) return 0;
    var a = str.split(':');
    if (a.length < 2) return 0;
    var hour = parseInt(a[0]);
    var min = parseInt(a[1]);

    if (a[1].indexOf('PM') > 0 && hour < 12) {
        hour += 12;  // 1 -> 13
    }

    return hour * 100 + min;
}

const EVT_TEAM_CHALLENGE    = 1;
const EVT_INSTANT_CHALLENGE = 2;
const EVT_STRUCTURE_CHECKIN = 3;
const EVT_PERF_CHECKIN      = 4;

// for roomid='ll_rm161', will return 'RM161 on Lower Level'
function getRoomLabel(roomid)
{
    var parts = roomid.split('_');
    if (parts.length != 2) return roomid;
    var levelName='';
    switch(parts[0].toLowerCase()) {
        case 'll': levelName = "Lower Level"; break;
        case 'ml': levelName = "Main Level"; break;
        default:
            return roomid;
    }
    return parts[1].toUpperCase() + " on " + levelName;
}

//ICRoom	Active	Competitive	Chall Letter	Lvl only	Level	School	Town	Membership Name	TCRoom	Manager	TeamNum	ICTime	TCTime	Challenge
function Team(cols)
{
    var i=0;

    if (cols.length < 6) {
        this.teamid = 0;
        return;
    }
    i++; // ICRoom

    var isActive = cols[i++]; // Active
    if (isActive.trim() !== 'A') { this.teamid=0; return; }

    i++; // competitive

    this.challengeid = cols[i++];
    this.level = cols[i++];
    var tmp = cols[i++].split('-');
    if (tmp.length > 1)
        this.panel = tmp[1];

    this.school = cols[i++].trim();
    this.district = cols[i++];
    this.teamname = cols[i++].trim();

    if (this.school.toLowerCase() === 'not shown') this.school = '';
    if (this.teamname.toLowerCase() === 'not shown') this.teamname = '';

    this.roomAlias = cols[i++];
    this.managers = cols[i++];

    this.teamid = cols[i++];

    this.ictime = GetSchedTime(EVT_INSTANT_CHALLENGE, cols[i++], this);
    var tctimeRaw = cols[i++];
    this.tctime = GetSchedTime(EVT_TEAM_CHALLENGE, tctimeRaw, this);

    if (this.challengeid === 'X') {
        checkInDelta = 115;
        this.perfCheckingTime = GetSchedTimeInt(EVT_PERF_CHECKIN, this.tctime.timeVal - checkInDelta, this);
    } else {
        var checkInDelta = 20;
        if (this.challengeid === 'R' || this.challengeid === 'RS') checkInDelta = 15;
        this.perfCheckingTime = GetSchedTimeInt(EVT_PERF_CHECKIN, this.tctime.timeVal - checkInDelta, this);
//        this.perfCheckingTime.timeVal -= checkInDelta;
    }

    if (this.challengeid === 'E') {
        this.structCheckinTime = GetSchedTimeInt(EVT_STRUCTURE_CHECKIN, this.tctime.timeVal - 100, this);
//        this.structCheckinTime.timeVal -= 100;
    }

    if (this.challengeid === '') {
        if (this.roomAlias.toUpperCase().indexOf("RISING") >= 0) { this.level = 'RS'; this.challengeid = 'R';}
    }

    // lookups

    this.challengeObj = mapChallenges[this.challengeid];
    this.room = mapRooms[this.roomAlias];

    //if (this.level == 'X') this.level = 'HS';

    // check

    if (this.challengeObj == null || this.challengeObj === 'undefined') {
        console.log("ERROR: unable to find challenge", cols);
    }

    if (this.room == null || this.room === 'undefined') {
        console.log("ERROR: unable to find room", cols);
    }

    if (!this.level) {
        if (this.challengeid === 'X') this.level = 'HS';
    }
    if (this.level === 'ML') this.level = 'MS';
    if (this.level === 'UL') this.level = 'UN';

    // set challenge name

    this.challenge = this.challengeObj.name;

    // sometimes teams don't have a name.  no error here, handle at render time

    if (this.tctime != null) {
        this.tctime.loc = getRoomLabel(this.room);
        this.tctime.mapLink = "/map.html?loc=" + this.room;
    }

    return this;

}

function SchedTime(eventType, timeStr, team, timeVal)
{
    this.eventType = eventType;
    this.team = team;
    this.timeStr = timeStr.replace(' ','');
    this.timeVal = timeVal;
    return this;
}

function GetSchedTime(eventType, timeStr, team)
{
    var timeVal = parseTime(timeStr);
    if (timeVal)
        return new SchedTime(eventType, timeStr, team, timeVal);
    return null;
}

function GetSchedTimeInt(eventType, timeVal, team)
{
    var timeStr= formatTime(timeVal);
    return new SchedTime(eventType, timeStr, team, timeVal);
}

function filterRow(row, filter)
{
    if (filter.challenge) {
        if (row.challenge.toLowerCase().indexOf(filter.challenge.toLowerCase()) < 0) return true;
    }
    if (filter.team) {
        var s = (row.teamid + ' ' + row.teamname).toLowerCase();
        if (s.indexOf(filter.team.toLowerCase()) < 0) return true;
    }
    if (filter.panel) {
        if (!row.panel || row.panel.toLowerCase() != filter.panel.toLowerCase()) return true;
    }
    return false;
}


var challengeGroups = [];

function ChallengeSection(group) {
    this.name = group.challengeObj.name;
    this.icon = group.challengeObj.icon;
    this.type = group.challengeObj.type;
    this.levels = [];
}

function LevelLink(group)
{
    this.name = levelNames[group.level];
    this.path = group.path;
    this.num = group.rows.length;
}

// The main page needs to be able to display
//   Challenge1 [level1] [level2]
//   Challenge2 [level1]
//   etc.
function addGroupLink(group)
{
    var cidx = group.challengeObj.index;
    var levelIdx = levelIndexes[group.level];

    if (!challengeGroups[cidx]) {
        challengeGroups[cidx] = new ChallengeSection(group);
    }

    challengeGroups[cidx].levels[levelIdx] = new LevelLink(group);
}

function render(filter, groups)
{
    var parentDir = "../webapp";

    var dir = parentDir + "/tc";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);

    dir = parentDir + "/teams";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);

    var headerStr = fs.readFileSync("header.html").toString();
    var footerStr = fs.readFileSync("footer.html").toString();

//    var teamDetailsFooterStr = "<div class=TeamDetailsFooter>Capital Region</div>";

    for (var i=0; i < groups.length; i++)
    {
        var group = groups[i];


        var filename = parentDir + group.path;

        addGroupLink(group);

        var s = headerStr.replace('_TITLE_','DI Region - ' + group.name);

        s += renderGroup(group, filter);

        s += "<BR>";

        s += footerStr;

        fs.writeFileSync(filename, s);

        // render a page for each team

        for (var j=0; j < group.rows.length; j++) {
            var team = group.rows[j];
            filename = parentDir + "/teams/" + team.teamid + ".htm";

            var s = headerStr.replace('_TITLE_','DI Team - ' + team.teamid);

            s += renderTeamDetails(team);

            s += footerStr;

            fs.writeFileSync(filename, s);
        }
    }

    generateChallengeIndex(challengeGroups, parentDir, headerStr, footerStr);

    generateSchoolPage(schoolList, parentDir, headerStr, footerStr);
}

function generateChallengeIndex(challengeGroups, parentDir, headerStr, footerStr)
{
    var filename = parentDir + "/index.htm";

    var s = headerStr.replace('_TITLE_','DI Region Tournament 2018');

    s += "<div style='text-align: center;font-weight:bold'>Welcome to the 2018 Capital Region Tournament</div>";

    s += "<div class='GroupHeader'>Schedule - By Challenge and Level</div>";

    for (var i=0;i < challengeGroups.length; i++) {
        var chal = challengeGroups[i];
        var iconurl = "/images/" + chal.icon;
        s += "<div style='clear:both'>";
        s += "<img border='0' style='height:4em;float:left' src='" + iconurl + "'>" ;

        s += "<div style='float:left'>";
        s += "<div class='Title'>" + chal.name ;
        if (chal.type != chal.name)
            s += "&nbsp; <div class='SubTitle'>" + chal.type +"</div>";
        s += "</div>";


        for (var j=0;j < 6;j++) {
            var level = chal.levels[j];
            if (level) {
                s += "<a class='ChalBtn' href='" + level.path + "'>" + level.name + " " +
                    "<div class='LevelCount'> (" + level.num + ")</div></a>";
            }
        }

        s += "</div>";

        s += "</div><BR>";

    }

    s += "<div class='GroupHeader'>Map</div>";

    s += "&nbsp;<a href='map.html' style='text-decoration:underline'>Click here to view the site map " + emoMap + "</a><BR>" +
        "&nbsp; (The team detail pages link to exact locations for check ins)<BR>" ;

    s += "<div class='GroupHeader'>School List</div>";

    s += "&nbsp;<a href='schools.htm' style='text-decoration:underline'>Click to view list of teams by school</a>";



    s += "<BR>";
    s += footerStr;
    fs.writeFileSync(filename, s);

}

function sortByName(a, b) {
    return a.name.localeCompare(b.name);
}

function generateSchoolPage(schoolList, parentDir, headerStr, footerStr)
{
    var filename = parentDir + "/schools.htm";

    var s = headerStr.replace('_TITLE_','DI Region - Schools');

    s += "<div class='GroupHeader'>List of Teams by School</div>";

    var schools = schoolList.sort(sortByName);

    for (var i=0;i < schools.length; i++) {
        var school = schools[i];
        var schoolName = school.name;
        if (school.name.trim() == '') schoolName = " (school name unknown) ";

        s += "<div style='clear:both'>";

        s += "<div class='Title'>" + schoolName ;
        s += "</div>";
        s += "<table border=0>";


        for (var level in school.levels) {
            var teams = school.levels[level];
            if (!teams) {
                continue;
            }
            teams = teams.sort(sortByName);

            for (var k=0; k < teams.length;k++)
            {
                var team = teams[k];
                var path = "/teams/" + team.teamid + ".htm";
                var name = team.name;
                if (name == '') {
                    name = team.teamid + " (" + team.challenge + ") ";
                }

                s += "<tr><td>" + levelNames[level] + "</td><td>"
                s += "<a class='ChalBtn' href='" + path + "'>" +  name + "</a></td></tr>";
            }

        }

        s += "</table>\n";
        s += "</div><BR>";

    }

    s += "<BR>";
    s += footerStr;
    fs.writeFileSync(filename, s);
}

function renderGroupHeader(group)
{
    var s = "<div class='GroupHeader'>" +
        "<img border='0' style='height:4em' src='" + group.iconurl + "'>" +
        group.challenge +
        (group.level ? (" - " + levelNames[group.level]) : "") +
        (group.panel ? (" &nbsp;" + group.panel) : "") +
        "</div>";

    return s;
}

var lastTime=0;
function formatTime(t)
{
    var ampm = (t >= 1200 ? "PM" : "AM");
    if (t >= 1300) t -= 1200;

    var mins = t % 100;
    if (mins >= 60) mins -= 40;
    var minStr = "" + mins;
    if (minStr.length === 1) minStr = "0" + mins;
    var timeStr = Math.floor(t / 100) + ":" + minStr;

    return timeStr + ampm;
}

var eventTypeAbbrev = ["?", "TC", "IC", "IN"];
var levelNames = {
    "EL":"Elem",
    "HS":"High School",
    "MS":"Middle",
    "RS":"Rising Stars",
    "UN": "Univ",
    'SL':'Secondary',
    'X':'High School'
};

var levelIndexes = {
    "RS":0,
    "EL":1,
    "MS":2,
    'SL':3,
    "HS":4,
    "UN": 5,
    'X':4
};


function renderTeamId(teamid)
{
    return teamid.replace('-','_');
}

function renderGroupRow(row, event)
{
    if (!row.level) {
        console.log("ERROR: level is not set", row);
        return;
    }
    var levelName = levelNames[row.level];
    if (!levelName) {
        console.log("Level name lookup failed", row);
        return;
    }

    var s = "  <a href='/teams/" + row.teamid  + ".htm'><div class='SchedRow'>\n" +
        (row.structCheckinTime ? ("    <div class='TimeStructure'>" + emoBalance + " " + row.structCheckinTime.timeStr + "</div>\n") : "") +
        "    <div class='TimePerfCheckin'> " + row.perfCheckingTime.timeStr + "</div>\n" +
        "    <div class='TimePerf'> " + row.tctime.timeStr + "</div>\n" +
        (row.ictime ? ("   <div class='TimeInstantChal'> IC:<b>" + row.ictime.timeStr + "</b></div> \n") : "") +
        "    <div class='Details'>\n" +
        "      <div class='Team'>" + row.teamname + " </div>\n" +
        "        <div class='TeamId'>" + renderTeamId(row.teamid) + "</div>\n" +
        "        <div class='School'>" + row.school + "</div>\n" +
        emoPage +
        //        "      <div class='ClickDetails'>(click for details...)</div>\n" +
        //        "      <a class='Location' href='" + event.mapLink + "'>&#x1F4CD;  " + event.loc +  "</a>\n" +
        "    </div>\n" +
        "  </div></a>\n";
    return s;
}

var rsmapLink="/map.html?loc=ll_hallway_157_161";
var rsloc="Hallway outside RM 157 on Lower Level";

var icmapLink="/map.html?loc=ll_stairwellrm119";
var icloc="Stairway next to RM 119 on Lower Level";

//ML_RM225
var structureCheckinMapLink="/map.html?loc=ml_rm225";
var structureLoc="RM 225 on Main Level";

function renderTeamDetails(row)
{
    var s ='';

    s +=    "        <div class='TeamHeader'>" + renderTeamId(row.teamid) + "\n" +
        "      " + row.teamname + " </div>\n" ;


    s += " <div class='SchedRow' style='padding-left:0.5em'>\n";

    var icRow = "";

    if (row.ictime) {
        icRow ="<tr><td><b>" + row.ictime.timeStr + "</b></td><td>Instant Chal CheckIn</td><td>" +
            "      <a class='Location' href='" + icmapLink + "'>&#x1F4CD;  " + icloc +  "</a></td></tr>\n" ;
    }

    var tcRows = "";
    if (row.structCheckinTime) {
        tcRows += "<tr><td><b>" + row.structCheckinTime.timeStr + "</b></td><td>Structure CheckIn</td><td>" +
            "      <a class='Location'  href='" + structureCheckinMapLink + "'>&#x1F4CD;  " + structureLoc +  "</a></td></tr>\n" ;
    }
    tcRows +=    "<tr><td><b> " + row.perfCheckingTime.timeStr + "</b></td><td>Performance CheckIn</td><td> " +
        "      <a class='Location'  href='" + row.tctime.mapLink + "'>&#x1F4CD;  " + row.tctime.loc +  "</a></td></tr>\n" +
        "<tr><td><b> " + row.tctime.timeStr + "</b></td><td>Performance</td><td>&nbsp;</td></tr>" ;

    s += "<table border='0'>";
    if (row.ictime && (row.ictime.timeVal < row.tctime.timeVal))
        s += icRow + tcRows;
    else
        s += tcRows + icRow;
    s += "</table>";
    s += "</div>"; // SchedRow

    s += "<div class='AfterTimeTable'>";

    var iconurl = "/images/" + row.challengeObj.icon;

    s += "        School: " + row.school + "<BR>\n"
    s += "        Managers: " + row.managers + "<BR>\n"
    s += "Challenge: " + row.challenge + " (" + row.challengeObj.type + " ) <BR>";
    s +=    "<img border='0'  src='" + iconurl + "'>" ;
    s += "</div>";


    return s;
}

function renderRowOld(row)
{
    renderRowTime(row.tctime);

    var s = "<li class='card TeamRow'>";
    s += "<div class='card-title'>" +  row.teamid + " " + row.teamname + "</div>";
    s += "<div class='card-subtitle'>" + row.school  + "</div>";
    s += "</li>\n";
    return s;
}

function addTimes(dest, team, eventType)
{
    if (eventType) {
        switch (eventType) {
            case EVT_TEAM_CHALLENGE: {
                if (team.tctime) dest.push(team.tctime);
                break;
            }
            case EVT_INSTANT_CHALLENGE: {
                if (team.ictime) dest.push(team.ictime);
                break;
            }
            case EVT_STRUCTURE_CHECKIN: {
                if (team.checkin) dest.push(team.checkin);
                break;
            }
            default:
                console.log("addTimes eventType unknown:" + eventType);
                break;
        }
    } else {
        // no filter, add all times
        if (team.tctime) dest.push(team.tctime);
//        if (team.ictime) dest.push(team.ictime);
//        if (team.checkin) dest.push(team.checkin);
    }
}

function renderGroup(group, filter)
{
    var times=[];

    // extract relevant event times
    for (var i=0;i < group.rows.length; i++) {
        addTimes(times, group.rows[i], filter.eventType);
    }

    times.sort(sortByEventTime);

    var s = renderGroupHeader(group);

    for (var i=0; i < times.length;i++) {
        var event = times[i];
        s += renderGroupRow(event.team, event);
    }
    return s;
}

function validateRow(row)
{
    // TODO: sanity check field values
}

function doEscape(chalName)
{
    var s = chalName.replace(/[ ,]/g, "_");
    s = s.replace(/[?<>!]/g,"");
    return s;
}

function Group(challenge, panel, level, iconurl, challengeObj)
{
    this.rows = []
    this.challenge = challenge;
    this.challengeObj = challengeObj;
    this.panel = panel;
    this.level = level;
    this.iconurl = iconurl;
    this.name = challenge + ' ' + level;
    this.path = "/tc/" + doEscape(challenge.toLowerCase()) + '_' + level.toLowerCase();
    if (panel) this.path += '_' + panel;
    this.path += ".htm";
    return this;
}

function splitIntoGroups(rows)
{
    var groups={};
    for (var i=0;i < rows.length;i++) {
        var row = rows[i];
        var key = row.challenge;
        //if (row.panel) key += '|' + row.panel;
        if (row.level) key += '|' + row.level;
        var group = groups[key];
        if (group) {

        } else {
            var iconurl = "/images/" + row.challengeObj.icon;
            group = new Group(row.challenge, row.panel, row.level, iconurl, row.challengeObj);
            groups[key] = group;
        }
        group.rows.push(row);
    }

    // transform from map to array of groups
    var tmp=[];
    for (var g in groups) {
        tmp.push (groups[g]);
    }
    return tmp;
}

function School(name)
{
    this.name = name;
    this.levels = {};
}

function SchoolTeam(teamid, name, challenge)
{
    this.teamid = teamid;
    this.name = name;
    this.challenge = challenge;
}

function addToSchoolList(team)
{
    var school = schoolMap[team.school];
    if (!school) {
        school = new School(team.school);
        schoolList.push(school);
        schoolMap[team.school] = school;
    }

    var levelIndex = team.level; //levelIndexes[team.level];
    if (!school.levels[levelIndex]) {
        school.levels[levelIndex] = [];
    }
    school.levels[levelIndex].push(new SchoolTeam(team.teamid, team.teamname, team.challenge));
}


function loadSchedule(filename) {
    var str = fs.readFileSync(filename).toString();

    var rows = CSVToArray(str, ',');
    //console.log(rows);

    // filter

    var result = [];
    for (var i = 0; i < rows.length; i++) {
        if (i === 0) continue; // skip header row
        if (rows[i].length < 10) continue; // skip empty rows

        var row = new Team(rows[i]);
        if (row.teamid == 0) continue;

        validateRow(row);

        result.push(row);

        addToSchoolList(row);
    }

    return result;
}

function filterAndRender(rows, filter)
{
    var filteredRows = [];

    for (var i = 0; i < rows.length; i++) {
        if (!filterRow(rows[i], filter)) {
            filteredRows.push(rows[i]);
        }
    }
    // organize

    var groups = splitIntoGroups(filteredRows);
    /*
    for (var i=0;i<groups.length;i++) {
        var group = groups[i];
        group.rows.sort(sortByTCTime);
    }*/

    render(filter, groups);
}

function ChallengeRow(row)
{
    //A,Technical Challenge,Maze Craze,orange,di-icon-mazecraze.png
    var i = 0;
    this.abbrev = row[i++];
    this.type = row[i++];
    this.name = row[i++];
    this.color = row[i++];
    this.icon = row[i++];
    this.index = parseInt(row[i++]);
    return this;
}

function loadChallenges(filename)
{
    var str = fs.readFileSync(filename).toString();

    var rows = CSVToArray(str, ',');
    //console.log(rows);

    // filter

    var map = {};

    var filteredRows=[];
    for (var i=0;i<rows.length;i++) {
//        if (i === 0) continue; // skip header row
        if (!rows[i][0]) continue; // skip empty rows

        var obj = new ChallengeRow(rows[i]);
        map[obj.abbrev] = obj;
    }


    return map;
}


function loadRoomAssignments(filename)
{
    var str = fs.readFileSync(filename).toString();

    var rows = CSVToArray(str, ',');
    //console.log(rows);

    // filter

    var map = {};

    var filteredRows=[];
    for (var i=0;i<rows.length;i++) {
        if (i === 0) continue; // skip header row
        if (!rows[i][0]) continue; // skip empty rows

        map[rows[i][0]] = rows[i][1].trim().toLowerCase();
    }


    return map;
}


mapChallenges = loadChallenges("../webapp/challenges.csv");
mapRooms = loadRoomAssignments("../webapp/rooms.csv");

schedRows = loadSchedule('../di18schedfinal.csv');

var filter = {challenge:null, panel:null, team:null, school: null};

filterAndRender(schedRows, filter);

process.exit(0);
