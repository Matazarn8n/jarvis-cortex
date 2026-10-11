// Les deux régimes non triviaux de `store` tenaient leur promesse par un
// `existsSync` suivi d'une écriture. Entre les deux, un autre processus passe.
// Ces deux tests lancent de VRAIS processus concurrents : une boucle en un seul
// processus ne reproduit pas la course, elle la sérialise.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const SRC = process.env.BRAIN_UNDER_TEST || new URL('../brain.js', import.meta.url).pathname;
const ECRIVAINS = 8;

const WRAPPER = `
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { store } = require(process.argv[2]);
const top = Number(process.argv[3]);
// Attente ACTIVE jusqu'au top commun. Sans elle, le demarrage de node (~40 ms,
// et decale d'un enfant a l'autre) serialise les ecrivains : la course ne se
// reproduit pas, et un test qui passe des DEUX cotes du correctif ne mesure
// rien. Verifie le 2026-08-23 — a 6 enfants sans top, l'ancien brain.js passait.
while (Date.now() < top) {}
try { store(process.argv[4], { type: process.argv[5], name: process.argv[6] }); }
catch (e) { process.stderr.write(String(e.message)); process.exit(1); }
`;

function bac() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'memconc-'));
  fs.mkdirSync(path.join(d, 'config'));
  fs.copyFileSync(SRC, path.join(d, 'brain.js'));
  fs.writeFileSync(path.join(d, 'config', 'workspace.json'),
    JSON.stringify({ root: '.', memoryDir: 'memoire', memoryIndex: 'MEMORY.md' }));
  fs.writeFileSync(path.join(d, 'ecrivain.mjs'), WRAPPER);
  return { dir: d, mem: path.join(d, 'memoire'), mod: path.join(d, 'brain.js'),
           wrapper: path.join(d, 'ecrivain.mjs') };
}

function lanceTous(b, type, nom, faits) {
  const top = Date.now() + 900;   // laisse chaque enfant booter avant le top
  return Promise.all(faits.map((fait) => new Promise((res) => {
    const p = spawn(process.execPath,
                    [b.wrapper, b.mod, String(top), fait, type, nom],
                    { cwd: b.dir, stdio: 'pipe' });
    let err = '';
    p.stderr.on('data', (c) => { err += c; });
    p.on('close', (code) => res({ code, err }));
  })));
}

test('project: un seul écrivain gagne, aucun fait ne disparaît en silence', async () => {
  const b = bac();
  const sorties = await lanceTous(b, 'project', 'course_project',
    Array.from({ length: ECRIVAINS }, (_, i) => `fait numero ${i}`));
  const gagnants = sorties.filter((s) => s.code === 0);
  assert.equal(gagnants.length, 1, `un seul gagnant attendu, obtenu ${gagnants.length}`);
  const perdants = sorties.filter((s) => s.code !== 0);
  assert.ok(perdants.every((s) => /append-only/.test(s.err)),
            'chaque perdant doit être REFUSÉ explicitement, pas tomber autrement');
  fs.rmSync(b.dir, { recursive: true, force: true });
});

test('feedback: chaque contenu remplacé est archivé, aucun ne se perd', async () => {
  const b = bac();
  await lanceTous(b, 'feedback', 'course_feedback', ['fait initial']);   // le fichier existe
  const sorties = await lanceTous(b, 'feedback', 'course_feedback',
    Array.from({ length: ECRIVAINS }, (_, i) => `fait concurrent ${i}`));
  assert.ok(sorties.every((s) => s.code === 0), sorties.map((s) => s.err).join('\n'));

  const fichiers = fs.readdirSync(b.mem).filter((f) => f.startsWith('feedback_course_feedback'));
  const corpus = fichiers.map((f) => fs.readFileSync(path.join(b.mem, f), 'utf8')).join('\n');
  // ECRIVAINS remplacements sur un fichier existant ⇒ ECRIVAINS archives `.vN`,
  // toutes distinctes : deux archives du même original prouvent la course.
  const versions = fichiers.filter((f) => /\.v\d+\.md$/.test(f));
  assert.equal(versions.length, ECRIVAINS, `archives attendues ${ECRIVAINS}, obtenu ${versions.length}`);
  const initiales = versions.filter(
    (f) => fs.readFileSync(path.join(b.mem, f), 'utf8').includes('fait initial'));
  assert.equal(initiales.length, 1, "l'original ne doit être archivé qu'UNE fois");
  for (let i = 0; i < ECRIVAINS; i++) {
    assert.ok(corpus.includes(`fait concurrent ${i}`),
              `le fait ${i} a été écrasé sans jamais être archivé`);
  }
  fs.rmSync(b.dir, { recursive: true, force: true });
});
