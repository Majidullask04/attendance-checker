// backend/routes/reports.js
// Layer 6: Monthly Muster Roll + Payroll Reconciliation Export.
// GET /api/reports/payroll-muster?month=YYYY-MM  -> JSON muster matrix + payroll totals
// GET /api/reports/payroll-muster?month=YYYY-MM&format=csv -> UTF-8 payroll CSV (file download)
import { Router } from 'express';
import db from '../db.js';
import { verifyToken } from '../middleware/auth.js';
import { POLICY, getDayBounds } from '../config/policy.js';
import { computeDailyAttendanceSummary } from '../utils/validationEngine.js';

const router = Router();

const DAY_CODES = {
  FULL_DAY: 'P',
  REGULARIZED: 'REG',
  ON_DUTY: 'OD',
  HALF_DAY: 'HD',
  ACTIVE_SHIFT: 'HD',
  SHORTFALL: 'A',
  ABSENT: 'A',
};

function pad(n) {
  return String(n).padStart(2, '0');
}

function monthDatesList(monthStr) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthStr || '');
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]); // 1-based
  if (monthIndex < 1 || monthIndex > 12) return null;
  const dates = [];
  for (let day = 1; day <= 31; day++) {
    const dateStr = `${year}-${pad(monthIndex)}-${pad(day)}`;
    // 31st on a 30-day month would roll over — validate via Date
    const check = new Date(`${dateStr}T12:00:00Z`);
    if (Number.isNaN(check.getTime())) break;
    const backDate = `${check.getUTCFullYear()}-${pad(check.getUTCMonth() + 1)}-${pad(check.getUTCDate())}`;
    if (backDate !== dateStr) break;
    dates.push({ dateStr, day: dateStr.slice(-2), weekday: check.getUTCDay() }); // 0 = Sunday
  }
  return { year, monthIndex, dates };
}

function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function buildMuster(monthStr, restrictUserId = null) {
  const parsed = monthDatesList(monthStr);
  if (!parsed) return null;
  const { monthIndex, dates } = parsed;
  const monthPrefix = `${((monthStr || '').split('-')[0])}-${pad(monthIndex)}`;

  const userClauses = [`role != 'admin'`];
  const userParams = [];
  if (restrictUserId) {
    userClauses.push(`id = $1`);
    userParams.push(restrictUserId);
  }
  const users = await db.allAsync(
    `SELECT id, name, email, department FROM users WHERE ${userClauses.join(' AND ')} ORDER BY name ASC`,
    userParams
  );

  // Fetch all raw records across the month (IST bounds of first..last day)
  const monthBounds = {
    from: getDayBounds(dates[0].dateStr).from,
    to: getDayBounds(dates[dates.length - 1].dateStr).to,
  };
  const recordClauses = [`recorded_at >= $1`, `recorded_at < $2`];
  const recordParams = [monthBounds.from, monthBounds.to];
  if (restrictUserId) {
    recordClauses.push(`user_id = $3`);
    recordParams.push(restrictUserId);
  }
  const monthRecords = await db.allAsync(
    `SELECT * FROM attendance_records WHERE ${recordClauses.join(' AND ')} ORDER BY recorded_at ASC`,
    recordParams
  );

  const monthWorkflows = await db.allAsync(
    `SELECT * FROM workflow_requests WHERE date_ist LIKE $1 ${(restrictUserId ? 'AND user_id = $2' : '')} AND status = 'APPROVED'`,
    restrictUserId ? [`${monthPrefix}-%`, restrictUserId] : [`${monthPrefix}-%`]
  );

  const recordsByUser = {};
  const workflowsByUserDate = {};
  for (const r of monthRecords) {
    (recordsByUser[r.user_id] ||= []).push(r);
  }
  for (const w of monthWorkflows) {
    (workflowsByUserDate[w.user_id] ||= {})[w.date_ist] ||= [];
    workflowsByUserDate[w.user_id][w.date_ist].push(w);
  }

  const pendingRows = await db.allAsync(
    `SELECT user_id, date_ist FROM workflow_requests
     WHERE date_ist LIKE $1 ${(restrictUserId ? 'AND user_id = $2' : '')} AND status = 'PENDING'`,
    restrictUserId ? [`${monthPrefix}-%`, restrictUserId] : [`${monthPrefix}-%`]
  );
  const pendingByUserDate = {};
  for (const p of pendingRows) {
    (pendingByUserDate[p.user_id] ||= {})[p.date_ist] = true;
  }

  const employees = await Promise.all(users.map(async (u) => {
    const userRecs = recordsByUser[u.id] || [];
    const userCells = {};
    const totals = {
      calendarDays: dates.length,
      presentFullDays: 0,
      halfDays: 0,
      onDutyDays: 0,
      regularizedDays: 0,
      absentDays: 0,
      weekOffs: 0,
      totalPayableDays: 0,
      totalEffectiveMinutes: 0,
      totalDeviationDeficitMinutes: 0,
      totalOvertimeMinutes: 0,
      lateArrivalCount: 0,
      pendingWorkflowDays: 0,
    };

    for (const { dateStr, day, weekday } of dates) {
      if (weekday === 0) {
        userCells[day] = { code: 'WO', label: 'Week Off' };
        totals.weekOffs += 1;
        continue;
      }
      const bounds = getDayBounds(dateStr);
      const dayRecords = userRecs.filter(
        (r) => r.recorded_at >= bounds.from && r.recorded_at < bounds.to
      );
      const approvedWorkflows = (workflowsByUserDate[u.id] || {})[dateStr] || [];
      const hasPending = Boolean((pendingByUserDate[u.id] || {})[dateStr]);

      let summary;
      if (dayRecords.length > 0 || approvedWorkflows.length > 0) {
        summary = computeDailyAttendanceSummary(dayRecords, approvedWorkflows);
      }

      if (!summary || summary.dayStatus === 'ABSENT') {
        if (hasPending) totals.pendingWorkflowDays += 1;
        userCells[day] = summary?.dayStatus === 'ABSENT'
          ? { code: 'A', label: 'Absent' }
          : { code: '-', label: 'No Punch' };
        if (summary?.dayStatus === 'ABSENT') totals.absentDays += 1;
        continue;
      }

      totals.totalPayableDays += summary.payableDays || 0;
      totals.totalEffectiveMinutes += summary.effectiveMinutes || 0;
      totals.totalDeviationDeficitMinutes += summary.deviationDeficitMinutes || 0;
      totals.totalOvertimeMinutes += summary.overtimeMinutes || 0;
      if (summary.arrivalStatus === 'LATE_ARRIVAL') totals.lateArrivalCount += 1;

      switch (summary.dayStatus) {
        case 'FULL_DAY':
          userCells[day] = { code: DAY_CODES.FULL_DAY, label: 'Present (Full Day)' };
          totals.presentFullDays += 1;
          break;
        case 'REGULARIZED':
          userCells[day] = { code: DAY_CODES.REGULARIZED, label: 'Regularized' };
          totals.regularizedDays += 1;
          break;
        case 'ON_DUTY':
          userCells[day] = { code: DAY_CODES.ON_DUTY, label: 'On-Duty (OD)' };
          totals.onDutyDays += 1;
          break;
        case 'HALF_DAY':
        case 'ACTIVE_SHIFT':
          userCells[day] = { code: DAY_CODES.HALF_DAY, label: 'Half Day' };
          totals.halfDays += 1;
          break;
        case 'SHORTFALL':
          userCells[day] = { code: DAY_CODES.SHORTFALL, label: 'Shortfall / LOP' };
          totals.absentDays += 1;
          break;
        default:
          userCells[day] = { code: '-', label: 'No Punch' };
      }
    }

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      department: u.department || 'Field',
      cells: userCells,
      totals: {
        ...totals,
        totalPayableDays: Number(totals.totalPayableDays.toFixed(1)),
        totalEffectiveHours: Number((totals.totalEffectiveMinutes / 60).toFixed(2)),
        totalDeficitHours: Number((totals.totalDeviationDeficitMinutes / 60).toFixed(2)),
        totalOvertimeHours: Number((totals.totalOvertimeMinutes / 60).toFixed(2)),
      },
    };
  }));

  return { month: monthPrefix, dates, employees };
}

