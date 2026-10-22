import React, { useState, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { KeyRound, ArrowRight, ArrowLeft, AlertCircle, Eye, EyeOff } from 'lucide-react';
import './ResetPassword.css';

const validatePassword = (password) => {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter (A-Z).';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter (a-z).';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number (0-9).';
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return 'Password must contain at least one special character (e.g. !@#$%^&*).';
  }
  return null;
};

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const passwordInputRef = useRef(null);
  const confirmPasswordInputRef = useRef(null);

  const togglePasswordVisibility = () => {
    const input = passwordInputRef.current;
    const start = input?.selectionStart;
    const end = input?.selectionEnd;

    setShowPassword((prev) => !prev);

    requestAnimationFrame(() => {
      if (input) {
        input.focus();
        if (start !== null && end !== null && typeof input.setSelectionRange === 'function') {
          try {
            input.setSelectionRange(start, end);
          } catch {
            // Safe fallback
          }
        }
      }
    });
  };

  const toggleConfirmPasswordVisibility = () => {
    const input = confirmPasswordInputRef.current;
    const start = input?.selectionStart;
    const end = input?.selectionEnd;

    setShowConfirmPassword((prev) => !prev);

    requestAnimationFrame(() => {
      if (input) {
        input.focus();
        if (start !== null && end !== null && typeof input.setSelectionRange === 'function') {
          try {
            input.setSelectionRange(start, end);
          } catch {
            // Safe fallback
          }
        }
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!token || !token.trim()) {
      setError('Password reset token is missing. Please request a new link.');
      return;
    }

    if (!password || !confirmPassword) {
      setError('Please fill in both password fields.');
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      await api.post('/auth/reset-password', {
        token: token.trim(),
        password,
      });

      // Redirect to login with success message
      navigate('/login', {
        state: { message: 'Password updated. Please sign in.' },
        replace: true,
      });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Failed to reset password. The link may have expired or already been used.'
      );
    } finally {
      setLoading(false);
    }
  };

  // If URL has no token at all, present clear error state
  if (!token) {
    return (
      <div className="reset-page">
        <div className="reset-card">
          <div className="reset-header">
            <div className="reset-icon-badge reset-icon-error">
              <AlertCircle size={28} />
            </div>
            <h1 className="reset-title">Invalid Reset Link</h1>
            <p className="reset-subtitle">
              This password reset link is invalid or incomplete. Please request a new password reset email.
            </p>
          </div>
          <div className="reset-action-group">
            <Link to="/forgot-password" className="btn btn-primary reset-full-btn">
              Request new link
            </Link>
            <Link to="/login" className="btn btn-secondary reset-full-btn">
              <ArrowLeft size={16} />
              <span>Back to sign in</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="reset-page">
      <div className="reset-card">
        <div className="reset-header">
          <div className="reset-icon-badge">
            <KeyRound size={24} />
          </div>
          <h1 className="reset-title">Set new password</h1>
          <p className="reset-subtitle">
            Create a secure password with at least 8 characters.
          </p>
        </div>

        {error && (
          <div className="reset-alert-error">
            <AlertCircle size={16} className="reset-alert-icon" />
            <div className="reset-alert-content">
              <span>{error}</span>
              {error.toLowerCase().includes('expired') || error.toLowerCase().includes('already') ? (
                <div style={{ marginTop: '6px' }}>
                  <Link to="/forgot-password" className="reset-alert-link">
                    Request a new reset link &rarr;
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="reset-form" noValidate>
          <div>
            <label htmlFor="password" className="reset-label">
              New password
            </label>
            <div className="password-input-container">
              <input
                ref={passwordInputRef}
                id="password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Min. 8 chars (A-Z, 0-9, symbol)"
                required
                className="input password-input"
                autoComplete="new-password"
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={togglePasswordVisibility}
                onMouseDown={(e) => e.preventDefault()}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <EyeOff size={18} aria-hidden="true" />
                ) : (
                  <Eye size={18} aria-hidden="true" />
                )}
              </button>
            </div>
            <span className="reset-hint">
              Must have 8+ characters, 1 uppercase, 1 lowercase, 1 number, and 1 symbol.
            </span>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="reset-label">
              Confirm password
            </label>
            <div className="password-input-container">
              <input
                ref={confirmPasswordInputRef}
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                name="confirmPassword"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Re-enter password"
                required
                className="input password-input"
                autoComplete="new-password"
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={toggleConfirmPasswordVisibility}
                onMouseDown={(e) => e.preventDefault()}
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                aria-pressed={showConfirmPassword}
              >
                {showConfirmPassword ? (
                  <EyeOff size={18} aria-hidden="true" />
                ) : (
                  <Eye size={18} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary reset-submit-btn"
          >
            {loading ? (
              'Updating password...'
            ) : (
              <>
                <span>Update password</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>

          <div className="reset-footer">
            <Link to="/login" className="reset-back-link">
              <ArrowLeft size={16} />
              <span>Back to sign in</span>
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
