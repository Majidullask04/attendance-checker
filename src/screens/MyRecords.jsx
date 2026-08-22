import { useState } from 'react';
import { formatTime, formatDate, formatDuration, confidenceLabel, groupRecordsByDay } from '../utils/formatters';

export default function MyRecords({ store }) {
  const { myRecords } = store;
  const [filter, setFilter] = useState('all'); // all | flagged | offline

  const filtered = myRecords.filter(r => {
    if (filter === 'flagged') return r.status === 'flagged';
    if (filter === 'offline') return r.isOfflineSync;
    return true;
  });

  const grouped = groupRecordsByDay(filtered);
  const days = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

  // Compute daily summaries
  const dailySummary = days.map(day => {
    const recs = grouped[day];
    const ci = recs.find(r => r.recordType === 'check_in');
    const co = recs.find(r => r.recordType === 'check_out');
    let hours = 0;
    if (ci && co) hours = (new Date(co.recordedAt) - new Date(ci.recordedAt)) / 3600000;
    return { day, recs, ci, co, hours };
  });

  return (
    <div className="screen fade-in">
      <div className="screen-header">
        <div>
          <h1 className="screen-title">My Records</h1>
          <p className="screen-sub">{myRecords.length} total records — append-only audit trail</p>
        </div>
        <div className="filter-tabs">
          {[['all', 'All'], ['flagged', '⚑ Flagged'], ['offline', '📵 Offline Sync']].map(([val, label]) => (
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
            <div className="empty-text">No records found</div>
          </div>
        )}
        {dailySummary.map(({ day, recs, ci, co, hours }) => (
          <div key={day} className="day-group">
            <div className="day-group-header">
              <div className="day-group-date">
                {new Date(day).toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })}
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
                .sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt))
                .map(r => {
                  const conf = confidenceLabel(r.confidenceScore);
                  return (
                    <div key={r.id} className={`record-row ${r.status === 'flagged' ? 'record-row--flagged' : ''} ${r.status === 'corrected' ? 'record-row--corrected' : ''}`}>
                      <div className={`record-type-badge ${r.recordType === 'check_in' ? 'badge-in' : 'badge-out'}`}>
                        {r.recordType === 'check_in' ? '▲ IN' : '▼ OUT'}
                      </div>

                      <div className="record-time font-mono">{formatTime(r.recordedAt)}</div>

                      <div className="record-badges">
                        {r.isOfflineSync && <span className="badge badge--warning">Offline Sync</span>}
                        {r.status === 'flagged'   && <span className="badge badge--danger">Flagged</span>}
                        {r.status === 'corrected' && <span className="badge badge--info">Corrected</span>}
                        <span className={`badge badge--${conf.color}`}>{conf.label} {r.confidenceScore}%</span>
                        <span className="badge badge--neutral">{r.verifiedBy.toUpperCase()}</span>
                      </div>

                      <div className="record-meta font-mono">
                        ±{r.accuracyMeters}m · {r.deviceId}
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
