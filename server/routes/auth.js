const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db');
const { sendPasswordResetEmail } = require('../services/mailer');
const { createPasswordResetLimiter } = require('../middleware/rateLimiter');
const authenticateToken = require('../middleware/auth');
const { requireAdmin } = require('../middleware/auth');
const { validateBody, z } = require('../middleware/validate');
const { notifyUser } = require('../services/notificationService');
const { getPermissionsForRole } = require('../config/permissions');
const {
  setAuthCookies,
  clearAuthCookies,
  getRefreshTokenFromReq,
} = require('../utils/cookies');
const { generateCsrfToken } = require('../middleware/csrf');
const { isAllowedOrigin } = require('../utils/corsOrigins');
const {
  getRequestMeta,
  logSecurityEvent,
  checkAndNotifyNewDevice,
} = require('../services/securityService');

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
const issueAuthSession = async (user, req, res, { familyId = null, checkNewDevice = false } = {}) => {
  const userId = user.user_id || user.id;
  const userRole = user.role || 'employee';
  let employeeId = user.employee_id || null;

  if (!employeeId) {
    const [matched] = await pool.query('SELECT id FROM employees WHERE LOWER(email) = LOWER(?)', [user.email]);
    if (matched.length > 0) employeeId = matched[0].id;
  }

  const { ip, userAgent, deviceId } = getRequestMeta(req, res);

  if (checkNewDevice) {
    await checkAndNotifyNewDevice({ userId, ip, userAgent, deviceId });
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
  const effectiveFamilyId = familyId || crypto.randomUUID();

  const [rtResult] = await pool.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, family_id, device_id, ip, user_agent, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [userId, refreshTokenHash, effectiveFamilyId, deviceId, ip, userAgent, refreshExpiresAt]
  );

  // 3. CSRF Token
  const csrfToken = generateCsrfToken();

  // 4. Attach cookies to HTTP response
  setAuthCookies(res, {
    accessToken,
    refreshToken: rawRefreshToken,
    csrfToken,
  });

  return { accessToken, csrfToken, refreshTokenId: rtResult.insertId };
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
    const { accessToken } = await issueAuthSession(newUser, req, res);

    res.status(201).json({
      message: 'User registered successfully!',
      accessToken,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        employee_id: newUser.employee_id
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error during registration.' });
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
      await logSecurityEvent({
        type: 'login_failed',
        req,
        details: `Failed login attempt for unknown email: ${normalizedEmail}`,
      });
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    const user = users[0];

    if (user.is_active === 0 || user.is_active === false) {
      await logSecurityEvent({
        type: 'login_failed',
        userId: user.id,
        req,
        details: 'Login attempt on disabled account.',
      });
      return res.status(401).json({ message: 'Account has been disabled. Please contact an administrator.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await logSecurityEvent({
        type: 'login_failed',
        userId: user.id,
        req,
        details: 'Failed login attempt (invalid password).',
      });
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

    const { accessToken } = await issueAuthSession(user, req, res, { checkNewDevice: true });

    res.json({
      message: 'Login successful!',
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || 'employee',
        employee_id: employeeId || null,
        department_id: user.department_id || null,
        permissions: getPermissionsForRole(user.role || 'employee'),
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error during login.' });
  }
});

// POST /api/auth/refresh - Rotate refresh token and detect token reuse
router.post('/refresh', async (req, res) => {
  try {
    const rawRefreshToken = getRefreshTokenFromReq(req);

    if (!rawRefreshToken) {
      return res.status(401).json({ message: 'No refresh token provided.' });
    }

    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    const [tokens] = await pool.query(
      `SELECT rt.id, rt.user_id, rt.family_id, rt.revoked_at, rt.expires_at,
              u.name, u.email, u.role, u.employee_id, u.department_id, u.token_version, u.is_active
       FROM refresh_tokens rt
       JOIN users u ON rt.user_id = u.id
       WHERE rt.token_hash = ?`,
      [tokenHash]
    );

    if (tokens.length === 0) {
      clearAuthCookies(res);
      return res.status(401).json({ message: 'Invalid or expired refresh token. Please sign in again.' });
    }

    const record = tokens[0];

    // Reuse detection: if a revoked token is presented again, revoke the entire family
    if (record.revoked_at !== null) {
      await pool.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = ? AND revoked_at IS NULL',
        [record.family_id]
      );
      await logSecurityEvent({
        type: 'token_reuse',
        userId: record.user_id,
        req,
        details: `Revoked refresh token reused (token_id=${record.id}, family=${record.family_id}). Whole family revoked.`,
      });
      clearAuthCookies(res);
      return res.status(401).json({
        message: 'Refresh token reuse detected. All sessions in this family have been revoked.',
        code: 'TOKEN_REUSE_DETECTED',
      });
    }

    if (new Date(record.expires_at) <= new Date() || record.is_active === 0 || record.is_active === false) {
      clearAuthCookies(res);
      return res.status(401).json({ message: 'Invalid or expired refresh token. Please sign in again.' });
    }

    // Issue fresh access + refresh tokens in the same family
    const { accessToken, refreshTokenId } = await issueAuthSession(
      { ...record, id: record.user_id },
      req,
      res,
      {
        familyId: record.family_id,
        checkNewDevice: false,
      }
    );

    // Mark old refresh token as revoked and replaced
    await pool.query(
      'UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by = ? WHERE id = ?',
      [refreshTokenId, record.id]
    );

    res.json({
      message: 'Session refreshed successfully.',
      accessToken,
      user: {
        id: record.user_id,
        name: record.name,
        email: record.email,
        role: record.role || 'employee',
        employee_id: record.employee_id || null,
        department_id: record.department_id || null,
        permissions: getPermissionsForRole(record.role || 'employee'),
      },
    });
  } catch (error) {
    clearAuthCookies(res);
    res.status(500).json({ message: 'Failed to refresh authentication session.' });
  }
});

// POST /api/auth/logout - Clear cookies and revoke current refresh token
router.post('/logout', async (req, res) => {
  try {
    const rawRefreshToken = getRefreshTokenFromReq(req);

    if (rawRefreshToken) {
      const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
      await pool.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL',
        [tokenHash]
      );
    }

    clearAuthCookies(res);
    res.json({ message: 'Logged out successfully.' });
  } catch (error) {
    clearAuthCookies(res);
    res.status(500).json({ message: 'Server error during logout.' });
  }
});

// POST /api/auth/logout-all - Revoke all active sessions for current user
router.post('/logout-all', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
      [req.user.id]
    );
    await pool.query('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [req.user.id]);
    clearAuthCookies(res);
    res.json({ message: 'All active sessions have been logged out.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to log out all devices.' });
  }
});

