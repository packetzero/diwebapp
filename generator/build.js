
const path = require('path');
const fs = require('fs');
const _ = require('underscore');
_.templateSettings.interpolate = /\{\{(.+?)\}\}/g;

const TOPDIR=path.resolve(__dirname, '..');
const OUTDIR=path.join(TOPDIR,"output");
const DATADIR=path.join(TOPDIR,"data");
const TEMPLATEDIR=path.join(TOPDIR,"style");

const TEMPLATEFILES = [ "header.html", "footer.html", "map.html" ];

let gTemplates = {};
let gStringData = {};
let mapChallenges={};
let mapRooms={};

let schoolList = [];
let schoolMap = {};


const emoBalance = "&#x2696;";
const emoHourglass = "&#x23F3;";
const emoAction = "&#x1F3AC;";
const emoLightbulb = "&#x1F4A1;";
const emoPage = "&#x1F4C4;";
const emoMap = "&#x1F5FA;";

// ref: http://stackoverflow.com/a/1293163/2343
// This will parse a delimited string into an array of
// arrays. The default delimiter is the comma, but this
// can be overriden in the second argument.
function CSVToArray( strData, strDelimiter ){
    // Check to see if the delimiter is defined. If not,
    // then default to comma.
    strDelimiter = (strDelimiter || ",");

    // Create a regular expression to parse the CSV values.
    let objPattern = new RegExp(
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
    let arrData = [[]];

    // Create an array to hold our individual pattern
    // matching groups.
    let arrMatches = null;


    // Keep looping over the regular expression matches
    // until we can no longer find a match.
    while (arrMatches = objPattern.exec( strData )){

        // Get the delimiter that was found.
        let strMatchedDelimiter = arrMatches[ 1 ];

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

        let strMatchedValue;

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
    let a = str.split(':');
    if (a.length < 2) return 0;
    let hour = parseInt(a[0]);
    let min = parseInt(a[1]);

    if (a[1].indexOf('PM') > 0 && hour < 12) {
        hour += 12;  // 1 -> 13
    }

    return hour * 100 + min;
}

const EVT_TEAM_CHALLENGE    = 1;
const EVT_INSTANT_CHALLENGE = 2;
const EVT_STRUCTURE_CHECKIN = 3;
const EVT_PERF_CHECKIN      = 4;


//ICRoom	Active	Competitive	Chall Letter	Lvl only	Level	School	Town	Membership Name	TCRoom	Manager	TeamNum	ICTime	TCTime	Challenge
function Team(cols)
{
    let i=0;

    if (cols.length < 6) {
        this.teamid = 0;
        return;
    }
    i++; // ICRoom

    let isActive = cols[i++]; // Active
    if (isActive.trim() !== 'A') { this.teamid=0; return; }

    i++; // competitive

    this.challengeid = cols[i++];
    this.level = cols[i++];
    let tmp = cols[i++].split('-');
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
    let tctimeRaw = cols[i++];
    this.tctime = GetSchedTime(EVT_TEAM_CHALLENGE, tctimeRaw, this);

    if (this.challengeid === 'X') {
        checkInDelta = 115;
        this.perfCheckingTime = GetSchedTimeInt(EVT_PERF_CHECKIN, this.tctime.timeVal - checkInDelta, this);
    } else {
        let checkInDelta = 20;
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
        this.tctime.loc = this.room.label;
        this.tctime.mapLink = "/map.html?loc=" + this.room.id;
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
    let timeVal = parseTime(timeStr);
    if (timeVal)
        return new SchedTime(eventType, timeStr, team, timeVal);
    return null;
}

function GetSchedTimeInt(eventType, timeVal, team)
{
    let timeStr= formatTime(timeVal);
    return new SchedTime(eventType, timeStr, team, timeVal);
}

function filterRow(row, filter)
{
    if (filter.challenge) {
        if (row.challenge.toLowerCase().indexOf(filter.challenge.toLowerCase()) < 0) return true;
    }
    if (filter.team) {
        let s = (row.teamid + ' ' + row.teamname).toLowerCase();
        if (s.indexOf(filter.team.toLowerCase()) < 0) return true;
    }
    if (filter.panel) {
        if (!row.panel || row.panel.toLowerCase() != filter.panel.toLowerCase()) return true;
    }
    return false;
}


let challengeGroups = [];

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
    let cidx = group.challengeObj.index;
    let levelIdx = levelIndexes[group.level];

    if (!challengeGroups[cidx]) {
        challengeGroups[cidx] = new ChallengeSection(group);
    }

    challengeGroups[cidx].levels[levelIdx] = new LevelLink(group);
}

function render(filter, groups)
{
    // ensure output directories created

    let parentDir = OUTDIR;
    if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir);

    let dir = path.join(OUTDIR, "tc");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);

    dir = path.join(OUTDIR, "teams");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);

    for (let i=0; i < groups.length; i++)
    {
        let group = groups[i];


        let filename = parentDir + group.path;

        addGroupLink(group);

        let pageTitle = gStringData['TitlePrefixMisc'] + group.name;
        let s = renderHeaderTemplate(pageTitle);

        s += renderGroup(group, filter);

        s += "<BR>";

        s += renderFooterTemplate();

        fs.writeFileSync(filename, s);

        // render a page for each team

        for (let j=0; j < group.rows.length; j++) {
            let team = group.rows[j];
            filename = path.join(parentDir,"teams", team.teamid + ".htm");

            let pageTitle = gStringData['TitlePrefixTeam'] + team.teamid;
            let s = renderHeaderTemplate(pageTitle);

            s += renderTeamDetails(team);

            s += renderFooterTemplate();

            fs.writeFileSync(filename, s);
        }
    }

    generateChallengeIndex(challengeGroups, parentDir);

    generateSchoolPage(schoolList, parentDir);
}

