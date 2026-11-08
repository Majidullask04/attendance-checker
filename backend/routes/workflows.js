// backend/routes/workflows.js
// Layer 5: Zoho People-style workflow & approval engine.
// Workflows: REGULARIZATION (missed/wrong punch fix), PERMISSION (1–2h short leave),
// ON_DUTY (client site / substation dispatch).
import { Router } from 'express';
import { randomUUID } from 'crypto';
import db, { recomputeDailySummary } from '../db.js';
import { requireAdmin, verifyToken } from '../middleware/auth.js';

const router = Router();

const REQUEST_TYPES = ['REGULARIZATION', 'PERMISSION', 'ON_DUTY'];
const REASON_CATEGORIES = [
  'MISSED_CHECK_IN',
  'MISSED_CHECK_OUT',
  'WRONG_PUNCH_TIME',
  'LATE_ARRIVAL_PASS',
  'EARLY_DEPARTURE_PASS',
  'CLIENT_SITE_VISIT',
  'SUBSTATION_DISPATCH',
  'VENDOR_INSPECTION',
  'OTHER',
];

// Helper: ISO timestamp for a HH:MM time on a given IST calendar day
function istDateTimeToISO(dateIST, timeHHMM) {
  if (!dateIST || !timeHHMM || !/^\d{2}:\d{2}$/.test(timeHHMM)) return null;
  const [y, m, d] = dateIST.split('-').map(Number);
  const [hh, mm] = timeHHMM.split(':').map(Number);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - 330 * 60000).toISOString();
}

// ── GET /api/workflows (employee: own; admin: all, ?status=&userId=) ─────────
router.get('/', verifyToken, async (req, res) => {
  try {
    const { status, userId } = req.query;
    const clauses = [];
    const params = [];

    if (req.user.role === 'admin' && userId) {
      clauses.push(`w.user_id = $${params.length + 1}`);
      params.push(userId);
    } else if (req.user.role !== 'admin' || req.query.mine === '1') {
      clauses.push(`w.user_id = $${params.length + 1}`);
      params.push(req.user.id);
    }

    if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      clauses.push(`w.status = $${params.length + 1}`);
      params.push(status);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await db.allAsync(
      `SELECT w.*, u.name AS user_name, u.email AS user_email, u.department, u.avatar
       FROM workflow_requests w
       LEFT JOIN users u ON w.user_id = u.id
       ${where}
       ORDER BY w.created_at DESC
       LIMIT 200`,
      params
    );

    res.json({
      requests: rows,
      counts: {
        pending: rows.filter((r) => r.status === 'PENDING').length,
        approved: rows.filter((r) => r.status === 'APPROVED').length,
        rejected: rows.filter((r) => r.status === 'REJECTED').length,
      },
    });
  } catch (err) {
    console.error('List workflows error:', err);
    res.status(500).json({ error: 'Failed to retrieve workflow requests.' });
  }
});

// ── GET /api/workflows/pending-count (badge counter for Sidebar/Dashboard) ───
router.get('/pending-count', verifyToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.json({ pending: 0 });
  }
  try {
    const row = await db.getAsync(
      `SELECT COUNT(*) as count FROM workflow_requests WHERE status = 'PENDING'`
    );
    res.json({ pending: parseInt(row?.count || 0) });
  } catch (err) {
    console.error('Pending count error:', err);
    res.status(500).json({ error: 'Failed to count pending workflow requests.' });
  }
});

// ── POST /api/workflows (submit REGULARIZATION / PERMISSION / ON_DUTY) ──────
router.post('/', verifyToken, async (req, res) => {
  const {
    requestType,
    request_type,
    dateIST,
    date_ist,
    requestedCheckIn,
    requested_check_in,
    requestedCheckOut,
    requested_check_out,
    permissionMinutes,
    permission_minutes,
    siteCode,
    site_code,
    reasonCategory,
    reason_category,
    reasonNote,
    reason_note,
  } = req.body;

  const type = (requestType || request_type || '').toUpperCase();
  const dateStr = dateIST || date_ist;
  const userId = req.user.id;

  if (!REQUEST_TYPES.includes(type)) {
    return res.status(400).json({ error: `requestType must be one of: ${REQUEST_TYPES.join(', ')}.` });
  }
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return res.status(400).json({ error: 'dateIST must be a valid YYYY-MM-DD calendar date (IST).' });
  }

  const category = reasonCategory || reason_category || (type === 'PERMISSION' ? 'LATE_ARRIVAL_PASS' : 'OTHER');
  if (!REASON_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `reasonCategory must be one of: ${REASON_CATEGORIES.join(', ')}.` });
  }

  const note = (reasonNote || reason_note || '').toString().trim();
  if (note.length > 2000) {
    return res.status(400).json({ error: 'reasonNote must not exceed 2000 characters.' });
  }

  const checkInISO = istDateTimeToISO(dateStr, requestedCheckIn || requested_check_in);
  const checkOutISO = istDateTimeToISO(dateStr, requestedCheckOut || requested_check_out);
  const minutes = Number(permissionMinutes ?? permission_minutes ?? 0);

  if (type === 'REGULARIZATION' && !checkInISO && !checkOutISO) {
    return res.status(400).json({
      error: 'Regularization requires requestedCheckIn and/or requestedCheckOut (HH:MM IST).',
    });
  }
  if (checkInISO && checkOutISO && checkOutISO <= checkInISO) {
    return res.status(400).json({ error: 'requestedCheckOut must be after requestedCheckIn.' });
  }
  if (type === 'PERMISSION') {
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 120) {
      return res.status(400).json({ error: 'PERMISSION requires permissionMinutes between 1 and 120 (short leave pass).' });
    }
  }

  try {
    // Block duplicate pending requests of the same type for the same user/date
    const dupe = await db.getAsync(
      `SELECT id FROM workflow_requests
       WHERE user_id = $1 AND date_ist = $2 AND request_type = $3 AND status = 'PENDING'`,
      [userId, dateStr, type]
    );
    if (dupe) {
      return res.status(409).json({
        error: `A pending ${type} request already exists for ${dateStr}. Await admin review before raising another.`,
      });
    }

    const id = `wf-${randomUUID()}`;
    await db.runAsync(
      `INSERT INTO workflow_requests
       (id, user_id, date_ist, request_type, requested_check_in, requested_check_out,
        permission_minutes, site_code, reason_category, reason_note, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING')`,
      [
        id,
        userId,
        dateStr,
        type,
        requestedCheckIn || requested_check_in || null,
        requestedCheckOut || requested_check_out || null,
        type === 'PERMISSION' ? minutes : null,
        (siteCode || site_code || '').toString().trim().slice(0, 64) || null,
        category,
        note || null,
      ]
    );

    const created = await db.getAsync(
      `SELECT w.*, u.name AS user_name, u.email AS user_email
       FROM workflow_requests w LEFT JOIN users u ON w.user_id = u.id WHERE w.id = $1`,
      [id]
    );

    res.status(201).json({
      success: true,
      request: created,
      message: `${type} request submitted for ${dateStr}. Awaiting admin approval.`,
    });
  } catch (err) {
    console.error('Create workflow error:', err);
    res.status(500).json({ error: 'Failed to submit workflow request.' });
  }
});

