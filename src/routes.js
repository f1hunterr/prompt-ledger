const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const archiver = require('archiver');
const { db } = require('./db');

const router = express.Router();

const TITLE_MAX = 200;
const TEXT_MAX = 50000;
const NAME_MAX = 200;

const EXTENSION_DIR = path.join(__dirname, '..', 'extension-shared');
const SERVER_URL_PLACEHOLDER = '__DEFAULT_SERVER_URL__';
const EXTENSION_VERSION_PLACEHOLDER = '__EXTENSION_VERSION__';
// Changes every time this process starts (a redeploy, a plain restart, a
// crash recovery), which is exactly what the client-side update banner
// wants to detect - no manual version bumping to remember.
const STARTED_AT = Date.now();

// A stable fingerprint of the extension's own source files (not the
// server app's). A previously-downloaded copy of extension-shared/ bakes
// this in at zip-build time (see /extension.zip below) and compares it
// against GET /api/extension-version, so the extension's own side panel
// can tell the user "there's a newer version of me" - Chrome has no
// update mechanism at all for a "Load unpacked" extension, so this is
// only ever a notice, never an automatic install.
function computeExtensionVersion() {
  const files = ['manifest.json', 'background.js', 'sidepanel.html', 'sidepanel.css', 'sidepanel.js'];
  const hash = crypto.createHash('sha256');
  files.forEach((name) => hash.update(fs.readFileSync(path.join(EXTENSION_DIR, name))));
  return hash.digest('hex').slice(0, 12);
}
const EXTENSION_VERSION = computeExtensionVersion();

function mapFolder(row) {
  return { id: row.id, name: row.name, createdAt: row.created_at, deletedAt: row.deleted_at ?? null };
}

function mapPrompt(row) {
  return {
    id: row.id,
    folderId: row.folder_id,
    title: row.title,
    text: row.text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null
  };
}

function cleanString(value, maxLen) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

// ---------- Health ----------
router.get('/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ status: 'error' });
  }
});

router.get('/api/version', (req, res) => {
  res.json({ startedAt: STARTED_AT });
});

router.get('/api/extension-version', (req, res) => {
  res.json({ version: EXTENSION_VERSION });
});

// ---------- Pre-configured Chrome extension download ----------
router.get('/extension.zip', (req, res) => {
  const origin = `${req.protocol}://${req.get('host')}`;
  const sidepanelJs = fs
    .readFileSync(path.join(EXTENSION_DIR, 'sidepanel.js'), 'utf8')
    .replace(SERVER_URL_PLACEHOLDER, origin)
    .replace(EXTENSION_VERSION_PLACEHOLDER, EXTENSION_VERSION);

  res.attachment('prompt-ledger-extension.zip');
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    console.error('extension.zip build failed:', err);
    res.status(500).end();
  });
  archive.pipe(res);
  archive.glob('**/*', { cwd: EXTENSION_DIR, ignore: ['sidepanel.js'] });
  archive.append(sidepanelJs, { name: 'sidepanel.js' });
  archive.finalize();
});

// ---------- Combined data load ----------
router.get('/api/data', (req, res) => {
  const folders = db.prepare('SELECT * FROM folders WHERE deleted_at IS NULL ORDER BY created_at ASC').all().map(mapFolder);
  const prompts = db.prepare('SELECT * FROM prompts WHERE deleted_at IS NULL ORDER BY created_at ASC').all().map(mapPrompt);
  res.json({ folders, prompts });
});

// ---------- Folders ----------
router.post('/api/folders', (req, res) => {
  const name = cleanString(req.body.name, NAME_MAX);
  if (!name) return res.status(400).json({ error: 'Folder name required' });

  const row = { id: crypto.randomUUID(), name, created_at: Date.now() };
  db.prepare('INSERT INTO folders (id, name, created_at) VALUES (?, ?, ?)')
    .run(row.id, row.name, row.created_at);
  res.status(201).json(mapFolder(row));
});

router.put('/api/folders/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM folders WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Folder not found' });

  const name = cleanString(req.body.name, NAME_MAX);
  if (!name) return res.status(400).json({ error: 'Folder name required' });

  db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name, req.params.id);
  res.json(mapFolder({ ...existing, name }));
});

