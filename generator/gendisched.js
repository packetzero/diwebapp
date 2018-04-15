
const path = require('path');
const fs = require('fs');
const _ = require('underscore');

_.templateSettings.interpolate = /\{\{(.+?)\}\}/g;

const TOPDIR=path.resolve(__dirname, '..');
const OUTDIR=path.join(TOPDIR,"output");
const DATADIR=path.join(TOPDIR,"data");
const TEMPLATEDIR=path.join(TOPDIR,"style");

const TEMPLATEFILES = [ "header.html", "footer.html", "map.html", "teamdetail.html", "grouprow.html", "index.html", "groupheaderrow.html", "schools.html" ];

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

let gTemplates = {};
let gStringData = {};
let mapChallenges={};
let gMapRooms={};

let schoolList = [];
let schoolMap = {};
let gLog = "";

const EMOJI={ balance: "&#x2696;", page: "&#x1F4C4;", map: "&#x1F5FA;"};

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
    this.room = gMapRooms[this.roomAlias];

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

        log('Wrote output',group.path);


        // render a page for each team

        for (let j=0; j < group.rows.length; j++) {
            let team = group.rows[j];
            filename = path.join("teams", team.teamid + ".htm");
            filepath = path.join(parentDir,filename);

            let pageTitle = gStringData['TitlePrefixTeam'] + team.teamid;
            let s = renderHeaderTemplate(pageTitle);

            s += renderTeamDetails(team);

            s += renderFooterTemplate();

            fs.writeFileSync(filepath, s);

            log('Wrote output/',filename);
        }
    }

    generateChallengeIndex(challengeGroups, parentDir);

    generateSchoolPage(schoolList, parentDir);
}

function renderMap()
{
    let filename = path.join(OUTDIR, "map.html");

    // build a JSON array of room assignments
    let s = "'TEST':{x:0,y:0,level:'',label:'TEST'}";
    let numMissingCoords = 0;
    let i = -1;
    for (key in gMapRooms) {
      i++;
      let room = gMapRooms[key];
      if (!room.mapx || (room.mapx == '0' && room.mapy == '0')) { numMissingCoords++; }
      s += ",'" + room.id + "' : { x: " + room.mapx + ",y:" + room.mapy + ",level:'" + room.buildingLevel + "',label:'" + room.label + "' }\n";
    }

    gStringData['_rooms_'] = s;

    let htm = renderTemplate(gTemplates['map.html'], gStringData);

    if (numMissingCoords > 0) { log('WARN: ',numMissingCoords,' rooms missing map coordinates'); }

    log('wrote output/map.html');

    fs.writeFileSync(filename, htm);

}

function generateChallengeIndex(challengeGroups, parentDir)
{
    let filename = parentDir + "/index.htm";

    let pageTitle = gStringData['TitleMain'] + " " + gStringData['EventYear'];
    let s = renderHeaderTemplate(pageTitle);

    gStringData.challengeGroups = challengeGroups;

    s += renderTemplate(gTemplates['index.html'], gStringData);

    s += renderFooterTemplate();
    fs.writeFileSync(filename, s);

    log('Wrote to output/index.htm');
}

function sortByName(a, b) {
    return a.name.localeCompare(b.name);
}

function generateSchoolPage(schoolList, parentDir)
{
    let filename = parentDir + "/schools.htm";

    let pageTitle = gStringData['TitlePrefixMisc'] + 'Schools';
    let s = renderHeaderTemplate(pageTitle);

    gStringData.sortByName = sortByName;
    gStringData.schools = schoolList.sort(sortByName);
    s += renderTemplate(gTemplates['schools.html'], gStringData);
    s += renderFooterTemplate();
    fs.writeFileSync(filename, s);

    log('Wrote output/schools.htm - ',gStringData.schools.length,' entries');
}

function renderGroupHeader(group)
{
  gStringData.group = group;
  return renderTemplate(gTemplates['groupheaderrow.html'], gStringData);
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


function renderTeamId(teamid)
{
    return teamid.replace('-','_');
}

function renderGroupRow(row, event)
{
    if (!row.level) {
        console.log("ERROR: level is not set", row);
        process.exit(4);
    }
    gStringData['row'] = row;
    return renderTemplate(gTemplates['grouprow.html'], gStringData);
}


function renderTeamDetails(row)
{
  gStringData['row'] = row;
  return renderTemplate(gTemplates['teamdetail.html'], gStringData);
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

function Group(challenge, panel, level, icon, challengeObj)
{
    this.rows = []
    this.challenge = challenge;
    this.challengeObj = challengeObj;
    this.panel = panel;
    this.level = level;
    this.icon = icon;
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
            group = new Group(row.challenge, row.panel, row.level, row.challengeObj.icon, row.challengeObj);
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
    gStringData.emoji = EMOJI;
    gStringData.levelNames = levelNames;


    return map;
}

function copyImages(fromdir, todir, force)
{
  let flags = (force ? 0 : fs.constants.COPYFILE_EXCL);

  if (!fs.existsSync(todir)) fs.mkdirSync(todir);


  let files = fs.readdirSync(fromdir);
  for (let i=0;i < files.length;i++) {
    let f = files[i];
    let from = path.join(fromdir, f);
    let to = path.join(todir,f);

    log('Copying ',f,' to output/images/');

    fs.copyFileSync(from, to);
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
        console.log("ERROR: unable to load template: " + path.join(TEMPLATEDIR,filename), ex);
        process.exit(3);
    }
  }
}
function log(s1,s2,s3)
{
  let styleClass = false;
  if (s1.indexOf('WARN') == 0 ) { styleClass = 'WARN'; }
  if (s1.indexOf('ERROR') == 0) { styleClass = 'ERROR'; }
  if (styleClass) {gLog += "<span class='" + styleClass + "'>"; }
  gLog += s1;
  if (s2) gLog += s2;
  if (s3) gLog += s3;
  if (styleClass) {gLog += "</span>"; }
  gLog += "\n";
}

function generate()
{
  gLog = '';
  // create output dir

  if (!fs.existsSync(OUTDIR)) {
    log('Creating output directory');
    fs.mkdirSync(OUTDIR);
  }

  // copy images to output/images
  copyImages(path.join(TOPDIR,'images'), path.join(OUTDIR,"images"), true);

  // load general strings like region, event date, title prefixes

  gStringData = JSON.parse(fs.readFileSync(path.join(DATADIR,"strings.json"), 'utf8'));
  log('loaded strings.json - ',Object.keys(gStringData).length, ' entries.');

  // load HTML templates

  loadHtmlTemplates();

  // load CSV files

  mapChallenges = loadChallenges(path.join(DATADIR,'challenges.csv'));
  log('loaded challenges.csv - ',Object.keys(mapChallenges).length, ' rows.');

  gMapRooms = loadRoomAssignments(path.join(DATADIR,'room_assignments.csv'));
  log('loaded room_assignments.csv - ',Object.keys(gMapRooms).length, ' rows.');

  schedRows = loadSchedule(path.join(DATADIR,'schedfinal.csv'));
  log('loaded schedfinal.csv - ',schedRows.length, ' rows.');

  // render static HTML files

  let filter = {challenge:null, panel:null, team:null, school: null};

  filterAndRender(schedRows, filter);

  renderMap();

  return gLog;
}

module.exports = {
  generate : generate
};

if (require.main === module) {
  // =======================================================
  // Execution starts here
  // =======================================================

  generate();
  process.exit(0);
}
