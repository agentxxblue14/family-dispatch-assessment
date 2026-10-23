// POST /api/login, POST /api/logout, GET /api/me
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { findUserForLogin, findUserById } = require('../db');
const { HttpError } = require('../http/errors');
const { loginBody } = require('../http/validate');
const { toUserJson } = require('../http/serialize');
const { requireAuth } = require('../auth/middleware');

// Compared against when the email is unknown, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

function authRoutes() {
  const router = express.Router();

  // Created per app, so each test app gets its own counter.
  // Only failed logins count, so normal use never hits the limit.
  const loginLimiter = rateLimit({
    windowMs: config.LOGIN_WINDOW_MS,
    limit: config.LOGIN_MAX_FAILURES,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = loginBody.parse(req.body);
    const user = await findUserForLogin(req.app.locals.db, email);
    const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, 'Invalid email or password');

    // New session id at login, so a session id planted before login is useless (fixation).
    await new Promise((done, fail) => req.session.regenerate((err) => (err ? fail(err) : done())));
    req.session.userId = user.id;
    res.json({ user: toUserJson(await findUserById(req.app.locals.db, user.id)) });
  });

  router.post('/logout', requireAuth, async (req, res) => {
    await new Promise((done) => req.session.destroy(done));
    res.clearCookie('fd.sid').status(204).end();
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json(toUserJson(req.user));
  });

  return router;
}


module.exports = { authRoutes };
