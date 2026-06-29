'use strict';
const config = require('./config');

function checkAuth(req) {
  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const colon   = decoded.indexOf(':');
  if (colon < 0) return false;
  const user = decoded.slice(0, colon);
  const pass = decoded.slice(colon + 1);
  return user === config.AUTH_USER && pass === config.AUTH_PASS;
}

module.exports = { checkAuth };