// POST /api/auth/change-password - Authenticated password change; revokes all tokens
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters long.'),
}).strict();

router.post('/change-password', authenticateToken, validateBody(changePasswordSchema), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const [users] = await pool.query('SELECT id, password FROM users WHERE id = ?', [req.user.id]);
    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const isMatch = await bcrypt.compare(currentPassword, users[0].password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query(
        'UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?',
        [hashedPassword, req.user.id]
      );
      await connection.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
        [req.user.id]
      );
      await connection.commit();
    } catch (txErr) {
      await connection.rollback();
      throw txErr;
    } finally {
      connection.release();
    }

    await notifyUser({
      userId: req.user.id,
      type: 'security',
      title: 'Password Changed',
      message: 'Your password was changed and all active sessions were revoked for security.',
    });

    clearAuthCookies(res);
    res.json({ message: 'Password updated successfully. Please sign in again.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to change password.' });
  }
});

// GET /api/auth/sessions - List own active sessions
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const rawRefreshToken = getRefreshTokenFromReq(req);
    const currentHash = rawRefreshToken
      ? crypto.createHash('sha256').update(rawRefreshToken).digest('hex')
      : null;

    const [sessions] = await pool.query(
      `SELECT id, device_id, ip, user_agent, created_at, expires_at, token_hash
       FROM refresh_tokens
       WHERE user_id = ? AND revoked_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        device_id: s.device_id,
        ip: s.ip,
        user_agent: s.user_agent,
        created_at: s.created_at,
        expires_at: s.expires_at,
        is_current: Boolean(currentHash && s.token_hash === currentHash),
      })),
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load active sessions.' });
  }
});

// DELETE /api/auth/sessions/:id - Revoke own session
router.delete('/sessions/:id', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    if (isNaN(sessionId)) {
      return res.status(400).json({ message: 'Invalid session ID.' });
    }

    const [result] = await pool.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ? AND user_id = ? AND revoked_at IS NULL',
      [sessionId, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Active session not found.' });
    }

    res.json({ message: 'Session revoked successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to revoke session.' });
  }
});

// POST /api/auth/users/:userId/force-logout - Admin only: force logout any user
router.post('/users/:userId/force-logout', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.userId, 10);
    if (isNaN(targetUserId)) {
      return res.status(400).json({ message: 'Invalid user ID.' });
    }

    const [users] = await pool.query('SELECT id FROM users WHERE id = ?', [targetUserId]);
    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    await pool.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
      [targetUserId]
    );
    await pool.query('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [targetUserId]);

    res.json({ message: 'User has been forcefully logged out from all devices.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to force logout user.' });
  }
});

// PATCH /api/auth/users/:userId/status - Admin only: enable/disable account (revokes all tokens on disable)
const userStatusSchema = z.object({
  is_active: z.boolean(),
}).strict();

router.patch('/users/:userId/status', authenticateToken, requireAdmin, validateBody(userStatusSchema), async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.userId, 10);
    if (isNaN(targetUserId)) {
      return res.status(400).json({ message: 'Invalid user ID.' });
    }

    const { is_active } = req.body;
    const [users] = await pool.query('SELECT id FROM users WHERE id = ?', [targetUserId]);
    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (!is_active) {
      await pool.query(
        'UPDATE users SET is_active = FALSE, disabled_at = NOW(), token_version = token_version + 1 WHERE id = ?',
        [targetUserId]
      );
      await pool.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
        [targetUserId]
      );
    } else {
      await pool.query(
        'UPDATE users SET is_active = TRUE, disabled_at = NULL WHERE id = ?',
        [targetUserId]
      );
    }

    res.json({ message: is_active ? 'Account enabled.' : 'Account disabled and all sessions revoked.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update account status.' });
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

      const origin = req.headers.origin;
      const clientUrl = (origin && isAllowedOrigin(origin))
        ? origin
        : (process.env.CLIENT_URL || 'http://localhost:5173');
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
