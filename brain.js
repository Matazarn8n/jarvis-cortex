/* brain.js - fast storage/retrieval path for the JARVIS memory store.
   Zero deps. Used directly by agents (one command instead of a grep-and-read
   expedition) and by bench/bench.js to prove the speedup.

   node brain.js recall "what price is the community locked at"
   node brain.js store "fact text" --type feedback --name my-slug [--why "..."] [--sandbox]

   recall: index-first. Reads MEMORY.md (+ category indexes), scores pointers,
   opens ONLY the best file(s), prints the relevant slice. Reports bytes + ms.
   store: writes a convention-correct memory file + appends the index line in
   one step. No exploration reads. Reports bytes + ms.
*/
'use strict';
const fs = require('fs');

//: Délai d'attente du verrou d'écriture, en millisecondes. Réglable pour les
//: tests seulement — un humain n'a aucune raison de le toucher.
const LOCK_TIMEOUT_MS = Number(process.env.BRAIN_LOCK_TIMEOUT_MS || 5000);

/**
 * Sérialise `fn()` sur `file` par un fichier `<file>.lock` créé en `wx`.
 *
 * ponytail: trois appels stdlib. `proper-lockfile` ferait la même chose avec
 * une dépendance, un `package.json` et un cycle de mise à jour ; Node n'expose
 * pas `flock`, mais `O_EXCL` sur un fichier local est exactement la primitive
 * dont on a besoin ici.
 *
 * Verrou tenu au-delà du délai : on REFUSE, on ne reprend pas. Un verrou
 * périmé se reprend en le supprimant à la main, geste rare et visible ; le
 * reprendre tout seul rouvrirait la course qu'on vient de fermer, et cette
 * fonction garde un fait que personne ne peut relire.
 */
function withFileLock(file, fn) {
  const lock = file + '.lock';
  const limite = Date.now() + LOCK_TIMEOUT_MS;
  let fd;
  for (;;) {
    try { fd = fs.openSync(lock, 'wx'); break; }
    catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (Date.now() >= limite) {
        throw new Error(`store: ${path.basename(lock)} est tenu depuis plus de ${LOCK_TIMEOUT_MS} ms — écriture REFUSÉE plutôt que concurrente. Si aucun autre \`brain store\` ne tourne, supprimez ce fichier à la main.`);
      }
      // Seul sommeil synchrone de Node : `fn` et ses appelants sont synchrones.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try { return fn(); } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
const path = require('path');
const { performance } = require('perf_hooks');

const WS = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'workspace.json'), 'utf8')); } catch { return {}; } })();
const ROOT = path.resolve(__dirname, WS.root || '..');
const MEM = path.join(ROOT, ...(WS.memoryDir || 'shared/memory').split('/'));
const MEM_INDEX = WS.memoryIndex || 'MEMORY.md';
const SANDBOX = path.join(__dirname, '.cache', 'sandbox-memory');

const STOP = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'what', 'whats', 'which', 'who', 'when', 'where', 'how', 'do', 'does', 'did', 'i', 'my', 'we', 'our', 'of', 'for', 'to', 'in', 'on', 'at', 'and', 'or', 'with', 'about', 'it', 'this', 'that', 'you', 'your', 'me', 'jay', 'jays', 'one', 'thing', 'things', 'current', 'new', 'best', 'main', 'use', 'get', 'set']);

function words(s, keepStop) {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s]+/)
    .filter(w => w.length > 2 && (keepStop || !STOP.has(w)));
}

// Root docs own certain question domains - the one piece of routing knowledge
// the CLI encodes (same thing CLAUDE.md's Map teaches an agent once).
// which root doc owns which topic - filled per workspace during setup (Step 1)
const ROOT_DOC_HINTS = WS.routing || {
  'CLAUDE.md': ['goal', 'goals', 'rule', 'rules', 'workspace', 'folder', 'folders', 'map'],
};

