/**
 * Mailer service for Employee Management System.
 * Supports Gmail SMTP (App Password) as well as custom SMTP servers via nodemailer.
 * If credentials are not yet configured, gracefully falls back to console logging.
 */

const nodemailer = require('nodemailer');

const createTransporter = () => {
  const emailUser = process.env.EMAIL_USER?.trim();
  const emailPass = process.env.EMAIL_PASS ? process.env.EMAIL_PASS.replace(/\s+/g, '') : '';
  const smtpHost = process.env.SMTP_HOST?.trim();

  if (!emailUser && !smtpHost) {
    return null;
  }

  // Gmail SMTP configuration
  if (emailUser && emailUser.includes('@gmail.com')) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: emailUser,
        pass: emailPass,
      },
    });
  }

  // Generic custom SMTP configuration
  return nodemailer.createTransport({
    host: smtpHost || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_PORT == 465,
    auth: {
      user: emailUser || process.env.SMTP_USER,
      pass: emailPass || process.env.SMTP_PASS,
    },
  });
};

const sendPasswordResetEmail = async ({ toEmail, resetUrl, expiresInMinutes = 20 }) => {
  const transporter = createTransporter();

  // If no SMTP credentials are configured, output to server console
  if (!transporter) {
    console.log('\n===============================================================');
    console.log('              PASSWORD RESET EMAIL (CONSOLE FALLBACK)          ');
    console.log('===============================================================');
    console.log(`To:          ${toEmail}`);
    console.log(`Subject:     Reset your Employee Management System password`);
    console.log(`Expires in:  ${expiresInMinutes} minutes`);
    console.log(`Reset Link:  ${resetUrl}`);
    console.log('---------------------------------------------------------------');
    console.log('NOTE: To receive real emails in your inbox, set EMAIL_USER and');
    console.log('EMAIL_PASS (Gmail App Password) in your server/.env file.');
    console.log('===============================================================\n');
    return { success: true, mode: 'console' };
  }

  try {
    const sender = process.env.EMAIL_FROM || process.env.EMAIL_USER;

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #0f172a; margin: 0; font-size: 22px;">Employee Management System</h2>
          <p style="color: #64748b; font-size: 14px; margin-top: 6px;">Password Reset Request</p>
        </div>

        <p style="color: #334155; font-size: 15px; line-height: 1.6;">
          Hello,
        </p>
        <p style="color: #334155; font-size: 15px; line-height: 1.6;">
          We received a request to reset the password for your account. Click the button below to choose a new password:
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 28px; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px; display: inline-block;">
            Reset Password
          </a>
        </div>

        <p style="color: #64748b; font-size: 13px; line-height: 1.5;">
          This link will expire in <strong>${expiresInMinutes} minutes</strong>. If you did not request a password reset, you can safely ignore this email.
        </p>

        <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />

        <p style="color: #94a3b8; font-size: 12px; line-height: 1.5; word-break: break-all;">
          If the button above does not work, copy and paste this link into your browser:<br />
          <a href="${resetUrl}" style="color: #4f46e5;">${resetUrl}</a>
        </p>
      </div>
    `;

    const info = await transporter.sendMail({
      from: `"Employee Management System" <${sender}>`,
      to: toEmail,
      subject: 'Reset your password - Employee Management System',
      text: `Hello,\n\nPlease click the link below to reset your password:\n${resetUrl}\n\nThis link will expire in ${expiresInMinutes} minutes.\nIf you did not request this, please ignore this email.`,
      html: htmlContent,
    });

    console.log(`[SMTP] Password reset email sent to ${toEmail} (MessageId: ${info.messageId})`);
    return { success: true, mode: 'smtp', messageId: info.messageId };
  } catch (error) {
    console.error('[SMTP ERROR] Failed to send email via SMTP:', error.message);
    console.log('\n[FALLBACK] Printing reset URL to console:');
    console.log(resetUrl);
    console.log('===============================================================\n');
    return { success: false, error: error.message, mode: 'fallback' };
  }
};

const sendAccountChangeNotificationEmail = async ({ toEmail, userName, changeType, details }) => {
  const transporter = createTransporter();
  const formattedTime = new Date().toUTCString();

  if (!transporter) {
    console.log('\n===============================================================');
    console.log('       ACCOUNT NOTIFICATION EMAIL (CONSOLE FALLBACK)           ');
    console.log('===============================================================');
    console.log(`To:          ${toEmail}`);
    console.log(`User:        ${userName || 'User'}`);
    console.log(`Change Type: ${changeType}`);
    console.log(`Details:     ${details}`);
    console.log(`Time:        ${formattedTime}`);
    console.log('---------------------------------------------------------------');
    console.log('NOTE: To receive real emails in your inbox, set EMAIL_USER and');
    console.log('EMAIL_PASS (Gmail App Password) in your server/.env file.');
    console.log('===============================================================\n');
    return { success: true, mode: 'console' };
  }

  try {
    const sender = process.env.EMAIL_FROM || process.env.EMAIL_USER;

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #0f172a; margin: 0; font-size: 22px;">Employee Management System</h2>
          <p style="color: #64748b; font-size: 14px; margin-top: 6px;">Security & Account Alert</p>
        </div>

        <p style="color: #334155; font-size: 15px; line-height: 1.6;">
          Hello <strong>${userName || 'there'}</strong>,
        </p>
        <p style="color: #334155; font-size: 15px; line-height: 1.6;">
          This is an automated notification to inform you that an important change was made to your account:
        </p>

        <div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; padding: 16px; margin: 20px 0; border-radius: 6px;">
          <p style="margin: 0; color: #1e293b; font-weight: 600; font-size: 15px;">${changeType}</p>
          <p style="margin: 6px 0 0 0; color: #475569; font-size: 14px;">${details}</p>
          <p style="margin: 6px 0 0 0; color: #94a3b8; font-size: 12px;">Timestamp: ${formattedTime}</p>
        </div>

        <p style="color: #64748b; font-size: 13px; line-height: 1.5;">
          If you performed this action, no further response is needed. If you did not authorize this change, please sign in and update your password immediately or contact your administrator.
        </p>
      </div>
    `;

    const info = await transporter.sendMail({
      from: `"Employee Management System" <${sender}>`,
      to: toEmail,
      subject: `Account Notice: ${changeType} - Employee Management System`,
      text: `Hello ${userName || 'there'},\n\nAn important change was made to your account:\n${changeType}\nDetails: ${details}\nTime: ${formattedTime}\n\nIf you did not authorize this, please change your password immediately.`,
      html: htmlContent,
    });

    console.log(`[SMTP] Account change notification sent to ${toEmail} (MessageId: ${info.messageId})`);
    return { success: true, mode: 'smtp', messageId: info.messageId };
  } catch (error) {
    console.error('[SMTP ERROR] Failed to send account change notification email:', error.message);
    return { success: false, error: error.message, mode: 'fallback' };
  }
};

module.exports = {
  sendPasswordResetEmail,
  sendAccountChangeNotificationEmail,
};
