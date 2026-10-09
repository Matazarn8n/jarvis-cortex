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

test('index: une entree trop longue garde son lien intact (parseable par recall)', async () => {
  const b = bac();
  const store = await chargeStore(b);
  const name = 'n'.repeat(100);
  store('x'.repeat(300), { type: 'feedback', name });
  const ligne = fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8').trim().split('\n').pop();
  assert.ok(ligne.length <= 200, 'longueur ' + ligne.length);
  assert.match(ligne, /\[[^\]]+\]\([^)]+\.md\)/);
});

test('recall: une regle revoquee (.vN) n est jamais rappelee', async () => {
  const b = bac();
  const m = await import(b.mod + '?t=' + Math.random());
  m.store('regle ancienne suppression', { type: 'feedback', name: 'suppression' });
  m.store('regle courante suppression', { type: 'feedback', name: 'suppression' });
  const r = m.recall('suppression', { k: 5 });
  assert.ok(r.hits.every(h => !/\.v\d+\.md$/.test(h.file)), JSON.stringify(r.hits.map(h => h.file)));
});

test('store: un nom de fichier > 120 caracteres est refuse (le lien d index reste borne)', async () => {
  const b = bac();
  const store = await chargeStore(b);
  assert.throws(() => store('fait', { type: 'feedback', name: 'n'.repeat(220) }), /nom trop long/);
});

test('recall: pointeur d index et lien suivi vers une archive .vN ignores', async () => {
  const b = bac();
  const m = await import(b.mod + '?t=' + Math.random());
  m.store('regle ancienne suppression', { type: 'feedback', name: 'suppression' });
  m.store('regle courante suppression', { type: 'feedback', name: 'suppression' });
  fs.appendFileSync(path.join(b.mem, 'MEMORY.md'), '- [Vieux](feedback_suppression.v1.md) — suppression ancienne\n');
  fs.appendFileSync(path.join(b.mem, 'feedback_suppression.md'), '\nVoir feedback_suppression.v1.md\n');
  const r = m.recall('suppression', { k: 1 });
  assert.ok(r.hits.every(h => !/\.v\d+\.md$/.test(h.file)), JSON.stringify(r.hits.map(h => h.file)));
  assert.ok(r.hits.every(h => !/ancienne/.test(h.slice)));
});

test('recall: pointeur d index deguise (x.v1.md/.) ne contourne pas le filtre des archives', async () => {
  const b = bac();
  const m = await import(b.mod + '?t=' + Math.random());
  m.store('regle ancienne suppression', { type: 'feedback', name: 'suppression' });
  m.store('regle courante suppression', { type: 'feedback', name: 'suppression' });
  fs.appendFileSync(path.join(b.mem, 'MEMORY.md'), '- [Ancienne suppression](feedback_suppression.v1.md/.) — suppression ancienne\n');
  const r = m.recall('suppression', { k: 3, hop: false });
  assert.ok(r.hits.every(h => !/\.v\d+\.md/.test(h.file)), JSON.stringify(r.hits.map(h => h.file)));
  assert.ok(r.hits.every(h => !/ancienne/.test(h.slice)));
});

test('recall: archives feedback en .V1 / .v01 / lien symbolique ignorees, doc actif reference_x.v1 rappelable', async () => {
  const b = bac();
  const m = await import(b.mod + '?t=' + Math.random());
  m.store('regle ancienne suppression', { type: 'feedback', name: 'suppression' });
  m.store('regle courante suppression', { type: 'feedback', name: 'suppression' });
  const v1 = path.join(b.mem, 'feedback_suppression.v1.md');
  fs.copyFileSync(v1, path.join(b.mem, 'feedback_suppression.V1.md'));
  fs.copyFileSync(v1, path.join(b.mem, 'feedback_suppression.v01.md'));
  fs.symlinkSync(v1, path.join(b.mem, 'suppression_alias.md'));
  fs.appendFileSync(path.join(b.mem, 'MEMORY.md'),
    '- [A](feedback_suppression.V1.md) — suppression\n- [B](suppression_alias.md) — suppression\n- [C](feedback_suppression.v01.md) — suppression\n');
  const r = m.recall('suppression', { k: 9, hop: false });
  assert.ok(r.hits.every(h => !/ancienne/.test(h.slice)), JSON.stringify(r.hits.map(h => h.file)));
  fs.writeFileSync(path.join(b.mem, 'reference_protocol.v1.md'), '---\nname: p\n---\nprotocole actif');
  fs.appendFileSync(path.join(b.mem, 'MEMORY.md'), '- [P](reference_protocol.v1.md) — protocol\n');
  const r2 = m.recall('protocol', { k: 3, hop: false });
  assert.ok(r2.hits.some(h => /reference_protocol\.v1\.md$/.test(h.file)), JSON.stringify(r2.hits.map(h => h.file)));
});
