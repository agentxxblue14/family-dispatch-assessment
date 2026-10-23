// GET /api/loads, GET /api/loads/:id, POST /api/loads/:id/advance
const express = require('express');
const { requireLoadAccess } = require('../auth/middleware');
const { HttpError, notFound } = require('../http/errors');
const { toLoadJson, toEventJson, toDocJson } = require('../http/serialize');
const { advanceBody } = require('../http/validate');

const CONFLICTS = {
  changed: 'This load has changed. Refresh and try again.',
  delivered: 'Load is already Delivered',
  'needs-pod': 'Upload the delivery document (POD) before marking Delivered',
};

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

  // The body carries only {from}: the status on the user's screen. The server decides the next
  // status. The load check runs first, so another company's load is 404 whatever the body says.
  router.post('/:id/advance', requireLoadAccess('load:advance'), async (req, res) => {
    const { from } = advanceBody.parse(req.body ?? {});
    const result = await req.repo.advanceLoad(req.load.id, from);
    if (!result) throw notFound();
    if (result.conflict) throw new HttpError(409, CONFLICTS[result.conflict]);
    res.json({ load: toLoadJson(result.load) });
  });

  return router;
}

module.exports = { loadRoutes };
