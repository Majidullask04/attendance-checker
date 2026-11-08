import pkg from 'pg';
const { Pool } = pkg;
import { randomUUID } from 'crypto';
import { isInvalidName, cleanUserName } from './utils/formatters.js';

const useDatabaseSsl = process.env.DATABASE_SSL === 'true';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useDatabaseSsl ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected database client error:', err.message);
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
      record_type TEXT CHECK(record_type IN ('check_in','check_out','break_start','break_end','ot_start','ot_end')) NOT NULL,
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

    // Phase 2: work mode + site reference on each punch (HQ / EPC site / On-Duty)
    // Phase 3 (Zoho 6-layer): full capture metadata on every punch
    try {
      const infoCols = await db.allAsync(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'attendance_records'`
      );
      const have = new Set((infoCols || []).map((c) => c.column_name));
      const addColumn = async (col, ddl) => {
        if (!have.has(col)) {
          await db.runAsync(`ALTER TABLE attendance_records ADD COLUMN ${ddl}`);
        }
      };
      await addColumn('work_mode', `work_mode TEXT`);
      await addColumn('site_ref', `site_ref TEXT`);
      await addColumn('site_code', `site_code TEXT`);
      await addColumn('capture_method', `capture_method TEXT`);
      await addColumn('ip_address', `ip_address TEXT`);
      await addColumn('gps_accuracy', `gps_accuracy REAL`);
      await addColumn('distance_meters', `distance_meters REAL`);
      await addColumn('geofence_status', `geofence_status TEXT`);
      await addColumn('arrival_status', `arrival_status TEXT`);
      await addColumn('device_info', `device_info TEXT`);
    } catch (colErr) {
      console.log('Work mode column check:', colErr.message);
    }

    // Layer 4: sites_geofences — geofence coordinates per MR. ELECTRICAL WORKS site
    await db.runAsync(`CREATE TABLE IF NOT EXISTS sites_geofences (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      radius_meters INTEGER NOT NULL DEFAULT 250,
      allowed_ips TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Layer 4: daily_attendance_summary — reconciled daily rollup per user/IST date
    await db.runAsync(`CREATE TABLE IF NOT EXISTS daily_attendance_summary (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      date_ist TEXT NOT NULL,
      first_check_in TIMESTAMP,
      last_check_out TIMESTAMP,
      gross_minutes INTEGER DEFAULT 0,
      break_minutes INTEGER DEFAULT 0,
      permission_minutes INTEGER DEFAULT 0,
      effective_minutes INTEGER DEFAULT 0,
      deviation_deficit_minutes INTEGER DEFAULT 0,
      overtime_minutes INTEGER DEFAULT 0,
      arrival_status TEXT,
      day_status TEXT,
      payable_days REAL DEFAULT 0,
      site_code TEXT,
      is_locked_for_payroll INTEGER DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    try {
      await db.runAsync(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_summary_user_date ON daily_attendance_summary (user_id, date_ist)`
      );
    } catch (idxErr) {
      console.log('daily_attendance_summary index check:', idxErr.message);
    }

    // Layer 5: workflow_requests — unified Regularization / Permission / On-Duty engine
    await db.runAsync(`CREATE TABLE IF NOT EXISTS workflow_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      date_ist TEXT NOT NULL,
      request_type TEXT NOT NULL CHECK(request_type IN ('REGULARIZATION','PERMISSION','ON_DUTY')),
      requested_check_in TEXT,
      requested_check_out TEXT,
      permission_minutes INTEGER,
      site_code TEXT,
      reason_category TEXT,
      reason_note TEXT,
      status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
      reviewed_by TEXT,
      reviewed_at TIMESTAMP,
      review_comment TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Immutable audit trail for workflow reviews (Regularization / Permission / OD)
    await db.runAsync(`CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_email TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      details TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Seed default geofence sites if empty (HQ workshop + sample EPC substation)
    const siteCount = await db.getAsync(`SELECT COUNT(*) as count FROM sites_geofences`);
    if (!siteCount || parseInt(siteCount.count) === 0) {
      const defaultSites = [
        ['site-mrew-hq-hyd', 'MREW-HQ-HYD', 'MR. ELECTRICAL WORKS — HQ Workshop (Hyderabad)', 17.385044, 78.486671, 250],
        ['site-mrew-sub-01', 'MREW-SUB-01', 'EPC Substation Site 01 — Gachibowli', 17.440081, 78.348915, 400],
        ['site-mrew-sub-02', 'MREW-SUB-02', 'EPC Substation Site 02 — Uppal', 17.400000, 78.560000, 400],
      ];
      for (const [id, code, name, lat, lng, radius] of defaultSites) {
        await db.runAsync(
          `INSERT INTO sites_geofences (id, code, name, lat, lng, radius_meters, is_active) VALUES ($1,$2,$3,$4,$5,$6,1)
           ON CONFLICT (code) DO NOTHING`,
          [id, code, name, lat, lng, radius]
        );
      }
      console.log('Seeded default sites_geofences (HQ + 2 EPC substations)');
    }

    // Phase 2: self-service regularization requests (Zoho-style missed-punch fixes)
    await db.runAsync(`CREATE TABLE IF NOT EXISTS regularization_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      request_date TEXT NOT NULL,
      check_in_time TEXT,
      check_out_time TEXT,
      reason_code TEXT NOT NULL,
      note TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      reviewed_by TEXT,
      reviewed_at TIMESTAMP,
      review_note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Auto-migrate record_type check constraint for existing PostgreSQL databases
    try {
      const constraints = await db.allAsync(`
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'attendance_records'::regclass 
          AND contype = 'c'
      `);
      for (const c of (constraints || [])) {
        if (c.conname.includes('record_type')) {
          await db.runAsync(`ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS "${c.conname}"`);
        }
      }
      await db.runAsync(`
        ALTER TABLE attendance_records 
        ADD CONSTRAINT attendance_records_record_type_check 
        CHECK (record_type IN ('check_in','check_out','break_start','break_end','ot_start','ot_end'))
      `);
      console.log('Auto-migrated attendance_records record_type check constraint (includes OT)');
    } catch (migErr) {
      // Non-fatal if table doesn't exist yet or already has new constraint
      console.log('Record type check constraint check:', migErr.message);
    }

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

// ── Sequential startup: tables → indexes → cleanup ──────────────────────────
async function startup() {
  await initDb(); // Wait for tables to exist first

  // Now create indexes (tables are guaranteed to exist)
  try {
    await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_used_tokens_lookup ON used_tokens (token, user_id, action_type)`);
    await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_records_user_date ON attendance_records (user_id, recorded_at)`);
    await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_regularization_status ON regularization_requests (status, request_date)`);
    console.log('Indexes created successfully');
  } catch (err) {
    console.error('Error creating indexes:', err.message);
  }

  // Now run cleanup (tables are guaranteed to exist)
  try {
    const result = await db.runAsync(`DELETE FROM used_tokens WHERE used_at < NOW() - INTERVAL '7 days'`);
    if (result.changes > 0) console.log(`Cleaned up ${result.changes} expired used_tokens rows`);
  } catch (err) {
    console.error('used_tokens cleanup error:', err.message);
  }

  // Auto-heal existing user names in DB (sanitize any usr_..., tok_..., emp-..., numeric IDs, or emails)
  try {
    const allUsers = await db.allAsync(`SELECT id, name, email FROM users`);
    let healedCount = 0;
    for (const u of (allUsers || [])) {
      if (isInvalidName(u.name)) {
        const cleaned = cleanUserName(u.name, u.email);
        await db.runAsync(`UPDATE users SET name = $1 WHERE id = $2`, [cleaned, u.id]);
        healedCount++;
      }
    }
    if (healedCount > 0) {
      console.log(`Auto-healed ${healedCount} user accounts with clean human names`);
    }
  } catch (healErr) {
    console.warn('Startup name auto-heal check error:', healErr.message);
  }
}

