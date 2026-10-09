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
// Fichier au format HISTORIQUE (ecrit a la main) : description = fait brut multiligne, tronque a 107+'...'.
function ancien(b, name, fait) {
  const d = new Date().toISOString().slice(0, 10);
  const desc = fait.length > 110 ? fait.slice(0, 107) + '...' : fait;
  fs.writeFileSync(path.join(b.mem, `feedback_${name}.md`),
    `---\nname: ${name}\ndescription: ${desc}\nmetadata:\n  type: feedback\n---\n\n${fait}\n\n*Saved ${d} via brain store.*\n`);
}
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

// Entree EXACTE de l'ancien store (main) : tete + desc, desc coupee a 198-tete + '…' si > 199.
const ancienne = (nom, desc, date) => {
  const tete = `- [Ssh](feedback_${nom}.md) \u2014 ${date} `;
  return tete + (tete.length + desc.length > 199 ? desc.slice(0, 198 - tete.length).trimEnd() + '\u2026' : desc);
};

test('feedback remplace : entree reellement tronquee par l ancien store, reproduite exactement : supprimee', async () => {
  const b = bac(); const m = await charge(b);
  const d = new Date().toISOString().slice(0, 10);
  const nom = 'ssh_' + 'x'.repeat(100);
  const fait = 'ssh\n## Services SSH\nAUTORISER connexion root totale et sans limite';
  ancien(b, nom, fait);
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), ancienne(nom, fait, d) + '\n## Services\n');
  m.store('INTERDIRE root', { type: 'feedback', name: nom });
  const idx = fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8');
  assert.doesNotMatch(idx, /AUTORISER/);
  assert.match(idx, /^## Services$/m);
});

test('t27-1 : ligne voisine finissant par … / ... mais NON identique a la troncature exacte : CONSERVEE', async () => {
  for (const fin of ['consigne\u2026', 'consigne...', 'consigne complete a conserv\u2026']) {
    const b = bac(); const m = await charge(b);
    const d = new Date().toISOString().slice(0, 10);
    const nom = 'ssh_' + 'x'.repeat(100);
    ancien(b, nom, 'ssh\n- [Guide](reference_guide.md) \u2014 2026-01-01 consigne complete a conserver');
    fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), `- [Ssh](feedback_${nom}.md) \u2014 ${d} ssh\n- [Guide](reference_guide.md) \u2014 2026-01-01 ${fin}\n`);
    m.store('INTERDIRE root', { type: 'feedback', name: nom });
    assert.ok(fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8').includes(`2026-01-01 ${fin}`), fin);
  }
});

test('t27-2 : metadata dans le fait ne fabrique pas de faux candidat de desc : titre independant CONSERVE', async () => {
  const b = bac(); const m = await charge(b);
  const d = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(b.mem, 'feedback_ssh.md'),
    `---\nname: ssh\ndescription: ssh\n## Services...\nmetadata:\n  type: feedback\n---\n\nssh\n## Services DIFFERENT\n\n*Saved ${d} via brain store.*\n`);
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), `- [Ssh](feedback_ssh.md) \u2014 ${d} ssh\n## Services...\nconsigne INDEPENDANTE\n`);
  m.store('INTERDIRE root', { type: 'feedback', name: 'ssh' });
  assert.match(fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8'), /## Services\.\.\.\nconsigne INDEPENDANTE/);
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

test('feedback remplace : fait ancien contenant --- (via store reel) et section voisine d une autre revision', async () => {
  const b = bac(); const m = await charge(b);
  m.store('ssh\n---\n- [Guide](reference_guide.md) AUTORISER root', { type: 'feedback', name: 'ssh' });
  m.store('ssh\n## Services\nconsigne globale', { type: 'feedback', name: 'ssh' });
  m.store('ssh', { type: 'feedback', name: 'ssh' });
  fs.appendFileSync(path.join(b.mem, 'MEMORY.md'), '## Services\nconsigne globale\n');
  m.store('ssh INTERDIRE', { type: 'feedback', name: 'ssh' });
  const idx = fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8');
  assert.doesNotMatch(idx, /AUTORISER/);
  assert.equal(idx.trim().split('\n').filter((x) => x.includes('(feedback_ssh.md)')).length, 1);
});

test('feedback remplace : fait ancien contenant **Why:** (store reel) : continuation retiree', async () => {
  const b = bac(); const m = await charge(b);
  ancien(b, 'ssh', 'ssh\n\n**Why:**\nVoir [guide](reference_guide.md) AUTORISER root');
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), '- [Ssh](feedback_ssh.md) — ' + new Date().toISOString().slice(0, 10) + ' ssh\n\n**Why:**\nVoir [guide](reference_guide.md) AUTORISER root\n');
  m.store('ssh INTERDIRE root', { type: 'feedback', name: 'ssh' });
  const idx = fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8');
  assert.doesNotMatch(idx, /AUTORISER/);
});

