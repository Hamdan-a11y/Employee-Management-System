const pool = require('./db');

async function migrate() {
  try {
    console.log('Checking if termination_date column exists in employees table...');
    const [columns] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'employees' 
        AND COLUMN_NAME = 'termination_date'
    `);

    if (columns.length === 0) {
      console.log('Adding termination_date column to employees table...');
      await pool.query(`
        ALTER TABLE employees 
        ADD COLUMN termination_date DATE NULL DEFAULT NULL,
        ADD INDEX idx_employees_termination_date (termination_date)
      `);
      console.log('Successfully added termination_date column and index to employees table.');
    } else {
      console.log('termination_date column already exists in employees table.');
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

migrate();

