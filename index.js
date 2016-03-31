"use strict";

const google = require('googleapis');
const OAuth2 = google.auth.OAuth2;

const clientJson = require('./client_id.json').installed;

const CLIENT_ID = clientJson.client_id;
const CLIENT_SECRET = clientJson.client_secret;
const REDIRECT_URL = clientJson.redirect_uris[0];

const oauth2Client = new OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);
google.options({ auth: oauth2Client });

const code = '';
const creds = {
  access_token: '',
  refresh_token: '',
};

if (typeof(code) === 'undefined' || !code) {
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.readonly',
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes
  });

  console.log(url);
} else {
  if (creds.access_token && creds.refresh_token) {
    oauth2Client.setCredentials({
      access_token: creds.access_token,
      refresh_token: creds.refresh_token,
    });
    afterLogin();
  } else {
    oauth2Client.getToken(code, function(err, tokens) {
      // Now tokens contains an access_token and an optional refresh_token. Save them.
      if (err) {
        console.log(err);
      } else {
        oauth2Client.setCredentials(tokens);
        console.log(tokens);
        afterLogin();
      }
    });
  }
}

function afterLogin() {
  const calendar = google.calendar('v3');

}
