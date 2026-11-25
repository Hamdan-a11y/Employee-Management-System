import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { setAccessToken } from '../services/api';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { Laptop, Shield, LogOut, Trash2, RefreshCw, AlertCircle, KeyRound } from 'lucide-react';
import './ActiveSessions.css';

const ActiveSessions = () => {
  const { logout } = useAuth();
  const { success, error: notifyError } = useNotification();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revokingId, setRevokingId] = useState(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/auth/sessions');
      setSessions(res.data?.sessions || []);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to load active sessions.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleRevoke = async (sessionId) => {
    try {
      setRevokingId(sessionId);
      await api.delete(`/auth/sessions/${sessionId}`);
      success('Session revoked.');
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to revoke session.');
    } finally {
      setRevokingId(null);
    }
  };

  const handleLogoutAll = async () => {
    try {
      await api.post('/auth/logout-all');
      setAccessToken(null);
      await logout();
      navigate('/login');
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to log out all devices.');
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    try {
      setChangingPw(true);
      await api.post('/auth/change-password', { currentPassword, newPassword });
      success('Password updated. All sessions were revoked — please sign in again.');
      setAccessToken(null);
      navigate('/login');
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to change password.');
    } finally {
      setChangingPw(false);
    }
  };

  return (
    <div className="app-container">
      <Sidebar />
      <main className="sessions-main">
        <div className="sessions-header">
          <div>
            <h1 className="sessions-title">Active Sessions & Security</h1>
            <p className="sessions-subtitle">
              Manage your signed-in devices and revoke any unrecognized sessions.
            </p>
          </div>
          <button className="sessions-logout-all-btn" onClick={handleLogoutAll}>
            <LogOut size={15} />
            Logout All Devices
          </button>
        </div>

        <div className="sessions-card">
          <div className="sessions-card-header">
            <h2>
              <Laptop size={18} />
              Your Active Sessions
            </h2>
            <button className="sessions-refresh-btn" onClick={fetchSessions} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="sessions-state">Loading active sessions...</div>
          ) : error ? (
            <div className="sessions-state error">
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          ) : sessions.length === 0 ? (
            <div className="sessions-state">No active sessions found.</div>
          ) : (
            <div className="sessions-list">
              {sessions.map((s) => (
                <div key={s.id} className="session-item">
                  <div className="session-info">
                    <div className="session-top">
                      <strong>{s.user_agent || 'Unknown Browser / Device'}</strong>
                      {s.is_current && <span className="session-current-pill">Current Session</span>}
                    </div>
                    <div className="session-meta">
                      <span>IP: {s.ip || 'Unknown'}</span>
                      <span>Device ID: {s.device_id || '—'}</span>
                      <span>Started: {new Date(s.created_at).toLocaleString()}</span>
                      <span>Expires: {new Date(s.expires_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <button
                    className="session-revoke-btn"
                    onClick={() => handleRevoke(s.id)}
                    disabled={revokingId === s.id}
                  >
                    <Trash2 size={14} />
                    {revokingId === s.id ? 'Revoking...' : 'Revoke'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sessions-card" style={{ marginTop: '24px' }}>
          <div className="sessions-card-header">
            <h2>
              <KeyRound size={18} />
              Change Password
            </h2>
          </div>
          <form className="sessions-pw-form" onSubmit={handleChangePassword}>
            <div className="sessions-pw-field">
              <label>Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="sessions-pw-field">
              <label>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="sessions-pw-submit" disabled={changingPw}>
              <Shield size={15} />
              {changingPw ? 'Updating...' : 'Update Password & Revoke All Sessions'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default ActiveSessions;
