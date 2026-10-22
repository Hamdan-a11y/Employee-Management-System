require('dotenv').config();
const pool = require('./db');

async function migrate() {
  console.log('Running migration for Employee Profile & Documents...');

  // 1. Check & add avatar_url column
  const [cols] = await pool.query('SHOW COLUMNS FROM employees LIKE ?', ['avatar_url']);
  if (cols.length === 0) {
    await pool.query('ALTER TABLE employees ADD COLUMN avatar_url VARCHAR(255) NULL AFTER designation');
    console.log('✓ Added avatar_url column to employees');
  } else {
    console.log('✓ avatar_url column already exists');
  }

  // 2. Check & create employee_documents table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_documents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      title VARCHAR(150) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_path VARCHAR(255) NOT NULL,
      file_size INT NOT NULL,
      file_type VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      INDEX idx_employee_id (employee_id)
    )
  `);
  console.log('✓ employee_documents table verified/created');

  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
