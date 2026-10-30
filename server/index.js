const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');

const config = require('./config/env');
const pool = require('./db');
const logger = require('./utils/logger');
const { apiLimiter, authLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const departmentRoutes = require('./routes/departments');
const employeeRoutes = require('./routes/employees');
const auditLogRoutes = require('./routes/auditLogs');
const notificationRoutes = require('./routes/notifications');
const attendanceRoutes = require('./routes/attendance');
const leaveRoutes = require('./routes/leaves');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./docs/swaggerSpec');

const app = express();
const PORT = config.port;
const isProduction = config.isProduction;

// Disable X-Powered-By header
app.disable('x-powered-by');

// Production reverse proxy trust & HTTPS enforcement
if (isProduction) {
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      return next();
    }
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  });
}

// Request correlation ID and structured logger
app.use(logger.requestLogger());

// Security headers with Helmet
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'http://localhost:5000',
          'http://127.0.0.1:5000',
          config.clientUrl,
        ].filter(Boolean),
        connectSrc: [
          "'self'",
          'http://localhost:5173',
          'http://127.0.0.1:5173',
          'http://localhost:5174',
          'http://127.0.0.1:5174',
          'http://localhost:5175',
          'http://127.0.0.1:5175',
          'http://localhost:5000',
          config.clientUrl,
        ].filter(Boolean),
      },
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
  })
);

// Explicit CORS allowlist with credentials
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5175',
  config.clientUrl,
].filter(Boolean);

const isDevOrigin = (origin) => {
  if (!isProduction && origin) {
    try {
      const parsed = new URL(origin);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        return true;
      }
    } catch (e) {
      return false;
    }
  }
  return false;
};

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps or server-to-server) or matching origins
      if (!origin || allowedOrigins.includes(origin) || isDevOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked: Origin ${origin} not in allowlist.`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-XSRF-Token', 'X-Request-ID'],
  })
);

// Request body size limits and cookie parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Static uploads serving
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Swagger API Documentation (mounted before rate limiters)
const swaggerUiOptions = {
  customSiteTitle: 'Employee Management System API Documentation',
  customCss: '.swagger-ui .topbar { display: block; background-color: #1e1b4b; }',
};
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));
app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));

// General API rate limiter
app.use('/api/', apiLimiter);

// Authentication rate limiter for sensitive endpoints
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);

// Health check route
app.get('/api/health', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 + 1 AS result');
    res.json({
      status: 'ok',
      message: 'Server and Database are healthy!',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
      result: rows[0].result,
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      message: 'Database health check failed.',
      timestamp: new Date().toISOString(),
    });
  }
});

// 404 Handler for undefined API routes
app.use('/api', notFoundHandler);

// Centralized error handling middleware
app.use(errorHandler);

// Start the server if directly executed (skip app.listen on Vercel serverless)
let server = null;
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  server = app.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT} in [${process.env.NODE_ENV || 'development'}] mode`);
  });
}

// Graceful shutdown handling
const handleGracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Gracefully shutting down server...`);
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed.');
      pool.end().then(() => {
        logger.info('Database connections closed.');
        process.exit(0);
      });
    });
  } else {
    pool.end().then(() => process.exit(0));
  }
};

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

module.exports = app;
