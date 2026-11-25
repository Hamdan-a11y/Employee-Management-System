const pool = require('./db');

async function columnExists(tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return rows[0].cnt > 0;
}

async function indexExists(tableName, indexName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [tableName, indexName]
  );
  return rows[0].cnt > 0;
}

async function migrateSecurity() {
  console.log('[Migration] Running security schema migration...');

  // 1. users: is_active, disabled_at
  if (!(await columnExists('users', 'is_active'))) {
    await pool.query('ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE');
  }
  if (!(await columnExists('users', 'disabled_at'))) {
    await pool.query('ALTER TABLE users ADD COLUMN disabled_at DATETIME NULL');
  }

  // 2. refresh_tokens: family_id, device_id, ip, user_agent, revoked_at, replaced_by
  if (!(await columnExists('refresh_tokens', 'family_id'))) {
    await pool.query("ALTER TABLE refresh_tokens ADD COLUMN family_id VARCHAR(64) NOT NULL DEFAULT ''");
  }
  if (!(await columnExists('refresh_tokens', 'device_id'))) {
    await pool.query('ALTER TABLE refresh_tokens ADD COLUMN device_id VARCHAR(64) NULL');
  }
  if (!(await columnExists('refresh_tokens', 'ip'))) {
    await pool.query('ALTER TABLE refresh_tokens ADD COLUMN ip VARCHAR(45) NULL');
  }
  if (!(await columnExists('refresh_tokens', 'user_agent'))) {
    await pool.query('ALTER TABLE refresh_tokens ADD COLUMN user_agent VARCHAR(512) NULL');
  }
  if (!(await columnExists('refresh_tokens', 'revoked_at'))) {
    await pool.query('ALTER TABLE refresh_tokens ADD COLUMN revoked_at DATETIME NULL');
  }
  if (!(await columnExists('refresh_tokens', 'replaced_by'))) {
    await pool.query('ALTER TABLE refresh_tokens ADD COLUMN replaced_by INT NULL');
  }
  if (!(await indexExists('refresh_tokens', 'idx_refresh_family'))) {
    await pool.query('CREATE INDEX idx_refresh_family ON refresh_tokens (family_id)');
  }

  // 3. security_events table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      type ENUM('login_failed', 'lockout', 'token_reuse', 'rate_limit', 'new_device', 'permission_denied') NOT NULL,
      user_id INT NULL,
      ip VARCHAR(45) NULL,
      details TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_sec_events_type (type),
      INDEX idx_sec_events_user (user_id),
      INDEX idx_sec_events_created (created_at DESC)
    )
  `);

  console.log('[Migration] Security schema migration completed.');
}

if (require.main === module) {
  migrateSecurity()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Migration] Security migration failed:', err);
      process.exit(1);
    });
}

module.exports = { migrateSecurity };
