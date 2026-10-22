const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function initializeDatabase() {
  try {
    // Connect to MySQL server without selecting a DB first
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      multipleStatements: true
      // Allows running all SQL commands in one go
    });

    console.log(' Connected to MySQL successfully!');

    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    await connection.query(schema);

    console.log(' Database "employee_db" and all tables created successfully!');
    await connection.end();
  }
  catch (error)
  {
    console.error(' Database setup failed:');
    console.error(error.message);
  }
}

initializeDatabase();
