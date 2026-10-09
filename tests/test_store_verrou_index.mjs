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
  assert.ok(ligne.length <= 200, `entree de ${ligne.length} caracteres`);
});

test('rappel : un pointeur d index vers une archive .vN.md est ignore', async () => {
  const b = bac(); const m = await charge(b);
  fs.writeFileSync(path.join(b.mem, 'feedback_beta.v1.md'), 'ancienne regle revoquee beta');
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), '- [Beta](feedback_beta.v1.md) — 2026-01-01 beta regle\n');
  assert.doesNotMatch(JSON.stringify(m.recall('beta')), /v1\.md/);
});

test('verrou frais pose par un autre : le reap ne l emporte pas', async () => {
  process.env.BRAIN_LOCK_TIMEOUT_MS = '300';
  const b = bac(); const m = await charge(b);
  delete process.env.BRAIN_LOCK_TIMEOUT_MS;
  const lock = path.join(b.mem, '.store.lock');
  fs.writeFileSync(lock, '999999999:0:frais'); // proprietaire mort mais verrou FRAIS (< 60 s)
  assert.throws(() => m.store('regle', { type: 'feedback', name: 'r_frais' }), /verrou/);
  assert.equal(fs.readFileSync(lock, 'utf8'), '999999999:0:frais');
});

test('ecritures feedback concurrentes sur verrou perime : aucune perte (8 processus)', async () => {
  const { spawn } = await import('node:child_process');
  const b = bac();
  const lock = path.join(b.mem, '.store.lock');
  fs.writeFileSync(lock, '999999999:0:mort'); vieux(lock);
  const top = Date.now() + 600;
  const code = `const {store}=require(${JSON.stringify(b.mod)});while(Date.now()<${top}){}
store('version '+process.argv[1],{type:'feedback',name:'course'});`;
  const rcs = await Promise.all(Array.from({ length: 8 }, (_, i) => new Promise((res) => {
    const c = spawn(process.execPath, ['-e', code, String(i)], { stdio: 'ignore' });
    c.on('exit', res);
  })));
  assert.deepEqual(rcs, Array(8).fill(0));
  const fichiers = fs.readdirSync(b.mem).filter((f) => /^feedback_course(\.v\d+)?\.md$/.test(f));
  assert.equal(fichiers.length, 8, fichiers.join(','));
});

test('verrou VIDE et frais (jeton en cours d ecriture) : jamais repris', async () => {
  process.env.BRAIN_LOCK_TIMEOUT_MS = '300';
  const b = bac(); const m = await charge(b);
  delete process.env.BRAIN_LOCK_TIMEOUT_MS;
  const lock = path.join(b.mem, '.store.lock');
  fs.writeFileSync(lock, '');
  assert.throws(() => m.store('regle', { type: 'feedback', name: 'r_vide' }), /verrou/);
  assert.ok(fs.existsSync(lock));
});

test('rappel : une regle active qui cite son archive .v1.md ne la fait pas lire', async () => {
  const b = bac(); const m = await charge(b);
  fs.writeFileSync(path.join(b.mem, 'feedback_gamma.v1.md'), 'ANCIENNE regle revoquee gamma');
  fs.writeFileSync(path.join(b.mem, 'feedback_gamma.md'), '# gamma\nregle active gamma, ancienne version: feedback_gamma.v1.md\n');
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), '- [Gamma](feedback_gamma.md) — 2026-01-01 gamma regle\n');
  assert.doesNotMatch(JSON.stringify(m.recall('gamma')), /ANCIENNE/);
});

test('nom de fichier trop long refuse (regle #2, fichier complet <= 120) ; 100 caracteres tient dans 200', async () => {
  const b = bac(); const m = await charge(b);
  assert.throws(() => m.store('x', { type: 'user', name: 'b'.repeat(180) }), /nom trop long/);
  m.store('y'.repeat(300), { type: 'reference', name: 'c'.repeat(100) });
  const ligne = fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8').trim().split('\n').pop();
  assert.ok(ligne.length <= 200, `${ligne.length}`);
  assert.match(ligne, /\(reference_c+\.md\)/);
});

