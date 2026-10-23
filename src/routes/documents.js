// POST /api/loads/:id/document (upload a POD), GET /api/loads/:id/document (download it)
const express = require('express');
const multer = require('multer');
const config = require('../config');
const { requireLoadAccess } = require('../auth/middleware');
const { HttpError, notFound, UPLOAD_RULE } = require('../http/errors');
const { toDocJson } = require('../http/serialize');
const { detectType, safeDisplayName, saveFile, filePath } = require('../storage');

// Files are held in memory (max 5 MB) so they can be checked before anything touches the disk.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 1 } });

function documentRoutes() {
  const router = express.Router();

  // Order: login (in app.js) > load lookup and permission > only then read the file.
  // A foreign or unauthenticated upload is refused before a single file byte is accepted.
  router.post('/:id/document', requireLoadAccess('doc:upload'), upload.single('file'), async (req, res) => {
    if (!req.file) throw new HttpError(400, UPLOAD_RULE);
    const type = detectType(req.file.buffer);
    if (!type) throw new HttpError(400, UPLOAD_RULE);

    const storedName = await saveFile(req.user.company_id, req.file.buffer, type.ext);
    const doc = await req.repo.addDocument(req.load.id, {
      filename: safeDisplayName(req.file.originalname, type.ext),
      storedName,
      mime: type.mime,
      sizeBytes: req.file.size,
    });
    res.status(201).json({ document: toDocJson(doc) });
  });

  router.get('/:id/document', requireLoadAccess('doc:view'), async (req, res) => {
    const doc = await req.repo.getDocument(req.load.id);
    if (!doc) throw notFound();
    res.download(filePath(req.user.company_id, doc.stored_name), doc.filename, {
      headers: { 'Content-Type': doc.mime },
    });
  });

  return router;
}

module.exports = { documentRoutes };
