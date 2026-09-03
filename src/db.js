const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'db.sqlite'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY,
    folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_prompts_folder_id ON prompts(folder_id);
`);

// Added after the tables above already shipped, so existing databases need
// this column bolted on rather than created fresh — CREATE TABLE IF NOT
// EXISTS above is a no-op on a database that already has these tables.
function ensureColumn(table, column, type) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
ensureColumn('folders', 'deleted_at', 'INTEGER');
ensureColumn('prompts', 'deleted_at', 'INTEGER');
// "Delete forever" from the recycle bin, and emptying it, don't actually
// remove the row - they just stamp purged_at. Nothing in the app or its API
// ever shows a purged_at row again, but the data survives in the SQLite
// file so it can still be pulled back with scripts/recover-purged.js if
// someone empties the bin by mistake.
ensureColumn('folders', 'purged_at', 'INTEGER');
ensureColumn('prompts', 'purged_at', 'INTEGER');

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_folders_deleted_at ON folders(deleted_at);
  CREATE INDEX IF NOT EXISTS idx_prompts_deleted_at ON prompts(deleted_at);
  CREATE INDEX IF NOT EXISTS idx_folders_purged_at ON folders(purged_at);
  CREATE INDEX IF NOT EXISTS idx_prompts_purged_at ON prompts(purged_at);
`);

module.exports = { db, DATA_DIR };
