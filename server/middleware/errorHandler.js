const logger = require('../utils/logger');

const isProduction = process.env.NODE_ENV === 'production';

// Centralized error handler
function errorHandler(err, req, res, next) {
  let statusCode = err.status || err.statusCode || 500;
  let message = err.message || 'An unexpected internal server error occurred.';
  let code = err.code || 'INTERNAL_SERVER_ERROR';

  // 1. JSON parsing / Body syntax error
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    message = 'Invalid JSON payload provided.';
    code = 'INVALID_JSON_BODY';
  }

  // 2. CORS Block Error
  if (message.includes('CORS blocked')) {
    statusCode = 403;
    code = 'CORS_NOT_ALLOWED';
  }

  // 3. Multer file upload errors
  if (err.name === 'MulterError') {
    statusCode = 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'Uploaded file exceeds the maximum allowed size limit.';
      code = 'FILE_TOO_LARGE';
    } else {
      message = `File upload error: ${err.message}`;
      code = err.code;
    }
  }

  // 4. MySQL Database Errors
  if (err.code === 'ER_DUP_ENTRY') {
    statusCode = 400;
    message = 'A record with this unique information already exists.';
    code = 'DUPLICATE_ENTRY';
  } else if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    statusCode = 400;
    message = 'Referenced related record does not exist.';
    code = 'FOREIGN_KEY_VIOLATION';
  } else if (err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_CONNECTION_LOST') {
    statusCode = 503;
    message = 'Database service is currently unreachable. Please try again shortly.';
    code = 'DATABASE_UNAVAILABLE';
  }

  // 5. In production, never expose sensitive system/database internals on 500s
  if (statusCode >= 500 && isProduction) {
    message = 'An unexpected server error occurred. Please contact support if the issue persists.';
  }

  // Log error using structured logger
  logger.error(err.message, {
    requestId: req.id,
    path: req.originalUrl,
    method: req.method,
    statusCode,
    code,
    stack: err.stack,
  });

  const responsePayload = {
    success: false,
    status: 'error',
    message,
    code,
  };

  // Attach stack and details only in non-production environments
  if (!isProduction) {
    responsePayload.stack = err.stack;
    if (err.details) responsePayload.details = err.details;
  }

  res.status(statusCode).json(responsePayload);
}

// 404 Handler for undefined API routes
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    status: 'error',
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
    code: 'ROUTE_NOT_FOUND',
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
};
