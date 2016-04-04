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
  const obj = createEventObject(entry[0], `${day}T${entry[1]}${timezone}`, `${day}T${entry[2]}${timezone}`);
  insertEvent(obj);
}

function processElective(day, timezone, times, className) {
  const obj = createEventObject(className, `${day}T${times[0]}${timezone}`, `${day}T${times[1]}${timezone}`);
  insertEvent(obj);
}

function makeEntry() {
  const entries = require('./events.json');
  //const day = new Date().toISOString().split('T')[0];;
  const day = '2016-04-04';
  const timezone = '-05:00';

  for (const entry of entries) {
    if (!Array.isArray(entry[0])) {
      processRegularClass(day, timezone, entry);
    } else {
      const times = entry[0];
      for (const className of entry[1]) {
        //processElective(day, timezone, times, className);
      }
    }
  }
}
