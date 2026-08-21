import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SRC = process.env.BRAIN_UNDER_TEST || new URL('../brain.js', import.meta.url).pathname;

function bac() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-'));
  fs.mkdirSync(path.join(d, 'config'));
  fs.copyFileSync(SRC, path.join(d, 'brain.js'));
  fs.writeFileSync(path.join(d, 'config', 'workspace.json'),
    JSON.stringify({ root: '.', memoryDir: 'memoire', memoryIndex: 'MEMORY.md' }));
  return { dir: d, mem: path.join(d, 'memoire'), mod: path.join(d, 'brain.js') };
}

async function chargeStore(b) {
  const m = await import(b.mod + '?t=' + Math.random()); // pas de cache entre cas
  return m.store;
}

test('project (episodique): refus si le fichier existe deja, sans --force', async () => {
  const b = bac();
  const store = await chargeStore(b);
  store('premier evenement', { type: 'project', name: 'sonde_evt' });
  assert.throws(() => store('second evenement', { type: 'project', name: 'sonde_evt' }));
  const content = fs.readFileSync(path.join(b.mem, 'project_sonde_evt.md'), 'utf8');
  assert.match(content, /premier evenement/);
  assert.doesNotMatch(content, /second evenement/);
});

test('project (episodique): --force autorise l ecrasement explicite', async () => {
  const b = bac();
  const store = await chargeStore(b);
  store('premier evenement', { type: 'project', name: 'sonde_evt' });
  store('second evenement', { type: 'project', name: 'sonde_evt', force: true });
  const content = fs.readFileSync(path.join(b.mem, 'project_sonde_evt.md'), 'utf8');
  assert.match(content, /second evenement/);
  assert.doesNotMatch(content, /premier evenement/);
});

test('feedback (procedural): remplacement versionne, ancien contenu preserve', async () => {
  const b = bac();
  const store = await chargeStore(b);
  store('regle version 1', { type: 'feedback', name: 'regle_a' });
  store('regle version 2', { type: 'feedback', name: 'regle_a' });
  const current = fs.readFileSync(path.join(b.mem, 'feedback_regle_a.md'), 'utf8');
  const v1 = fs.readFileSync(path.join(b.mem, 'feedback_regle_a.v1.md'), 'utf8');
  assert.match(current, /regle version 2/);
  assert.match(v1, /regle version 1/);
});

test('user/reference (semantique): upsert sans version creee', async () => {
  const b = bac();
  const store = await chargeStore(b);
  store('fait user v1', { type: 'user', name: 'sonde_user' });
  store('fait user v2', { type: 'user', name: 'sonde_user' });
  store('fait ref v1', { type: 'reference', name: 'sonde_ref' });
  store('fait ref v2', { type: 'reference', name: 'sonde_ref' });
  const userContent = fs.readFileSync(path.join(b.mem, 'user_sonde_user.md'), 'utf8');
  const refContent = fs.readFileSync(path.join(b.mem, 'reference_sonde_ref.md'), 'utf8');
  assert.match(userContent, /fait user v2/);
  assert.doesNotMatch(userContent, /fait user v1/);
  assert.match(refContent, /fait ref v2/);
  assert.doesNotMatch(refContent, /fait ref v1/);
  assert.equal(fs.existsSync(path.join(b.mem, 'user_sonde_user.v1.md')), false);
  assert.equal(fs.existsSync(path.join(b.mem, 'reference_sonde_ref.v1.md')), false);
});