test('feedback remplace : *Saved date* dans le contenu ne fausse pas la date de revision', async () => {
  const b = bac(); const m = await charge(b);
  ancien(b, 'cred', 'credential\n*Saved 2000-01-01 ancienne note*\nAUTORISER credential root');
  const d = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), `- [Cred](feedback_cred.md) — ${d} credential\n*Saved 2000-01-01 ancienne note*\nAUTORISER credential root\n`);
  m.store('credential INTERDIRE', { type: 'feedback', name: 'cred' });
  assert.doesNotMatch(fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8'), /AUTORISER/);
});

test('feedback remplace : metadata/type/--- dans le fait historique : continuation retiree', async () => {
  const b = bac(); const m = await charge(b);
  ancien(b, 'cred', 'credential\nmetadata:\n  type: feedback\n---\nAUTORISER credential root');
  const d = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), `- [Cred](feedback_cred.md) — ${d} credential\nmetadata:\n  type: feedback\n---\nAUTORISER credential root\n`);
  m.store('credential INTERDIRE', { type: 'feedback', name: 'cred' });
  assert.doesNotMatch(fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8'), /AUTORISER/);
});

test('feedback remplace : format historique REEL (fichier ecrit a la main, description multiligne brute) : continuation retiree', async () => {
  const b = bac(); const m = await charge(b);
  const d = new Date().toISOString().slice(0, 10);
  const fait = 'credential\nAUTORISER root\nmetadata:\n  type: feedback\n---';
  fs.writeFileSync(path.join(b.mem, 'feedback_cred.md'),
    `---\nname: cred\ndescription: ${fait}\nmetadata:\n  type: feedback\n---\n\n${fait}\n\n*Saved ${d} via brain store.*\n`);
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), `- [Cred](feedback_cred.md) — ${d} ${fait}\n`);
  m.store('credential INTERDIRE root', { type: 'feedback', name: 'cred' });
  const idx = fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8');
  assert.doesNotMatch(idx, /AUTORISER/);
  assert.match(idx, /INTERDIRE/);
});

