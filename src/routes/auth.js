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

  // Two login limits, both created per app (so each test app gets its own counters) and both
  // counting failed logins only (so normal use never hits them).
  //
  // 1. Per account: 10 failures per email per 15 minutes, from any IP. This is the brute-force
  //    protection: nobody gets more than 10 guesses at one password, however many IPs they use.
  //    Trade-off (accepted for a demo, stated in ARCHITECTURE.md): anyone who knows an email can
  //    keep that one account locked by sending 10 bad guesses every 15 minutes. Production would
  //    switch to a CAPTCHA or email unlock after the failures instead of a hard block.
  //
  // 2. Per IP: 50 failures per 15 minutes. Stops one source spraying a password across many
  //    accounts. It is set well above 10 so one person's typos (or one attacked account) do not
  //    lock out colleagues who share the same office network or proxy IP.
  const accountLimiter = rateLimit({
    windowMs: config.LOGIN_WINDOW_MS,
    limit: config.LOGIN_MAX_FAILURES,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `email:${String(req.body?.email || '').toLowerCase()}`,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  });

  const ipLimiter = rateLimit({
    windowMs: config.LOGIN_WINDOW_MS,
    limit: config.LOGIN_MAX_FAILURES_PER_IP,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  });

  router.post('/login', ipLimiter, accountLimiter, async (req, res) => {
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
