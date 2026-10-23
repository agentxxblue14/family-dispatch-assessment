// Error types and the one error handler that turns them into JSON responses.
const { ZodError } = require('zod');
const multer = require('multer');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// The same 404 body is used for "does not exist", "another company's" and "another driver's",
// so a caller can never tell which one it was.
const notFound = () => new HttpError(404, 'Not found');
const forbidden = () => new HttpError(403, 'Forbidden');

const UPLOAD_RULE = 'Only PDF, PNG or JPG up to 5 MB';

// Express 5 sends errors thrown in async handlers here automatically.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof ZodError) return res.status(400).json({ error: 'Invalid input' });
  if (err instanceof multer.MulterError) return res.status(400).json({ error: UPLOAD_RULE });
  // Body parser errors (bad JSON, body too large) carry a 4xx status.
  if (err.status >= 400 && err.status < 500) return res.status(err.status).json({ error: 'Invalid input' });
  // Anything else: log the details on the server only, never send them to the browser.
  console.error(err);
  return res.status(500).json({ error: 'Server error' });
}

module.exports = { HttpError, notFound, forbidden, errorHandler, UPLOAD_RULE };
