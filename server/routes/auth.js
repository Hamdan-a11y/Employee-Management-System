const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db');
const { sendPasswordResetEmail } = require('../services/mailer');
const { createPasswordResetLimiter } = require('../middleware/rateLimiter');
const authenticateToken = require('../middleware/auth');
const { notifyUser } = require('../services/notificationService');
const {
  setAuthCookies,
  clearAuthCookies,
  getRefreshTokenFromReq,
} = require('../utils/cookies');
const { generateCsrfToken } = require('../middleware/csrf');

// Rate limiter for password reset requests: 5 per IP and 3 per Email per 15 minutes
const passwordResetLimiter = createPasswordResetLimiter({
  windowMs: 15 * 60 * 1000,
  maxPerIp: 5,
  maxPerEmail: 3,
});

const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const validatePassword = (password) => {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter.';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number.';
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return 'Password must contain at least one special character.';
  }
  return null;
};

/**
 * Issues short-lived access token (15m) and long-lived refresh token (7d)
 * and sets them as secure HttpOnly cookies.
 */
const issueAuthSession = async (user, res) => {
  const userId = user.id || user.user_id;
  const userRole = user.role || 'employee';
  let employeeId = user.employee_id || null;

  if (!employeeId) {
    const [matched] = await pool.query('SELECT id FROM employees WHERE LOWER(email) = LOWER(?)', [user.email]);
    if (matched.length > 0) employeeId = matched[0].id;
  }

  // 1. Access Token (15 min)
  const accessToken = jwt.sign(
    {
      id: userId,
      email: user.email,
      name: user.name,
      role: userRole,
      employee_id: employeeId,
      token_version: user.token_version || 1,
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  // 2. Refresh Token (7 days)
  const rawRefreshToken = crypto.randomBytes(32).toString('hex');
  const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
  const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await pool.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    [userId, refreshTokenHash, refreshExpiresAt]
  );

  // 3. CSRF Token
  const csrfToken = generateCsrfToken();

  // 4. Attach cookies to HTTP response
  setAuthCookies(res, {
    accessToken,
    refreshToken: rawRefreshToken,
    csrfToken,
  });

  return { accessToken, csrfToken };
};

// GET /api/auth/me - Verify current session from HttpOnly cookie
router.get('/me', authenticateToken, async (req, res) => {
  res.json({
    user: req.user,
  });
});

// GET /api/auth/csrf - Get current CSRF token
router.get('/csrf', (req, res) => {
  res.json({
    csrfToken: req.cookies?.['XSRF-TOKEN'] || generateCsrfToken(),
  });
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Full name is required.' });
    }

    if (!email || !emailRegex.test(email.trim())) {
      return res.status(400).json({ message: 'Please provide a valid email address.' });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [existingUser] = await pool.query('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (existingUser.length > 0) {
      return res.status(400).json({ message: 'An account with this email already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Link with employee record if matching email exists
    const [matchingEmp] = await pool.query('SELECT id FROM employees WHERE LOWER(email) = ?', [normalizedEmail]);
    const linkedEmpId = matchingEmp.length > 0 ? matchingEmp[0].id : null;

    const [result] = await pool.query(
      "INSERT INTO users (name, email, password, role, employee_id, token_version) VALUES (?, ?, ?, 'employee', ?, 1)",
      [name.trim(), normalizedEmail, hashedPassword, linkedEmpId]
    );

    const newUser = {
      id: result.insertId,
      name: name.trim(),
      email: normalizedEmail,
      role: 'employee',
      employee_id: linkedEmpId,
      token_version: 1
    };
    await issueAuthSession(newUser, res);

    res.status(201).json({
      message: 'User registered successfully!',
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        employee_id: newUser.employee_id
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error during registration.', error: error.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Email address is required.' });
    }

    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ message: 'Please provide a valid email address.' });
    }

    if (!password) {
      return res.status(400).json({ message: 'Password is required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
    if (users.length === 0) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    const user = users[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    let employeeId = user.employee_id;
    if (!employeeId) {
      const [matched] = await pool.query('SELECT id FROM employees WHERE LOWER(email) = ?', [user.email.toLowerCase()]);
      if (matched.length > 0) {
        employeeId = matched[0].id;
        await pool.query('UPDATE users SET employee_id = ? WHERE id = ?', [employeeId, user.id]);
      }
    }
    user.employee_id = employeeId;

    await issueAuthSession(user, res);

    res.json({
      message: 'Login successful!',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || 'employee',
        employee_id: employeeId || null
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error during login.', error: error.message });
  }
});

// POST /api/auth/refresh - Rotate refresh token and issue new access token
router.post('/refresh', async (req, res) => {
  try {
    const rawRefreshToken = getRefreshTokenFromReq(req);

    if (!rawRefreshToken) {
      return res.status(401).json({ message: 'No refresh token provided.' });
    }

    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    const [tokens] = await pool.query(
      `SELECT rt.id, rt.user_id, u.name, u.email, u.role, u.employee_id, u.token_version 
       FROM refresh_tokens rt 
       JOIN users u ON rt.user_id = u.id 
       WHERE rt.token_hash = ? AND rt.expires_at > NOW()`,
      [tokenHash]
    );

    if (tokens.length === 0) {
      clearAuthCookies(res);
      return res.status(401).json({ message: 'Invalid or expired refresh token. Please sign in again.' });
    }

    const record = tokens[0];

    // Invalidate used refresh token (Rotation)
    await pool.query('DELETE FROM refresh_tokens WHERE id = ?', [record.id]);

    // Issue fresh access + refresh tokens
    await issueAuthSession(record, res);

    res.json({
      message: 'Session refreshed successfully.',
      user: {
        id: record.user_id,
        name: record.name,
        email: record.email,
        role: record.role || 'employee',
        employee_id: record.employee_id || null
      },
    });
  } catch (error) {
    clearAuthCookies(res);
    res.status(500).json({ message: 'Failed to refresh authentication session.', error: error.message });
  }
});

// POST /api/auth/logout - Clear cookies and invalidate refresh token
router.post('/logout', async (req, res) => {
  try {
    const rawRefreshToken = getRefreshTokenFromReq(req);

    if (rawRefreshToken) {
      const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
      await pool.query('DELETE FROM refresh_tokens WHERE token_hash = ?', [tokenHash]);
    }

    clearAuthCookies(res);
    res.json({ message: 'Logged out successfully.' });
  } catch (error) {
    clearAuthCookies(res);
    res.status(500).json({ message: 'Server error during logout.', error: error.message });
  }
});

// POST /auth/forgot-password: Request password reset link
router.post('/forgot-password', passwordResetLimiter, async (req, res) => {
  const genericSuccessMessage = 'If an account exists for this email, a reset link has been sent.';

  try {
    const { email } = req.body;

    if (!email || !emailRegex.test(email.trim())) {
      return res.json({ message: genericSuccessMessage });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const [users] = await pool.query('SELECT id, email, name FROM users WHERE email = ?', [normalizedEmail]);

    if (users.length > 0) {
      const user = users[0];

      await pool.query(
        'UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL',
        [user.id]
      );

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 20 * 60 * 1000);

      await pool.query(
        'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
        [user.id, tokenHash, expiresAt]
      );

      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      const resetUrl = `${clientUrl}/reset-password?token=${rawToken}`;

      await sendPasswordResetEmail({
        toEmail: user.email,
        resetUrl,
        expiresInMinutes: 20,
      });
    }

    return res.json({ message: genericSuccessMessage });
  } catch (error) {
    console.error('Error in /forgot-password:', error);
    return res.status(500).json({ message: 'An error occurred while processing your request. Please try again later.' });
  }
});

// POST /auth/reset-password: Verify token and set new password
router.post('/reset-password', passwordResetLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ message: 'Password reset token is required.' });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');

    const [tokens] = await pool.query(
      `SELECT pr.id AS reset_id, pr.user_id, pr.expires_at, pr.used_at, u.email 
       FROM password_resets pr
       JOIN users u ON pr.user_id = u.id
       WHERE pr.token_hash = ? AND pr.used_at IS NULL AND pr.expires_at > NOW()`,
      [tokenHash]
    );

    if (tokens.length === 0) {
      return res.status(400).json({
        message: 'This password reset link is invalid, expired, or has already been used.',
      });
    }

    const resetRecord = tokens[0];

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Perform password update, token revocation, and reset consumption in an atomic transaction
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        'UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?',
        [hashedPassword, resetRecord.user_id]
      );
      await connection.query('DELETE FROM refresh_tokens WHERE user_id = ?', [resetRecord.user_id]);

      await connection.query(
        'UPDATE password_resets SET used_at = NOW() WHERE id = ?',
        [resetRecord.reset_id]
      );

      await connection.commit();
    } catch (txErr) {
      await connection.rollback();
      throw txErr;
    } finally {
      connection.release();
    }

    await notifyUser({
      userId: resetRecord.user_id,
      type: 'security',
      title: 'Password Changed',
      message: 'Your account password was updated successfully. All other active sessions were invalidated for security.',
      sendEmail: true,
      emailDetails: 'Your account password was recently changed. If you did not make this change, please contact support immediately.',
    });

    clearAuthCookies(res);

    return res.json({
      message: 'Password updated successfully. Please sign in.',
    });
  } catch (error) {
    console.error('Error in /reset-password:', error);
    return res.status(500).json({ message: 'Failed to reset password. Please try again.' });
  }
});

module.exports = router;
