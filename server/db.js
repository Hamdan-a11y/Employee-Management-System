const mysql = require('mysql2/promise');
const config = require('./config/env');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  connectTimeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

// Test connection on boot (non-blocking)
(async () => {
  try {
    const connection = await pool.getConnection();
    connection.release();
    if (!config.isTest) {
      console.log(`[Database] Successfully connected to MySQL database: ${config.db.database}@${config.db.host}:${config.db.port}`);
    }
  } catch (err) {
    console.error(`[Database Error] Could not connect to MySQL at ${config.db.host}:${config.db.port} - ${err.message}`);
  }
})();

module.exports = pool;
