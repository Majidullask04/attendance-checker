import { useState } from 'react';
import { formatTime, formatDuration, confidenceLabel, groupRecordsByDay } from '../utils/formatters.js';

export default function MyRecords({ store }) {
  const { myRecords } = store;
  const [filter, setFilter] = useState('all'); // all | flagged | offline

  const filtered = myRecords.filter((r) => {
    if (filter === 'flagged') return r.status === 'flagged';
    if (filter === 'offline') return r.is_offline_sync === 1 || r.isOfflineSync;
    return true;
  });

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
            {myRecords.length} total events recorded · Cryptographically signed SQLite database records
          </p>
        </div>
        <div className="filter-tabs">
          {[
            ['all', 'All Records'],
            ['flagged', '⚑ Flagged'],
            ['offline', '📵 Offline Scans'],
          ].map(([val, label]) => (
            <button
              key={val}
              id={`filter-${val}`}
              className={`filter-tab ${filter === val ? 'active' : ''}`}
              onClick={() => setFilter(val)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="records-list">
        {dailySummary.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
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
                <div className="day-group-summary">
                  <span className="day-group-hours">{formatDuration(hours)}</span>
                  <span className="day-group-label"> worked</span>
                </div>
              )}
            </div>

            <div className="records-group">
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

                  return (
                    <div
                      key={r.id}
                      className={`record-row ${
                        r.status === 'flagged' ? 'record-row--flagged' : ''
                      } ${r.status === 'corrected' ? 'record-row--corrected' : ''}`}
                    >
                      <div
                        className={`record-type-badge ${
                          type === 'check_in' ? 'badge-in' : 'badge-out'
                        }`}
                      >
                        {type === 'check_in' ? '▲ IN' : '▼ OUT'}
                      </div>

                      <div className="record-time font-mono">
                        {formatTime(time)}
                      </div>

                      <div className="record-badges">
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
                      </div>

                      <div className="record-meta font-mono">
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
