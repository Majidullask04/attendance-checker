import pkg from 'pg';
const { Pool } = pkg;
import { randomUUID } from 'crypto';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

pool.connect()
  .then(() => console.log('PostgreSQL connected successfully'))
  .catch(err => console.error('DB open error:', err));

const db = {
  runAsync: async (sql, params = []) => {
    const result = await pool.query(sql, params);
    return { changes: result.rowCount };
  },
  getAsync: async (sql, params = []) => {
    const result = await pool.query(sql, params);
    return result.rows[0];
  },
  allAsync: async (sql, params = []) => {
    const result = await pool.query(sql, params);
    return result.rows;
  }
};

// ── Schema Initialization ───────────────────────────────────────────────────
const initDb = async () => {
  try {
    await db.runAsync(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      name TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin','user')) NOT NULL,
      department TEXT,
      avatar TEXT,
      device_id TEXT,
      is_approved INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await db.runAsync(`CREATE TABLE IF NOT EXISTS qr_tokens (
      id TEXT PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      location_id TEXT NOT NULL,
      location_name TEXT DEFAULT 'Main Warehouse',
      generated_by TEXT NOT NULL,
      generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1
    )`);

    await db.runAsync(`CREATE TABLE IF NOT EXISTS used_tokens (
      id SERIAL PRIMARY KEY,
      token TEXT NOT NULL,
      user_id TEXT NOT NULL,
      action_type TEXT DEFAULT 'check_in',
      used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await db.runAsync(`CREATE TABLE IF NOT EXISTS attendance_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      location_id TEXT NOT NULL,
      location_name TEXT,
      record_type TEXT CHECK(record_type IN ('check_in','check_out','break_start','break_end')) NOT NULL,
      recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      device_timestamp TIMESTAMP,
      latitude REAL,
      longitude REAL,
      accuracy_meters REAL,
      device_id TEXT,
      verified_by TEXT DEFAULT 'qr_code',
      confidence_score INTEGER,
      status TEXT DEFAULT 'verified',
      qr_token TEXT,
      correction_reason TEXT,
      corrected_at TIMESTAMP,
      corrected_by TEXT,
      is_offline_sync INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Seed default active QR token if empty
    const countRow = await db.getAsync(`SELECT COUNT(*) as count FROM qr_tokens WHERE is_active = 1`);
    if (!countRow || parseInt(countRow.count) === 0) {
      const initialToken = `tok_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
      await db.runAsync(
        `INSERT INTO qr_tokens (id, token, location_id, location_name, generated_by, is_active) VALUES ($1, $2, $3, $4, $5, 1)`,
        [randomUUID(), initialToken, 'loc-001', 'Main HQ & Warehouse', 'system']
      );
      console.log('Seeded initial active QR token:', initialToken);
    }
  } catch (err) {
    console.error('Schema initialization error:', err);
  }
};

initDb();

// ── Periodic Cleanup: used_tokens older than 7 days ─────────────────────────
async function cleanupUsedTokens() {
  try {
    const result = await db.runAsync(`DELETE FROM used_tokens WHERE used_at < NOW() - INTERVAL '7 days'`);
    if (result.changes > 0) console.log(`Cleaned up ${result.changes} expired used_tokens rows`);
  } catch (err) {
    console.error('used_tokens cleanup error:', err);
  }
}
// Run cleanup on startup and every 24 hours
cleanupUsedTokens();
setInterval(cleanupUsedTokens, 24 * 60 * 60 * 1000);

// ── Performance indexes ──────────────────────────────────────────────────────
const initIndexes = async () => {
  try {
    await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_used_tokens_lookup ON used_tokens (token, user_id, action_type)`);
    await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_records_user_date ON attendance_records (user_id, recorded_at)`);
  } catch(err) {
    console.error('Error creating indexes', err);
  }
};
initIndexes();

export default db;
