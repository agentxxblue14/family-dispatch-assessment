// Lock 1: the tenant repository. This is the ONLY place application code reads or writes
// tenant data.
//
// tenantRepo(db, user) returns functions that are already bound to one user. Every SQL
// statement below filters by company_id = user.company_id, and driver reads also filter by
// driver_id = user.id. The user object comes from the server session (see auth/middleware.js),
// never from the browser. Every statement also runs inside withTenant, so Row Level Security
// (Lock 2) applies the same company filter a second time, in the database.
//
// Returns raw rows. Routes turn them into JSON with http/serialize.js.
const { withTenant } = require('./index');
const { nextStatus } = require('../policy/workflow');

// One SELECT used by listLoads, getLoad and advanceLoad, so all three return the same shape.
// The joins repeat the company filter, so a row can only ever join to its own company.
const LOAD_SELECT = `
  SELECT l.id, l.ref, l.origin, l.destination, l.status, l.driver_id, l.truck_id,
         u.name AS driver_name, t.unit AS truck_unit,
         EXISTS (SELECT 1 FROM documents d WHERE d.load_id = l.id AND d.company_id = l.company_id) AS has_document
    FROM loads l
    LEFT JOIN users u ON u.id = l.driver_id AND u.company_id = l.company_id
    LEFT JOIN trucks t ON t.id = l.truck_id AND t.company_id = l.company_id
   WHERE l.company_id = $1`;

function tenantRepo(db, user, { enforceRls = true } = {}) {
  const companyId = user.company_id;
  const isDriver = user.role === 'driver';
  const run = (fn) => withTenant(db, companyId, fn, { enforceRls });

  // Drivers only ever see loads assigned to them. Adds "AND l.driver_id = $n" when needed.
  function driverScope(params) {
    if (!isDriver) return '';
    params.push(user.id);
    return ` AND l.driver_id = $${params.length}`;
  }

  async function selectLoad(tx, id) {
    const params = [companyId, id];
    const sql = `${LOAD_SELECT} AND l.id = $2${driverScope(params)}`;
    const { rows } = await tx.query(sql, params);
    return rows[0] || null;
  }

  return {
    listLoads() {
      return run(async (tx) => {
        const params = [companyId];
        const sql = `${LOAD_SELECT}${driverScope(params)} ORDER BY l.ref`;
        return (await tx.query(sql, params)).rows;
      });
    },

    // null when the load belongs to another company, does not exist, or (for a driver)
    // is assigned to someone else. The caller cannot tell these apart, on purpose.
    getLoad(id) {
      return run((tx) => selectLoad(tx, id));
    },

    // Moves a load one step forward. The row is locked (FOR UPDATE) so two clicks at the
    // same moment cannot both move it. Status change and history row commit together.
    advanceLoad(id) {
      return run(async (tx) => {
        const params = [id, companyId];
        const lockSql = `SELECT l.id, l.status, l.driver_id FROM loads l
                          WHERE l.id = $1 AND l.company_id = $2${driverScope(params)} FOR UPDATE`;
        const current = (await tx.query(lockSql, params)).rows[0];
        if (!current) return null;
        const next = nextStatus(current.status);
        if (!next) return { conflict: true };
        await tx.query('UPDATE loads SET status = $1 WHERE id = $2 AND company_id = $3', [next, id, companyId]);
        await tx.query(
          `INSERT INTO load_events (company_id, load_id, from_status, to_status, user_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [companyId, id, current.status, next, user.id],
        );
        return { load: await selectLoad(tx, id) };
      });
    },

    listEvents(loadId) {
      return run(async (tx) => {
        const { rows } = await tx.query(
          `SELECT e.id, e.from_status, e.to_status, e.at, u.name AS user_name
             FROM load_events e
             JOIN users u ON u.id = e.user_id AND u.company_id = e.company_id
            WHERE e.company_id = $1 AND e.load_id = $2
            ORDER BY e.at, e.id`,
          [companyId, loadId],
        );
        return rows;
      });
    },

    listDrivers() {
      return run(async (tx) => {
        const { rows } = await tx.query(
          `SELECT u.id, u.name, u.email,
                  (SELECT count(*)::int FROM loads l
                    WHERE l.driver_id = u.id AND l.company_id = u.company_id AND l.status <> 'Delivered') AS open_loads
             FROM users u
            WHERE u.company_id = $1 AND u.role = 'driver'
            ORDER BY u.name`,
          [companyId],
        );
        return rows;
      });
    },

    listTrucks() {
      return run(async (tx) => {
        const { rows } = await tx.query(
          `SELECT t.id, t.unit,
                  (SELECT count(*)::int FROM loads l
                    WHERE l.truck_id = t.id AND l.company_id = t.company_id AND l.status <> 'Delivered') AS open_loads
             FROM trucks t
            WHERE t.company_id = $1
            ORDER BY t.unit`,
          [companyId],
        );
        return rows;
      });
    },

    // Newest document for a load (uploads are append-only; older ones stay as history).
    // Returns stored_name so the route can find the file; the serializer never sends it out.
    getDocument(loadId) {
      return run(async (tx) => {
        const { rows } = await tx.query(
          `SELECT d.id, d.filename, d.stored_name, d.mime, d.size_bytes, d.uploaded_at, u.name AS uploaded_by_name
             FROM documents d
             JOIN users u ON u.id = d.uploaded_by AND u.company_id = d.company_id
            WHERE d.company_id = $1 AND d.load_id = $2
            ORDER BY d.id DESC LIMIT 1`,
          [companyId, loadId],
        );
        return rows[0] || null;
      });
    },

    addDocument(loadId, { filename, storedName, mime, sizeBytes }) {
      return run(async (tx) => {
        const { rows } = await tx.query(
          `INSERT INTO documents (company_id, load_id, filename, stored_name, mime, size_bytes, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, filename, stored_name, mime, size_bytes, uploaded_at`,
          [companyId, loadId, filename, storedName, mime, sizeBytes, user.id],
        );
        return { ...rows[0], uploaded_by_name: user.name };
      });
    },

    logDenial(method, path, status) {
      return run((tx) =>
        tx.query('INSERT INTO access_denials (company_id, user_id, method, path, status) VALUES ($1, $2, $3, $4, $5)', [
          companyId,
          user.id,
          method,
          path.slice(0, 300),
          status,
        ]),
      );
    },

    listDenials() {
      return run(async (tx) => {
        const { rows } = await tx.query(
          `SELECT d.id, d.method, d.path, d.status, d.at, u.name AS user_name, u.role AS user_role
             FROM access_denials d
             JOIN users u ON u.id = d.user_id AND u.company_id = d.company_id
            WHERE d.company_id = $1
            ORDER BY d.id DESC LIMIT 200`,
          [companyId],
        );
        return rows;
      });
    },
  };
}

module.exports = { tenantRepo };
