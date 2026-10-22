import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { Mail, ArrowLeft, ArrowRight, AlertCircle, CheckCircle } from 'lucide-react';
import './ForgotPassword.css';

const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    if (!emailRegex.test(email.trim())) {
      setError('Please provide a valid email address.');
      return;
    }

    try {
      setLoading(true);
      await api.post('/auth/forgot-password', { email: email.trim() });
      setSubmitted(true);
    } catch (err) {
      // Even if network or server errors occur, ensure consistent behavior without exposing account existence
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="forgot-page">
      <div className="forgot-card">
        <div className="forgot-header">
          <div className="forgot-icon-badge">
            <Mail size={24} />
          </div>
          <h1 className="forgot-title">Forgot password?</h1>
          <p className="forgot-subtitle">
            No worries! Enter your account email and we'll send you a password reset link.
          </p>
        </div>

        {submitted ? (
          <div className="forgot-success-box">
            <div className="forgot-success-icon">
              <CheckCircle size={36} />
            </div>
            <h2 className="forgot-success-title">Check your inbox</h2>
            <p className="forgot-success-text">
              If an account exists for <strong>{email}</strong>, a reset link has been sent. The link expires in 20 minutes.
            </p>
            <p className="forgot-hint-text">
              Didn't receive an email? Check your spam folder or make sure the address was entered correctly.
            </p>
            <div className="forgot-action-group">
              <button
                type="button"
                className="btn btn-secondary forgot-resend-btn"
                onClick={() => {
                  setSubmitted(false);
                  setEmail('');
                }}
              >
                Send another link
              </button>
              <Link to="/login" className="btn btn-primary forgot-back-btn">
                <ArrowLeft size={16} />
                <span>Back to sign in</span>
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="forgot-form" noValidate>
            {error && (
              <div className="forgot-alert-error">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="email" className="forgot-label">
                Email address
              </label>
              <input
                id="email"
                type="email"
                name="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError('');
                }}
                placeholder="admin@example.com"
                required
                className="input"
                autoComplete="email"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary forgot-submit-btn"
            >
              {loading ? (
                'Sending reset link...'
              ) : (
                <>
                  <span>Send reset link</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            <div className="forgot-footer">
              <Link to="/login" className="forgot-back-link">
                <ArrowLeft size={16} />
                <span>Back to sign in</span>
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
