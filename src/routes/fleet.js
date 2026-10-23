// GET /api/drivers, GET /api/trucks (owner and dispatcher only)
const express = require('express');
const { requirePermission } = require('../auth/middleware');

function fleetRoutes() {
  const router = express.Router();

  router.get('/drivers', requirePermission('fleet:view'), async (req, res) => {
    const rows = await req.repo.listDrivers();
    res.json(rows.map((d) => ({ id: d.id, name: d.name, email: d.email, openLoads: d.open_loads })));
  });

  router.get('/trucks', requirePermission('fleet:view'), async (req, res) => {
    const rows = await req.repo.listTrucks();
    res.json(rows.map((t) => ({ id: t.id, unit: t.unit, openLoads: t.open_loads })));
  });

  return router;
}

module.exports = { fleetRoutes };
