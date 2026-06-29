'use strict';
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

let _db = null;

function getDb() {
  if (_db) return _db;

  _db = new DatabaseSync(config.DB_PATH);

  _db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id         TEXT PRIMARY KEY,
      url        TEXT,
      status     TEXT DEFAULT 'queued',
      progress   TEXT,
      speed      TEXT,
      eta        TEXT,
      error      TEXT,
      cancelled  INTEGER DEFAULT 0,
      filename   TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS options (
      options_id TEXT,
      option_key TEXT,
      format_id  TEXT,
      PRIMARY KEY (options_id, option_key)
    );
  `);

  return _db;
}

module.exports = { getDb };
