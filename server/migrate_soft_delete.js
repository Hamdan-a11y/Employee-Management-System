const pool = require('./db');

async function migrate() {
  try {
    console.log('Checking if deleted_at column exists in employees table...');
    const [columns] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'employees' 
        AND COLUMN_NAME = 'deleted_at'
    `);

    if (columns.length === 0) {
      console.log('Adding deleted_at column to employees table...');
      await pool.query(`
        ALTER TABLE employees 
        ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL,
        ADD INDEX idx_employees_deleted_at (deleted_at)
      `);
      console.log('Successfully added deleted_at column and index to employees table.');
    } else {
      console.log('deleted_at column already exists in employees table.');
    }

    console.log('Ensuring audit_logs action column supports RESTORE...');
    await pool.query(`
      ALTER TABLE audit_logs 
      MODIFY COLUMN action ENUM('CREATE', 'UPDATE', 'DELETE', 'RESTORE') NOT NULL
    `);
    console.log('audit_logs action column updated successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

migrate();