// Archives de versionnage feedback (`<nom>.vN.md`) = règles révoquées : jamais
// rappelées, ni par l'index, ni par balayage de noms, ni par suivi de lien.
// Seules les archives de feedback (`feedback_<nom>.vN.md`, écrites par store())
// sont des règles révoquées ; un document actif `reference_x.v1.md` reste
// rappelable. Insensible à la casse et à `.v01` ; le chemin ET sa cible réelle
// (lien symbolique) sont testés.
// Reconnaissance d'une entrée d'index : UNE seule définition, partagée par recall() et par le
// nettoyage de store() (sinon un format lu par l'un et ignoré par l'autre fuit ou supprime).
const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/;
const ARCHIVE_RE = /^feedback_.*\.v0*\d+\.md$/i;
let archiveInodes = null; // remis à null au début de chaque recall()
function isArchived(p) {
  let real = p;
  try { real = fs.realpathSync(p); } catch { /* absent : on teste le nom seul */ }
  if (ARCHIVE_RE.test(path.basename(p)) || ARCHIVE_RE.test(path.basename(real))) return true;
  // lien physique : un autre nom pour le même inode qu'une archive du dossier
  // mémoire (ensemble construit UNE fois par rappel, pas par candidat)
  try {
    if (!archiveInodes) {
      archiveInodes = new Set();
      for (const f of fs.readdirSync(MEM)) {
        if (!ARCHIVE_RE.test(f)) continue;
        const a = fs.statSync(path.join(MEM, f));
        archiveInodes.add(a.dev + ':' + a.ino);
      }
    }
    const st = fs.statSync(p);
    if (archiveInodes.has(st.dev + ':' + st.ino)) return true;
  } catch { /* fichier absent : rien à comparer */ }
  return false;
}

