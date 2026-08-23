import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useAttendanceStore } from '../store/useStore';

export default function AdminApprovals() {
  const { isAdmin } = useAuth();
  const { addToast } = useAttendanceStore();
  const [pendingUsers, setPendingUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadPending = async () => {
    setIsLoading(true);
    try {
      const data = await api.getPendingUsers();
      setPendingUsers(data.users || []);
    } catch (err) {
      addToast('Failed to load pending users', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) loadPending();
  }, [isAdmin]);

  const handleApprove = async (userId) => {
    try {
      await api.approveUser(userId);
      addToast('User approved successfully', 'success');
      loadPending();
    } catch (err) {
      addToast(err.message || 'Approval failed', 'error');
    }
  };

  const handleReject = async (userId) => {
    if (!confirm('Are you sure you want to reject this registration? This cannot be undone.')) return;
    try {
      await api.rejectUser(userId);
      addToast('User rejected and removed', 'warning');
      loadPending();
    } catch (err) {
      addToast(err.message || 'Rejection failed', 'error');
    }
  };

  if (!isAdmin) {
    return (
      <div className="screen fade-in">
        <div className="empty-state">
          <div className="empty-state-icon">🔒</div>
          <h3 className="empty-state-title">Admin Access Required</h3>
          <p className="empty-state-desc">You do not have permission to view pending approvals.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen fade-in">
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Pending Approvals</h1>
          <p className="screen-sub">Review and approve new employee registrations</p>
        </div>
        <div className="screen-actions">
          <button className="btn-secondary" onClick={loadPending} disabled={isLoading}>
            {isLoading ? 'Loading…' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {pendingUsers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">✅</div>
          <h3 className="empty-state-title">All Caught Up</h3>
          <p className="empty-state-desc">No pending employee registrations at this time.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th>Registered</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingUsers.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="user-cell">
                      <div className="user-avatar">{u.avatar || '👤'}</div>
                      <div>
                        <div className="user-name">{u.name}</div>
                        <div className="user-email font-mono">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>{u.department}</td>
                  <td>{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="text-right">
                    <div className="action-cell">
                      <button className="btn-action btn-success" onClick={() => handleApprove(u.id)}>
                        ✅ Approve
                      </button>
                      <button className="btn-action btn-danger" onClick={() => handleReject(u.id)}>
                        ❌ Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
