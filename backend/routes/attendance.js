import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// Helper: get today's records for user
async function getTodayRecords(userId) {
  return db.allAsync(
    `SELECT * FROM attendance_records 
     WHERE user_id = ? AND date(recorded_at) = date('now') 
     ORDER BY recorded_at ASC`,
    [userId]
  );
}

// ── Input Validation Helpers ────────────────────────────────────────────────
function parseQRPayload(body) {
  const { qrPayload } = body;
  if (!qrPayload) {
    return { error: 'qrPayload is required.' };
  }

  let data;
  try {
    data = typeof qrPayload === 'string' ? JSON.parse(qrPayload) : qrPayload;
  } catch {
    return { error: 'Malformed QR payload format. Expected valid JSON.' };
  }

  if (typeof data !== 'object' || data === null) {
    return { error: 'QR payload must be a JSON object.' };
  }

  const tokenString = data?.token || data?.tokenId || data?.t;
  if (!tokenString || typeof tokenString !== 'string') {
    return { error: 'QR Code signature missing token ID.' };
  }

  return { data, tokenString };
}

// POST /api/attendance/check-in
router.post('/check-in', async (req, res) => {
  const { latitude, longitude, accuracyMeters, deviceId, deviceTimestamp } = req.body;
  const userId = req.user.id;

  // 1. Parse & validate QR payload
  const parsed = parseQRPayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }
  const { data, tokenString } = parsed;

  try {
    // 2. Validate token exists and is currently active
    const tokenRow = await db.getAsync(
      `SELECT * FROM qr_tokens WHERE token = ? AND is_active = 1`,
      [tokenString]
    );
    if (!tokenRow) {
      return res.status(400).json({
        error: 'Invalid or Expired QR Token! The Admin has rotated the active token. Please scan the current live QR screen.',
      });
    }

    // 3. Anti-Replay: Check token not already consumed by this user for check-in
    const used = await db.getAsync(
      `SELECT * FROM used_tokens WHERE token = ? AND user_id = ? AND action_type = 'check_in'`,
      [tokenString, userId]
    );
    if (used) {
      return res.status(400).json({
        error: 'Replay Attack Blocked: This specific QR token has already been consumed for your check-in.',
      });
    }

    // 4. Validate user is not already checked in
    const today = await getTodayRecords(userId);
    const lastIn = [...today].reverse().find((r) => r.record_type === 'check_in');
    const lastOut = [...today].reverse().find((r) => r.record_type === 'check_out');
    const isCurrentlyIn = lastIn && (!lastOut || new Date(lastOut.recorded_at) < new Date(lastIn.recorded_at));

    if (isCurrentlyIn) {
      return res.status(400).json({ error: 'You already have an active shift checked in.' });
    }

    // 5. Create immutable check-in record
    const recordId = `rec-${Date.now()}-${userId}-in`;
    const now = new Date().toISOString();
    const confidence = Math.floor(Math.random() * 15) + 85;

    await db.runAsync(
      `INSERT INTO attendance_records 
       (id, user_id, location_id, location_name, record_type, recorded_at, device_timestamp, latitude, longitude, accuracy_meters, device_id, verified_by, confidence_score, status, qr_token)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        recordId,
        userId,
        data.locationId || data.l || tokenRow.location_id,
        data.locationName || tokenRow.location_name || 'Main Warehouse',
        'check_in',
        now,
        deviceTimestamp || now,
        latitude || null,
        longitude || null,
        accuracyMeters || 10,
        deviceId || req.user.deviceId || 'web-client',
        'qr_code',
        confidence,
        confidence < 60 ? 'flagged' : 'verified',
        tokenString,
      ]
    );

    // 6. Mark token consumed for check-in
    await db.runAsync(
      `INSERT INTO used_tokens (token, user_id, action_type) VALUES (?,?, 'check_in')`,
      [tokenString, userId]
    );

    const record = await db.getAsync(`SELECT * FROM attendance_records WHERE id = ?`, [recordId]);
    res.json({ success: true, record });
  } catch (err) {
    console.error('Check-in error:', err);
    res.status(500).json({ error: 'Internal server error during check-in processing.' });
  }
});

// POST /api/attendance/check-out
router.post('/check-out', async (req, res) => {
  const { latitude, longitude, accuracyMeters, deviceId, deviceTimestamp } = req.body;
  const userId = req.user.id;

  // 1. Parse & validate QR payload
  const parsed = parseQRPayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }
  const { data, tokenString } = parsed;

  try {
    // 2. Validate token is live & active
    const tokenRow = await db.getAsync(
      `SELECT * FROM qr_tokens WHERE token = ? AND is_active = 1`,
      [tokenString]
    );
    if (!tokenRow) {
      return res.status(400).json({
        error: 'Invalid or Expired QR Token! Please scan the current active station QR code to check out.',
      });
    }

    // 3. Validate active shift exists
    const today = await getTodayRecords(userId);
    const lastIn = [...today].reverse().find((r) => r.record_type === 'check_in');
    const lastOut = [...today].reverse().find((r) => r.record_type === 'check_out');
    const isCurrentlyIn = lastIn && (!lastOut || new Date(lastOut.recorded_at) < new Date(lastIn.recorded_at));

    if (!isCurrentlyIn) {
      return res.status(400).json({ error: 'No active shift found to check out from.' });
    }

    // 4. Create check-out record
    const recordId = `rec-${Date.now()}-${userId}-out`;
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO attendance_records 
       (id, user_id, location_id, location_name, record_type, recorded_at, device_timestamp, latitude, longitude, accuracy_meters, device_id, verified_by, confidence_score, status, qr_token)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        recordId,
        userId,
        data.locationId || data.l || tokenRow.location_id,
        data.locationName || tokenRow.location_name || 'Main Warehouse',
        'check_out',
        now,
        deviceTimestamp || now,
        latitude || null,
        longitude || null,
        accuracyMeters || 10,
        deviceId || req.user.deviceId || 'web-client',
        'qr_code',
        95,
        'verified',
        tokenString,
      ]
    );

    // 5. Mark token consumed for check-out
    await db.runAsync(
      `INSERT INTO used_tokens (token, user_id, action_type) VALUES (?,?, 'check_out')`,
      [tokenString, userId]
    );

    const record = await db.getAsync(`SELECT * FROM attendance_records WHERE id = ?`, [recordId]);
    res.json({ success: true, record });
  } catch (err) {
    console.error('Check-out error:', err);
    res.status(500).json({ error: 'Internal server error during check-out processing.' });
  }
});

// POST /api/attendance/sync-batch (Offline queue recovery)
// Accepts an array of cached offline records and processes each one.
// If the QR token expired while offline, the record is stored as 'flagged' for admin review.
router.post('/sync-batch', async (req, res) => {
  const { records: offlineRecords } = req.body;
  const userId = req.user.id;

  if (!Array.isArray(offlineRecords) || offlineRecords.length === 0) {
    return res.status(400).json({ error: 'records array is required and must not be empty.' });
  }

  if (offlineRecords.length > 20) {
    return res.status(400).json({ error: 'Maximum 20 offline records per batch.' });
  }

  const results = [];

  for (const entry of offlineRecords) {
    const { type, qrPayload, timestamp, deviceId: offlineDeviceId, latitude, longitude } = entry;
    if (!type || !qrPayload) {
      results.push({ error: 'Missing type or qrPayload', entry });
      continue;
    }

    let data;
    try {
      data = typeof qrPayload === 'string' ? JSON.parse(qrPayload) : qrPayload;
    } catch {
      results.push({ error: 'Malformed qrPayload', entry });
      continue;
    }

    const tokenString = data?.token || data?.tokenId || data?.t;
    if (!tokenString) {
      results.push({ error: 'Missing token in qrPayload', entry });
      continue;
    }

    try {
      // Check if token was active at some point (even if now deactivated)
      const tokenRow = await db.getAsync(
        `SELECT * FROM qr_tokens WHERE token = ?`,
        [tokenString]
      );

      // Determine status: if token is still active → verified; if expired → flagged for review
      const isStillActive = tokenRow?.is_active === 1;
      const confidence = isStillActive ? 85 : 45;
      const status = isStillActive ? 'verified' : 'flagged';

      const recordId = `rec-${Date.now()}-${userId}-${type === 'check_in' ? 'in' : 'out'}-offline-${Math.random().toString(36).slice(2, 6)}`;
      const recordedAt = timestamp || new Date().toISOString();

      await db.runAsync(
        `INSERT INTO attendance_records 
         (id, user_id, location_id, location_name, record_type, recorded_at, device_timestamp, latitude, longitude, accuracy_meters, device_id, verified_by, confidence_score, status, qr_token, is_offline_sync)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
        [
          recordId,
          userId,
          data.locationId || data.l || tokenRow?.location_id || 'loc-001',
          tokenRow?.location_name || 'Unknown (Offline)',
          type,
          recordedAt,
          timestamp || recordedAt,
          latitude || null,
          longitude || null,
          10,
          offlineDeviceId || req.user.deviceId || 'web-client',
          'qr_code_offline',
          confidence,
          status,
          tokenString,
        ]
      );

      results.push({ success: true, recordId, status, type });
    } catch (err) {
      console.error('Offline sync error for entry:', err);
      results.push({ error: 'DB write failed', entry });
    }
  }

  res.json({ synced: results.filter((r) => r.success).length, total: offlineRecords.length, results });
});

