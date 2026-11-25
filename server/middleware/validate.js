const { z } = require('zod');

/**
 * Middleware factory that validates req.body against a strict Zod schema.
 * Rejects unknown fields, client-supplied timestamps, status, or manipulation fields.
 */
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      let message = 'Invalid request payload.';
      if (firstIssue?.code === 'unrecognized_keys') {
        message = `Unknown or disallowed field(s): ${firstIssue.keys.join(', ')}`;
      } else if (firstIssue?.message) {
        message = firstIssue.path?.length
          ? `${firstIssue.path.join('.')}: ${firstIssue.message}`
          : firstIssue.message;
      }
      return res.status(400).json({
        success: false,
        message,
        code: 'VALIDATION_ERROR',
      });
    }
    req.body = result.data;
    next();
  };
}

module.exports = {
  validateBody,
  z,
};
