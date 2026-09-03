const crypto = require('crypto');
const express = require('express');
const { db } = require('./db');

const router = express.Router();

const TITLE_MAX = 200;
const TEXT_MAX = 50000;
const NAME_MAX = 200;

function mapFolder(row) {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

function mapPrompt(row) {
  return {
    id: row.id,
    folderId: row.folder_id,
    title: row.title,
    text: row.text,
    createdAt: row.created_at,
    updatedAt: row.updated_at
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

// ---------- Combined data load ----------
router.get('/api/data', (req, res) => {
  const folders = db.prepare('SELECT * FROM folders ORDER BY created_at ASC').all().map(mapFolder);
  const prompts = db.prepare('SELECT * FROM prompts ORDER BY created_at ASC').all().map(mapPrompt);
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

router.delete('/api/folders/:id', (req, res) => {
  const folder = db.prepare('SELECT id FROM folders WHERE id = ?').get(req.params.id);
  if (!folder) return res.status(404).json({ error: 'Folder not found' });

  const { count } = db.prepare('SELECT COUNT(*) AS count FROM prompts WHERE folder_id = ?').get(req.params.id);
  db.prepare('DELETE FROM folders WHERE id = ?').run(req.params.id);
  res.json({ deletedPromptCount: count });
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
  const existing = db.prepare('SELECT * FROM prompts WHERE id = ?').get(req.params.id);
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
  const result = db.prepare('DELETE FROM prompts WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Prompt not found' });
  res.status(204).end();
});

// ---------- Export / Import ----------
router.get('/api/export', (req, res) => {
  const folders = db.prepare('SELECT * FROM folders ORDER BY created_at ASC').all().map(mapFolder);
  const prompts = db.prepare('SELECT * FROM prompts ORDER BY created_at ASC').all().map(mapPrompt);
  res.json({ exportedAt: new Date().toISOString(), folders, prompts });
});

router.post('/api/import', (req, res) => {
  const incomingFolders = Array.isArray(req.body.folders) ? req.body.folders : [];
  const incomingPrompts = Array.isArray(req.body.prompts) ? req.body.prompts : [];

  const existingFolders = db.prepare('SELECT * FROM folders').all();
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

module.exports = router;
