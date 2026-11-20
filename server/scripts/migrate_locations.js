const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function migrateLocations() {
  console.log('Connecting to database for geolocation migration...');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Password@123',
    database: process.env.DB_NAME || 'employee_db',
    port: process.env.DB_PORT || 3306,
    multipleStatements: true,
  });

  try {
    console.log('Creating office_locations table...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS office_locations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        address VARCHAR(255) NOT NULL,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        allowed_radius INT NOT NULL DEFAULT 100,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_office_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('Creating location_exemptions table...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS location_exemptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NULL,
        department_id INT NULL,
        reason VARCHAR(255) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NULL,
        approved_by INT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
        FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_exemption_emp (employee_id),
        INDEX idx_exemption_dept (department_id),
        INDEX idx_exemption_dates (start_date, end_date),
        INDEX idx_exemption_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('Checking columns on attendance table...');
    const [cols] = await conn.query('SHOW COLUMNS FROM attendance');
    const colNames = cols.map((c) => c.Field);

    const columnsToAdd = [
      { name: 'check_in_latitude', sql: 'ADD COLUMN check_in_latitude DECIMAL(10, 8) NULL' },
      { name: 'check_in_longitude', sql: 'ADD COLUMN check_in_longitude DECIMAL(11, 8) NULL' },
      { name: 'check_in_accuracy', sql: 'ADD COLUMN check_in_accuracy DECIMAL(8, 2) NULL' },
      { name: 'check_in_office_id', sql: 'ADD COLUMN check_in_office_id INT NULL, ADD CONSTRAINT fk_attendance_checkin_office FOREIGN KEY (check_in_office_id) REFERENCES office_locations(id) ON DELETE SET NULL' },
      { name: 'check_in_distance', sql: 'ADD COLUMN check_in_distance DECIMAL(10, 2) NULL' },
      { name: 'check_in_location_status', sql: "ADD COLUMN check_in_location_status ENUM('inside', 'outside', 'no_location', 'exempt') DEFAULT 'no_location'" },
      { name: 'check_in_ip_address', sql: 'ADD COLUMN check_in_ip_address VARCHAR(45) NULL' },
      { name: 'check_in_user_agent', sql: 'ADD COLUMN check_in_user_agent VARCHAR(255) NULL' },

      { name: 'check_out_latitude', sql: 'ADD COLUMN check_out_latitude DECIMAL(10, 8) NULL' },
      { name: 'check_out_longitude', sql: 'ADD COLUMN check_out_longitude DECIMAL(11, 8) NULL' },
      { name: 'check_out_accuracy', sql: 'ADD COLUMN check_out_accuracy DECIMAL(8, 2) NULL' },
      { name: 'check_out_office_id', sql: 'ADD COLUMN check_out_office_id INT NULL, ADD CONSTRAINT fk_attendance_checkout_office FOREIGN KEY (check_out_office_id) REFERENCES office_locations(id) ON DELETE SET NULL' },
      { name: 'check_out_distance', sql: 'ADD COLUMN check_out_distance DECIMAL(10, 2) NULL' },
      { name: 'check_out_location_status', sql: "ADD COLUMN check_out_location_status ENUM('inside', 'outside', 'no_location', 'exempt') DEFAULT 'no_location'" },
      { name: 'check_out_ip_address', sql: 'ADD COLUMN check_out_ip_address VARCHAR(45) NULL' },
      { name: 'check_out_user_agent', sql: 'ADD COLUMN check_out_user_agent VARCHAR(255) NULL' },

      { name: 'is_flagged_suspicious', sql: 'ADD COLUMN is_flagged_suspicious BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'suspicious_reason', sql: 'ADD COLUMN suspicious_reason VARCHAR(255) NULL' }
    ];

    for (const col of columnsToAdd) {
      if (!colNames.includes(col.name)) {
        console.log(`Adding ${col.name} to attendance table...`);
        try {
          await conn.query(`ALTER TABLE attendance ${col.sql}`);
        } catch (err) {
          console.warn(`Could not add column ${col.name}: ${err.message}`);
        }
      }
    }

    // Seed sample offices if none exist
    const [offices] = await conn.query('SELECT COUNT(*) as count FROM office_locations');
    if (offices[0].count === 0) {
      console.log('Seeding default office locations...');
      await conn.query(`
        INSERT INTO office_locations (name, address, latitude, longitude, allowed_radius, is_active)
        VALUES
          ('Global Headquarters (HQ)', '100 Enterprise Boulevard, Tech City', 37.77492900, -122.41941600, 150, TRUE),
          ('Downtown Innovation Hub', '45 Market Street, Suite 800', 37.78917200, -122.40144900, 100, TRUE),
          ('East Bay Operations Center', '1200 Industrial Parkway, Oakland', 37.80436400, -122.27111400, 200, TRUE);
      `);
      console.log('Seeded 3 default offices.');
    }

    console.log('Geolocation migration completed successfully!');
  } finally {
    await conn.end();
  }
}

migrateLocations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
