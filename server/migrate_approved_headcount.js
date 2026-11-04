const pool = require('./db');

async function migrate() {
  try {
    console.log('Checking if approved_headcount column exists in departments table...');
    const [columns] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'departments' 
        AND COLUMN_NAME = 'approved_headcount'
    `);

    if (columns.length === 0) {
      console.log('Adding approved_headcount column to departments table...');
      await pool.query(`
        ALTER TABLE departments 
        ADD COLUMN approved_headcount INT NOT NULL DEFAULT 0,
        ADD CONSTRAINT chk_dept_approved_headcount CHECK (approved_headcount >= 0)
      `);
      console.log('Successfully added approved_headcount column to departments table.');
    } else {
      console.log('approved_headcount column already exists in departments table.');
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

migrate();

