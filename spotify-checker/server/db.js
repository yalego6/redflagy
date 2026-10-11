const path = require("path");
const Database = require("better-sqlite3");

const dbPath = path.join(__dirname, "..", "data.sqlite");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS artists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('red','orange','green')),
    reason TEXT DEFAULT '',
    category TEXT DEFAULT 'rien',
    gender TEXT DEFAULT 'inconnu',
    image_url TEXT,
    source_url TEXT,
    created_date TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    artists TEXT NOT NULL,       -- JSON array of artist names
    results TEXT NOT NULL,       -- JSON array of {artist_name,status,reason,...}
    red_count INTEGER DEFAULT 0,
    orange_count INTEGER DEFAULT 0,
    green_count INTEGER DEFAULT 0,
    created_date TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_artists_name ON artists (name COLLATE NOCASE);
`);

module.exports = db;