// ── GET /api/reports/payroll-muster ──────────────────────────────────────────
router.get('/payroll-muster', verifyToken, async (req, res) => {
  try {
    const todayIST = getDayBounds().dateString;
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '')
      ? req.query.month
      : todayIST.slice(0, 7);
    // Employees always see only their own muster; admins see everyone (or drill into ?userId=)
    const isAdminView = req.user.role === 'admin';
    const restrictUserId = !isAdminView
      ? req.user.id
      : (req.query.userId || null);

    const muster = await buildMuster(month, restrictUserId);
    if (!muster) {
      return res.status(400).json({ error: 'month must be a valid YYYY-MM value.' });
    }

    if ((req.query.format || '').toLowerCase() === 'csv') {
      const header = [
        'Employee Name', 'Email', 'Department',
        `Month (${muster.month} IST)`,
        'Calendar Days', 'Present Full (P)', 'Half Days (HD)', 'On-Duty (OD)',
        'Regularized (REG)', 'Absent/LOP (A)', 'Week Offs (WO)',
        'Net Payable Days', 'Total Effective Hours', 'Total Deficit Hours',
        'Total Overtime Hours', 'Late Arrivals',
      ];
      const lines = [header.join(',')];
      for (const emp of muster.employees) {
        lines.push([
          csvEscape(emp.name),
          csvEscape(emp.email),
          csvEscape(emp.department),
          csvEscape(muster.month),
          emp.totals.calendarDays,
          emp.totals.presentFullDays,
          emp.totals.halfDays,
          emp.totals.onDutyDays,
          emp.totals.regularizedDays,
          emp.totals.absentDays,
          emp.totals.weekOffs,
          emp.totals.totalPayableDays,
          emp.totals.totalEffectiveHours,
          emp.totals.totalDeficitHours,
          emp.totals.totalOvertimeHours,
          emp.totals.lateArrivalCount,
        ].join(','));
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="payroll-muster-${muster.month}.csv"`
      );
      return res.send(`\uFEFF${lines.join('\n')}`);
    }

    res.json({
      month: muster.month,
      timezone: POLICY.TIMEZONE,
      days: muster.dates.map((d) => d.day),
      employees: muster.employees,
      legend: [
        ['P', 'Present (Full Day)'],
        ['HD', 'Half Day'],
        ['OD', 'On-Duty'],
        ['REG', 'Regularized'],
        ['A', 'Absent / LOP'],
        ['WO', 'Week Off'],
        ['-', 'No Punch'],
      ],
    });
  } catch (err) {
    console.error('Payroll muster error:', err);
    res.status(500).json({ error: 'Failed to build payroll muster report.' });
  }
});

export default router;
