import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Check,
  Circle,
  CheckCircle2,
} from 'lucide-react';
import {
  validateName,
  validateEmail,
  validatePassword,
  getPasswordChecklist,
  calculatePasswordStrength,
} from '../utils/validation';
import './Register.css';

const Register = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [touched, setTouched] = useState({
    name: false,
    email: false,
    password: false,
    confirmPassword: false,
  });

  const [serverErrors, setServerErrors] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const nameInputRef = useRef(null);
  const emailInputRef = useRef(null);
  const passwordInputRef = useRef(null);
  const confirmPasswordInputRef = useRef(null);

  const { login } = useAuth();
  const navigate = useNavigate();

  // Evaluated password checklist & strength
  const passwordChecklist = getPasswordChecklist(formData.password);
  const passwordStrength = calculatePasswordStrength(formData.password);

  // Computed field errors (shows on blur or after submit attempt)
  const nameError =
    (touched.name ? validateName(formData.name) : '') || serverErrors.name;

  const emailError =
    (touched.email ? validateEmail(formData.email) : '') || serverErrors.email;

  const passwordError =
    (touched.password ? validatePassword(formData.password) : '') ||
    serverErrors.password;

  const getConfirmPasswordError = () => {
    if (serverErrors.confirmPassword) return serverErrors.confirmPassword;
    if (!touched.confirmPassword) return '';
    if (!formData.confirmPassword) return 'Please confirm your password.';
    if (formData.confirmPassword !== formData.password)
      return 'Passwords do not match.';
    return '';
  };

  const confirmPasswordError = getConfirmPasswordError();
  const isPasswordsMatch =
    Boolean(formData.password && formData.confirmPassword) &&
    formData.password === formData.confirmPassword;

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Clear server error for this field when typing
    if (serverErrors[name]) {
      setServerErrors((prev) => ({ ...prev, [name]: '' }));
    }
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Mark all fields as touched on submit attempt
    setTouched({
      name: true,
      email: true,
      password: true,
      confirmPassword: true,
    });

    // Validate all fields
    const nameErr = validateName(formData.name);
    const emailErr = validateEmail(formData.email);
    const passwordErr = validatePassword(formData.password);
    let confirmErr = '';
    if (!formData.confirmPassword) {
      confirmErr = 'Please confirm your password.';
    } else if (formData.confirmPassword !== formData.password) {
      confirmErr = 'Passwords do not match.';
    }

    // Focus first invalid field and prevent submission
    if (nameErr) {
      nameInputRef.current?.focus();
      return;
    }
    if (emailErr) {
      emailInputRef.current?.focus();
      return;
    }
    if (passwordErr) {
      passwordInputRef.current?.focus();
      return;
    }
    if (confirmErr) {
      confirmPasswordInputRef.current?.focus();
      return;
    }

    try {
      setLoading(true);
      const res = await api.post('/auth/register', {
        name: formData.name.trim(),
        email: formData.email.trim(),
        password: formData.password,
      });

      login(res.data.user);
      navigate('/dashboard');
    } catch (err) {
      const serverMsg =
        err.response?.data?.message ||
        (err.message === 'Network Error' ? 'Unable to connect to the server. Please ensure the backend is running.' : err.message) ||
        'Registration failed. Please try again.';

      // Map server errors directly to the corresponding field if applicable
      if (/email/i.test(serverMsg)) {
        setServerErrors((prev) => ({ ...prev, email: serverMsg }));
        setError(serverMsg);
        emailInputRef.current?.focus();
      } else if (/password/i.test(serverMsg)) {
        setServerErrors((prev) => ({ ...prev, password: serverMsg }));
        setError(serverMsg);
        passwordInputRef.current?.focus();
      } else if (/name/i.test(serverMsg)) {
        setServerErrors((prev) => ({ ...prev, name: serverMsg }));
        setError(serverMsg);
        nameInputRef.current?.focus();
      } else {
        setError(serverMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const togglePasswordVisibility = () => {
    const input = passwordInputRef.current;
    const start = input?.selectionStart;
    const end = input?.selectionEnd;

    setShowPassword((prev) => !prev);

    requestAnimationFrame(() => {
      if (input) {
        input.focus();
        if (
          start !== null &&
          end !== null &&
          typeof input.setSelectionRange === 'function'
        ) {
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
        if (
          start !== null &&
          end !== null &&
          typeof input.setSelectionRange === 'function'
        ) {
          try {
            input.setSelectionRange(start, end);
          } catch {
            // Safe fallback
          }
        }
      }
    });
  };

  return (
    <div className="register-page">
      <div className="register-card">
        <div className="register-header">
          <h1 className="register-title">Create an account</h1>
          <p className="register-subtitle">
            Get started with Employee Management System
          </p>
        </div>

        {error && (
          <div className="register-alert-error" role="alert">
            <AlertCircle size={16} className="register-alert-icon" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="register-form" noValidate>
          {/* Full Name */}
          <div className="form-group">
            <label htmlFor="name" className="register-label">
              Full name
            </label>
            <input
              ref={nameInputRef}
              id="name"
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              onBlur={() => handleBlur('name')}
              placeholder="Sarah Connor"
              className={`input ${
                nameError
                  ? 'input-error'
                  : touched.name && formData.name.trim()
                  ? 'input-valid'
                  : ''
              }`}
              aria-invalid={nameError ? 'true' : 'false'}
              aria-describedby={nameError ? 'name-error' : undefined}
              disabled={loading}
              autoComplete="name"
            />
            <div className="field-feedback-container">
              {nameError && (
                <div id="name-error" className="field-feedback-error" role="alert">
                  <AlertCircle size={14} />
                  <span>{nameError}</span>
                </div>
              )}
            </div>
          </div>

          {/* Email Address */}
          <div className="form-group">
            <label htmlFor="email" className="register-label">
              Email address
            </label>
            <input
              ref={emailInputRef}
              id="email"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              onBlur={() => handleBlur('email')}
              placeholder="sarah@example.com"
              className={`input ${
                emailError
                  ? 'input-error'
                  : touched.email && !validateEmail(formData.email)
                  ? 'input-valid'
                  : ''
              }`}
              aria-invalid={emailError ? 'true' : 'false'}
              aria-describedby={emailError ? 'email-error' : undefined}
              disabled={loading}
              autoComplete="email"
            />
            <div className="field-feedback-container">
              {emailError && (
                <div id="email-error" className="field-feedback-error" role="alert">
                  <AlertCircle size={14} />
                  <span>{emailError}</span>
                </div>
              )}
            </div>
          </div>

          {/* Password Field */}
          <div className="form-group">
            <label htmlFor="password" className="register-label">
              Password
            </label>
            <div className="password-input-container">
              <input
                ref={passwordInputRef}
                id="password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={formData.password}
                onChange={handleChange}
                onBlur={() => handleBlur('password')}
                placeholder="Min. 8 chars (A-Z, 0-9, symbol)"
                className={`input password-input ${
                  passwordError
                    ? 'input-error'
                    : touched.password && !validatePassword(formData.password)
                    ? 'input-valid'
                    : ''
                }`}
                aria-invalid={passwordError ? 'true' : 'false'}
                aria-describedby={
                  passwordError
                    ? 'password-error password-checklist'
                    : 'password-checklist'
                }
                disabled={loading}
                autoComplete="new-password"
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

            {/* Error message only after blur with unmet rules */}
            <div className="field-feedback-container">
              {passwordError && (
                <div
                  id="password-error"
                  className="field-feedback-error"
                  role="alert"
                >
                  <AlertCircle size={14} />
                  <span>{passwordError}</span>
                </div>
              )}
            </div>

            {/* Optional Password Strength Meter */}
            {formData.password && (
              <div className="password-strength-container" aria-hidden="true">
                <div className="password-strength-header">
                  <span className="password-strength-title">Strength:</span>
                  <span
                    className={`password-strength-label strength-${passwordStrength.level}`}
                  >
                    {passwordStrength.label}
                  </span>
                </div>
                <div className="password-strength-track">
                  <div
                    className={`password-strength-bar strength-${passwordStrength.level}`}
                    style={{ width: `${passwordStrength.percent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Live Password Checklist (Updates live as user types) */}
            <div
              id="password-checklist"
              className="password-checklist"
              aria-live="polite"
            >
              <div className="password-checklist-header">
                Password must include:
              </div>
              <ul className="password-checklist-items">
                {passwordChecklist.map((rule) => (
                  <li
                    key={rule.id}
                    className={`checklist-item ${
                      rule.isMet ? 'met' : 'unmet'
                    }`}
                  >
                    {rule.isMet ? (
                      <Check
                        size={13}
                        className="checklist-icon-check"
                        aria-hidden="true"
                      />
                    ) : (
                      <Circle
                        size={13}
                        className="checklist-icon-circle"
                        aria-hidden="true"
                      />
                    )}
                    <span>{rule.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Confirm Password Field */}
          <div className="form-group">
            <label htmlFor="confirmPassword" className="register-label">
              Confirm password
            </label>
            <div className="password-input-container">
              <input
                ref={confirmPasswordInputRef}
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                onBlur={() => handleBlur('confirmPassword')}
                placeholder="Re-enter password"
                className={`input password-input ${
                  confirmPasswordError
                    ? 'input-error'
                    : isPasswordsMatch
                    ? 'input-valid'
                    : ''
                }`}
                aria-invalid={confirmPasswordError ? 'true' : 'false'}
                aria-describedby={
                  confirmPasswordError
                    ? 'confirmPassword-error'
                    : isPasswordsMatch
                    ? 'confirmPassword-match'
                    : undefined
                }
                disabled={loading}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={toggleConfirmPasswordVisibility}
                onMouseDown={(e) => e.preventDefault()}
                aria-label={
                  showConfirmPassword
                    ? 'Hide confirm password'
                    : 'Show confirm password'
                }
                aria-pressed={showConfirmPassword}
              >
                {showConfirmPassword ? (
                  <EyeOff size={18} aria-hidden="true" />
                ) : (
                  <Eye size={18} aria-hidden="true" />
                )}
              </button>
            </div>

            {/* Live Match / Mismatch Feedback */}
            <div className="field-feedback-container">
              {confirmPasswordError ? (
                <div
                  id="confirmPassword-error"
                  className="field-feedback-error"
                  role="alert"
                >
                  <AlertCircle size={14} />
                  <span>{confirmPasswordError}</span>
                </div>
              ) : isPasswordsMatch ? (
                <div
                  id="confirmPassword-match"
                  className="field-feedback-success"
                  role="status"
                >
                  <CheckCircle2 size={14} />
                  <span>Passwords match</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary register-submit-btn"
          >
            {loading ? (
              'Creating account...'
            ) : (
              <>
                <span>Sign up</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <div className="register-footer">
          Already have an account?{' '}
          <Link to="/login" className="register-link">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Register;