startup();

// ── Layer 4: Daily Attendance Summary Rollup ────────────────────────────────
// Recomputes the materialized daily_attendance_summary row for one user/date.
// Called after every accepted punch and every approved workflow request.
async function recomputeDailySummary(userId, dateString) {
  try {
    const { getDayBounds } = await import('./config/policy.js');
    const { computeDailyAttendanceSummary } = await import('./utils/validationEngine.js');
    const bounds = getDayBounds(dateString);
    const dateIST = bounds.dateString;

    const userRow = await db.getAsync(`SELECT id, name, email FROM users WHERE id = $1`, [userId]);
    if (!userRow) return null;

    const dayRecords = await db.allAsync(
      `SELECT * FROM attendance_records
       WHERE user_id = $1 AND recorded_at >= $2 AND recorded_at < $3
       ORDER BY recorded_at ASC`,
      [userId, bounds.from, bounds.to]
    );

    const approvedWorkflows = await db.allAsync(
      `SELECT * FROM workflow_requests
       WHERE user_id = $1 AND date_ist = $2 AND status = 'APPROVED'`,
      [userId, dateIST]
    );

    const summary = computeDailyAttendanceSummary(dayRecords, approvedWorkflows);

    // Rebuild strategy: delete + insert with ON CONFLICT guard so the UNIQUE
    // (user_id, date_ist) index stays authoritative and untouched rows keep working.
    await db.runAsync(`DELETE FROM daily_attendance_summary WHERE user_id = $1 AND date_ist = $2`, [userId, dateIST]);
    const summaryId = `das-${String(userId).slice(0, 12)}-${dateIST}`;
    await db.runAsync(
      `INSERT INTO daily_attendance_summary
       (id, user_id, date_ist, first_check_in, last_check_out, gross_minutes, break_minutes,
        permission_minutes, effective_minutes, deviation_deficit_minutes, overtime_minutes,
        arrival_status, day_status, payable_days, site_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (user_id, date_ist) DO NOTHING`,
      [
        summaryId,
        userId,
        dateIST,
        summary.firstCheckIn,
        summary.lastCheckOut,
        summary.grossMinutes,
        summary.breakMinutes,
        summary.permissionMinutes,
        summary.effectiveMinutes,
        summary.deviationDeficitMinutes,
        summary.overtimeMinutes,
        summary.arrivalStatus,
        summary.dayStatus,
        summary.payableDays,
        summary.siteCode,
      ]
    );
    return { ...summary, dateIST, userId };
  } catch (err) {
    console.error('recomputeDailySummary error:', err.message);
    return null;
  }
}

setInterval(async () => {
  try {
    const result = await db.runAsync(`DELETE FROM used_tokens WHERE used_at < NOW() - INTERVAL '7 days'`);
    if (result.changes > 0) console.log(`Cleaned up ${result.changes} expired used_tokens rows`);
  } catch (err) {
    console.error('Periodic cleanup error:', err.message);
  }
}, 24 * 60 * 60 * 1000);

export { recomputeDailySummary };
export default db;
