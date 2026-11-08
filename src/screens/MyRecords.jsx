import { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { formatTime, formatDuration, confidenceLabel, groupRecordsByDay } from '../utils/formatters.js';
import { WORK_MODE_META } from '../utils/attendancePolicy.js';
import {
  ClipboardList,
  CheckCircle2,
  Coffee,
  Play,
  FastForward,
  Square,
  Flag,
  WifiOff,
  FileSignature,
  CalendarClock,
  HardHat,
  X,
  Clock3,
  ScanFace,
} from 'lucide-react';

const TYPE_META = {
  check_in: { badge: 'badge-in', label: 'Check In', icon: <CheckCircle2 size={12} /> },
  check_out: { badge: 'badge-out', label: 'Check Out', icon: <CheckCircle2 size={12} /> },
  break_start: { badge: 'badge-warning', label: 'Break Start', icon: <Coffee size={12} /> },
  break_end: { badge: 'badge-in', label: 'Break Resume', icon: <Play size={12} /> },
  ot_start: { badge: 'badge-ot', label: 'OT Start', icon: <FastForward size={12} /> },
  ot_end: { badge: 'badge-out', label: 'OT End', icon: <Square size={12} /> },
};

const REQUEST_TYPES = [
  ['REGULARIZATION', 'Regularize Attendance', 'Fix a missed or wrong punch', <CalendarClock size={15} key="reg" />],
  ['PERMISSION', 'Request Permission', '1–2h approved late arrival / early departure pass', <Clock3 size={15} key="perm" />],
  ['ON_DUTY', 'Apply On-Duty (OD)', 'Client site / substation dispatch', <HardHat size={15} key="od" />],
];

const STATUS_BADGE = {
  PENDING: 'badge--warning',
  APPROVED: 'badge--success',
  REJECTED: 'badge--danger',
};

function RequestModal({ open, onClose, onSubmit, isSubmitting, prefillDate, sites }) {
  const [type, setType] = useState('REGULARIZATION');
  const [date, setDate] = useState(prefillDate);
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [siteCode, setSiteCode] = useState(sites?.[0]?.code || 'MREW-HQ-HYD');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setType('REGULARIZATION');
      setDate(prefillDate || new Date().toISOString().slice(0, 10));
      setCheckInTime('');
      setCheckOutTime('');
      setMinutes(60);
      setNote('');
    }
  }, [open, prefillDate]);

  if (!open) return null;

  const submit = async () => {
    await onSubmit({
      requestType: type,
      dateIST: date,
      requestedCheckIn: type === 'REGULARIZATION' ? checkInTime || null : null,
      requestedCheckOut: type === 'REGULARIZATION' ? checkOutTime || null : null,
      permissionMinutes: type === 'PERMISSION' ? Number(minutes) : null,
      siteCode: type === 'ON_DUTY' ? siteCode : null,
      reasonNote: note,
    });
    onClose();
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card fade-in">
        <div className="modal-header">
          <h3 className="section-title">Attendance Workflow Request</h3>
          <button className="btn-tiny" onClick={onClose} aria-label="Close request form">
            <X size={15} />
          </button>
        </div>

        <div className="request-type-grid">
          {REQUEST_TYPES.map(([value, label, hint, icon]) => (
            <button
              key={value}
              className={`request-type-chip ${type === value ? 'active' : ''}`}
              onClick={() => setType(value)}
            >
              <span className="request-type-icon">{icon}</span>
              <span className="request-type-label">{label}</span>
              <span className="request-type-hint">{hint}</span>
            </button>
          ))}
        </div>

        <div className="form-grid">
          <div className="form-row">
            <label className="form-label" htmlFor="wf-date">Date (IST)</label>
            <input
              id="wf-date"
              type="date"
              className="date-input font-mono"
              value={date || ''}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {type === 'REGULARIZATION' && (
            <>
              <div className="form-row">
                <label className="form-label" htmlFor="wf-checkin">Requested Check-In (HH:MM)</label>
                <input
                  id="wf-checkin"
                  type="time"
                  className="date-input font-mono"
                  value={checkInTime}
                  onChange={(e) => setCheckInTime(e.target.value)}
                />
              </div>
              <div className="form-row">
                <label className="form-label" htmlFor="wf-checkout">Requested Check-Out (HH:MM)</label>
                <input
                  id="wf-checkout"
                  type="time"
                  className="date-input font-mono"
                  value={checkOutTime}
                  onChange={(e) => setCheckOutTime(e.target.value)}
                />
              </div>
            </>
          )}

          {type === 'PERMISSION' && (
            <div className="form-row">
              <label className="form-label" htmlFor="wf-minutes">Permission Duration (max 120 min)</label>
              <select
                id="wf-minutes"
                className="date-input font-mono"
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              >
                {[30, 60, 90, 120].map((m) => (
                  <option key={m} value={m}>{m} minutes</option>
                ))}
              </select>
            </div>
          )}

          {type === 'ON_DUTY' && (
            <div className="form-row">
              <label className="form-label" htmlFor="wf-site">Client Site / EPC Project Code</label>
              <select
                id="wf-site"
                className="date-input font-mono"
                value={siteCode}
                onChange={(e) => setSiteCode(e.target.value)}
              >
                {(sites?.length ? sites : [{ code: 'MREW-HQ-HYD', name: 'HQ Workshop (Hyderabad)' }]).map((s) => (
                  <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-row">
            <label className="form-label" htmlFor="wf-note">Reason</label>
            <textarea
              id="wf-note"
              className="form-textarea"
              rows={3}
              placeholder="Add context for the reviewing admin (site name, gate number, reason…)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={isSubmitting}>
            <span>{isSubmitting ? 'Submitting…' : 'Submit for Approval'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MyRecords({ store }) {
  const {
    myRecords = [],
    workflowRequests = [],
    submitWorkflowRequest,
    currentUser,
  } = store;
  const [filter, setFilter] = useState('all'); // all | flagged | offline
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sites, setSites] = useState([]);

  useEffect(() => {
    api.getSites()
      .then((d) => setSites(d.sites || []))
      .catch(() => setSites([]));
  }, []);

  const filtered = myRecords.filter((r) => {
    if (filter === 'flagged') return r.status === 'flagged';
    if (filter === 'offline') return r.is_offline_sync === 1 || r.isOfflineSync;
    return true;
  });

  // Layer 5: only requests belonging to the signed-in employee
  const myRequests = workflowRequests.filter((w) => w.user_id === currentUser?.id).slice(0, 10);

  const handleSubmit = async (payload) => {
    setIsSubmitting(true);
    try {
      await submitWorkflowRequest(payload);
    } catch (err) {
      console.error('Workflow submit failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const grouped = groupRecordsByDay(filtered);
  const days = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

  // Compute daily summaries
  const dailySummary = days.map((day) => {
    const recs = grouped[day];
    const ci = recs.find((r) => (r.record_type === 'check_in' || r.recordType === 'check_in'));
    const co = recs.find((r) => (r.record_type === 'check_out' || r.recordType === 'check_out'));
    let hours = 0;
    const ciTime = ci ? (ci.recorded_at || ci.recordedAt) : null;
    const coTime = co ? (co.recorded_at || co.recordedAt) : null;
    if (ciTime && coTime) {
      hours = (new Date(coTime) - new Date(ciTime)) / 3600000;
    }
    return { day, recs, ci, co, hours };
  });

  return (
    <div className="screen fade-in">
      <div className="screen-header">
        <div>
          <h1 className="screen-title">My Attendance History</h1>
          <p className="screen-sub">
            {myRecords.length} events logged · Authenticated QR scan history
          </p>
        </div>
        <div className="filter-tabs">
          {[
            ['all', 'All Records', <ClipboardList size={14} key="all" />],
            ['flagged', 'Flagged', <Flag size={14} key="flg" />],
            ['offline', 'Offline Scans', <WifiOff size={14} key="off" />],
          ].map(([val, label, icon]) => (
            <button
              key={val}
              id={`filter-${val}`}
              className={`filter-tab ${filter === val ? 'active' : ''}`}
              onClick={() => setFilter(val)}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Layer 5: Zoho-style self-service workflow requests bar */}
      <div className="request-bar fade-in">
        <div className="request-bar-title">
          <FileSignature size={15} className="text-accent" />
          <span>Raise Request — Regularization / Permission / On-Duty</span>
        </div>
        <div className="request-bar-actions">
          {REQUEST_TYPES.map(([value, label, , icon]) => (
            <button
              key={value}
              id={`raise-${value.toLowerCase()}`}
              className="btn-secondary request-chip"
              onClick={() => setIsRequestOpen(true)}
            >
              <span className="request-type-icon">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Layer 5: my requests status list */}
      {myRequests.length > 0 && (
        <div className="requests-section fade-in">
          <h3 className="section-title">My Workflow Requests</h3>
          <div className="records-group stagger-group">
            {myRequests.map((w) => (
              <div key={w.id} className="record-row interactive-item">
                <div className={`record-type-badge ${w.request_type === 'ON_DUTY' ? 'badge-ot' : 'badge-in'}`}>
                  <span>
                    {w.request_type === 'REGULARIZATION'
                      ? 'REGULARIZATION'
                      : w.request_type === 'PERMISSION'
                        ? `PERMISSION · ${w.permission_minutes}m`
                        : `ON-DUTY · ${w.site_code || ''}`}
                  </span>
                </div>
                <div className="record-time font-mono">{w.date_ist}</div>
                <div className="record-badges">
                  <span className={`badge ${STATUS_BADGE[w.status] || 'badge--neutral'}`}>{w.status}</span>
                  {w.reviewed_by && (
                    <span className="badge badge--neutral">by {w.reviewed_by}</span>
                  )}
                </div>
                <div className="record-meta font-mono">
                  {w.reason_category && <span className="text-muted">{w.reason_category} · </span>}
                  {w.reason_note || '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <RequestModal
        open={isRequestOpen}
        onClose={() => setIsRequestOpen(false)}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        prefillDate={new Date().toISOString().slice(0, 10)}
        sites={sites}
      />

      <div className="records-list">
        {dailySummary.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon"><ClipboardList size={32} /></div>
            <div className="empty-text">No attendance records found matching this filter</div>
          </div>
        )}
        {dailySummary.map(({ day, recs, hours }) => (
          <div key={day} className="day-group">
            <div className="day-group-header">
              <div className="day-group-date">
                {new Date(day).toLocaleDateString('en-IN', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
              {hours > 0 && (
                <div className="day-group-summary font-mono">
                  <span className="day-group-hours">{formatDuration(hours)}</span>
                  <span className="day-group-label"> worked</span>
                </div>
              )}
            </div>

            <div className="records-group stagger-group">
              {recs
                .sort(
                  (a, b) =>
                    new Date(a.recorded_at || a.recordedAt) -
                    new Date(b.recorded_at || b.recordedAt)
                )
                .map((r) => {
                  const type = r.record_type || r.recordType;
                  const time = r.recorded_at || r.recordedAt;
                  const score = r.confidence_score || r.confidenceScore || 90;
                  const token = r.qr_token || r.qrTokenId;
                  const conf = confidenceLabel(score);
                  const meta = TYPE_META[type] || { badge: 'badge-in', label: 'Event', icon: null };
                  const workModeCode = WORK_MODE_META[r.work_mode]?.code;

                  return (
                    <div
                      key={r.id}
                      className={`record-row ${
                        r.status === 'flagged' ? 'record-row--flagged' : ''
                      } ${r.status === 'corrected' ? 'record-row--corrected' : ''} interactive-item`}
                    >
                      <div className={`record-type-badge ${meta.badge}`}>
                        {meta.icon}
                        <span>{meta.label}</span>
                      </div>

                      <div className="record-time font-mono">
                        {formatTime(time)}
                      </div>

                      <div className="record-badges">
                        {workModeCode && (
                          <span className="badge badge--info">{workModeCode}</span>
                        )}
                        {r.geofence_status && (
                          <span className={`badge ${r.geofence_status === 'OUTSIDE_GEOFENCE' ? 'badge--danger' : r.geofence_status === 'APPROVED_ON_DUTY' ? 'badge--warning' : 'badge--success'}`}>
                            {r.geofence_status === 'IN_ZONE' ? 'In Geofence' : r.geofence_status.replace(/_/g, ' ')}
                          </span>
                        )}
                        {r.arrival_status && type === 'check_in' && (
                          <span className="badge badge--neutral">{r.arrival_status.replace(/_/g, ' ')}</span>
                        )}
                        {(r.is_offline_sync === 1 || r.isOfflineSync) && (
                          <span className="badge badge--warning">Offline Sync</span>
                        )}
                        {r.status === 'flagged' && (
                          <span className="badge badge--danger">Flagged</span>
                        )}
                        {r.status === 'corrected' && (
                          <span className="badge badge--info">Corrected</span>
                        )}
                        <span className={`badge badge--${conf.color}`}>
                          {conf.label} {score}%
                        </span>
                        <span className="badge badge--neutral">
                          {(r.verified_by || r.verifiedBy || 'QR_CODE').toUpperCase()}
                        </span>
                        {(r.selfie_data || r.selfieSha256 || r.selfie_sha256) && (
                          <span
                            className="badge badge--info face-verify-badge"
                            title={r.selfie_sha256 || r.selfieSha256 ? `Face sha256: ${r.selfie_sha256 || r.selfieSha256}` : 'Face verified capture'}
                          >
                            {r.selfie_data && (
                              <img
                                className="face-verify-thumb"
                                src={r.selfie_data}
                                alt="Verified selfie"
                                width={18}
                                height={18}
                              />
                            )}
                            <ScanFace size={12} />
                            <span>
                              {r.selfie_sha256 || r.selfieSha256
                                ? `Face sha256: ${(r.selfie_sha256 || r.selfieSha256).slice(0, 8)}…`
                                : 'Face Verified'}
                            </span>
                          </span>
                        )}
                        {r.face_match_score != null && (
                          <span className={`badge ${r.face_match_score >= 0.5 ? 'badge--success' : 'badge--danger'}`}>
                            Match {Math.round(r.face_match_score * 100)}%
                          </span>
                        )}
                      </div>

                      <div className="record-meta font-mono">
                        {r.distance_meters != null && (
                          <span className="text-muted">{r.distance_meters}m · </span>
                        )}
                        {token && (
                          <span className="text-muted" title={token}>
                            Token: {token.slice(0, 10)}… ·{' '}
                          </span>
                        )}
                        ±{r.accuracy_meters || r.accuracyMeters || 10}m ·{' '}
                        {r.location_name || r.locationName || 'Station'}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
