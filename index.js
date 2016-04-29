"use strict";

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const google = require('googleapis');
const OAuth2 = google.auth.OAuth2;

var SCOPES = ['https://www.googleapis.com/auth/calendar'];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH ||
    process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'school-calendar.json';

let weekOffset = 0;
if (process.argv.length > 2) {
  console.log(process.argv[2]);
  try {
    weekOffset = Math.abs(parseInt(process.argv[2]));
  } catch (e) {
    console.error('Invalid number for week offset', e);
    console.error(e.stack);
    process.exit(1);
  }
}

// Load client secrets from a local file.
fs.readFile('client_secret.json', function processClientSecrets(err, content) {
  if (err) {
    console.log('Error loading client secret file: ' + err);
    return;
  }

  // Authorize a client with the loaded credentials, then call the
  // Google Calendar API.
  authorize(JSON.parse(content), makeEntry);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  const clientSecret = credentials.installed.client_secret;
  const clientId = credentials.installed.client_id;
  const redirectUrl = credentials.installed.redirect_uris[0];
  const oauth2Client = new OAuth2(clientId, clientSecret, redirectUrl);

  google.options({ auth: oauth2Client });

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, function(err, token) {
    if (err) {
      getNewToken(oauth2Client, callback);
    } else {
      oauth2Client.setCredentials(JSON.parse(token));
      callback(oauth2Client);
    }
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  });

  console.log('Authorize this app by visiting this url: ', authUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Enter the code from that page here: ', function(code) {
    rl.close();
    oauth2Client.getToken(code, function(err, token) {
      if (err) {
        console.log('Error while trying to retrieve access token', err);
        return;
      }
      oauth2Client.credentials = token;
      storeToken(token);
      callback(oauth2Client);
    });
  });
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
  try {
    fs.mkdirSync(TOKEN_DIR);
  } catch (err) {
    if (err.code != 'EEXIST') {
      throw err;
    }
  }

  fs.writeFile(TOKEN_PATH, JSON.stringify(token));
  console.log('Token stored to ' + TOKEN_PATH);
}

/**
 * Lists the next 10 events on the user's primary calendar.
 *
 * @param {string} timeMin ISO time string for minimum time.
 * @param {function} cb Callback for calendar entries.
 */
function listEvents(timeMin, timeMax) {
  const calendar = google.calendar('v3');

  return new Promise((resolve) => {
    calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin,
      timeMax: timeMax,
      singleEvents: true,
      orderBy: 'startTime'
    }, function(err, response) {
      if (err) {
        console.log('The API returned an error: ' + err);
        return;
      }

      var events = response.items;
      if (events.length == 0) {
        console.log('No upcoming events found.');
      }

      resolve(response.items);
    });
  });
}

function insertEvent(obj) {
  const calendar = google.calendar('v3');

  calendar.events.insert({
    calendarId: 'primary',
    resource: obj,
  }, function(err, event) {
    if (err) {
      console.log('There was an error contacting the Calendar service: ' + err);
      return;
    }
    console.log('Event created: %s', event.htmlLink);
  });
}

function createEventObject(summary, start, end) {
  return {
    'summary': summary,
    'start': {
      'dateTime': start,
      'timeZone': 'America/New_York',
    },
    'end': {
      'dateTime': end,
      'timeZone': 'America/New_York',
    },
  };
}

function processRegularClass(day, timezone, entry) {
  return createEventObject(entry[0], `${day}T${entry[1]}${timezone}`, `${day}T${entry[2]}${timezone}`);
}

function processElective(day, timezone, times, className) {
  return createEventObject(className, `${day}T${times[0]}${timezone}`, `${day}T${times[1]}${timezone}`);
}

function makeEntry() {
  const entries = require('./events.json');
  //const day = new Date().toISOString().split('T')[0];

  const sunday = new Date();
  sunday.setMilliseconds(0);
  sunday.setSeconds(0);
  sunday.setMinutes(0);
  sunday.setHours(0);
  sunday.setDate(sunday.getDate() - sunday.getDay() + (7 * weekOffset));
  const sundayEpoch = sunday.getTime();

  const dates = [ 1, 2, 3, 4, 5 ].map(x => {
    const d = new Date(sundayEpoch);
    d.setDate(d.getDate() + x);
    return d;
  });
  const dateStrings = dates.map(x => x.toISOString().split('T')[0]);

  const timezone = '-05:00';
  const numberRegex = /^DAY (\d)/;

  let potentialCalendarEvents = [];
  let electiveCalendarEvents = [];

  for (const entry of entries) {
    if (!Array.isArray(entry[0])) {
      for (const day of dateStrings) {
        potentialCalendarEvents.push(processRegularClass(day, timezone, entry));
      }
    } else {
      const times = entry[0];
      for (const className of entry[1]) {
        electiveCalendarEvents.push({ times, className });
      }
    }
  }

  const endTime = new Date(dates[dates.length - 1].getTime());
  endTime.setDate(endTime.getDate() + 1);

  listEvents(dates[0].toISOString(), endTime.toISOString()).then((items) => {
    const electiveEvents = items.filter(eev => numberRegex.test(eev.summary)).map(eev => {
      const parsed = numberRegex.exec(eev.summary);
      const dayNumber = parseInt(parsed[1]);
      const elective = electiveCalendarEvents[dayNumber - 1];

      return processElective(eev.start.date, timezone, elective.times, elective.className);
    });

    potentialCalendarEvents = potentialCalendarEvents.concat(electiveEvents);

    const filtered = potentialCalendarEvents.filter(ev => {
      const searchCalendar = (el) => el.summary === ev.summary && (new Date(el.start.dateTime)).getTime() === (new Date(ev.start.dateTime)).getTime();
      if (items.some(searchCalendar)) {
        return false;
      }
      return true;
    });

    console.log(filtered);
    filtered.forEach(x => insertEvent(x));
  });
}