router.delete('/api/folders/:id', (req, res) => {
  const folder = db.prepare('SELECT id FROM folders WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
  if (!folder) return res.status(404).json({ error: 'Folder not found' });

  const now = Date.now();
  db.prepare('UPDATE folders SET deleted_at = ? WHERE id = ?').run(now, req.params.id);
  const { changes } = db.prepare('UPDATE prompts SET deleted_at = ? WHERE folder_id = ? AND deleted_at IS NULL')
    .run(now, req.params.id);
  res.json({ trashedPromptCount: changes });
});

// ---------- Prompts ----------
router.post('/api/prompts', (req, res) => {
  const title = cleanString(req.body.title, TITLE_MAX);
  const text = cleanString(req.body.text, TEXT_MAX);
  const folderId = typeof req.body.folderId === 'string' ? req.body.folderId : null;
  if (!title || !text) return res.status(400).json({ error: 'Title and text required' });

  const now = Date.now();
  const row = { id: crypto.randomUUID(), folder_id: folderId, title, text, created_at: now, updated_at: now };
  try {
    db.prepare(`
      INSERT INTO prompts (id, folder_id, title, text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(row.id, row.folder_id, row.title, row.text, row.created_at, row.updated_at);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid folder' });
  }
  res.status(201).json(mapPrompt(row));
});

router.put('/api/prompts/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM prompts WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Prompt not found' });

  const title = cleanString(req.body.title, TITLE_MAX);
  const text = cleanString(req.body.text, TEXT_MAX);
  const folderId = typeof req.body.folderId === 'string' ? req.body.folderId : null;
  if (!title || !text) return res.status(400).json({ error: 'Title and text required' });

  const updatedAt = Date.now();
  try {
    db.prepare('UPDATE prompts SET folder_id = ?, title = ?, text = ?, updated_at = ? WHERE id = ?')
      .run(folderId, title, text, updatedAt, req.params.id);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid folder' });
  }

  const row = db.prepare('SELECT * FROM prompts WHERE id = ?').get(req.params.id);
  res.json(mapPrompt(row));
});

router.delete('/api/prompts/:id', (req, res) => {
  const result = db.prepare('UPDATE prompts SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL')
    .run(Date.now(), req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Prompt not found' });
  res.status(204).end();
});

// ---------- Export / Import ----------
router.get('/api/export', (req, res) => {
  const folders = db.prepare('SELECT * FROM folders WHERE deleted_at IS NULL ORDER BY created_at ASC').all().map(mapFolder);
  const prompts = db.prepare('SELECT * FROM prompts WHERE deleted_at IS NULL ORDER BY created_at ASC').all().map(mapPrompt);
  res.json({ exportedAt: new Date().toISOString(), folders, prompts });
});

router.post('/api/import', (req, res) => {
  const incomingFolders = Array.isArray(req.body.folders) ? req.body.folders : [];
  const incomingPrompts = Array.isArray(req.body.prompts) ? req.body.prompts : [];

  const existingFolders = db.prepare('SELECT * FROM folders WHERE deleted_at IS NULL').all();
  const folderIdMap = {};
  const insertFolder = db.prepare('INSERT INTO folders (id, name, created_at) VALUES (?, ?, ?)');

  let folderCount = 0;
  incomingFolders.forEach((f) => {
    const name = cleanString(f.name, NAME_MAX) || 'Imported';
    const existing = existingFolders.find((sf) => sf.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      folderIdMap[f.id] = existing.id;
    } else {
      const newId = crypto.randomUUID();
      folderIdMap[f.id] = newId;
      insertFolder.run(newId, name, Date.now());
      existingFolders.push({ id: newId, name });
      folderCount++;
    }
  });

  const insertPrompt = db.prepare(`
    INSERT INTO prompts (id, folder_id, title, text, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  let importedCount = 0;
  incomingPrompts.forEach((p) => {
    const now = Date.now();
    const folderId = folderIdMap[p.folderId] || null;
    insertPrompt.run(
      crypto.randomUUID(),
      folderId,
      cleanString(p.title, TITLE_MAX) || 'Untitled prompt',
      cleanString(p.text, TEXT_MAX),
      now,
      now
    );
    importedCount++;
  });

  res.json({ importedCount, folderCount });
});

// ---------- Recycle bin ----------
// "Delete forever" / "Empty" below never run a real SQL DELETE - they stamp
// purged_at, which every query here filters out just like a normal delete.
// The rows physically stay in the SQLite file; recovering one after the
// fact is only possible via scripts/recover-purged.js run directly on the
// server, not through any API route - there's no login on this app, so an
// exposed "un-purge" endpoint would be recoverable by anyone, not just
// whoever manages the deployment.
router.get('/api/trash', (req, res) => {
  const folders = db.prepare('SELECT * FROM folders WHERE deleted_at IS NOT NULL AND purged_at IS NULL ORDER BY deleted_at DESC').all().map(mapFolder);
  const prompts = db.prepare('SELECT * FROM prompts WHERE deleted_at IS NOT NULL AND purged_at IS NULL ORDER BY deleted_at DESC').all().map(mapPrompt);
  res.json({ folders, prompts });
});

router.post('/api/trash/folders/:id/restore', (req, res) => {
  const folder = db.prepare('SELECT * FROM folders WHERE id = ? AND deleted_at IS NOT NULL AND purged_at IS NULL').get(req.params.id);
  if (!folder) return res.status(404).json({ error: 'Folder not found in trash' });

  db.prepare('UPDATE folders SET deleted_at = NULL WHERE id = ?').run(req.params.id);
  // Only bring back prompts that were trashed in the same folder-delete
  // action (same deleted_at stamp) - a prompt trashed separately, before
  // the folder went to trash, stays in trash until restored on its own.
  db.prepare('UPDATE prompts SET deleted_at = NULL WHERE folder_id = ? AND deleted_at = ? AND purged_at IS NULL')
    .run(req.params.id, folder.deleted_at);

  res.json(mapFolder({ ...folder, deleted_at: null }));
});

router.post('/api/trash/prompts/:id/restore', (req, res) => {
  const prompt = db.prepare('SELECT * FROM prompts WHERE id = ? AND deleted_at IS NOT NULL AND purged_at IS NULL').get(req.params.id);
  if (!prompt) return res.status(404).json({ error: 'Prompt not found in trash' });

  db.prepare('UPDATE prompts SET deleted_at = NULL WHERE id = ?').run(req.params.id);
  res.json(mapPrompt({ ...prompt, deleted_at: null }));
});

router.delete('/api/trash/folders/:id', (req, res) => {
  const folder = db.prepare('SELECT id FROM folders WHERE id = ? AND deleted_at IS NOT NULL AND purged_at IS NULL').get(req.params.id);
  if (!folder) return res.status(404).json({ error: 'Folder not found in trash' });

  const now = Date.now();
  // Detach any prompt that was restored back out of this folder before the
  // folder itself was restored, so purging the folder can't take a live,
  // visible prompt down with it.
  db.prepare('UPDATE prompts SET folder_id = NULL WHERE folder_id = ? AND deleted_at IS NULL').run(req.params.id);
  db.prepare('UPDATE prompts SET purged_at = ? WHERE folder_id = ? AND deleted_at IS NOT NULL AND purged_at IS NULL')
    .run(now, req.params.id);
  db.prepare('UPDATE folders SET purged_at = ? WHERE id = ?').run(now, req.params.id);
  res.status(204).end();
});

router.delete('/api/trash/prompts/:id', (req, res) => {
  const result = db.prepare('UPDATE prompts SET purged_at = ? WHERE id = ? AND deleted_at IS NOT NULL AND purged_at IS NULL')
    .run(Date.now(), req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Prompt not found in trash' });
  res.status(204).end();
});

router.post('/api/trash/empty', (req, res) => {
  const now = Date.now();
  // Same detach-first safety as the single-folder purge above, so a prompt
  // someone restored out of a still-trashed folder survives.
  db.prepare(`
    UPDATE prompts SET folder_id = NULL
    WHERE deleted_at IS NULL AND folder_id IN (SELECT id FROM folders WHERE deleted_at IS NOT NULL AND purged_at IS NULL)
  `).run();
  const deletedPromptCount = db.prepare('UPDATE prompts SET purged_at = ? WHERE deleted_at IS NOT NULL AND purged_at IS NULL').run(now).changes;
  const deletedFolderCount = db.prepare('UPDATE folders SET purged_at = ? WHERE deleted_at IS NOT NULL AND purged_at IS NULL').run(now).changes;
  res.json({ deletedFolderCount, deletedPromptCount });
});

module.exports = router;