// ── PATCH /api/workflows/:id/review (admin Approve / Reject) ────────────────
router.patch('/:id/review', requireAdmin, async (req, res) => {
  const { status, reviewComment } = req.body;
  const adminEmail = req.user.email;

  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ error: 'status must be APPROVED or REJECTED.' });
  }
  const comment = (reviewComment || '').toString().trim();

  try {
    const request = await db.getAsync(`SELECT * FROM workflow_requests WHERE id = $1`, [req.params.id]);
    if (!request) {
      return res.status(404).json({ error: 'Workflow request not found.' });
    }
    if (request.status !== 'PENDING') {
      return res.status(409).json({ error: `Request already ${request.status.toLowerCase()}.` });
    }

    await db.runAsync(
      `UPDATE workflow_requests SET status = $1, reviewed_by = $2, reviewed_at = $3, review_comment = $4
       WHERE id = $5`,
      [status, adminEmail, new Date().toISOString(), comment || null, request.id]
    );

    let reconcilationNote = null;

    if (status === 'APPROVED') {
      // Layer 5 -> Layer 4 auto-reconciliation on approval
      if (request.request_type === 'REGULARIZATION') {
        // Upsert corrected punches tagged REGULARIZED_BY_ADMIN
        const checkInISO = istDateTimeToISO(request.date_ist, request.requested_check_in);
        const checkOutISO = istDateTimeToISO(request.date_ist, request.requested_check_out);
        const punches = [
          checkInISO ? ['check_in', checkInISO] : null,
          checkOutISO ? ['check_out', checkOutISO] : null,
        ].filter(Boolean);

        for (const [recordType, atISO] of punches) {
          const exists = await db.getAsync(
            `SELECT id FROM attendance_records
             WHERE user_id = $1 AND record_type = $2 AND recorded_at = $3`,
            [request.user_id, recordType, atISO]
          );
          if (exists) continue;
          await db.runAsync(
            `INSERT INTO attendance_records
             (id, user_id, location_id, location_name, record_type, recorded_at, device_timestamp,
              verified_by, confidence_score, status, capture_method, site_code, correction_reason)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             ON CONFLICT DO NOTHING`,
            [
              `rec-${randomUUID()}`,
              request.user_id,
              request.site_code || 'loc-001',
              request.site_code || 'Regularized Entry',
              recordType,
              atISO,
              atISO,
              'REGULARIZED_BY_ADMIN',
              100,
              'verified',
              'REGULARIZED_BY_ADMIN',
              request.site_code || 'MREW-HQ-HYD',
              request.review_comment || request.reason_category || null,
            ]
          );
        }
        reconcilationNote = `${checkInISO ? 'check-in' : ''}${checkInISO && checkOutISO ? ' + ' : ''}${checkOutISO ? 'check-out' : ''} punches written as REGULARIZED_BY_ADMIN.`;
      }

      await recomputeDailySummary(request.user_id, request.date_ist);
    }

    await db.runAsync(
      `INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        `audit-${randomUUID()}`,
        adminEmail,
        `WORKFLOW_${status}`,
        'workflow_request',
        request.id,
        `${request.request_type} for ${request.date_ist}${comment ? ` — "${comment}"` : ''}${reconcilationNote ? ` · ${reconcilationNote}` : ''}`,
      ]
    );

    const updated = await db.getAsync(
      `SELECT w.*, u.name AS user_name, u.email AS user_email
       FROM workflow_requests w LEFT JOIN users u ON w.user_id = u.id WHERE w.id = $1`,
      [request.id]
    );

    res.json({
      success: true,
      request: updated,
      message: status === 'APPROVED'
        ? `${request.request_type} approved for ${request.date_ist}. ${reconcilationNote || 'Daily summary auto-reconciled.'}`
        : `${request.request_type} request rejected.`,
    });
  } catch (err) {
    console.error('Review workflow error:', err);
    res.status(500).json({ error: 'Failed to review workflow request.' });
  }
});

export default router;
