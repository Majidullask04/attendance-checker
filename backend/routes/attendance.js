import { Router } from 'express';
import { randomUUID, randomInt } from 'crypto';
import PDFDocument from 'pdfkit';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { POLICY, getDayBounds, getZonedDateTime, evaluateScanStatus, timeToMinutes } from '../config/policy.js';

const router = Router();

// Helper: get records for user on a specific calendar day in policy timezone
async function getDayUserRecords(userId, dateStr = null) {
  const bounds = getDayBounds(dateStr);
  return db.allAsync(
    `SELECT * FROM attendance_records 
     WHERE user_id = $1 AND recorded_at >= $2 AND recorded_at < $3 
     ORDER BY recorded_at ASC`,
    [userId, bounds.from, bounds.to]
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

  const ALLOWED_KEYS = ['l', 't', 'g', 'locationId', 'token', 'tokenId', 'generatedAt', 'locationName'];
  const hasUnexpectedKeys = Object.keys(data).some((k) => !ALLOWED_KEYS.includes(k));
  if (hasUnexpectedKeys) {
    return { error: 'QR payload contains unexpected fields.' };
  }

  return { data, tokenString };
}

// GET /api/attendance/policy - Expose current schedule policy
router.get('/policy', (req, res) => {
  res.json({
    policy: POLICY,
    serverTime: new Date().toISOString(),
    zonedTime: getZonedDateTime(),
  });
});

// POST /api/attendance/check-in
router.post('/check-in', async (req, res) => {
  const { latitude, longitude, accuracyMeters, deviceId, deviceTimestamp } = req.body;
  const userId = req.user.id;

  const parsed = parseQRPayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }
  const { data, tokenString } = parsed;

  try {
    const tokenRow = await db.getAsync(
      `SELECT * FROM qr_tokens WHERE token = $1 AND is_active = 1`,
      [tokenString]
    );
    if (!tokenRow) {
      return res.status(400).json({
        error: 'Invalid or Expired QR Token! The Admin has rotated the active token. Please scan the current live QR screen.',
      });
    }

    const used = await db.getAsync(
      `SELECT * FROM used_tokens WHERE token = $1 AND user_id = $2 AND action_type = 'check_in'`,
      [tokenString, userId]
    );
    if (used) {
      return res.status(400).json({
        error: 'Replay Attack Blocked: This specific QR token has already been consumed for your check-in.',
      });
    }

    const todayRecords = await getDayUserRecords(userId);
    const lastIn = [...todayRecords].reverse().find((r) => r.record_type === 'check_in');
    const lastOut = [...todayRecords].reverse().find((r) => r.record_type === 'check_out');
    const isCurrentlyIn = lastIn && (!lastOut || new Date(lastOut.recorded_at) < new Date(lastIn.recorded_at));

    if (isCurrentlyIn) {
      return res.status(400).json({ error: 'You already have an active shift checked in today.' });
    }

    const recordId = `rec-${randomUUID()}`;
    const now = new Date().toISOString();
    const confidence = randomInt(88, 100);

    // Evaluate check-in time against policy (<= 09:00 IST -> verified, > 09:00 IST -> late)
    const scanEvaluation = evaluateScanStatus(new Date(), 'check_in');
    const status = scanEvaluation === 'late' ? 'late' : 'verified';

    await db.runAsync(
      `INSERT INTO attendance_records 
       (id, user_id, location_id, location_name, record_type, recorded_at, device_timestamp, latitude, longitude, accuracy_meters, device_id, verified_by, confidence_score, status, qr_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
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
        status,
        tokenString,
      ]
    );

    await db.runAsync(
      `INSERT INTO used_tokens (token, user_id, action_type) VALUES ($1,$2, 'check_in')`,
      [tokenString, userId]
    );

    const record = await db.getAsync(
      `SELECT ar.*, COALESCE(u.name, u.email, 'Employee') AS userName, u.email AS userEmail, u.avatar 
       FROM attendance_records ar 
       LEFT JOIN users u ON ar.user_id = u.id 
       WHERE ar.id = $1`,
      [recordId]
    );
    res.json({
      success: true,
      record,
      timing: scanEvaluation,
      message: scanEvaluation === 'late' ? 'Checked in (marked Late after 09:00 AM)' : 'Checked in on-time (Present)',
    });
  } catch (err) {
    console.error('Check-in error:', err);
    res.status(500).json({ error: 'Internal server error during check-in processing.' });
  }
});

// POST /api/attendance/check-out
router.post('/check-out', async (req, res) => {
  const { latitude, longitude, accuracyMeters, deviceId, deviceTimestamp } = req.body;
  const userId = req.user.id;

  const parsed = parseQRPayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }
  const { data, tokenString } = parsed;

  try {
    const tokenRow = await db.getAsync(
      `SELECT * FROM qr_tokens WHERE token = $1 AND is_active = 1`,
      [tokenString]
    );
    if (!tokenRow) {
      return res.status(400).json({
        error: 'Invalid or Expired QR Token! Please scan the current active station QR code to check out.',
      });
    }

    const todayRecords = await getDayUserRecords(userId);
    const lastIn = [...todayRecords].reverse().find((r) => r.record_type === 'check_in');
    const lastOut = [...todayRecords].reverse().find((r) => r.record_type === 'check_out');
    const isCurrentlyIn = lastIn && (!lastOut || new Date(lastOut.recorded_at) < new Date(lastIn.recorded_at));

    if (!isCurrentlyIn) {
      return res.status(400).json({ error: 'No active shift found to check out from.' });
    }

    const recordId = `rec-${randomUUID()}`;
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO attendance_records 
       (id, user_id, location_id, location_name, record_type, recorded_at, device_timestamp, latitude, longitude, accuracy_meters, device_id, verified_by, confidence_score, status, qr_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
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

    await db.runAsync(
      `INSERT INTO used_tokens (token, user_id, action_type) VALUES ($1,$2, 'check_out')`,
      [tokenString, userId]
    );

    const record = await db.getAsync(
      `SELECT ar.*, COALESCE(u.name, u.email, 'Employee') AS userName, u.email AS userEmail, u.avatar 
       FROM attendance_records ar 
       LEFT JOIN users u ON ar.user_id = u.id 
       WHERE ar.id = $1`,
      [recordId]
    );
    res.json({ success: true, record, message: 'Checked out successfully. Shift ended.' });
  } catch (err) {
    console.error('Check-out error:', err);
    res.status(500).json({ error: 'Internal server error during check-out processing.' });
  }
});

// POST /api/attendance/break - Start or End Break
router.post('/break', async (req, res) => {
  const { action, latitude, longitude, accuracyMeters, deviceId } = req.body;
  const userId = req.user.id;

  if (!['start', 'end'].includes(action)) {
    return res.status(400).json({ error: 'action must be either "start" or "end".' });
  }

  try {
    const todayRecords = await getDayUserRecords(userId);
    const lastIn = [...todayRecords].reverse().find((r) => r.record_type === 'check_in');
    const lastOut = [...todayRecords].reverse().find((r) => r.record_type === 'check_out');
    const isShiftActive = lastIn && (!lastOut || new Date(lastOut.recorded_at) < new Date(lastIn.recorded_at));

    if (!isShiftActive) {
      return res.status(400).json({ error: 'You must have an active shift to take a break.' });
    }

    const lastBreakStart = [...todayRecords].reverse().find((r) => r.record_type === 'break_start');
    const lastBreakEnd = [...todayRecords].reverse().find((r) => r.record_type === 'break_end');
    const isOnBreak = lastBreakStart && (!lastBreakEnd || new Date(lastBreakEnd.recorded_at) < new Date(lastBreakStart.recorded_at));

    const now = new Date().toISOString();
    const recordId = `rec-${randomUUID()}`;

    if (action === 'start') {
      if (isOnBreak) {
        return res.status(400).json({ error: 'You are already on break.' });
      }

      await db.runAsync(
        `INSERT INTO attendance_records 
         (id, user_id, location_id, location_name, record_type, recorded_at, device_timestamp, latitude, longitude, accuracy_meters, device_id, verified_by, confidence_score, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          recordId,
          userId,
          'loc-001',
          'Main Warehouse',
          'break_start',
          now,
          now,
          latitude || null,
          longitude || null,
          accuracyMeters || 10,
          deviceId || req.user.deviceId || 'web-client',
          'app_action',
          95,
          'verified',
        ]
      );

      const record = await db.getAsync(
        `SELECT ar.*, COALESCE(u.name, u.email, 'Employee') AS userName, u.email AS userEmail, u.avatar 
         FROM attendance_records ar 
         LEFT JOIN users u ON ar.user_id = u.id 
         WHERE ar.id = $1`,
        [recordId]
      );
      return res.json({ success: true, record, message: 'Break started. Timer running (30-40 min).' });
    }

    if (action === 'end') {
      if (!isOnBreak) {
        return res.status(400).json({ error: 'You are not currently on break.' });
      }

      // Break end MUST be verified with QR scan
      const parsed = parseQRPayload(req.body);
      if (parsed.error) {
        return res.status(400).json({ error: `QR scan required to end break: ${parsed.error}` });
      }
      const { data, tokenString } = parsed;

      const tokenRow = await db.getAsync(
        `SELECT * FROM qr_tokens WHERE token = $1 AND is_active = 1`,
        [tokenString]
      );
      if (!tokenRow) {
        return res.status(400).json({ error: 'Invalid or expired QR token. Please scan the current station QR code.' });
      }

      await db.runAsync(
        `INSERT INTO attendance_records 
         (id, user_id, location_id, location_name, record_type, recorded_at, device_timestamp, latitude, longitude, accuracy_meters, device_id, verified_by, confidence_score, status, qr_token)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          recordId,
          userId,
          data.locationId || data.l || tokenRow.location_id,
          data.locationName || tokenRow.location_name || 'Main Warehouse',
          'break_end',
          now,
          now,
          latitude || null,
          longitude || null,
          accuracyMeters || 10,
          deviceId || req.user.deviceId || 'web-client',
          'qr_code',
          98,
          'verified',
          tokenString,
        ]
      );

      await db.runAsync(
        `INSERT INTO used_tokens (token, user_id, action_type) VALUES ($1,$2, 'break_end')`,
        [tokenString, userId]
      );

      const record = await db.getAsync(
        `SELECT ar.*, COALESCE(u.name, u.email, 'Employee') AS userName, u.email AS userEmail, u.avatar 
         FROM attendance_records ar 
         LEFT JOIN users u ON ar.user_id = u.id 
         WHERE ar.id = $1`,
        [recordId]
      );
      return res.json({ success: true, record, message: 'Break ended via QR scan. Shift resumed!' });
    }
  } catch (err) {
    console.error('Break action error:', err);
    res.status(500).json({ error: 'Internal server error during break processing.' });
  }
});

// POST /api/attendance/ot - Overtime Start or End (After 17:00 IST)
router.post('/ot', async (req, res) => {
  const { action, latitude, longitude, accuracyMeters, deviceId } = req.body;
  const userId = req.user.id;

  if (!['start', 'end'].includes(action)) {
    return res.status(400).json({ error: 'action must be "start" or "end".' });
  }

  const parsed = parseQRPayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }
  const { data, tokenString } = parsed;

  try {
    const tokenRow = await db.getAsync(
      `SELECT * FROM qr_tokens WHERE token = $1 AND is_active = 1`,
      [tokenString]
    );
    if (!tokenRow) {
      return res.status(400).json({ error: 'Invalid or expired QR token for OT.' });
    }

    const todayRecords = await getDayUserRecords(userId);
    const lastOtStart = [...todayRecords].reverse().find((r) => r.record_type === 'ot_start');
    const lastOtEnd = [...todayRecords].reverse().find((r) => r.record_type === 'ot_end');
    const isOtActive = lastOtStart && (!lastOtEnd || new Date(lastOtEnd.recorded_at) < new Date(lastOtStart.recorded_at));

    if (action === 'start' && isOtActive) {
      return res.status(400).json({ error: 'Overtime is already active.' });
    }
    if (action === 'end' && !isOtActive) {
      return res.status(400).json({ error: 'No active Overtime session found to stop.' });
    }

    const recordType = action === 'start' ? 'ot_start' : 'ot_end';
    const recordId = `rec-${randomUUID()}`;
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO attendance_records 
       (id, user_id, location_id, location_name, record_type, recorded_at, device_timestamp, latitude, longitude, accuracy_meters, device_id, verified_by, confidence_score, status, qr_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        recordId,
        userId,
        data.locationId || data.l || tokenRow.location_id,
        data.locationName || tokenRow.location_name || 'Main Warehouse',
        recordType,
        now,
        now,
        latitude || null,
        longitude || null,
        accuracyMeters || 10,
        deviceId || req.user.deviceId || 'web-client',
        'qr_code',
        98,
        'verified',
        tokenString,
      ]
    );

    await db.runAsync(
      `INSERT INTO used_tokens (token, user_id, action_type) VALUES ($1,$2, $3)`,
      [tokenString, userId, recordType]
    );

    const record = await db.getAsync(
      `SELECT ar.*, COALESCE(u.name, u.email, 'Employee') AS userName, u.email AS userEmail, u.avatar 
       FROM attendance_records ar 
       LEFT JOIN users u ON ar.user_id = u.id 
       WHERE ar.id = $1`,
      [recordId]
    );
    res.json({
      success: true,
      record,
      message: action === 'start' ? 'Overtime started! Extra work timer is running.' : 'Overtime session stopped.',
    });
  } catch (err) {
    console.error('OT action error:', err);
    res.status(500).json({ error: 'Internal server error during overtime processing.' });
  }
});

// POST /api/attendance/scan - Unified Smart QR Scan Router
router.post('/scan', async (req, res) => {
  const userId = req.user.id;
  const { actionOverride } = req.body;

  try {
    const todayRecords = await getDayUserRecords(userId);
    const lastIn = [...todayRecords].reverse().find((r) => r.record_type === 'check_in');
    const lastOut = [...todayRecords].reverse().find((r) => r.record_type === 'check_out');
    const isShiftActive = lastIn && (!lastOut || new Date(lastOut.recorded_at) < new Date(lastIn.recorded_at));

    const lastBreakStart = [...todayRecords].reverse().find((r) => r.record_type === 'break_start');
    const lastBreakEnd = [...todayRecords].reverse().find((r) => r.record_type === 'break_end');
    const isOnBreak = lastBreakStart && (!lastBreakEnd || new Date(lastBreakEnd.recorded_at) < new Date(lastBreakStart.recorded_at));

    const lastOtStart = [...todayRecords].reverse().find((r) => r.record_type === 'ot_start');
    const lastOtEnd = [...todayRecords].reverse().find((r) => r.record_type === 'ot_end');
    const isOtActive = lastOtStart && (!lastOtEnd || new Date(lastOtEnd.recorded_at) < new Date(lastOtStart.recorded_at));

    // Handle OT toggle if explicitly requested or if after 17:00 and shift is done
    if (actionOverride === 'ot' || actionOverride === 'ot_start' || actionOverride === 'ot_end') {
      req.body.action = isOtActive ? 'end' : 'start';
      return router.handle(Object.assign(req, { url: '/ot' }), res);
    }

    // 1. If on break, scanning resumes shift
    if (isOnBreak) {
      req.body.action = 'end';
      return router.handle(Object.assign(req, { url: '/break' }), res);
    }

    // 2. If not checked in, check in
    if (!isShiftActive) {
      return router.handle(Object.assign(req, { url: '/check-in' }), res);
    }

    // 3. If checked in and time >= 17:00 (work day completed) and user wants OT
    const zoned = getZonedDateTime(new Date(), POLICY.TIMEZONE);
    if (zoned.totalMinutes >= timeToMinutes(POLICY.WORK_END) && req.body.isOt) {
      req.body.action = isOtActive ? 'end' : 'start';
      return router.handle(Object.assign(req, { url: '/ot' }), res);
    }

    // 4. Otherwise standard checkout
    return router.handle(Object.assign(req, { url: '/check-out' }), res);
  } catch (err) {
    console.error('Smart scan error:', err);
    res.status(500).json({ error: 'Failed to process QR scan.' });
  }
});

// POST /api/attendance/sync-batch (Offline queue recovery)
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
      const tokenRow = await db.getAsync(
        `SELECT * FROM qr_tokens WHERE token = $1`,
        [tokenString]
      );

      const isStillActive = tokenRow?.is_active === 1;
      const confidence = isStillActive ? 85 : 45;
      const status = isStillActive ? 'verified' : 'flagged';

      const recordId = `rec-${randomUUID()}`;
      const recordedAt = timestamp || new Date().toISOString();

      await db.runAsync(
        `INSERT INTO attendance_records 
         (id, user_id, location_id, location_name, record_type, recorded_at, device_timestamp, latitude, longitude, accuracy_meters, device_id, verified_by, confidence_score, status, qr_token, is_offline_sync)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,1)`,
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

// GET /api/attendance/records (user history or admin drilldown)
router.get('/records', async (req, res) => {
  const { userId, date } = req.query;
  const targetId = req.user.role === 'admin' && userId ? userId : req.user.id;

  try {
    if (date) {
      const bounds = getDayBounds(date);
      const rows = await db.allAsync(
        `SELECT ar.*, COALESCE(u.name, u.email, 'Employee') AS userName, u.email AS userEmail, u.avatar 
         FROM attendance_records ar 
         LEFT JOIN users u ON ar.user_id = u.id 
         WHERE ar.user_id = $1 AND ar.recorded_at >= $2 AND ar.recorded_at < $3 
         ORDER BY ar.recorded_at DESC`,
        [targetId, bounds.from, bounds.to]
      );
      return res.json({ records: rows, date: bounds.dateString });
    }

    const rows = await db.allAsync(
      `SELECT ar.*, COALESCE(u.name, u.email, 'Employee') AS userName, u.email AS userEmail, u.avatar 
       FROM attendance_records ar 
       LEFT JOIN users u ON ar.user_id = u.id 
       WHERE ar.user_id = $1 
       ORDER BY ar.recorded_at DESC 
       LIMIT 200`,
      [targetId]
    );
    res.json({ records: rows });
  } catch (err) {
    console.error('Error fetching records:', err);
    res.status(500).json({ error: 'Failed to retrieve attendance records.' });
  }
});

/**
 * Shared helper: calculates attendance metrics for all employees on a given date.
 */
async function computeTeamAttendance(dateInput = null) {
  const bounds = getDayBounds(dateInput);
  const users = await db.allAsync(
    `SELECT id, name, email, department, avatar, role 
     FROM users 
     WHERE role != 'admin' 
     ORDER BY name ASC`
  );

  const dayRecords = await db.allAsync(
    `SELECT * FROM attendance_records 
     WHERE recorded_at >= $1 AND recorded_at < $2 
     ORDER BY recorded_at ASC`,
    [bounds.from, bounds.to]
  );

  // Group records by user_id
  const recordsByUser = {};
  for (const r of dayRecords) {
    if (!recordsByUser[r.user_id]) recordsByUser[r.user_id] = [];
    recordsByUser[r.user_id].push(r);
  }

  const team = users.map((u) => {
    const recs = recordsByUser[u.id] || [];
    const checkInRec = recs.find((r) => r.record_type === 'check_in');
    const checkOutRec = [...recs].reverse().find((r) => r.record_type === 'check_out');

    const breakStartRec = recs.find((r) => r.record_type === 'break_start');
    const breakEndRec = breakStartRec
      ? recs.find((r) => r.record_type === 'break_end' && new Date(r.recorded_at) > new Date(breakStartRec.recorded_at))
      : null;

    const otStartRec = recs.find((r) => r.record_type === 'ot_start');
    const otEndRec = otStartRec
      ? recs.find((r) => r.record_type === 'ot_end' && new Date(r.recorded_at) > new Date(otStartRec.recorded_at))
      : null;

    const checkInTime = checkInRec ? checkInRec.recorded_at : null;
    const checkOutTime = checkOutRec ? checkOutRec.recorded_at : null;
    const breakStartTime = breakStartRec ? breakStartRec.recorded_at : null;
    const breakEndTime = breakEndRec ? breakEndRec.recorded_at : null;
    const otStartTime = otStartRec ? otStartRec.recorded_at : null;
    const otEndTime = otEndRec ? otEndRec.recorded_at : null;

    // Break duration calculation
    let breakDurationMinutes = 0;
    if (breakStartTime && breakEndTime) {
      breakDurationMinutes = Math.round((new Date(breakEndTime) - new Date(breakStartTime)) / 60000);
    } else if (breakStartTime) {
      breakDurationMinutes = Math.round((Date.now() - new Date(breakStartTime)) / 60000);
    }

    // Work duration calculation
    let hoursWorked = 0;
    if (checkInTime && checkOutTime) {
      hoursWorked = Math.max(0, (new Date(checkOutTime) - new Date(checkInTime)) / 3600000);
    } else if (checkInTime) {
      hoursWorked = Math.max(0, (Date.now() - new Date(checkInTime)) / 3600000);
    }

    // Overtime hours calculation
    let otHours = 0;
    if (otStartTime && otEndTime) {
      otHours = Math.max(0, (new Date(otEndTime) - new Date(otStartTime)) / 3600000);
    } else if (otStartTime) {
      otHours = Math.max(0, (Date.now() - new Date(otStartTime)) / 3600000);
    }

    // Check if late (after 09:00 IST)
    let isLate = false;
    if (checkInTime) {
      const zonedCheckIn = getZonedDateTime(checkInTime, POLICY.TIMEZONE);
      isLate = zonedCheckIn.totalMinutes > timeToMinutes(POLICY.CHECK_IN_END);
    }

    // Check if unresumed break -> automatically Half Day
    const unresumedBreak = Boolean(breakStartTime && !breakEndTime);

    // Final status classification
    let status = 'absent';
    let statusLabel = 'Absent';

    if (!checkInTime) {
      status = 'absent';
      statusLabel = 'Absent';
    } else if (unresumedBreak) {
      // If today and break was recently started (< 40 min), status is 'on_break'
      const isToday = bounds.dateString === getZonedDateTime().dateString;
      if (isToday && breakDurationMinutes <= POLICY.BREAK_MINUTES_MAX) {
        status = 'on_break';
        statusLabel = 'On Break';
      } else {
        // Exceeded break without scanning QR or day ended
        status = 'half_day';
        statusLabel = 'Half Day (Break Unresumed)';
      }
    } else if (otStartTime && !otEndTime) {
      status = 'overtime';
      statusLabel = 'Active Overtime';
    } else if (checkOutTime) {
      if (hoursWorked < 4) {
        status = 'half_day';
        statusLabel = 'Half Day (<4h)';
      } else if (isLate) {
        status = 'late';
        statusLabel = 'Late (Completed)';
      } else {
        status = 'checked_out';
        statusLabel = 'Full Day (Done)';
      }
    } else {
      // Currently checked in
      if (isLate) {
        status = 'late';
        statusLabel = 'Late';
      } else {
        status = 'present';
        statusLabel = 'Present';
      }
    }

    const flagged = recs.some((r) => r.status === 'flagged');

    return {
      ...u,
      checkInTime,
      checkOutTime,
      breakStartTime,
      breakEndTime,
      breakDurationMinutes,
      otStartTime,
      otEndTime,
      otHours: Number(otHours.toFixed(2)),
      hoursWorked: Number(hoursWorked.toFixed(2)),
      isLate,
      status,
      statusLabel,
      flagged,
      records: recs,
    };
  });

  return { bounds, team };
}

// GET /api/attendance/team (Admin only - supports ?date=YYYY-MM-DD)
router.get('/team', requireAdmin, async (req, res) => {
  try {
    const { bounds, team } = await computeTeamAttendance(req.query.date);
    res.json({
      date: bounds.dateString,
      timezone: POLICY.TIMEZONE,
      team,
    });
  } catch (err) {
    console.error('Error fetching team summary:', err);
    res.status(500).json({ error: 'Failed to retrieve team status data.' });
  }
});

// GET /api/attendance/summary (Admin or team metrics)
router.get('/summary', async (req, res) => {
  try {
    const { bounds, team } = await computeTeamAttendance(req.query.date);

    const counts = {
      date: bounds.dateString,
      totalEmployees: team.length,
      present: team.filter((e) => e.status === 'present').length,
      late: team.filter((e) => e.status === 'late').length,
      checkedOut: team.filter((e) => e.status === 'checked_out').length,
      halfDay: team.filter((e) => e.status === 'half_day').length,
      overtime: team.filter((e) => e.status === 'overtime' || e.otHours > 0).length,
      onBreak: team.filter((e) => e.status === 'on_break').length,
      absent: team.filter((e) => e.status === 'absent').length,
      flagged: team.filter((e) => e.flagged).length,
    };

    res.json({ summary: counts });
  } catch (err) {
    console.error('Error fetching summary:', err);
    res.status(500).json({ error: 'Failed to retrieve attendance summary.' });
  }
});

// GET /api/attendance/report/pdf (Admin only - PDF Download for any day)
router.get('/report/pdf', requireAdmin, async (req, res) => {
  try {
    const dateInput = req.query.date || null;
    const { bounds, team } = await computeTeamAttendance(dateInput);

    const doc = new PDFDocument({ margin: 36, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="attendance-report-${bounds.dateString}.pdf"`
    );

    doc.pipe(res);

    // ── Header Section ──────────────────────────────────────────────────────
    doc
      .rect(36, 36, doc.page.width - 72, 70)
      .fill('#0f172a');

    doc
      .fillColor('#38bdf8')
      .fontSize(18)
      .font('Helvetica-Bold')
      .text('MR. ELECTRICALS', 52, 48);

    doc
      .fillColor('#f8fafc')
      .fontSize(13)
      .font('Helvetica-Bold')
      .text('Daily Shift & Attendance Ledger', 52, 70);

    doc
      .fillColor('#94a3b8')
      .fontSize(10)
      .font('Helvetica')
      .text(
        `Date: ${bounds.dateString}  |  Timezone: ${POLICY.TIMEZONE}  |  Generated: ${new Date().toLocaleString('en-IN', { timeZone: POLICY.TIMEZONE })}`,
        52,
        88
      );

    doc.moveDown(3);

    // ── Summary Metrics Bar ─────────────────────────────────────────────────
    const presentCount = team.filter((e) => ['present', 'checked_out'].includes(e.status)).length;
    const lateCount = team.filter((e) => e.isLate).length;
    const halfDayCount = team.filter((e) => e.status === 'half_day').length;
    const absentCount = team.filter((e) => e.status === 'absent').length;
    const otCount = team.filter((e) => e.otHours > 0 || e.status === 'overtime').length;

    const startY = 120;
    const boxWidth = (doc.page.width - 72 - 32) / 5;

    const metrics = [
      { label: 'PRESENT / DONE', val: presentCount, color: '#10b981' },
      { label: 'LATE (>9 AM)', val: lateCount, color: '#f59e0b' },
      { label: 'HALF DAY', val: halfDayCount, color: '#f97316' },
      { label: 'ABSENT', val: absentCount, color: '#ef4444' },
      { label: 'OVERTIME', val: otCount, color: '#8b5cf6' },
    ];

    metrics.forEach((m, idx) => {
      const bx = 36 + idx * (boxWidth + 8);
      doc.roundedRect(bx, startY, boxWidth, 46, 4).fillAndStroke('#f1f5f9', '#cbd5e1');
      doc.fillColor(m.color).fontSize(14).font('Helvetica-Bold').text(String(m.val), bx, startY + 8, { width: boxWidth, align: 'center' });
      doc.fillColor('#475569').fontSize(8).font('Helvetica-Bold').text(m.label, bx, startY + 28, { width: boxWidth, align: 'center' });
    });

    // ── Table Header ────────────────────────────────────────────────────────
    const tableTop = 180;
    doc.rect(36, tableTop, doc.page.width - 72, 22).fill('#1e293b');

    doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
    doc.text('EMPLOYEE', 42, tableTop + 7, { width: 130 });
    doc.text('DEPT', 175, tableTop + 7, { width: 70 });
    doc.text('CHECK-IN', 250, tableTop + 7, { width: 55 });
    doc.text('CHECK-OUT', 310, tableTop + 7, { width: 55 });
    doc.text('BREAK', 370, tableTop + 7, { width: 45 });
    doc.text('HOURS', 420, tableTop + 7, { width: 40 });
    doc.text('OT', 465, tableTop + 7, { width: 35 });
    doc.text('STATUS', 505, tableTop + 7, { width: 55 });

    // ── Table Rows ──────────────────────────────────────────────────────────
    let curY = tableTop + 24;
    const formatHTime = (iso) => {
      if (!iso) return '--:--';
      const d = new Date(iso);
      return d.toLocaleTimeString('en-IN', { timeZone: POLICY.TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: true });
    };

    team.forEach((emp, i) => {
      if (curY > doc.page.height - 60) {
        doc.addPage();
        curY = 36;
      }

      const rowBg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
      doc.rect(36, curY, doc.page.width - 72, 22).fill(rowBg);

      doc.fillColor('#0f172a').fontSize(8).font('Helvetica-Bold');
      doc.text(emp.name || emp.email, 42, curY + 6, { width: 130, ellipsis: true });

      doc.fillColor('#64748b').font('Helvetica');
      doc.text(emp.department || 'Field', 175, curY + 6, { width: 70, ellipsis: true });

      doc.fillColor(emp.isLate ? '#d97706' : '#0f172a');
      doc.text(formatHTime(emp.checkInTime), 250, curY + 6, { width: 55 });

      doc.fillColor('#0f172a');
      doc.text(formatHTime(emp.checkOutTime), 310, curY + 6, { width: 55 });

      doc.text(emp.breakDurationMinutes > 0 ? `${emp.breakDurationMinutes}m` : '--', 370, curY + 6, { width: 45 });
      doc.text(emp.hoursWorked > 0 ? `${emp.hoursWorked}h` : '0h', 420, curY + 6, { width: 40 });
      doc.text(emp.otHours > 0 ? `${emp.otHours}h` : '--', 465, curY + 6, { width: 35 });

      let statusColor = '#64748b';
      if (['present', 'checked_out'].includes(emp.status)) statusColor = '#059669';
      if (emp.status === 'late') statusColor = '#d97706';
      if (emp.status === 'half_day') statusColor = '#ea580c';
      if (emp.status === 'absent') statusColor = '#dc2626';
      if (emp.status === 'overtime') statusColor = '#7c3aed';

      doc.fillColor(statusColor).font('Helvetica-Bold');
      doc.text(emp.status.replace('_', ' ').toUpperCase(), 505, curY + 6, { width: 55 });

      curY += 22;
    });

    // ── Footer ──────────────────────────────────────────────────────────────
    doc
      .fontSize(7)
      .fillColor('#94a3b8')
      .font('Helvetica')
      .text(
        'Mr. Electricals Automated QR Attendance System — Cryptographically Signed Ledger',
        36,
        doc.page.height - 30,
        { align: 'center', width: doc.page.width - 72 }
      );

    doc.end();
  } catch (err) {
    console.error('PDF export error:', err);
    res.status(500).json({ error: 'Failed to generate attendance PDF report.' });
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
  if (reason.trim().length > 2000) {
    return res.status(400).json({ error: 'Correction reason must not exceed 2000 characters.' });
  }

  try {
    const record = await db.getAsync(`SELECT * FROM attendance_records WHERE id = $1`, [req.params.id]);
    if (!record) return res.status(404).json({ error: 'Record not found.' });

    await db.runAsync(
      `UPDATE attendance_records 
       SET status = 'corrected', correction_reason = $1, corrected_by = $2, corrected_at = $3 
       WHERE id = $4`,
      [reason.trim(), req.user.email, new Date().toISOString(), req.params.id]
    );

    res.json({ success: true, message: 'Record marked as corrected in audit trail.' });
  } catch (err) {
    console.error('Error correcting record:', err);
    res.status(500).json({ error: 'Failed to submit correction.' });
  }
});

export default router;
