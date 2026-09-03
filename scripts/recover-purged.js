// Run this directly on the server (e.g. `docker compose exec prompt-ledger
// node scripts/recover-purged.js list`), not through the app - there's no
// login here, so this is intentionally only reachable by whoever has shell
// access to the box, not exposed as an API route.
//
// Usage:
//   node scripts/recover-purged.js list
//   node scripts/recover-purged.js restore folder <id>
//   node scripts/recover-purged.js restore prompt <id>
//
// "restore" only clears purged_at - the item lands back in the normal
// Recycle bin, where it still needs a regular restore (in the app, or with
// this same script) to become visible in the library again.

const { db } = require('../src/db');

function listPurged() {
  const folders = db.prepare('SELECT id, name, deleted_at, purged_at FROM folders WHERE purged_at IS NOT NULL ORDER BY purged_at DESC').all();
  const prompts = db.prepare('SELECT id, title, folder_id, deleted_at, purged_at FROM prompts WHERE purged_at IS NOT NULL ORDER BY purged_at DESC').all();

  console.log(`Purged folders (${folders.length}):`);
  folders.forEach((f) => console.log(`  ${f.id}  "${f.name}"  purged ${new Date(f.purged_at).toISOString()}`));

  console.log(`\nPurged prompts (${prompts.length}):`);
  prompts.forEach((p) => console.log(`  ${p.id}  "${p.title}"  purged ${new Date(p.purged_at).toISOString()}`));
}

function restore(type, id) {
  const table = type === 'folder' ? 'folders' : type === 'prompt' ? 'prompts' : null;
  if (!table || !id) {
    console.error('Usage: node scripts/recover-purged.js restore <folder|prompt> <id>');
    process.exitCode = 1;
    return;
  }
  const result = db.prepare(`UPDATE ${table} SET purged_at = NULL WHERE id = ? AND purged_at IS NOT NULL`).run(id);
  if (result.changes === 0) {
    console.error(`No purged ${type} with id ${id}. Run "list" to see what's recoverable.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Un-purged ${type} ${id}. It's back in the Recycle bin - restore it from there (or with this script) to bring it back into the library.`);
}

const [, , cmd, type, id] = process.argv;
if (cmd === 'list') {
  listPurged();
} else if (cmd === 'restore') {
  restore(type, id);
} else {
  console.log('Usage:');
  console.log('  node scripts/recover-purged.js list');
  console.log('  node scripts/recover-purged.js restore <folder|prompt> <id>');
  process.exitCode = 1;
}
