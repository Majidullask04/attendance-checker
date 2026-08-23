import sqlite3 from 'sqlite3';
import { randomUUID } from 'crypto';

const DB_PATH = './database.sqlite';

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('DB open error:', err);
  else console.log('SQLite connected successfully at', DB_PATH);
});

// Enable Write-Ahead Logging for concurrent read/write (fixes SQLITE_BUSY at rush hour)
db.run('PRAGMA journal_mode = WAL;');
db.run('PRAGMA busy_timeout = 5000;');

// Promisify helpers
db.runAsync = (sql, params = []) =>
  new Promise((res, rej) => {
    db.run(sql, params, function (err) {
      if (err) rej(err);
      else res({ id: this.lastID, changes: this.changes });
    });
  });

db.getAsync = (sql, params = []) =>
  new Promise((res, rej) => {
    db.get(sql, params, (err, row) => {
      if (err) rej(err);
      else res(row);
    });
  });

db.allAsync = (sql, params = []) =>
  new Promise((res, rej) => {
    db.all(sql, params, (err, rows) => {
      if (err) rej(err);
      else res(rows);
    });
  });

// ── Schema Initialization ───────────────────────────────────────────────────
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    name TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin','user')) NOT NULL,
    department TEXT,
    avatar TEXT,
    device_id TEXT,
    is_approved INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS qr_tokens (
    id TEXT PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    location_id TEXT NOT NULL,
    location_name TEXT DEFAULT 'Main Warehouse',
    generated_by TEXT NOT NULL,
    generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS used_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL,
    user_id TEXT NOT NULL,
    action_type TEXT DEFAULT 'check_in',
    used_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS attendance_records (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    location_id TEXT NOT NULL,
    location_name TEXT,
    record_type TEXT CHECK(record_type IN ('check_in','check_out','break_start','break_end')) NOT NULL,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    device_timestamp DATETIME,
    latitude REAL,
    longitude REAL,
    accuracy_meters REAL,
    device_id TEXT,
    verified_by TEXT DEFAULT 'qr_code',
    confidence_score INTEGER,
    status TEXT DEFAULT 'verified',
    qr_token TEXT,
    correction_reason TEXT,
    corrected_at DATETIME,
    corrected_by TEXT,
    is_offline_sync INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Seed default users if empty
  db.get(`SELECT COUNT(*) as count FROM users`, (err, row) => {
    if (err) {
      console.error('Error checking users count:', err);
      return;
    }
    if (!row || row.count === 0) {
      const users = [
        ['emp-001', 'mrelectricalworks02@gmail.com', null, 'Mr. Electrical Admin', 'admin', 'Management', '👑', 'dev-admin', 1],
        ['emp-002', 'arjun@mrelectric.com', null, 'Arjun Mehta', 'user', 'Electrical', '👷', 'dev-a1b2', 1],
        ['emp-003', 'priya@mrelectric.com', null, 'Priya Sharma', 'user', 'Electrical', '👩‍🔧', 'dev-c3d4', 1],
        ['emp-004', 'rahul@mrelectric.com', null, 'Rahul Singh', 'user', 'Plumbing', '🧑‍🔧', 'dev-e5f6', 1],
        ['emp-005', 'deepa@mrelectric.com', null, 'Deepa Nair', 'user', 'Electrical', '👩‍💼', 'dev-g7h8', 1],
        ['emp-006', 'vikram@mrelectric.com', null, 'Vikram Joshi', 'user', 'HVAC', '👨‍🔬', 'dev-i9j0', 1],
      ];
      const stmt = db.prepare(
        `INSERT INTO users (id, email, password_hash, name, role, department, avatar, device_id, is_approved) VALUES (?,?,?,?,?,?,?,?,?)`
      );
      users.forEach((u) => stmt.run(u));
      stmt.finalize();
      console.log('Seeded initial users including Admin (mrelectricalworks02@gmail.com)');
    }
  });

  // Seed default active QR token if empty
  db.get(`SELECT COUNT(*) as count FROM qr_tokens WHERE is_active = 1`, (err, row) => {
    if (err) return;
    if (!row || row.count === 0) {
      const initialToken = `tok_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
      db.run(
        `INSERT INTO qr_tokens (id, token, location_id, location_name, generated_by, is_active) VALUES (?, ?, ?, ?, ?, 1)`,
        [randomUUID(), initialToken, 'loc-001', 'Main HQ & Warehouse', 'emp-001']
      );
      console.log('Seeded initial active QR token:', initialToken);
    }
  });
});

// ── Periodic Cleanup: used_tokens older than 7 days ─────────────────────────
function cleanupUsedTokens() {
  db.run(
    `DELETE FROM used_tokens WHERE used_at < datetime('now', '-7 days')`,
    function (err) {
      if (err) console.error('used_tokens cleanup error:', err);
      else if (this.changes > 0) console.log(`Cleaned up ${this.changes} expired used_tokens rows`);
    }
  );
}
// Run cleanup on startup and every 24 hours
cleanupUsedTokens();
setInterval(cleanupUsedTokens, 24 * 60 * 60 * 1000);

// ── Performance indexes ──────────────────────────────────────────────────────
db.run(`CREATE INDEX IF NOT EXISTS idx_used_tokens_lookup ON used_tokens (token, user_id, action_type)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_records_user_date ON attendance_records (user_id, recorded_at)`);

export default db;
