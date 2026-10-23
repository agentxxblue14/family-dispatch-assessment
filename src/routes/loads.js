// GET /api/loads, GET /api/loads/:id, POST /api/loads/:id/advance
const express = require('express');
const { requireLoadAccess } = require('../auth/middleware');
const { HttpError, notFound } = require('../http/errors');
const { toLoadJson, toEventJson, toDocJson } = require('../http/serialize');

function loadRoutes() {
  const router = express.Router();

  // Owner and dispatcher: every load in their company. Driver: only loads assigned to them.
  // The repository applies both rules; the query string is never read.
  router.get('/', async (req, res) => {
    const rows = await req.repo.listLoads();
    res.json(rows.map(toLoadJson));
  });

  router.get('/:id', requireLoadAccess('load:view'), async (req, res) => {
    const [events, doc] = await Promise.all([req.repo.listEvents(req.load.id), req.repo.getDocument(req.load.id)]);
    res.json({ load: toLoadJson(req.load), events: events.map(toEventJson), document: doc && toDocJson(doc) });
  });

  // The request body is ignored completely: the server decides the next status.
  router.post('/:id/advance', requireLoadAccess('load:advance'), async (req, res) => {
    const result = await req.repo.advanceLoad(req.load.id);
    if (!result) throw notFound();
    if (result.conflict) throw new HttpError(409, 'Load is already Delivered');
    res.json({ load: toLoadJson(result.load) });
  });

  return router;
}

module.exports = { loadRoutes };
