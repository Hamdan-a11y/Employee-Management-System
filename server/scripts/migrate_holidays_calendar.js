const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function migrateHolidaysAndCalendar() {
  console.log('Connecting to database for holidays and working week calendar migration...');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Password@123',
    database: process.env.DB_NAME || 'employee_db',
    port: process.env.DB_PORT || 3306,
    multipleStatements: true,
  });

  try {
    // ==========================================
    // 1. UPDATE HOLIDAYS TABLE
    // ==========================================
    console.log('Checking holidays table columns and keys...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS holidays (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    const [hCols] = await conn.query('SHOW COLUMNS FROM holidays');
    const hColNames = hCols.map((c) => c.Field);

    // Drop old UNIQUE constraint on `date` if present
    const [hKeys] = await conn.query('SHOW INDEX FROM holidays');
    const hasUniqueDate = hKeys.some((k) => k.Column_name === 'date' && !k.Non_unique);
    if (hasUniqueDate) {
      console.log('Dropping single-column UNIQUE index on holidays.date to support multi-day & department scopes...');
      const dateIndexName = hKeys.find((k) => k.Column_name === 'date' && !k.Non_unique)?.Key_name || 'date';
      try {
        await conn.query(`ALTER TABLE holidays DROP INDEX \`${dateIndexName}\``);
      } catch (e) {
        console.warn('Could not drop index:', e.message);
      }
    }

    if (!hColNames.includes('end_date')) {
      console.log('Adding end_date to holidays...');
      await conn.query('ALTER TABLE holidays ADD COLUMN end_date DATE NULL AFTER date');
    }

    if (!hColNames.includes('scope')) {
      console.log('Adding scope to holidays...');
      await conn.query("ALTER TABLE holidays ADD COLUMN scope ENUM('all', 'department') NOT NULL DEFAULT 'all' AFTER end_date");
    }

    if (!hColNames.includes('department_id')) {
      console.log('Adding department_id to holidays...');
      await conn.query('ALTER TABLE holidays ADD COLUMN department_id INT NULL AFTER scope, ADD CONSTRAINT fk_holidays_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE');
    }

    // Add indexes for efficient date range queries
    try {
      await conn.query('ALTER TABLE holidays ADD INDEX idx_holidays_range (date, end_date), ADD INDEX idx_holidays_scope (scope, department_id)');
    } catch (e) {
      // Index might already exist
    }

    // ==========================================
    // 2. CREATE WORKING_WEEK_CONFIGS TABLE
    // ==========================================
    console.log('Creating working_week_configs table...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS working_week_configs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        scope ENUM('company', 'department', 'shift') NOT NULL DEFAULT 'company',
        department_id INT NULL,
        shift_id INT NULL,
        monday BOOLEAN NOT NULL DEFAULT TRUE,
        tuesday BOOLEAN NOT NULL DEFAULT TRUE,
        wednesday BOOLEAN NOT NULL DEFAULT TRUE,
        thursday BOOLEAN NOT NULL DEFAULT TRUE,
        friday BOOLEAN NOT NULL DEFAULT TRUE,
        saturday BOOLEAN NOT NULL DEFAULT FALSE,
        sunday BOOLEAN NOT NULL DEFAULT FALSE,
        effective_from DATE NOT NULL,
        created_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
        FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_ww_scope (scope, department_id, shift_id),
        INDEX idx_ww_effective (effective_from DESC)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Seed default company working week if none exists
    const [wwRows] = await conn.query("SELECT COUNT(*) as count FROM working_week_configs WHERE scope = 'company'");
    if (wwRows[0].count === 0) {
      console.log('Seeding default company working week (Mon-Fri, Sat-Sun off)...');
      await conn.query(`
        INSERT INTO working_week_configs (
          scope, department_id, shift_id,
          monday, tuesday, wednesday, thursday, friday, saturday, sunday,
          effective_from
        ) VALUES (
          'company', NULL, NULL,
          TRUE, TRUE, TRUE, TRUE, TRUE, FALSE, FALSE,
          '2020-01-01'
        )
      `);
    }

    // ==========================================
    // 3. UPDATE LEAVE_REQUESTS TABLE (DECIMAL & HALF-DAY)
    // ==========================================
    console.log('Updating leave_requests table...');
    const [lrCols] = await conn.query('SHOW COLUMNS FROM leave_requests');
    const lrColNames = lrCols.map((c) => c.Field);

    await conn.query('ALTER TABLE leave_requests MODIFY COLUMN days_count DECIMAL(4, 1) NOT NULL DEFAULT 1.0');

    if (!lrColNames.includes('is_half_day')) {
      console.log('Adding is_half_day to leave_requests...');
      await conn.query('ALTER TABLE leave_requests ADD COLUMN is_half_day BOOLEAN NOT NULL DEFAULT FALSE AFTER days_count');
    }

    if (!lrColNames.includes('half_day_type')) {
      console.log('Adding half_day_type to leave_requests...');
      await conn.query("ALTER TABLE leave_requests ADD COLUMN half_day_type ENUM('first_half', 'second_half') NULL AFTER is_half_day");
    }

    // ==========================================
    // 4. UPDATE LEAVE_BALANCES TABLE (DECIMAL)
    // ==========================================
    console.log('Updating leave_balances table to DECIMAL(5, 1)...');
    await conn.query(`
      ALTER TABLE leave_balances
        MODIFY COLUMN annual_total DECIMAL(5, 1) NOT NULL DEFAULT 15.0,
        MODIFY COLUMN annual_used DECIMAL(5, 1) NOT NULL DEFAULT 0.0,
        MODIFY COLUMN sick_total DECIMAL(5, 1) NOT NULL DEFAULT 10.0,
        MODIFY COLUMN sick_used DECIMAL(5, 1) NOT NULL DEFAULT 0.0,
        MODIFY COLUMN casual_total DECIMAL(5, 1) NOT NULL DEFAULT 5.0,
        MODIFY COLUMN casual_used DECIMAL(5, 1) NOT NULL DEFAULT 0.0,
        MODIFY COLUMN maternity_total DECIMAL(5, 1) NOT NULL DEFAULT 90.0,
        MODIFY COLUMN maternity_used DECIMAL(5, 1) NOT NULL DEFAULT 0.0,
        MODIFY COLUMN paternity_total DECIMAL(5, 1) NOT NULL DEFAULT 10.0,
        MODIFY COLUMN paternity_used DECIMAL(5, 1) NOT NULL DEFAULT 0.0
    `);

    // ==========================================
    // 5. SEED STANDARD PUBLIC HOLIDAYS FOR 2026
    // ==========================================
    console.log('Seeding standard public holidays for 2026...');
    const holidays2026 = [
      { name: "New Year's Day", date: '2026-01-01', end_date: null, scope: 'all' },
      { name: 'Kashmir Day', date: '2026-02-05', end_date: null, scope: 'all' },
      { name: 'Eid-ul-Fitr Holidays', date: '2026-03-20', end_date: '2026-03-23', scope: 'all' },
      { name: 'Pakistan Day', date: '2026-03-23', end_date: null, scope: 'all' },
      { name: 'Labor Day', date: '2026-05-01', end_date: null, scope: 'all' },
      { name: 'Eid-ul-Adha Holidays', date: '2026-05-27', end_date: '2026-05-29', scope: 'all' },
      { name: 'Ashura (Muharram)', date: '2026-07-25', end_date: '2026-07-26', scope: 'all' },
      { name: 'Independence Day', date: '2026-08-14', end_date: null, scope: 'all' },
      { name: 'Eid Milad-un-Nabi', date: '2026-09-04', end_date: null, scope: 'all' },
      { name: 'Iqbal Day', date: '2026-11-09', end_date: null, scope: 'all' },
      { name: 'Quaid-e-Azam Day / Christmas', date: '2026-12-25', end_date: null, scope: 'all' }
    ];

    for (const h of holidays2026) {
      const [existing] = await conn.query(
        'SELECT id FROM holidays WHERE name = ? AND date = ?',
        [h.name, h.date]
      );
      if (existing.length === 0) {
        await conn.query(
          'INSERT INTO holidays (name, date, end_date, scope, department_id) VALUES (?, ?, ?, ?, NULL)',
          [h.name, h.date, h.end_date, h.scope]
        );
      }
    }

    console.log('Holiday & Working Week migration completed successfully!');
  } finally {
    await conn.end();
  }
}

migrateHolidaysAndCalendar().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
