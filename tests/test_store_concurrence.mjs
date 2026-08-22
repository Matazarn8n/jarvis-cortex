// Course réelle entre PROCESS — le seul montage qui prouve l'atomicité. Deux
// appels dans le même process ne se recouvrent jamais : le code fautif y
// passait vert (réserves HAUTE 3d906ce7d7f9 et 6e708b04ecfa).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';

const SRC = process.env.BRAIN_UNDER_TEST || new URL('../brain.js', import.meta.url).pathname;
// 16 suffit pour le régime `feedback` (le verrou se voit tout de suite) ; la
// course du régime `project`, elle, n'a été REPRODUITE sur le code fautif qu'à
// 32 — sa fenêtre est de deux syscalls. Relevable par l'environnement pour
// rejouer cette reproduction sans alourdir la suite de tous les jours.
const CONCURRENTS = Number(process.env.BRAIN_CONCURRENTS || 16);

function bac() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-conc-'));
  fs.mkdirSync(path.join(d, 'config'));
  fs.copyFileSync(SRC, path.join(d, 'brain.js'));
  fs.writeFileSync(path.join(d, 'config', 'workspace.json'),
    JSON.stringify({ root: '.', memoryDir: 'memoire', memoryIndex: 'MEMORY.md' }));
  return { dir: d, mem: path.join(d, 'memoire'), mod: path.join(d, 'brain.js') };
}

/** Lance CONCURRENTS process EN PARALLÈLE, réveillés au même top.
 *
 * `spawnSync` ne convient pas : il attend chaque fils, donc il SÉRIALISE la
 * course qu'on veut mesurer — le code fautif y passait vert. `spawn` + un top
 * commun est le seul montage qui les fait entrer dans la section critique
 * ensemble.
 */
function course(b, type, nom, faitDe) {
  const top = Date.now() + 500;                 // même réveil pour tous
  const src = i =>
    `const {store} = require(${JSON.stringify(b.mod)});` +
    `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,Math.max(0,${top}-Date.now()));` +
    `try{store(${JSON.stringify(faitDe)}+${i},{type:${JSON.stringify(type)},name:${JSON.stringify(nom)}});` +
    `console.log('OK')}catch(e){console.log('REFUS')}`;
  return Promise.all(Array.from({ length: CONCURRENTS }, (_v, i) => new Promise(res => {
    const p = spawn(process.execPath, ['-e', src(i)], { cwd: b.dir, encoding: 'utf8' });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.on('close', () => res(out.trim()));
  })));
}

test('project: une seule ecriture gagne, aucune ne s ecrase en silence', async () => {
  const b = bac();
  // Amorce séquentielle : le dossier mémoire doit exister avant la course.
  execFileSync(process.execPath, ['-e',
    `require(${JSON.stringify(b.mod)}).store('amorce',{type:'user',name:'amorce'})`],
    { cwd: b.dir });

  const sorties = await course(b, 'project', 'course_projet', 'fait projet ');
  const gagnants = sorties.filter(s => s === 'OK').length;
  assert.equal(gagnants, 1, `un seul process doit créer le fichier, ${gagnants} l'ont fait`);

  const contenu = fs.readFileSync(path.join(b.mem, 'project_course_projet.md'), 'utf8');
  // Le gabarit recopie le fait en `description:` ET dans le corps : on compte
  // les marques DISTINCTES, pas les occurrences.
  const marques = new Set([...contenu.matchAll(/fait projet (\d+)/g)].map(m => m[1]));
  assert.equal(marques.size, 1, `le fichier porte ${marques.size} faits distincts — un seul a écrit`);
});

test('feedback: aucun fait perdu, une version par ecriture archivee', async () => {
  const b = bac();
  execFileSync(process.execPath, ['-e',
    `require(${JSON.stringify(b.mod)}).store('valeur initiale',{type:'feedback',name:'course_fb'})`],
    { cwd: b.dir });

  const sorties = await course(b, 'feedback', 'course_fb', 'regle ');
  const ok = sorties.filter(s => s === 'OK').length;
  assert.equal(ok, CONCURRENTS, `les ${CONCURRENTS} écritures doivent aboutir, ${ok} ont abouti`);

  // Le contrat du régime : « l'ancien contenu part dans <base>.vN.md, jamais
  // perdu ». Donc CHAQUE valeur écrite se retrouve, soit courante soit archivée.
  const fichiers = fs.readdirSync(b.mem).filter(n => n.startsWith('feedback_course_fb'));
  const tout = fichiers.map(n => fs.readFileSync(path.join(b.mem, n), 'utf8')).join('\n');
  const vues = new Set([...tout.matchAll(/regle (\d+)/g)].map(m => m[1]));
  assert.equal(vues.size, CONCURRENTS,
    `${CONCURRENTS} faits écrits, ${vues.size} retrouvés — le régime en a perdu`);
  assert.equal(fichiers.length, CONCURRENTS + 1,
    `attendu ${CONCURRENTS + 1} fichiers (courant + une version par écrasement), vu ${fichiers.length}`);
});

test('verrou tenu: l ecriture est REFUSEE, jamais concurrente', () => {
  const b = bac();
  execFileSync(process.execPath, ['-e',
    `require(${JSON.stringify(b.mod)}).store('valeur initiale',{type:'feedback',name:'bloque'})`],
    { cwd: b.dir });
  const cible = path.join(b.mem, 'feedback_bloque.md');
  fs.writeFileSync(cible + '.lock', '');        // un autre process le tient

  const r = spawnSync(process.execPath, ['-e',
    `require(${JSON.stringify(b.mod)}).store('ne doit pas passer',{type:'feedback',name:'bloque'})`],
    { cwd: b.dir, encoding: 'utf8', env: { ...process.env, BRAIN_LOCK_TIMEOUT_MS: '200' } });

  assert.notEqual(r.status, 0, 'une écriture sous verrou tenu doit échouer');
  assert.match(r.stderr, /tenu depuis plus de 200 ms/);
  assert.match(fs.readFileSync(cible, 'utf8'), /valeur initiale/);
});