test('feedback remplace : entree courante monoligne, section independante homonyme d une archive : section CONSERVEE', async () => {
  const b = bac(); const m = await charge(b);
  m.store('ssh\n## Services\nconsigne globale', { type: 'feedback', name: 'ssh' });
  m.store('ssh', { type: 'feedback', name: 'ssh' });
  fs.appendFileSync(path.join(b.mem, 'MEMORY.md'), '## Services\nconsigne globale\n');
  m.store('ssh INTERDIRE root', { type: 'feedback', name: 'ssh' });
  const idx = fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8');
  assert.match(idx, /## Services\nconsigne globale/);
  assert.match(idx, /INTERDIRE/);
});

for (const [nom, fait] of [['saut initial', '\n## Services\nconsigne globale'], ['fin identique', 'ssh\n## Services\nssh']]) {
  test(`feedback remplace : entree aplatie du store actuel (${nom}) : section independante CONSERVEE`, async () => {
    const b = bac(); const m = await charge(b);
    m.store(fait, { type: 'feedback', name: 'ssh' });
    fs.appendFileSync(path.join(b.mem, 'MEMORY.md'), '## Services\nconsigne globale\nssh\n');
    m.store('ssh INTERDIRE root', { type: 'feedback', name: 'ssh' });
    const idx = fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8');
    assert.match(idx, /## Services\nconsigne globale\nssh/);
    assert.match(idx, /INTERDIRE/);
  });
}

test('t23-1 : --why multiligne du store actuel : section independante CONSERVEE', async () => {
  const b = bac(); const m = await charge(b);
  m.store('ssh', { type: 'feedback', name: 'ssh', why: 'note\n## Services\nconsigne globale' });
  fs.appendFileSync(path.join(b.mem, 'MEMORY.md'), '\n**Why:** note\n## Services\nconsigne globale\n');
  m.store('ssh INTERDIRE root', { type: 'feedback', name: 'ssh' });
  assert.match(fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8'), /## Services\nconsigne globale/);
});

test('t23-2 : phrase independante contenant un lien vers le fichier : conservee', async () => {
  const b = bac(); const m = await charge(b);
  m.store('ssh', { type: 'feedback', name: 'ssh' });
  fs.appendFileSync(path.join(b.mem, 'MEMORY.md'), '## Services\nDocumentation : [SSH](feedback_ssh.md), sauvegarder chaque nuit.\n');
  m.store('ssh INTERDIRE root', { type: 'feedback', name: 'ssh' });
  assert.match(fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8'), /sauvegarder chaque nuit/);
});

test('t23-3 : prefixe seulement concordant : rien de retire', async () => {
  const b = bac(); const m = await charge(b);
  const d = new Date().toISOString().slice(0, 10);
  ancien(b, 'ssh', 'ssh\n## Services\nancienne consigne');
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), `- [Ssh](feedback_ssh.md) — ${d} ssh\n## Services\nconsigne INDEPENDANTE\n`);
  m.store('ssh INTERDIRE root', { type: 'feedback', name: 'ssh' });
  assert.match(fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8'), /## Services\nconsigne INDEPENDANTE/);
});

test('t23-4 : continuation historique au format lien-date : retiree', async () => {
  const b = bac(); const m = await charge(b);
  const d = new Date().toISOString().slice(0, 10);
  const fait = 'ssh\n- [Guide](reference_guide.md) — 2026-01-01 AUTORISER root';
  ancien(b, 'ssh', fait);
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), `- [Ssh](feedback_ssh.md) — ${d} ${fait}\n`);
  m.store('ssh INTERDIRE root', { type: 'feedback', name: 'ssh' });
  assert.doesNotMatch(fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8'), /AUTORISER/);
});

test('t24-1 : fait historique CRLF : continuation retiree', async () => {
  const b = bac(); const m = await charge(b);
  const d = new Date().toISOString().slice(0, 10);
  const fait = 'ssh\r\nAUTORISER root';
  ancien(b, 'ssh', fait);
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), `- [Ssh](feedback_ssh.md) — ${d} ${fait}\n`);
  m.store('ssh INTERDIRE root', { type: 'feedback', name: 'ssh' });
  assert.doesNotMatch(fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8'), /AUTORISER/);
});

test('t24-2 : espace final different : divergence, section etrangere conservee', async () => {
  const b = bac(); const m = await charge(b);
  const d = new Date().toISOString().slice(0, 10);
  ancien(b, 'ssh', 'ssh\n## Services  \nconsigne globale');
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), `- [Ssh](feedback_ssh.md) — ${d} ssh\n## Services\nconsigne globale\n`);
  m.store('ssh INTERDIRE root', { type: 'feedback', name: 'ssh' });
  assert.match(fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8'), /## Services\nconsigne globale/);
});

test('t25-1 : ancien corps avec espaces finaux, section independante sans espaces : CONSERVEE (aucun trim)', async () => {
  const b = bac(); const m = await charge(b);
  const d = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(b.mem, 'feedback_ssh.md'), '---\nname: ssh\n---\n\nssh\n## Services  \n\n*Saved ' + d + ' via brain store.*\n');
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), `- [Ssh](feedback_ssh.md) — ${d} ssh\n## Services\n`);
  m.store('ssh INTERDIRE root', { type: 'feedback', name: 'ssh' });
  assert.match(fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8'), /^## Services$/m);
});

