// GET /api/audit/denials (owner only): blocked attempts made by users of the owner's company.
const express = require('express');
const { requirePermission } = require('../auth/middleware');
const { toDenialJson } = require('../http/serialize');

function auditRoutes() {
  const router = express.Router();

  router.get('/denials', requirePermission('audit:view'), async (req, res) => {
    const rows = await req.repo.listDenials();
    res.json(rows.map(toDenialJson));
  });

  return router;
}

module.exports = { auditRoutes };
