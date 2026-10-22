require('dotenv').config();

function validateEnv() {
  const missing = [];
  const required = ['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET'];

  for (const key of required) {
    if (!process.env[key] || process.env[key].trim() === '') {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    const errorMsg = `[CRITICAL CONFIG ERROR] Missing required environment variable(s): ${missing.join(', ')}. Please check your .env file or refer to .env.example.`;
    console.error(errorMsg);
    if (process.env.NODE_ENV !== 'test') {
      throw new Error(errorMsg);
    }
  }

  const isProduction = process.env.NODE_ENV === 'production';

  // Production security checks
  if (isProduction) {
    const secret = process.env.JWT_SECRET || '';
    if (secret.length < 32 || secret.includes('secret') || secret.includes('12345')) {
      console.warn(
        '[SECURITY WARNING] JWT_SECRET in production appears weak or uses a default phrase. Ensure a strong 32+ character random key is set.'
      );
    }
  }

  return {
    isProduction,
    isTest: process.env.NODE_ENV === 'test',
    port: parseInt(process.env.PORT || '5000', 10),
    clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
    db: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'employee_db',
      ssl: process.env.DB_SSL === 'true' || (isProduction && process.env.DB_HOST !== 'localhost' && process.env.DB_HOST !== '127.0.0.1'),
    },
    jwtSecret: process.env.JWT_SECRET,
  };
}

const config = validateEnv();

module.exports = config;