// ---------- recall ----------
function recall(query, opts) {
  archiveInodes = null;
  opts = opts || {};
  const t0 = performance.now();
  let bytes = 0;
  const read = p => { const s = fs.readFileSync(p, 'utf8'); bytes += Buffer.byteLength(s); return s; };
  const qw = words(query);

  // 1) index hop: MEMORY.md is the hub and the ONLY always-read file
  //    (category indexes stay closed - filenames cover their contents)
  const pointers = []; // {file, score, line}
  const hub = path.join(MEM, MEM_INDEX);
  if (fs.existsSync(hub)) {
    for (const line of read(hub).split('\n')) {
      const m = line.match(LINK_RE);
      if (!m || ARCHIVE_RE.test(path.basename(m[2]))) continue; // archives feedback versionnées : jamais rappelées
      const lw = words(line);
      let score = 0;
      for (const w of qw) {
        if (lw.includes(w)) score += 3;
        else if (lw.some(x => x.startsWith(w) || w.startsWith(x))) score += 1;
      }
      const target = path.resolve(MEM, m[2]); // filtrer le chemin RÉSOLU : `x.v1.md/.` se normalise en l'archive
      if (score > 0 && !isArchived(target)) pointers.push({ file: target, score, line: line.trim() });
    }
  }
  // 2) filename sweep (names only - no content reads)
  for (const f of fs.readdirSync(MEM)) {
    if (!f.endsWith('.md') || isArchived(path.join(MEM, f))) continue; // archives .vN = règles révoquées, jamais rappelées
    const fw = words(f.replace(/\.md$/, ''));
    let score = 0;
    for (const w of qw) {
      if (fw.includes(w)) score += 4;
      else if (fw.some(x => x.includes(w) || w.includes(x))) score += 1;
    }
    if (score > 0) pointers.push({ file: path.join(MEM, f), score, line: '(filename match) ' + f });
  }
  // 3) root ALLCAPS docs answer identity/goal/tool questions
  for (const [f, hints] of Object.entries(ROOT_DOC_HINTS)) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    let score = 0;
    for (const w of qw) if (hints.includes(w)) score += 4;
    if (score > 0) pointers.push({ file: p, score, line: '(root doc) ' + f });
  }

  pointers.sort((a, b) => b.score - a.score);
  // dedupe by file
  const seen = new Set(), top = [];
  for (const p of pointers) {
    if (seen.has(p.file) || isArchived(p.file)) continue; // point de passage unique : toute source (index, noms, docs racine) est filtrée
    seen.add(p.file); top.push(p);
    if (top.length >= (opts.k || 3)) break;
  }

  // 3) open only the winners; return the most relevant slice of each.
  // opts.answerRe: stop reading further files once the answer is on screen
  // (mirrors a real agent - it stops when it has what it needs).
  const qrawAll = words(query, true);
  const sliceOf = (body) => {
    const lines = body.split('\n');
    // a section heading that names the question wins outright - it slices the
    // whole relevant section instead of a window around one keyword-dense line
    let hStart = -1, hBest = 0;
    lines.forEach((line, i) => {
      if (!/^#{2,4}\s/.test(line)) return;
      const hw = words(line, true); // exact tokens - 'one' must not match 'Done'
      const s = qrawAll.filter(w => hw.includes(w)).length;
      if (s > hBest) { hBest = s; hStart = i; }
    });
    if (hStart >= 0 && hBest >= 1) return lines.slice(hStart, Math.min(lines.length, hStart + 26)).join('\n');
    let bestI = 0, bestS = -1;
    lines.forEach((line, i) => {
      const lw = line.toLowerCase();
      let s = 0;
      for (const w of qw) if (lw.includes(w)) s++;
      if (s > bestS) { bestS = s; bestI = i; }
    });
    const lo = Math.max(0, bestI - 10), hi = Math.min(lines.length, bestI + 16);
    return lines.slice(lo, hi).join('\n');
  };
  const hits = [];
  let found = false;
  for (const t of top) {
    if (!fs.existsSync(t.file)) continue;
    if (found) break;
    const body = read(t.file);
    if (opts.answerRe && opts.answerRe.test(body)) found = true;
    hits.push({ file: path.relative(ROOT, t.file), score: t.score, pointer: t.line, slice: sliceOf(body) });
  }
  // 4) one pointer hop: if the best slice NAMES another md file (indexes and
  //    memories often point instead of containing), open that too - the
  //    evidence should hold the fact, not just the address of the fact
  if (hits.length && opts.hop !== false && !found) {
    const m = hits[0].slice.match(/[\w][\w\/.-]*\.md/g);
    for (const cand of (m || [])) {
      if (/^(MEMORY|memory-)/.test(cand) || ARCHIVE_RE.test(path.basename(cand))) continue; // jamais d'archive feedback révoquée
      const p1 = path.resolve(ROOT, cand);
      const p2 = path.resolve(path.dirname(path.join(ROOT, hits[0].file)), cand);
      const hp = fs.existsSync(p1) ? p1 : (fs.existsSync(p2) ? p2 : null);
      if (!hp || isArchived(hp) || hits.some(h => path.resolve(ROOT, h.file) === hp)) continue;
      const body = read(hp);
      if (opts.answerRe && opts.answerRe.test(body)) found = true;
      // we arrived via an explicit pointer, so serve the document generously:
      // jump to the first heading that matches the question (stop words count
      // here - 'one thing' IS the heading), else take the head
      const qraw = words(query, true);
      const blines = body.split('\n');
      let start = 0, bestH = 0;
      for (let i = 0; i < blines.length; i++) {
        const l = blines[i];
        const hm = l.match(/^(#{2,4})\s/); // section headings only - the doc
        if (!hm) continue;                 // title restates everything and lies
        const hw = words(l, true); // exact tokens, same rule as sliceOf
        const s2 = qraw.filter(w => hw.includes(w)).length;
        if (s2 > bestH && s2 >= 1) { bestH = s2; start = Math.max(0, i - 1); }
      }
      const head = blines.slice(start, start + 45).join('\n').slice(0, 3500);
      hits.push({ file: path.relative(ROOT, hp), score: 0, pointer: '(followed from ' + hits[0].file + ')', slice: head });
      break;
    }
  }
  return { hits, bytes, ms: +(performance.now() - t0).toFixed(2), found };
}

// Verrou de magasin — `wx` sur un fichier, la seule primitive atomique que la
// bibliothèque standard offre en synchrone. Sert au régime `feedback`, dont le
// versionnement doit être indivisible. Un verrou abandonné par un processus tué
// se périme : sans ça, un crash figerait le magasin pour toujours, ce qui est
// pire que la course qu'il ferme.
const STORE_LOCK_STALE_MS = 60000;
const STORE_LOCK_TIMEOUT_MS = Number(process.env.BRAIN_LOCK_TIMEOUT_MS) || 10000;

function pidVivant(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function lisVerrou(f) {
  try { return { st: fs.statSync(f), owner: fs.readFileSync(f, 'utf8') }; }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; } // toute autre erreur est remontée
}

// Reprise d'un verrou périmé : SEUL le détenteur du verrou de reprise (`.reap`, `wx`) a le
// droit de supprimer le verrou principal, et seulement s'il porte encore le MÊME propriétaire
// mort. Personne d'autre ne supprime le verrou principal (hors son propre jeton à la sortie),
// donc un verrou frais ne peut pas être emporté. Un `.reap` abandonné n'est jamais volé : on
// échoue bruyamment (fenêtre de quelques microsecondes), plutôt que de rouvrir la course.
function verrouPerime(cur) {
  // Périmé = ancien (observation FRAÎCHE) ET propriétaire mort. Un contenu vide (écriture du
  // jeton en cours, ou crash entre open et write) n'est périmé que par son âge seul.
  const age = Date.now() - cur.st.mtimeMs;
  if (age <= STORE_LOCK_STALE_MS) return false;
  const pid = Number(cur.owner.split(':')[0]);
  return cur.owner === '' || (Number.isInteger(pid) && pid > 0 && !pidVivant(pid));
}

function reprendreVerrouPerime(lock, ownerLu) {
  const reap = lock + '.reap';
  let fd;
  try { fd = fs.openSync(reap, 'wx'); }
  catch (e) { if (e.code === 'EEXIST') return false; throw e; }
  try {
    // Réobservation SOUS le verrou de reprise : même propriétaire ET toujours périmé à l'instant T.
    const cur = lisVerrou(lock);
    if (cur && cur.owner === ownerLu && verrouPerime(cur)) fs.unlinkSync(lock);
    return true;
  } finally {
    try { fs.closeSync(fd); } catch (_) {}
    try { fs.unlinkSync(reap); } catch (_) {}
  }
}

function withStoreLock(dir, fn) {
  const lock = path.join(dir, '.store.lock');
  const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > STORE_LOCK_TIMEOUT_MS) {
      throw new Error(`store: verrou ${lock} non obtenu en ${STORE_LOCK_TIMEOUT_MS} ms — un autre écrivain n'a pas rendu la main (ou ${lock}.reap abandonné : à supprimer à la main).`);
    }
    try {
      const fd = fs.openSync(lock, 'wx');
      try { fs.writeSync(fd, token); } finally { fs.closeSync(fd); }
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const cur = lisVerrou(lock); // lève sur EACCES etc. : jamais de boucle muette
      if (cur && verrouPerime(cur) && reprendreVerrouPerime(lock, cur.owner)) continue;
      // Attente SYNCHRONE sans dépendance : `store` est un chemin synchrone de
      // bout en bout, un `await` ici changerait sa signature.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try {
    return fn();
  } finally {
    // Ne supprimer QUE son propre verrou (jamais celui d'un autre écrivain).
    try { if (fs.readFileSync(lock, 'utf8') === token) fs.unlinkSync(lock); } catch (_) {}
  }
}

// ---------- store ----------
function store(fact, opts) {
  opts = opts || {};
  const t0 = performance.now();
  const type = opts.type || 'project';
  const name = (opts.name || words(fact).slice(0, 4).join('-') || 'note').toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const dir = opts.sandbox ? SANDBOX : MEM;
  fs.mkdirSync(dir, { recursive: true });
  const prefix = { feedback: 'feedback_', project: 'project_', user: 'user_', reference: 'reference_' }[type] || '';
  // Le slug passé par --name porte souvent DÉJÀ son préfixe de type (c'est la
  // convention des memories écrites à la main, et celle des pointeurs [[...]]).
  // Le recoller aveuglément a produit 63 `feedback_feedback_*` et un pointeur
  // mort dans CLAUDE.md racine — vérifié le 2026-08-11.
  if (name.length > 120) throw new Error(`store: nom trop long (--name de ${name.length} caractères, max 120) — le pointeur d'index doit tenir dans 200 caractères.`);
  const base = name.replace(/-/g, '_');
  const file = path.join(dir, (prefix && base.startsWith(prefix) ? '' : prefix) + base + '.md');
  // Le lien d'index ne se tronque jamais ; sa longueur doit donc être bornée à
  // la source pour que l'entrée tienne dans ENTRY_MAX (200) sans le couper.
  if (path.basename(file).length > 120) {
    throw new Error(`store: nom trop long (${path.basename(file).length} > 120 caractères) — raccourcir --name.`);
  }
  const today = new Date().toISOString().slice(0, 10);
  const flat = fact.replace(/\s+/g, ' ').trim(); // l'entrée d'index tient sur UNE ligne
  const desc = flat.length > 110 ? flat.slice(0, 107) + '...' : flat;
  const body = `---
name: ${name}
description: ${desc}
metadata:
  type: ${type}
---

${fact}
${opts.why ? `\n**Why:** ${opts.why}\n` : ''}
*Saved ${today} via brain store.*
`;
  // UN seul verrou pour tout le geste (corps + index) et pour TOUS les types : l'index
  // est partagé, deux écrivains ne doivent jamais s'y croiser.
  let entry;
  withStoreLock(dir, () => {
    // Contenu de la règle AVANT remplacement : il sert à reconnaître, dans l'index, les lignes de
    // continuation d'une ancienne entrée multiligne (ce sont des lignes de cet ancien fait).
    // ... et de ses archives .vN : les révisions antérieures ont chacune laissé leur entrée (index
    // historique append-only) avec leurs propres continuations.
    const racine = path.basename(file, '.md');
    const sources = [file, ...fs.readdirSync(dir).filter((f) => f.startsWith(racine + '.v') && /\.v0*\d+\.md$/.test(f) && f.slice(racine.length).match(/^\.v0*\d+\.md$/)).map((f) => path.join(dir, f))];
    const ancien = sources.filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\u0000');
    // Trois régimes d'écriture, pilotés par `type` (déjà calculé plus haut) :
    //  - user/reference (sémantique)  : upsert, comportement historique inchangé.
    //  - project (épisodique)         : append-only — un fichier existant bloque
    //    l'écriture (perte de fait silencieuse sinon), sauf --force explicite.
    //  - feedback (procédural)        : remplacement versionné — l'ancien
    //    contenu part dans <base>.vN.md avant d'être remplacé, jamais perdu.
    // Un type inconnu garde l'écrasement inconditionnel d'origine.
    // Réserves HAUTE 3d906ce7d7f9 et 6e708b04ecfa (audit 2026-08-21, arbitrées
    // FIX le 2026-08-22). Les deux régimes non triviaux tenaient leur promesse par
    // un `existsSync` suivi d'une écriture : entre les deux, un autre processus
    // passe. `project` perdait le fait qu'il jure de ne jamais perdre, et
    // `feedback` pouvait archiver deux fois le MÊME contenu sous deux `.vN`
    // différents, puis laisser une des deux écritures disparaître sans archive.
    if (type === 'project' && !opts.force) {
      // Création EXCLUSIVE : c'est le noyau qui tranche, pas nous. `wx` échoue en
      // EEXIST si le fichier apparaît entre-temps, ce qu'aucun test préalable ne
      // peut garantir. `--force` retombe sur l'écrasement demandé explicitement.
      try {
        fs.writeFileSync(file, body, { flag: 'wx' });
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
        throw new Error(`store refuse d'écraser "${path.basename(file)}" (type project = append-only, le fait existant serait perdu) — relancez avec --force pour l'autoriser explicitement.`);
      }
    } else if (type === 'feedback') {
      // Le choix du `.vN`, la copie et le remplacement forment UN geste : les
      // séparer laissait deux écrivains choisir le même numéro, ou archiver le
      // même original deux fois avant que l'un des deux corps ne soit écrasé sans
      // jamais avoir été archivé. Verrou exclusif de fichier, du même dossier.
      // Verrou par fichier (contrat de #2 : écriture REFUSÉE si `<fichier>.lock` est tenu) en plus du
      // verrou de magasin.
      withFileLock(file, () => {
        if (fs.existsSync(file)) {
          let n = 1;
          while (fs.existsSync(file.replace(/\.md$/, `.v${n}.md`))) n++;
          fs.copyFileSync(file, file.replace(/\.md$/, `.v${n}.md`));
        }
        fs.writeFileSync(file, body);
      });
    } else {
      fs.writeFileSync(file, body);
    }
    // one index line - append-only, no reads needed beyond the index itself
    const index = path.join(dir, MEM_INDEX);
    const title = name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    // Budget d'index EXÉCUTOIRE. memory-gc porte déjà la règle « une entrée ≤ 200
    // caractères, le détail vit dans les fichiers » — mais en audit sur demande,
    // que personne ne lance : 30 des 134 lignes de MEMORY.md la violaient au
    // 2026-08-11. Un index toujours chargé qui grossit sans plafond finit par
    // coûter plus cher que ce qu'il fait gagner, donc on tronque à l'écriture.
    const ENTRY_MAX = 200;
    // Plafond de 200 caractères SANS couper le pointeur [titre](fichier) : on rabote d'abord la
    // description, puis le titre affiché (lisible, pas un identifiant). Le nom de fichier, lui,
    // n'est jamais tronqué.
    const fixe = (t) => `- [${t}](${path.basename(file)}) — ${today} `;
    let tt = title;
    let tete = fixe(tt);
    const reserveDesc = 40;
    if (tete.length + reserveDesc > ENTRY_MAX - 1 && tt.length > 8) {
      const surplus = tete.length + reserveDesc - (ENTRY_MAX - 1);
      tt = tt.slice(0, Math.max(8, tt.length - surplus - 1)).trimEnd() + '…';
      tete = fixe(tt);
    }
    const reste = Math.max(0, ENTRY_MAX - 1 - tete.length);
    entry = tete + desc + '\n';
    if (entry.length - 1 > ENTRY_MAX) entry = tete + (reste > 1 ? desc.slice(0, reste - 1).trimEnd() + '…' : '…') + '\n';
    if (opts.sandbox && !fs.existsSync(index)) fs.writeFileSync(index, '# Sandbox Memory Index\n\n');
    if (type === 'feedback') {
      // Remplacement versionné : l'entrée d'index de la règle précédente est RETIRÉE (sinon le
      // rappel par index transmettrait l'ancienne consigne révoquée à côté de la nouvelle).
      const cible = path.basename(file);
    const pointe = (l) => { const m = l.match(/^\s*(?:[-*+]|\d+[.)])?\s*\[([^\]]+)\]\(([^)]+)\)/); return m && path.resolve(dir, m[2]) === file; };
    const prev = fs.existsSync(index) ? fs.readFileSync(index, 'utf8') : '';
    // On retire l'entrée dont le pointeur PRINCIPAL est ce fichier, et ses lignes de continuation
    // EXACTES : l'ancien store écrivait `tete + desc` avec desc = fait (tronqué à 107 + '...' au-delà
    // de 110), retours à la ligne compris. L'étendue de l'ancienne entrée se recalcule donc depuis
    // les faits de l'ancien fichier et de ses archives .vN : on saute exactement les lignes de ce
    // desc, pas une ligne de plus — une entrée voisine, une section ou un titre ne sont jamais
    // pris pour une continuation.
    // Le front matter recopie `description: ${desc}` (qui peut contenir des '---') : on le saute
    // jusqu'à son bloc `metadata:\n  type:` fixe, pas jusqu'au premier '---'.
    // Le front matter recopie `description: ${desc}` (qui peut contenir des '---') : on le saute
    // jusqu'à son bloc `metadata:\n  type:` fixe, pas jusqu'au premier '---'. La fin du fait est
    // ambiguë (le fait peut contenir `**Why:**`) : on retourne TOUTES les coupes plausibles.
    const faits = (t, crlf = false) => {
      const W = (x) => (crlf ? x.replace(/\n/g, '\r\n') : x); // longueurs/préfixes mesurés comme l'ancien store les a écrits
      const FIN = /\nmetadata:\n  type: [^\n]*\n---(?=\n)/g;
      const dm = t.match(/^---\nname: [^\n]*\ndescription: /);
      if (dm) {
        // Le desc historique est recopié tel quel dans `description:` PUIS en tête du corps : la
        // vraie fin du front matter est le bloc metadata après lequel le corps recommence par ce desc.
        const out = new Set();
        for (const m of t.slice(dm[0].length).matchAll(FIN)) {
          const cand = t.slice(dm[0].length, dm[0].length + m.index);
          const apres = t.slice(dm[0].length + m.index + m[0].length);
          if (!apres.startsWith('\n\n')) continue;
          const corps = apres.slice(2);
          // Desc historique = fait brut (≤ 110) ou fait tronqué à 107 + '...' (donc EXACTEMENT 110 car.).
          if (W(cand).length <= 110 && W(corps).startsWith(W(cand))) out.add(cand);
          else if (W(cand).length === 110 && cand.endsWith('...') && W(corps).length > 110 && W(corps).startsWith(W(cand).slice(0, 107))) out.add(cand);
        }
        return out.size > 1 ? null : [...out]; // plusieurs coupes plausibles (faux bloc metadata dans le fait) : ambigu
      }
      // Fichier sans `description:` (écrit à la main) : le fait est le corps, coupé avant le pied et,
      // faute de mieux, avant chaque `**Why:**` plausible.
      const fm = t.match(/^---\n[\s\S]*?\n---\n\n?/);
      const sansPied = t.slice(fm ? fm[0].length : 0).replace(/\n\n?\*Saved [^\n]*\n?$/, '').replace(/\r?\n$/, ''); // un seul saut final (terminateur de fichier), jamais de trim
      const coupes = new Set([sansPied]);
      for (let m = sansPied.indexOf('\n\n**Why:**'); m >= 0; m = sansPied.indexOf('\n\n**Why:**', m + 1)) coupes.add(sansPied.slice(0, m));
      return [...coupes];
    };
    // Chaque révision écrit son entrée à SA date (`*Saved AAAA-MM-JJ*`) : le pointeur et son desc
    // ne se rapprochent que d'une révision de même date, sinon une archive voisine pourrait
    // prêter ses lignes à une autre entrée.
    let ambigu = false; // coupe du fait ambiguë : RIEN n'est retiré de l'index
    const revs = (textes) => textes.flatMap((t0) => {
      // Fichier ENTIÈREMENT CRLF : on analyse en LF puis on rétablit CRLF. Fins mixtes (gabarit LF, fait CRLF) : octets bruts, comparaison exacte.
      const crlf = t0.includes('\r\n') && !/(^|[^\r])\n/.test(t0); const t = crlf ? t0.replace(/\r\n/g, '\n') : t0;
      const date = (t.match(/\*Saved (\d{4}-\d{2}-\d{2}) via brain store\.\*\s*$/) || [])[1]; // pied FINAL seulement
      const aDesc = /^---\nname: [^\n]*\ndescription: /.test(t);
      const vers = (f) => (crlf ? f.replace(/\n/g, '\r\n') : f);
      // avec `description:` faits() rend déjà le desc final ; sans, c'est le fait brut à tronquer
      const fs_ = faits(t, crlf);
      if (!fs_) { ambigu = true; return []; }
      return fs_.map((f) => (aDesc ? vers(f) : (f = vers(f)).length <= 110 ? f : f.slice(0, 107) + '...'))
        .filter((f) => f.includes('\n')).map((f) => ({ date, desc: f }));
    });
    const textes = ancien.split('\u0000');
    const revisions = revs(textes);
    // La DERNIÈRE entrée pointant ce fichier est celle de sa révision courante : seules ses lignes
    // (pas celles des archives, indiscernables par la 1re ligne) peuvent être des continuations.
    // Les entrées antérieures (reliquats d'un index historique append-only) gardent toutes les sources.
    const courantes = fs.existsSync(file) ? revs(textes.slice(0, 1)) : revisions;
    const estEntree = (l) => pointe(l) && /^\s*(?:[-*+]|\d+[.)])?\s*\[[^\]]+\]\([^)]+\) — \d{4}-\d{2}-\d{2} /.test(l);
    const derniere = prev.split('\n').reduce((r, l, i) => (estEntree(l) ? i : r), -1);
    const lignes = prev.split('\n');
    const sortie = [];
    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i];
      if (ambigu) { sortie.push(l); continue; }
      // Seule une ligne AU FORMAT D'ENTRÉE (`[titre](fichier) — AAAA-MM-JJ …`) est une entrée à retirer :
      // `- [SSH](f.md), sauvegarder…` ou une phrase contenant le lien est une ligne indépendante.
      if (!estEntree(l)) { sortie.push(l); continue; }
      // Une ligne au format d'entrée de store (`[titre](fichier) — AAAA-MM-JJ …`) est une entrée
      // indépendante, jamais une continuation. Une continuation est une ligne de l'ancien fait,
      // égale à la ligne du desc, ou — pour la dernière — tronquée par '...' / '…'.
      let k = 0; let douteuse = 0;
      const mt = l.match(/^(\s*(?:[-*+]|\d+[.)])?\s*\[[^\]]+\]\([^)]+\) — (\d{4}-\d{2}-\d{2}) )([^\n]*)$/);
      for (const { desc, date } of (i === derniere ? courantes : revisions)) {
        if (!mt || (date && mt[2] !== date)) continue;
        // Reproduction EXACTE, octet pour octet, de ce que l'ancien store a écrit : `tete + desc`,
        // ou `tete + desc.slice(0, 198 - tete.length).trimEnd() + '…'` si tete + desc dépassait 199.
        // Aucune tolérance : au moindre écart d'une ligne, rien n'est retiré (un doublon vaut mieux
        // qu'une ligne indépendante perdue).
        const tete = mt[1];
        const E = tete + (tete.length + desc.length > ENTRY_MAX - 1 ? desc.slice(0, Math.max(0, ENTRY_MAX - 2 - tete.length)).trimEnd() + '…' : desc);
        const nl = E.split('\n').length;
        const bloc = lignes.slice(i, i + nl).join('\n'); // index CRLF : la dernière ligne peut garder son \r
        if (bloc === E || bloc === E + '\r') { if (nl - 1 > k) k = nl - 1; }
        else if (nl > 1 && E.split('\n')[0] === l) douteuse = Math.max(douteuse, nl); // 1re ligne d'un fait multiligne, suite divergente
      }
      // Doute : entrée multiligne dont la suite ne correspond pas exactement -> RIEN n'est retiré.
      if (douteuse && k === 0) {
        // on garde aussi tout le bloc (douteuse lignes) : il n'est pas réanalysé comme entrées
        for (let q = 0; q < douteuse && i + q < lignes.length; q++) sortie.push(lignes[i + q]);
        i += douteuse - 1; continue;
      }
      i += k;
    }
    const garde = sortie.join('\n').replace(/\n*$/, '');
    const tmp = `${index}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, (garde ? garde + '\n' : '') + entry);
      fs.renameSync(tmp, index);
    } else {
      fs.appendFileSync(index, entry);
    }
    // Le fait n'est jamais perdu (il est dans son fichier) — mais l'index qui
    // déborde doit se voir, sinon la dérive reprend. Alerte, pas exception.
    const indexBytes = fs.statSync(index).size;
    const INDEX_MAX = 16000;
    if (indexBytes > INDEX_MAX) {
      console.error(`[brain] MEMORY.md ${indexBytes} c > budget ${INDEX_MAX} c — lancer la skill memory-gc`);
    }
  });
  const bytes = Buffer.byteLength(body) + Buffer.byteLength(entry);
  return { file: path.relative(ROOT, file), indexLine: entry.trim(), bytes, ms: +(performance.now() - t0).toFixed(2) };
}

// builds the one-turn prompt (question + recall evidence). NO LLM here -
// the caller pastes it into their own session, so nothing bills as API usage.
function buildAsk(question, k, recallQuery) {
  const r = recall(recallQuery || question, { k: k || 1 });
  const evidence = r.hits.map(h => `=== ${h.file}\n${h.slice}`).join('\n\n').slice(0, 9000);
  const prompt = `${question}\n\nEvidence pulled by the workspace brain (brain.js recall):\n${evidence}\n\nAnswer from this evidence only: quote the key line, name the source file. One short answer, no preamble.`;
  return { prompt, recallBytes: r.bytes, recallMs: r.ms, hits: r.hits.map(h => h.file) };
}

// cross-platform clipboard: Windows clip / macOS pbcopy / Linux xclip-or-xsel
function copyToClipboard(text) {
  const { spawnSync } = require('child_process');
  const tries = process.platform === 'win32' ? [['clip', []]]
    : process.platform === 'darwin' ? [['pbcopy', []]]
      : [['xclip', ['-selection', 'clipboard']], ['xsel', ['-ib']]];
  for (const [cmd, args] of tries) {
    const r = spawnSync(cmd, args, { input: text });
    if (r.status === 0) return r;
  }
  return { status: 1 };
}

module.exports = { recall, store, buildAsk, ROOT, MEM, SANDBOX };

// ---------- CLI ----------
if (require.main === module) {
  const [, , cmd, ...rest] = process.argv;
  const args = [], flags = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) { flags[rest[i].slice(2)] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true; }
    else args.push(rest[i]);
  }
  if (cmd === 'recall') {
    const r = recall(args.join(' '), { k: Number(flags.k) || 3 });
    for (const h of r.hits) {
      console.log(`\n=== ${h.file}  (score ${h.score})`);
      console.log(h.slice);
    }
    console.log(`\n[brain] ${r.hits.length} hits · ${r.bytes.toLocaleString()} bytes read · ${r.ms}ms`);
  } else if (cmd === 'store') {
    let r;
    try {
      r = store(args.join(' '), flags);
    } catch (e) {
      console.error(`[brain] ${e.message}`);
      process.exit(1);
    }
    console.log(`[brain] stored -> ${r.file}`);
    console.log(`[brain] index += ${r.indexLine}`);
    console.log(`[brain] ${r.bytes.toLocaleString()} bytes written · ${r.ms}ms · zero exploration reads`);
  } else if (cmd === 'ask') {
    // ZERO-LLM by design (Jay): builds the one-turn prompt and copies it to
    // the clipboard - paste it into your own Claude session. brain.js never
    // invokes claude itself, so nothing can bill as API usage.
    const { prompt, recallBytes, recallMs, hits } = buildAsk(args.join(' '), Number(flags.k) || 1);
    const cp = copyToClipboard(prompt);
    console.log(prompt);
    console.log(`\n[brain] one-turn prompt built from ${hits.join(', ') || 'no hits'} · ${recallBytes.toLocaleString()} bytes read in ${recallMs}ms · 0 tokens${cp.status === 0 ? ' · COPIED TO CLIPBOARD' : ''}`);
    console.log('[brain] paste it into your Claude session for the one-turn answer.');
  } else {
    console.log('usage: node brain.js recall "question" [--k 3] | node brain.js store "fact" [--type feedback|project|user|reference] [--name slug] [--why "..."] [--sandbox] | node brain.js ask "question" (builds + copies the one-turn prompt, no LLM)');
  }
}