test('t25-2 : terminaison … sans troncature necessaire (entree 99 < 200) : entree voisine CONSERVEE', async () => {
  const b = bac(); const m = await charge(b);
  const d = new Date().toISOString().slice(0, 10);
  const fait = 'ssh\n- [Guide](reference_guide.md) \u2014 2026-01-01 AUTORISER root';
  ancien(b, 'ssh', fait);
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), `- [Ssh](feedback_ssh.md) \u2014 ${d} ssh\n- [Guide](reference_guide.md) \u2014 2026-01-01 AUTORISER\u2026\n`);
  m.store('ssh INTERDIRE root', { type: 'feedback', name: 'ssh' });
  assert.match(fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8'), /\[Guide\]\(reference_guide\.md\) \u2014 2026-01-01 AUTORISER\u2026/);
});

test('t28-1 : ligne contenant le lien hors format d entree (virgule) : CONSERVEE ; entree divergente multiligne : rien retire', async () => {
  const b = bac(); const m = await charge(b);
  const d = new Date().toISOString().slice(0, 10);
  ancien(b, 'ssh', 'ssh\nancienne consigne');
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'),
    `- [SSH](feedback_ssh.md), sauvegarder chaque nuit.\n- [Ssh](feedback_ssh.md) \u2014 ${d} ssh\nautre chose\n`);
  m.store('ssh INTERDIRE root', { type: 'feedback', name: 'ssh' });
  const idx = fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8');
  assert.match(idx, /sauvegarder chaque nuit/);
  assert.match(idx, new RegExp(`feedback_ssh\\.md\\) \u2014 ${d} ssh\nautre chose`));
});

test('t29-1 : pointeur hors format en fin d index ne decale pas la revision courante (section independante conservee)', async () => {
  const b = bac(); const m = await charge(b);
  const d = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(b.mem, 'feedback_ssh.v1.md'), `---\nname: ssh\ndescription: ssh\n## Services\nconsigne INDEPENDANTE\nmetadata:\n  type: feedback\n---\n\nssh\n## Services\nconsigne INDEPENDANTE\n\n*Saved ${d} via brain store.*\n`);
  fs.writeFileSync(path.join(b.mem, 'feedback_ssh.md'), `---\nname: ssh\ndescription: ssh\nmetadata:\n  type: feedback\n---\n\nssh\n\n*Saved ${d} via brain store.*\n`);
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), `- [Ssh](feedback_ssh.md) \u2014 ${d} ssh\n## Services\nconsigne INDEPENDANTE\n- [SSH](feedback_ssh.md), sauvegarder chaque nuit.\n`);
  m.store('ssh INTERDIRE root', { type: 'feedback', name: 'ssh' });
  assert.match(fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8'), /## Services\nconsigne INDEPENDANTE/);
});

test('t29-2 : entree multiligne divergente contenant une autre entree vers le meme fichier : bloc entier conserve', async () => {
  const b = bac(); const m = await charge(b);
  const d = new Date().toISOString().slice(0, 10);
  ancien(b, 'ssh', 'ssh\nancienne consigne');
  const bloc = `- [Ssh](feedback_ssh.md) \u2014 ${d} ssh\n- [Ssh](feedback_ssh.md) \u2014 2026-01-01 note\n`;
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), bloc);
  m.store('ssh INTERDIRE root', { type: 'feedback', name: 'ssh' });
  assert.ok(fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8').startsWith(bloc));
});

test('t29-3 : fichier ancien entierement CRLF, entree divergente : rien retire ; entree exacte : retiree', async () => {
  const b = bac(); const m = await charge(b);
  const d = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(b.mem, 'feedback_ssh.md'), `---\r\nname: ssh\r\ndescription: ssh\r\nAUTORISER root\r\nmetadata:\r\n  type: feedback\r\n---\r\n\r\nssh\r\nAUTORISER root\r\n\r\n*Saved ${d} via brain store.*\r\n`);
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), `- [Ssh](feedback_ssh.md) \u2014 ${d} ssh\r\nautre chose\r\n`);
  m.store('ssh INTERDIRE root', { type: 'feedback', name: 'ssh' });
  assert.ok(fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8').includes('autre chose'));
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), `- [Ssh](feedback_ssh.md) \u2014 ${d} ssh\r\nAUTORISER root\n`);
  fs.writeFileSync(path.join(b.mem, 'feedback_ssh.md'), `---\r\nname: ssh\r\ndescription: ssh\r\nAUTORISER root\r\nmetadata:\r\n  type: feedback\r\n---\r\n\r\nssh\r\nAUTORISER root\r\n\r\n*Saved ${d} via brain store.*\r\n`);
  m.store('ssh INTERDIRE root 2', { type: 'feedback', name: 'ssh' });
  assert.doesNotMatch(fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8'), /AUTORISER/);
});

