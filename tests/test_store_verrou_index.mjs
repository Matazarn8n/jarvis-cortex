// Verrou de magasin (pas de vol d'un verrou vivant/frais), archives hors rappel,
// troncature d'index qui garde le pointeur entier.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SRC = process.env.BRAIN_UNDER_TEST || new URL('../brain.js', import.meta.url).pathname;

function bac() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'memlock-'));
  fs.mkdirSync(path.join(d, 'config'));
  fs.copyFileSync(SRC, path.join(d, 'brain.js'));
  fs.writeFileSync(path.join(d, 'config', 'workspace.json'),
    JSON.stringify({ root: '.', memoryDir: 'memoire', memoryIndex: 'MEMORY.md' }));
  fs.mkdirSync(path.join(d, 'memoire'));
  return { dir: d, mem: path.join(d, 'memoire'), mod: path.join(d, 'brain.js') };
}
const charge = async (b) => import(b.mod + '?t=' + Math.random());
const vieux = (f) => { const t = new Date(Date.now() - 3600_000); fs.utimesSync(f, t, t); };

test('verrou perime d un processus MORT : repris, ecriture reussit', async () => {
  const b = bac(); const m = await charge(b);
  const lock = path.join(b.mem, '.store.lock');
  fs.writeFileSync(lock, '999999999:0:x'); vieux(lock);
  m.store('regle', { type: 'feedback', name: 'r_mort' });
  assert.ok(fs.existsSync(path.join(b.mem, 'feedback_r_mort.md')));
  assert.equal(fs.existsSync(lock), false);
});

test('verrou VIEUX mais proprietaire VIVANT : jamais vole (timeout, verrou intact)', async () => {
  process.env.BRAIN_LOCK_TIMEOUT_MS = '300';
  const b = bac(); const m = await charge(b);
  delete process.env.BRAIN_LOCK_TIMEOUT_MS;
  const lock = path.join(b.mem, '.store.lock');
  fs.writeFileSync(lock, `${process.pid}:0:vivant`); vieux(lock);
  assert.throws(() => m.store('regle', { type: 'feedback', name: 'r_vivant' }), /verrou/);
  assert.equal(fs.readFileSync(lock, 'utf8'), `${process.pid}:0:vivant`);
});

test('rappel : les archives .vN.md ne sont pas des regles actives', async () => {
  const b = bac(); const m = await charge(b);
  m.store('regle alpha version un', { type: 'feedback', name: 'alpha' });
  m.store('regle alpha version deux', { type: 'feedback', name: 'alpha' });
  assert.ok(fs.existsSync(path.join(b.mem, 'feedback_alpha.v1.md')));
  const r = m.recall('alpha');
  const fichiers = JSON.stringify(r);
  assert.match(fichiers, /feedback_alpha\.md/);
  assert.doesNotMatch(fichiers, /feedback_alpha\.v1\.md/);
});

test('index : troncature garde le lien entier (slug de 100 caracteres)', async () => {
  const b = bac(); const m = await charge(b);
  const slug = 'a'.repeat(100);
  const r = m.store('x'.repeat(300), { type: 'feedback', name: slug });
  const ligne = fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8').trim().split('\n').pop();
  assert.match(ligne, /^- \[[^\]]+\]\(feedback_a+\.md\)/);
  assert.ok(ligne.includes(`(${path.basename(r.file)})`));
});