test('feedback remplace : l entree d index precedente est retiree, rappel et prompt sans l ancienne consigne', async () => {
  const b = bac(); const m = await charge(b);
  m.store('ssh: autoriser la connexion root', { type: 'feedback', name: 'ssh_root' });
  m.store('ssh: interdire la connexion root', { type: 'feedback', name: 'ssh_root' });
  const idx = fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8');
  assert.equal(idx.split('\n').filter((l) => l.includes('(feedback_ssh_root.md)')).length, 1);
  assert.doesNotMatch(idx, /autoriser/);
  assert.match(idx, /interdire/);
  const rec = JSON.stringify(m.recall('ssh'));
  assert.doesNotMatch(rec, /autoriser/);
  assert.doesNotMatch(JSON.stringify(m.buildAsk('ssh')), /autoriser/);
});

test('index : feedback remplace + project/user concurrents -> aucune entree perdue, une seule par regle', async () => {
  const { spawn } = await import('node:child_process');
  const b = bac();
  const top = Date.now() + 600;
  const code = `const {store}=require(${JSON.stringify(b.mod)});while(Date.now()<${top}){}
const i=Number(process.argv[1]);
if(i%2===0)store('regle version '+i,{type:'feedback',name:'meme_regle'});
else store('fait numero '+i,{type:i%4===1?'project':'user',name:'fait_'+i});`;
  const rcs = await Promise.all(Array.from({ length: 12 }, (_, i) => new Promise((res) => {
    spawn(process.execPath, ['-e', code, String(i)], { stdio: 'ignore' }).on('exit', res);
  })));
  assert.deepEqual(rcs, Array(12).fill(0));
  const idx = fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8').split('\n');
  assert.equal(idx.filter((l) => l.includes('(feedback_meme_regle.md)')).length, 1);
  for (const i of [1, 3, 5, 7, 9, 11]) {
    assert.equal(idx.filter((l) => l.includes(`fait_${i}.md)`)).length, 1, `fait ${i} perdu`);
  }
});

test('feedback multiligne remplace : plus de continuation de l ancienne consigne', async () => {
  const b = bac(); const m = await charge(b);
  m.store('ssh\nAUTORISER connexion root', { type: 'feedback', name: 'ssh_ml' });
  m.store('ssh\nINTERDIRE connexion root', { type: 'feedback', name: 'ssh_ml' });
  const idx = fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8');
  assert.doesNotMatch(idx, /AUTORISER/);
  assert.match(idx, /INTERDIRE/);
  assert.equal(idx.trim().split('\n').length, 1);
  // ancienne entree multiligne deja presente dans l index
  fs.writeFileSync(path.join(b.mem, 'feedback_ssh_ml.md'), '---\nname: ssh_ml\n---\n\nssh\nAUTORISER ancien\n');
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), '- [Ssh Ml](feedback_ssh_ml.md) — 2026-01-01 ssh\nAUTORISER ancien\n- [Autre](feedback_autre.md) — 2026-01-01 voir [SSH](feedback_ssh_ml.md)\n');
  m.store('ssh\nINTERDIRE v3', { type: 'feedback', name: 'ssh_ml' });
  const idx2 = fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8');
  assert.doesNotMatch(idx2, /AUTORISER/);
  assert.match(idx2, /\(feedback_autre\.md\)/); // l entree d un autre fichier qui CITE le lien est conservee
  assert.match(idx2, /INTERDIRE v3/);
});

