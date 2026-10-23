// Request guards. This is where the company id for every request comes from.
const { findUserById } = require('../db');
const { tenantRepo } = require('../db/repo');
const { can } = require('../policy/permissions');
const { HttpError, notFound, forbidden } = require('../http/errors');
const { idParam } = require('../http/validate');

// Requires a logged-in session. The session holds only the user id; the user (and so the
// company) is loaded fresh from the database on every request. Nothing the browser sends
// (query, body, headers) is ever used to decide the company.
async function requireAuth(req, res, next) {
  const userId = req.session.userId;
  if (!userId) throw new HttpError(401, 'Not logged in');
  const user = await findUserById(req.app.locals.db, userId);
  if (!user) {
    await new Promise((done) => req.session.destroy(done));
    throw new HttpError(401, 'Not logged in');
  }
  req.user = user;
  req.repo = tenantRepo(req.app.locals.db, user, { enforceRls: req.app.locals.enforceRls });
  next();
}

// Role check for routes that are not about one load (fleet lists, blocked log).
// Wrong role inside your own company is 403, and the attempt is logged.
function requirePermission(action) {
  return async (req, res, next) => {
    if (!can(req.user, action)) {
      await req.repo.logDenial(req.method, req.originalUrl, 403);
      throw forbidden();
    }
    next();
  };
}

// For routes about one load: validates the id, loads it through the scoped repository and
// checks the role rule. Another company's load, another driver's load and a missing load
// all end the same way: logged, then 404 Not found. Sets req.load for the route.
function requireLoadAccess(action) {
  return async (req, res, next) => {
    const id = idParam.parse(req.params.id);
    const load = await req.repo.getLoad(id);
    if (!load || !can(req.user, action, load)) {
      await req.repo.logDenial(req.method, req.originalUrl, 404);
      throw notFound();
    }
    req.load = load;
    next();
  };
}

module.exports = { requireAuth, requirePermission, requireLoadAccess };
