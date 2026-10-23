// Role permissions: one table, one function, used by every route.
//
// Company isolation is NOT decided here. The repository (Lock 1) and Row Level Security (Lock 2)
// already guarantee that any load passed in belongs to the user's company. This file adds the
// role rules, plus the rule that a driver only touches loads assigned to them.

const PERMISSIONS = Object.freeze({
  'fleet:view': Object.freeze(['owner', 'dispatcher']),
  'load:view': Object.freeze(['owner', 'dispatcher', 'driver']),
  'load:advance': Object.freeze(['owner', 'dispatcher', 'driver']),
  'doc:upload': Object.freeze(['owner', 'dispatcher', 'driver']),
  'doc:view': Object.freeze(['owner', 'dispatcher', 'driver']),
  'audit:view': Object.freeze(['owner']),
});

// Deny by default: an unknown action or role is never allowed.
function can(user, action, load) {
  const allowedRoles = Object.hasOwn(PERMISSIONS, action) ? PERMISSIONS[action] : [];
  if (!allowedRoles.includes(user.role)) return false;
  if (user.role === 'driver' && load) return load.driver_id === user.id;
  return true;
}

module.exports = { PERMISSIONS, can };