function renderMap()
{
    let filename = path.join(OUTDIR, "map.html");

    // build a JSON array of room assignments

    gStringData['_rooms_'] = "";

    let s = renderTemplate(gTemplates['map.html'], gStringData);

    fs.writeFileSync(filename, s);

}

function generateChallengeIndex(challengeGroups, parentDir)
{
    let filename = parentDir + "/index.htm";

    let pageTitle = gStringData['TitleMain'] + " " + gStringData['EventYear'];
    let s = renderHeaderTemplate(pageTitle);

    s += "<div style='text-align: center;font-weight:bold'>Welcome to the " + gStringData.EventYear + " " + gStringData.TournamentTitle + "</div>";

    s += "<div class='GroupHeader'>Schedule - By Challenge and Level</div>";

    for (let i=0;i < challengeGroups.length; i++) {
        let chal = challengeGroups[i];
        let iconurl = "/images/" + chal.icon;
        s += "<div style='clear:both'>";
        s += "<img border='0' style='height:4em;float:left' src='" + iconurl + "'>" ;

        s += "<div style='float:left'>";
        s += "<div class='Title'>" + chal.name ;
        if (chal.type != chal.name)
            s += "&nbsp; <div class='SubTitle'>" + chal.type +"</div>";
        s += "</div>";


        for (let j=0;j < 6;j++) {
            let level = chal.levels[j];
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
    s += renderFooterTemplate();
    fs.writeFileSync(filename, s);

}

function sortByName(a, b) {
    return a.name.localeCompare(b.name);
}

function generateSchoolPage(schoolList, parentDir)
{
    let filename = parentDir + "/schools.htm";

    let pageTitle = gStringData['TitlePrefixMisc'] + 'Schools';
    let s = renderHeaderTemplate(pageTitle);

    s += "<div class='GroupHeader'>List of Teams by School</div>";

    let schools = schoolList.sort(sortByName);

    for (let i=0;i < schools.length; i++) {
        let school = schools[i];
        let schoolName = school.name;
        if (school.name.trim() == '') schoolName = " (school name unknown) ";

        s += "<div style='clear:both'>";

        s += "<div class='Title'>" + schoolName ;
        s += "</div>";
        s += "<table border=0>";


        for (let level in school.levels) {
            let teams = school.levels[level];
            if (!teams) {
                continue;
            }
            teams = teams.sort(sortByName);

            for (let k=0; k < teams.length;k++)
            {
                let team = teams[k];
                let path = "/teams/" + team.teamid + ".htm";
                let name = team.name;
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
    s += renderFooterTemplate();
    fs.writeFileSync(filename, s);
}

function renderGroupHeader(group)
{
    let s = "<div class='GroupHeader'>" +
        "<img border='0' style='height:4em' src='" + group.iconurl + "'>" +
        group.challenge +
        (group.level ? (" - " + levelNames[group.level]) : "") +
        (group.panel ? (" &nbsp;" + group.panel) : "") +
        "</div>";

    return s;
}

let lastTime=0;
function formatTime(t)
{
    let ampm = (t >= 1200 ? "PM" : "AM");
    if (t >= 1300) t -= 1200;

    let mins = t % 100;
    if (mins >= 60) mins -= 40;
    let minStr = "" + mins;
    if (minStr.length === 1) minStr = "0" + mins;
    let timeStr = Math.floor(t / 100) + ":" + minStr;

    return timeStr + ampm;
}

const eventTypeAbbrev = ["?", "TC", "IC", "IN"];
const levelNames = {
    "EL":"Elem",
    "HS":"High School",
    "MS":"Middle",
    "RS":"Rising Stars",
    "UN": "Univ",
    'SL':'Secondary',
    'X':'High School'
};

const levelIndexes = {
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
    let levelName = levelNames[row.level];
    if (!levelName) {
        console.log("Level name lookup failed", row);
        return;
    }

    let s = "  <a href='/teams/" + row.teamid  + ".htm'><div class='SchedRow'>\n" +
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


function renderTeamDetails(row)
{
    let s ='';

    s +=    "        <div class='TeamHeader'>" + renderTeamId(row.teamid) + "\n" +
        "      " + row.teamname + " </div>\n" ;


    s += " <div class='SchedRow' style='padding-left:0.5em'>\n";

    let icRow = "";

    if (row.ictime) {
        icRow ="<tr><td><b>" + row.ictime.timeStr + "</b></td><td>Instant Chal CheckIn</td><td>" +
            "      <a class='Location' href='/map.html?loc=" + gStringData.icroomid + "'>&#x1F4CD;  " + gStringData.icroomname +  "</a></td></tr>\n" ;
    }

    let tcRows = "";
    if (row.structCheckinTime) {
        tcRows += "<tr><td><b>" + row.structCheckinTime.timeStr + "</b></td><td>Structure CheckIn</td><td>" +
            "      <a class='Location'  href='/map.html?loc=" + gStringData.sciroomid + "'>&#x1F4CD;  " + gStringData.sciroomname +  "</a></td></tr>\n" ;
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

    let iconurl = "/images/" + row.challengeObj.icon;

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

    let s = "<li class='card TeamRow'>";
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
    let times=[];

    // extract relevant event times
    for (let i=0;i < group.rows.length; i++) {
        addTimes(times, group.rows[i], filter.eventType);
    }

    times.sort(sortByEventTime);

    let s = renderGroupHeader(group);

    for (let i=0; i < times.length;i++) {
        let event = times[i];
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
    let s = chalName.replace(/[ ,]/g, "_");
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
    let groups={};
    for (let i=0;i < rows.length;i++) {
        let row = rows[i];
        let key = row.challenge;
        //if (row.panel) key += '|' + row.panel;
        if (row.level) key += '|' + row.level;
        let group = groups[key];
        if (group) {

        } else {
            let iconurl = "/images/" + row.challengeObj.icon;
            group = new Group(row.challenge, row.panel, row.level, iconurl, row.challengeObj);
            groups[key] = group;
        }
        group.rows.push(row);
    }

    // transform from map to array of groups
    let tmp=[];
    for (let g in groups) {
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
    let school = schoolMap[team.school];
    if (!school) {
        school = new School(team.school);
        schoolList.push(school);
        schoolMap[team.school] = school;
    }

    let levelIndex = team.level; //levelIndexes[team.level];
    if (!school.levels[levelIndex]) {
        school.levels[levelIndex] = [];
    }
    school.levels[levelIndex].push(new SchoolTeam(team.teamid, team.teamname, team.challenge));
}


function loadSchedule(filename) {
    let str = fs.readFileSync(filename).toString();

    let rows = CSVToArray(str, ',');
    //console.log(rows);

    // filter

    let result = [];
    for (let i = 0; i < rows.length; i++) {
        if (i === 0) continue; // skip header row
        if (rows[i].length < 10) continue; // skip empty rows

        let row = new Team(rows[i]);
        if (row.teamid == 0) continue;

        validateRow(row);

        result.push(row);

        addToSchoolList(row);
    }

    return result;
}

function filterAndRender(rows, filter)
{
    let filteredRows = [];

    for (let i = 0; i < rows.length; i++) {
        if (!filterRow(rows[i], filter)) {
            filteredRows.push(rows[i]);
        }
    }
    // organize

    let groups = splitIntoGroups(filteredRows);

    render(filter, groups);
}

function ChallengeRow(row)
{
    //A,Technical Challenge,Maze Craze,orange,di-icon-mazecraze.png
    let i = 0;
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
    let str = fs.readFileSync(filename).toString();

    let rows = CSVToArray(str, ',');
    //console.log(rows);

    // filter

    let map = {};

    let filteredRows=[];
    for (let i=0;i<rows.length;i++) {
        if (i === 0) continue; // skip header row. TODO: use header row
        if (!rows[i][0]) continue; // skip empty rows

        let obj = new ChallengeRow(rows[i]);
        map[obj.abbrev] = obj;
    }


    return map;
}

function RoomAssignment(row)
{
  //TempWorkingName,RoomID,ActualName,BuildingLevel,MapX,MapY,
  //IC Check In,L1_EASTPF,East Entrance Hallway,Level 1,0,0
  let i = 0;
  this.tempWorkingName = row[i++].trim();
  this.id = row[i++].trim();
  this.actualName = row[i++].trim();
  this.buildingLevel = row[i++].trim();
  this.mapx = row[i++].trim();
  this.mapy = row[i++].trim();

  this.label = this.actualName;
  if (this.buildingLevel.length > 0) this.label = this.actualName + " on " + this.buildingLevel;
  return this;
}

function loadRoomAssignments(filename)
{
    let str = fs.readFileSync(filename).toString();

    let rows = CSVToArray(str, ',');

    let map = {};

    let filteredRows = [];
    for (let i=0;i<rows.length;i++) {
      // TODO: use header row
        if (i === 0) continue; // skip header row
        if (!rows[i][0]) continue; // skip empty rows

        let room = new RoomAssignment(rows[i]);
        map[room.tempWorkingName] = room;

        //map[rows[i][0]] = rows[i][1].trim().toLowerCase();
    }

    let structureCheckinRoom = map['Structure Weigh In'];
    let icroom = map['IC Check In'];
    let rsciroom = map['Rising Stars Check In'];

    if (!structureCheckinRoom) {
      console.log("ERROR: no room assignment present for 'Structure Weigh In'");
      process.exit(4);
    }

    if (!icroom) {
      console.log("ERROR: no room assignment present for 'IC Check In'");
      process.exit(4);
    }

    if (!rsciroom) {
      console.log("ERROR: no room assignment present for 'Rising Stars Check In'");
      process.exit(4);
    }

    gStringData.sciroomid = structureCheckinRoom.id;
    gStringData.sciroomname = structureCheckinRoom.label;
    gStringData.icroomid = icroom.id;
    gStringData.icroomname = icroom.label;
    gStringData.rsciroomid = rsciroom.id;
    gStringData.rsciroomname = rsciroom.label;

    return map;
}

function copyImages(fromdir, todir, force)
{
  let flags = (force ? 0 : fs.constants.COPYFILE_EXCL);

  if (!fs.existsSync(todir)) fs.mkdirSync(todir);


  let files = fs.readdirSync(fromdir);
  for (let i=0;i < files.length;i++) {
    let f = files[i];
    fs.copyFileSync(path.join(fromdir, f), path.join(todir,f));
  }
}

function renderTemplate(compiledTemplate, data)
{
  return compiledTemplate(data);
}

function renderHeaderTemplate(pageTitle)
{
  gStringData.title = pageTitle;
  let s = renderTemplate(gTemplates['header.html'], gStringData);
  return s;
}

function renderFooterTemplate()
{
  let s = renderTemplate(gTemplates['footer.html'], gStringData);
  return s;
}

function loadHtmlTemplates()
{
  for (let i = 0; i < TEMPLATEFILES.length; i++) {
    let filename = TEMPLATEFILES[i];
    try {
        let templateString = fs.readFileSync(path.join(TEMPLATEDIR,filename),'utf8').toString();
        gTemplates[filename] = _.template(templateString);
    } catch (ex) {
        console.log("ERROR: unable to load template: " + path.join(TEMPLATEDIR,filename));
        process.exit(3);
    }
  }
}

// =======================================================
// Execution starts here
// =======================================================

// create output dir

if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR);

// copy images to output/images

copyImages(path.join(TOPDIR,'images'), path.join(OUTDIR,"images"), true);

// load general strings like region, event date, title prefixes

gStringData = JSON.parse(fs.readFileSync(path.join(DATADIR,"strings.json"), 'utf8'));

// load HTML templates

loadHtmlTemplates();

// load CSV files

mapChallenges = loadChallenges(path.join(DATADIR,'challenges.csv'));

mapRooms = loadRoomAssignments(path.join(DATADIR,'room_assignments.csv'));

schedRows = loadSchedule(path.join(DATADIR,'schedfinal.csv'));

// render static HTML files

let filter = {challenge:null, panel:null, team:null, school: null};

filterAndRender(schedRows, filter);

renderMap();

process.exit(0);
