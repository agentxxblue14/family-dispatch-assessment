// Builds the Express app. Order matters: security headers, body limit, session, static files,
// then API routes, then the JSON 404 and the error handler.
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const config = require('./config');
const { requireAuth } = require('./auth/middleware');
const { errorHandler } = require('./http/errors');
const { authRoutes } = require('./routes/auth');
const { loadRoutes } = require('./routes/loads');
const { fleetRoutes } = require('./routes/fleet');
const { auditRoutes } = require('./routes/audit');

function createApp(db, { enforceRls = true } = {}) {
  const app = express();
  app.locals.db = db;
  app.locals.enforceRls = enforceRls;

  // Replit serves the app through a TLS proxy. Trusting one hop lets secure cookies work and
  // gives the rate limiter the real client IP instead of the proxy's.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Lets the Replit workspace preview pane show the app. Every other site is refused.
          frameAncestors: ["'self'", 'https://replit.com', 'https://*.replit.com'],
        },
      },
      // X-Frame-Options cannot list allowed sites; the CSP frame-ancestors rule above replaces it.
      xFrameOptions: false,
    }),
  );
  app.use(express.json({ limit: '20kb' }));
  app.use(
    session({
      name: 'fd.sid',
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true, // page scripts cannot read the cookie
        sameSite: 'strict', // the browser never sends it on requests started by other sites
        secure: process.env.NODE_ENV === 'production', // HTTPS only when deployed
        maxAge: 8 * 60 * 60 * 1000,
      },
    }),
  );
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api', authRoutes());
  // Everything below needs a logged-in user; requireAuth also sets req.user and req.repo.
  app.use('/api/loads', requireAuth, loadRoutes());
  app.use('/api/audit', requireAuth, auditRoutes());
  app.use('/api', requireAuth, fleetRoutes());

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