// GET /api/attendance/records (user history or admin user drilldown)
router.get('/records', async (req, res) => {
  const { userId } = req.query;
  const targetId = req.user.role === 'admin' && userId ? userId : req.user.id;

  try {
    const rows = await db.allAsync(
      `SELECT * FROM attendance_records WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 200`,
      [targetId]
    );
    res.json({ records: rows });
  } catch (err) {
    console.error('Error fetching records:', err);
    res.status(500).json({ error: 'Failed to retrieve attendance records.' });
  }
});

// GET /api/attendance/team (Admin only)
router.get('/team', requireAdmin, async (req, res) => {
  try {
    const rows = await db.allAsync(`
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.department, 
        u.avatar, 
        u.role,
        (SELECT recorded_at FROM attendance_records WHERE user_id = u.id AND record_type = 'check_in' AND date(recorded_at) = date('now') ORDER BY recorded_at DESC LIMIT 1) as checkInTime,
        (SELECT recorded_at FROM attendance_records WHERE user_id = u.id AND record_type = 'check_out' AND date(recorded_at) = date('now') ORDER BY recorded_at DESC LIMIT 1) as checkOutTime,
        (SELECT COUNT(*) FROM attendance_records WHERE user_id = u.id AND status = 'flagged' AND date(recorded_at) = date('now')) as flaggedCount
      FROM users u
      WHERE u.role != 'admin'
    `);

    const result = rows.map((r) => {
      const isDone = Boolean(r.checkOutTime && (!r.checkInTime || new Date(r.checkOutTime) > new Date(r.checkInTime)));
      const isPresent = Boolean(r.checkInTime && (!r.checkOutTime || new Date(r.checkInTime) > new Date(r.checkOutTime)));

      let hoursWorked = 0;
      if (r.checkInTime && r.checkOutTime) {
        hoursWorked = Math.max(0, (new Date(r.checkOutTime) - new Date(r.checkInTime)) / 3600000);
      } else if (r.checkInTime) {
        hoursWorked = Math.max(0, (Date.now() - new Date(r.checkInTime)) / 3600000);
      }

      return {
        ...r,
        status: isDone ? 'checked_out' : isPresent ? 'present' : 'absent',
        hoursWorked,
        flagged: r.flaggedCount > 0,
      };
    });

    res.json({ team: result });
  } catch (err) {
    console.error('Error fetching team summary:', err);
    res.status(500).json({ error: 'Failed to retrieve team status data.' });
  }
});