test('feedback remplace : ancienne description avec ligne vide, puce, titre retiree', async () => {
  const b = bac(); const m = await charge(b);
  fs.mkdirSync(b.mem, { recursive: true });
  fs.writeFileSync(path.join(b.mem, 'feedback_ssh_ml.md'), '---\nname: ssh_ml\n---\n\nssh\n\nAUTORISER vide\n- AUTORISER puce\n# AUTORISER titre\n');
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), '- [Ssh Ml](feedback_ssh_ml.md) — 2026-01-01 ssh\n\nAUTORISER vide\n- AUTORISER puce\n# AUTORISER titre\n- [Autre](feedback_autre.md) — 2026-01-01 garde\n');
  m.store('ssh INTERDIRE', { type: 'feedback', name: 'ssh_ml' });
  const idx = fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8');
  assert.doesNotMatch(idx, /AUTORISER/);
  assert.match(idx, /\(feedback_autre\.md\)/);
  assert.match(idx, /INTERDIRE/);
});

test('feedback remplace : ancienne entree au lien ./ ou dossier/../ retiree', async () => {
  const b = bac(); const m = await charge(b);
  fs.mkdirSync(b.mem, { recursive: true });
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), '- [A](./feedback_regle_alpha.md) — 2026-01-01 credential: AUTORISER root\n- [B](sub/../feedback_regle_alpha.md) — 2026-01-01 AUTORISER bis\n- [C](feedback_autre.md) — 2026-01-01 garde\n');
  m.store('credential: INTERDIRE root', { type: 'feedback', name: 'regle_alpha' });
  const idx = fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8');
  assert.doesNotMatch(idx, /AUTORISER/);
  assert.match(idx, /\(feedback_autre\.md\)/);
  assert.match(idx, /INTERDIRE/);
});

test('feedback remplace : puces * conservees/retirees comme recall() les lit', async () => {
  const b = bac(); const m = await charge(b);
  fs.mkdirSync(b.mem, { recursive: true });
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), '* [Old](feedback_star.md) — 2026-01-01 AUTORISER root\n* [Other](reference_opaque.v1.md) — 2026-01-01 garde\n');
  m.store('INTERDIRE root', { type: 'feedback', name: 'star' });
  const idx = fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8');
  assert.doesNotMatch(idx, /AUTORISER/);
  assert.match(idx, /reference_opaque\.v1\.md/);
});

test('recall: reference active .v1.md citee par l index reste rappelable (seules archives feedback exclues)', async () => {
  const b = bac(); const m = await charge(b);
  fs.mkdirSync(b.mem, { recursive: true });
  fs.writeFileSync(path.join(b.mem, 'reference_opaque.v1.md'), '---\nname: x\n---\nneedle fact\n');
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), '- [needle](reference_opaque.v1.md) — 2026-01-01 needle\n');
  assert.match(JSON.stringify(m.recall('needle')), /reference_opaque\.v1\.md/);
});

test('feedback remplace : entree numerotee retiree, entree numerotee voisine conservee', async () => {
  const b = bac(); const m = await charge(b);
  fs.mkdirSync(b.mem, { recursive: true });
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), '1. [SSH](feedback_ssh.md) — 2026-01-01 AUTORISER root\n2. [Voisin](reference_voisin.md) — 2026-01-01 garde voisin\n');
  m.store('INTERDIRE root', { type: 'feedback', name: 'ssh' });
  const idx = fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8');
  assert.doesNotMatch(idx, /AUTORISER/);
  assert.match(idx, /reference_voisin\.md/);
});

test('feedback remplace : section etrangere et continuation contenant un lien', async () => {
  const b = bac(); const m = await charge(b);
  fs.mkdirSync(b.mem, { recursive: true });
  fs.writeFileSync(path.join(b.mem, 'feedback_ssh.md'), '---\nname: ssh\n---\n\nssh\nVoir [guide](reference_guide.md) : AUTORISER root\n');
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), '- [Ssh](feedback_ssh.md) — 2026-01-01 ssh\nVoir [guide](reference_guide.md) : AUTORISER root\n\n## Services\nconsigne globale conservee\n');
  m.store('INTERDIRE root', { type: 'feedback', name: 'ssh' });
  const idx = fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8');
  assert.doesNotMatch(idx, /AUTORISER/);
  assert.match(idx, /## Services/);
  assert.match(idx, /consigne globale conservee/);
});

