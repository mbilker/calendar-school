 "use strict";

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const google = require('googleapis');
const OAuth2 = google.auth.OAuth2;

const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH ||
    process.env.USERPROFILE) + '/.credentials/';
const TOKEN_PATH = TOKEN_DIR + 'school-calendar.json';

let weekOffset = 0;
if (process.argv.length > 2) {
  console.log(process.argv[2]);
  try {
    weekOffset = parseInt(process.argv[2]);
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
 * Gets the calendar named 'School'.
 *
 * @return {string} id calendarId for 'School' calendar.
 */
function getCalendarId() {
  // Override to use default calendar.
  return Promise.resolve('primary');

/*
  const calendar = google.calendar('v3');

  return new Promise((resolve, reject) => {
    calendar.calendarList.list({}, function(err, response) {
      if (err) {
        reject(err);
        return;
      } else if (response.items.length === 0) {
        reject(new Error('no calendars available'));
        return;
      }

      for (const item of response.items) {
        if (item.summary === 'School') {
          resolve(item.id);
          return;
        }
      }
    });
  });
*/
}

/**
 * Lists the next 10 events on the user's primary calendar.
 *
 * @param {string} timeMin ISO time string for minimum time.
 * @param {function} cb Callback for calendar entries.
 */
function listEvents(calendarId, timeMin, timeMax) {
  const calendar = google.calendar('v3');

  return new Promise((resolve, reject) => {
    calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime'
    }, function(err, response) {
      if (err) {
        console.log('The API returned an error: ' + err);
        reject(err);
        return;
      }

      const events = response.items;
      if (events.length == 0) {
        console.log('No upcoming events found.');
      }

      resolve(response.items);
    });
  });
}

function insertEvent(calendarId, resource) {
  const calendar = google.calendar('v3');

  calendar.events.insert({
    calendarId,
    resource,
  }, function(err, event) {
    if (err) {
      console.log('There was an error contacting the Calendar service: ' + err);
      return;
    }
    console.log('Event created: %s', event.htmlLink);
  });
}

function createEventObject(options) {
  return {
    'summary': options.summary,
    'location': options.location,
    'start': {
      'dateTime': options.start,
    },
    'end': {
      'dateTime': options.end,
    },
  };
}

/*
 * Helper functions to create the event objects that the Google Calendar API uses
 */
function processRegularClass(
  day,
  offset,
  [
    summary,
    location,
    [
      startHour,
      startMinute,
      startSeconds
    ],
    [
      endHour,
      endMinute,
      endSeconds
    ],
    specifiedDays
  ]
) {
  const days = specifiedDays || '12345';

  const startDate = new Date(day);
  startDate.setDate(startDate.getDate() + 1);
  startDate.setHours(startHour);
  startDate.setMinutes(startMinute);
  startDate.setSeconds(startSeconds);

  const endDate = new Date(day);
  endDate.setDate(endDate.getDate() + 1);
  endDate.setHours(endHour);
  endDate.setMinutes(endMinute);
  endDate.setSeconds(endSeconds);

  if (days.indexOf(offset.toString()) > -1) {
    return createEventObject({ summary, location, start: startDate.toISOString(), end: endDate.toISOString() });
  }
}

function makeEntry() {
  let calendarId = null;

  // Regex for matching calendar event descriptions
  //const isDaylightSavingsTime = true;
  //const timezoneOffset = isDaylightSavingsTime ? 4 : 5;
  const noSchoolRegex = /^NO SCHOOL/;

  // Load event templates
  const standardEntries = require('./events.json').map((entry) => {
    entry[2] = entry[2].split(':').map((x) => parseInt(x));
    entry[3] = entry[3].split(':').map((x) => parseInt(x));
    return entry;
  });

  // Find the Sunday for the current week,
  // Sunday's `getDate()` is 0, use it to find Monday - Friday
  const sunday = new Date();
  sunday.setMilliseconds(0);
  sunday.setSeconds(0);
  sunday.setMinutes(0);
  sunday.setHours(0);
  sunday.setDate(sunday.getDate() - sunday.getDay() + (7 * weekOffset));
  const sundayEpoch = sunday.getTime();

  // Generate the dates corresponding to Monday - Friday
  // using offsets from Sunday
  const offsets = [1, 2, 3, 4, 5];
  const dates = offsets.map(x => {
    const d = new Date(sundayEpoch);
    d.setDate(d.getDate() + x);
    return d;
  });
  const dateStrings = dates.map(x => x.toISOString().split('T')[0]);

  // Storage for potential events, filtered later if present already on calendar
  let potentialCalendarEvents = [];

  // Parse through template to generate the calendar events
  const addEvents = (day, offset, entries) => {
    for (const entry of entries) {
      potentialCalendarEvents.push(processRegularClass(day, offset, entry));
    }
  };

  // The end time to fetch from Google Calendar, only fetch to Friday
  const endTime = new Date(dates[dates.length - 1].getTime());
  endTime.setDate(endTime.getDate() + 1);

  // Get the target calendar from the list of calendars the account has access to.
  getCalendarId().then((id) => {
    calendarId = id;

    return listEvents(calendarId, dates[0].toISOString(), endTime.toISOString());
  }).then((items) => {
    const noSchoolEvents = items.filter(eev => noSchoolRegex.test(eev.summary))
      .map(eev => eev.start.date);

    dateStrings.forEach((day, i) => {
      if (noSchoolEvents.indexOf(day) === -1) {
        addEvents(day, offsets[i], standardEntries);
      }
    });

    const calendarEvents = potentialCalendarEvents.filter((el) => !!el).reduce((prev, next) => prev.concat(next), []);
    const filtered = calendarEvents.filter(ev => {
      const searchCalendar = (el) => (
        el.summary === ev.summary
        && new Date(el.start.dateTime).getTime() === new Date(ev.start.dateTime).getTime()
      );
      if (items.some(searchCalendar)) {
        return false;
      }
      return true;
    });

    console.log(filtered);
    filtered.forEach(x => insertEvent(calendarId, x));
  }).catch((err) => {
    console.error(err);
  });
}