// GET /api/attendance/audit (Admin only)
router.get('/audit', requireAdmin, async (req, res) => {
  try {
    const rows = await db.allAsync(`
      SELECT ar.*, u.name as userName, u.email as userEmail, u.avatar 
      FROM attendance_records ar
      LEFT JOIN users u ON ar.user_id = u.id
      ORDER BY ar.recorded_at DESC
      LIMIT 100
    `);
    res.json({ records: rows });
  } catch (err) {
    console.error('Error fetching audit log:', err);
    res.status(500).json({ error: 'Failed to retrieve audit ledger.' });
  }
});

// PATCH /api/attendance/correct/:id (Admin only)
router.patch('/correct/:id', requireAdmin, async (req, res) => {
  const { reason } = req.body;
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ error: 'A string justification reason is required for correction.' });
  }

  if (reason.trim().length < 10) {
    return res.status(400).json({ error: 'Correction reason must be at least 10 characters for audit compliance.' });
  }

  try {
    const record = await db.getAsync(`SELECT * FROM attendance_records WHERE id = ?`, [req.params.id]);
    if (!record) return res.status(404).json({ error: 'Record not found.' });

    await db.runAsync(
      `UPDATE attendance_records 
       SET status = 'corrected', correction_reason = ?, corrected_by = ?, corrected_at = ? 
       WHERE id = ?`,
      [reason.trim(), req.user.email, new Date().toISOString(), req.params.id]
    );

    res.json({ success: true, message: 'Record marked as corrected in audit trail.' });
  } catch (err) {
    console.error('Error correcting record:', err);
    res.status(500).json({ error: 'Failed to submit correction.' });
  }
});

export default router;