test('feedback remplace : prefixe sans marque de troncature non supprime ; troncature … supprimee', async () => {
  const b = bac(); const m = await charge(b);
  fs.mkdirSync(b.mem, { recursive: true });
  fs.writeFileSync(path.join(b.mem, 'feedback_ssh.md'), '---\nname: ssh\n---\n\nssh\n## Services SSH\nAUTORISER connexion root totale\n');
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), '- [Ssh](feedback_ssh.md) — 2026-01-01 ssh\n## Services SSH\nAUTORISER connexion ro…\n## Services\n');
  m.store('INTERDIRE root', { type: 'feedback', name: 'ssh' });
  const idx = fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8');
  assert.doesNotMatch(idx, /AUTORISER/);
  assert.match(idx, /^## Services$/m);
});

test('feedback remplace : continuations des revisions anterieures (archives .vN) retirees aussi', async () => {
  const b = bac(); const m = await charge(b);
  fs.mkdirSync(b.mem, { recursive: true });
  fs.writeFileSync(path.join(b.mem, 'feedback_ssh.v1.md'), '---\nname: ssh\n---\n\nssh\nAUTORISER connexion root\n');
  fs.writeFileSync(path.join(b.mem, 'feedback_ssh.md'), '---\nname: ssh\n---\n\nssh\nINTERDIRE connexion root\n');
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), '- [Ssh](feedback_ssh.md) — 2026-01-01 ssh\nAUTORISER connexion root\n- [Ssh](feedback_ssh.md) — 2026-01-02 ssh\nINTERDIRE connexion root\n');
  m.store('ssh\nINTERDIRE v3', { type: 'feedback', name: 'ssh' });
  const idx = fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8');
  assert.doesNotMatch(idx, /AUTORISER/);
  assert.equal(idx.trim().split('\n').length, 1);
});

test('feedback remplace : entree voisine identique a une ligne d archive conservee', async () => {
  const b = bac(); const m = await charge(b);
  fs.mkdirSync(b.mem, { recursive: true });
  const l = '- [Services](reference_services.md) — 2026-01-01 services';
  fs.writeFileSync(path.join(b.mem, 'feedback_ssh.v1.md'), `---\nname: ssh\n---\n\nssh\n${l}\n`);
  fs.writeFileSync(path.join(b.mem, 'feedback_ssh.md'), '---\nname: ssh\n---\n\nssh\n');
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), `- [Ssh](feedback_ssh.md) — 2026-01-01 ssh\n${l}\n`);
  m.store('INTERDIRE', { type: 'feedback', name: 'ssh' });
  assert.match(fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8'), /reference_services\.md/);
});

test('feedback remplace : ligne [..](..) — date sans puce voisine conservee ; continuation puce+lien de l ancien fait retiree', async () => {
  const b = bac(); const m = await charge(b);
  fs.mkdirSync(b.mem, { recursive: true });
  const v = '[Services](reference_services.md) — 2026-01-01 needle';
  fs.writeFileSync(path.join(b.mem, 'feedback_ssh.v1.md'), `---\nname: ssh\n---\n\nssh\n${v}\n`);
  fs.writeFileSync(path.join(b.mem, 'feedback_ssh.md'), '---\nname: ssh\n---\n\nssh\n- [Guide](reference_guide.md) AUTORISER root\n');
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), `- [Ssh](feedback_ssh.md) — 2026-01-01 ssh\n- [Guide](reference_guide.md) AUTORISER root\n- [Ssh](feedback_ssh.md) — 2026-01-02 ssh\n${v}\n`);
  m.store('INTERDIRE', { type: 'feedback', name: 'ssh' });
  const idx = fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8');
  assert.doesNotMatch(idx, /AUTORISER/);
  assert.match(idx, /reference_services\.md/);
});