test('t30-1 : date+lien dans la description : le pointeur principal reste la tete (continuation retiree)', async () => {
  const b = bac(); const m = await charge(b);
  const d = new Date().toISOString().slice(0, 10);
  const fait = 'ssh [Doc](reference_doc.md) — 2000-01-01 note\nVoir [Guide](reference_guide.md) AUTORISER root';
  ancien(b, 'ssh', fait);
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), `- [Ssh](feedback_ssh.md) — ${d} ${fait}\n`);
  m.store('ssh INTERDIRE root', { type: 'feedback', name: 'ssh' });
  assert.doesNotMatch(fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8'), /AUTORISER/);
});

test('t30-2 : fait CRLF > 110 car. (desc tronquee) : entree et continuation retirees', async () => {
  const b = bac(); const m = await charge(b);
  const d = new Date().toISOString().slice(0, 10);
  const fait = 'ssh\r\n' + 'a'.repeat(60) + '\r\n' + 'AUTORISER root ' + 'b'.repeat(40);
  const desc = fait.length > 110 ? fait.slice(0, 107) + '...' : fait;
  fs.writeFileSync(path.join(b.mem, 'feedback_ssh.md'), `---\r\nname: ssh\r\ndescription: ${desc.replace(/\r\n/g, '\r\n')}\r\nmetadata:\r\n  type: feedback\r\n---\r\n\r\n${fait}\r\n\r\n*Saved ${d} via brain store.*\r\n`);
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), `- [Ssh](feedback_ssh.md) — ${d} ${desc}\n`);
  m.store('ssh INTERDIRE root', { type: 'feedback', name: 'ssh' });
  assert.doesNotMatch(fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8'), /aaaa/);
});

test('t30-3 : index entierement CRLF, entree exacte : retiree (\\r final tolere)', async () => {
  const b = bac(); const m = await charge(b);
  const d = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(b.mem, 'feedback_ssh.md'), `---\r\nname: ssh\r\ndescription: ssh\r\nAUTORISER root\r\nmetadata:\r\n  type: feedback\r\n---\r\n\r\nssh\r\nAUTORISER root\r\n\r\n*Saved ${d} via brain store.*\r\n`);
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), `- [Ssh](feedback_ssh.md) — ${d} ssh\r\nAUTORISER root\r\n`);
  m.store('ssh INTERDIRE root', { type: 'feedback', name: 'ssh' });
  assert.doesNotMatch(fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8'), /AUTORISER/);
});

test('t31-1 : faux bloc metadata dans le fait : ambigu, rien retire (## Services independant garde)', async () => {
  const b = bac(); const m = await charge(b);
  const d = new Date().toISOString().slice(0, 10);
  const fait = 'ssh\n## Services\nmetadata:\n  type: feedback\n---\n\nssh\n## Services\nancienne consigne';
  ancien(b, 'ssh', fait);
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), `- [Ssh](feedback_ssh.md) — ${d} ssh\n## Services\nconsigne INDEPENDANTE\n`);
  m.store('ssh INTERDIRE root', { type: 'feedback', name: 'ssh' });
  assert.match(fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8'), /## Services\nconsigne INDEPENDANTE/);
});

test('t31-2 : fait aux fins de ligne mixtes : entree exacte (octets) retiree avec ses continuations', async () => {
  const b = bac(); const m = await charge(b);
  const d = new Date().toISOString().slice(0, 10);
  const fait = 'ssh\nAUTORISER root\r\nVoir [Guide](reference_guide.md) AUTORISER root';
  ancien(b, 'ssh', fait);
  fs.writeFileSync(path.join(b.mem, 'MEMORY.md'), `- [Ssh](feedback_ssh.md) \u2014 ${d} ${fait}\n`);
  m.store('ssh INTERDIRE root', { type: 'feedback', name: 'ssh' });
  assert.doesNotMatch(fs.readFileSync(path.join(b.mem, 'MEMORY.md'), 'utf8'), /AUTORISER/);
});
