import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext';
import { useAttendanceStore } from '../store/useStore';
import { getEmployeeName, renderAvatar, getInitials } from '../utils/formatters';
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Lock,
  Check,
  UserPlus,
  FileSignature,
} from 'lucide-react';

const STATUS_FILTERS = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'];

const STATUS_BADGE = {
  PENDING: 'badge--warning',
  APPROVED: 'badge--success',
  REJECTED: 'badge--danger',
};

export default function AdminApprovals() {
  const { isAdmin } = useAuth();
  const {
    addToast,
    reviewWorkflowRequest,
    pendingWorkflows = 0,
  } = useAttendanceStore();

  const [tab, setTab] = useState('workflows'); // workflows | accounts
  const [pendingUsers, setPendingUsers] = useState([]);
  const [workflowRequests, setWorkflowRequests] = useState([]);
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [isLoading, setIsLoading] = useState(true);

  const loadPending = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.getPendingUsers();
      setPendingUsers(data.users || []);
    } catch {
      addToast('Failed to load pending users', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  const loadWorkflows = useCallback(async () => {
    try {
      const data = await api.getWorkflows(statusFilter === 'ALL' ? null : statusFilter);
      setWorkflowRequests(data.requests || []);
    } catch {
      addToast('Failed to load workflow requests', 'error');
    }
  }, [addToast, statusFilter]);

  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([loadPending(), loadWorkflows()]);
    setIsLoading(false);
  }, [loadPending, loadWorkflows]);

  useEffect(() => {
    if (!isAdmin) return;
    refreshAll();
  }, [isAdmin, refreshAll]);

  const handleApproveUser = async (userId) => {
    try {
      await api.approveUser(userId);
      addToast('User approved successfully', 'success');
      loadPending();
    } catch (err) {
      addToast(err.message || 'Approval failed', 'error');
    }
  };

  const handleRejectUser = async (userId) => {
    if (!confirm('Are you sure you want to reject this registration? This cannot be undone.')) return;
    try {
      await api.rejectUser(userId);
      addToast('User rejected and removed', 'warning');
      loadPending();
    } catch (err) {
      addToast(err.message || 'Rejection failed', 'error');
    }
  };

  const handleReview = async (requestId, status) => {
    try {
      await reviewWorkflowRequest(requestId, status);
      await loadWorkflows();
    } catch (err) {
      addToast(err.message || 'Review failed', 'error');
    }
  };

  if (!isAdmin) {
    return (
      <div className="screen fade-in">
        <div className="empty-state">
          <div className="empty-state-icon"><Lock size={32} /></div>
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
          <h1 className="screen-title">Approval Center</h1>
          <p className="screen-sub">
            Review employee accounts and attendance workflows (Regularization / Permission / On-Duty).
          </p>
        </div>
        <div className="screen-actions">
          <button className="btn-secondary" onClick={refreshAll} disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? 'spin-anim' : ''} />
            <span>{isLoading ? 'Loading…' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Tabs: Attendance Workflows | User Accounts */}
      <div className="filter-tabs approvals-tabs">
        <button
          className={`filter-tab ${tab === 'workflows' ? 'active' : ''}`}
          onClick={() => setTab('workflows')}
        >
          <FileSignature size={14} />
          <span>Attendance Workflows</span>
          {pendingWorkflows > 0 && <span className="badge badge--warning">{pendingWorkflows}</span>}
        </button>
        <button
          className={`filter-tab ${tab === 'accounts' ? 'active' : ''}`}
          onClick={() => setTab('accounts')}
        >
          <UserPlus size={14} />
          <span>User Accounts</span>
          {pendingUsers.length > 0 && <span className="badge badge--warning">{pendingUsers.length}</span>}
        </button>
      </div>

      {tab === 'workflows' && (
        <>
          <div className="filter-tabs approvals-status-tabs">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                className={`filter-tab ${statusFilter === s ? 'active' : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                <span>{s.charAt(0) + s.slice(1).toLowerCase()}</span>
              </button>
            ))}
          </div>

          {workflowRequests.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><CheckCircle2 size={32} className="text-success" /></div>
              <h3 className="empty-state-title">No {statusFilter === 'ALL' ? '' : statusFilter.toLowerCase() + ' '}workflow requests</h3>
              <p className="empty-state-desc">Regularization, Permission and On-Duty requests show up here for 1-click review.</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Type</th>
                    <th>Date (IST)</th>
                    <th>Requested</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="stagger-group">
                  {workflowRequests.map((w) => (
                    <tr key={w.id} className="interactive-item">
                      <td>
                        <div className="user-cell">
                          <div className="user-avatar">{renderAvatar(w.avatar, getInitials(w.user_email || w.user_name))}</div>
                          <div>
                            <div className="user-name">{getEmployeeName({ name: w.user_name, email: w.user_email })}</div>
                            <div className="user-email font-mono">{w.user_email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${w.request_type === 'REGULARIZATION' ? 'badge--info' : w.request_type === 'PERMISSION' ? 'badge--warning' : 'badge--neutral'}`}>
                          {w.request_type}
                        </span>
                      </td>
                      <td className="font-mono text-muted">{w.date_ist}</td>
                      <td className="font-mono">
                        {w.request_type === 'REGULARIZATION' &&
                          `${w.requested_check_in || '--:--'} → ${w.requested_check_out || '--:--'}`}
                        {w.request_type === 'PERMISSION' && `${w.permission_minutes} min credit`}
                        {w.request_type === 'ON_DUTY' && (w.site_code || 'Client site')}
                      </td>
                      <td>
                        <div className="text-muted">{w.reason_category}</div>
                        <div className="user-email">{w.reason_note || '—'}</div>
                      </td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[w.status] || 'badge--neutral'}`}>{w.status}</span>
                        {w.reviewed_by && <div className="user-email text-muted">by {w.reviewed_by}</div>}
                      </td>
                      <td className="text-right">
                        {w.status === 'PENDING' ? (
                          <div className="action-cell">
                            <button className="btn-action btn-success" onClick={() => handleReview(w.id, 'APPROVED')}>
                              <Check size={14} /> Approve
                            </button>
                            <button className="btn-action btn-danger" onClick={() => handleReview(w.id, 'REJECTED')}>
                              <XCircle size={14} /> Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-muted">Reviewed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'accounts' && (
        <>
          {pendingUsers.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><CheckCircle2 size={32} className="text-success" /></div>
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
                <tbody className="stagger-group">
                  {pendingUsers.map((u) => (
                    <tr key={u.id} className="interactive-item">
                      <td>
                        <div className="user-cell">
                          <div className="user-avatar">{renderAvatar(u.avatar, getInitials(u.email || u.name))}</div>
                          <div>
                            <div className="user-name">{getEmployeeName(u)}</div>
                            <div className="user-email font-mono">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge--neutral">{u.department || 'General'}</span>
                      </td>
                      <td className="font-mono text-muted">
                        {new Date(u.created_at).toLocaleDateString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="text-right">
                        <div className="action-cell">
                          <button className="btn-action btn-success" onClick={() => handleApproveUser(u.id)}>
                            <Check size={14} /> Approve
                          </button>
                          <button className="btn-action btn-danger" onClick={() => handleRejectUser(u.id)}>
                            <XCircle size={14} /> Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
