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

// ---------- recall ----------
function recall(query, opts) {
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
      const m = line.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (!m) continue;
      const lw = words(line);
      let score = 0;
      for (const w of qw) {
        if (lw.includes(w)) score += 3;
        else if (lw.some(x => x.startsWith(w) || w.startsWith(x))) score += 1;
      }
      if (score > 0) pointers.push({ file: path.resolve(MEM, m[2]), score, line: line.trim() });
    }
  }
  // 2) filename sweep (names only - no content reads)
  for (const f of fs.readdirSync(MEM)) {
    if (!f.endsWith('.md')) continue;
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
    if (seen.has(p.file)) continue;
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
      if (/^(MEMORY|memory-)/.test(cand)) continue;
      const p1 = path.resolve(ROOT, cand);
      const p2 = path.resolve(path.dirname(path.join(ROOT, hits[0].file)), cand);
      const hp = fs.existsSync(p1) ? p1 : (fs.existsSync(p2) ? p2 : null);
      if (!hp || hits.some(h => path.resolve(ROOT, h.file) === hp)) continue;
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
  const base = name.replace(/-/g, '_');
  const file = path.join(dir, (prefix && base.startsWith(prefix) ? '' : prefix) + base + '.md');
  const today = new Date().toISOString().slice(0, 10);
  const desc = fact.length > 110 ? fact.slice(0, 107) + '...' : fact;
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
  // Trois régimes d'écriture, pilotés par `type` (déjà calculé plus haut) :
  //  - user/reference (sémantique)  : upsert, comportement historique inchangé.
  //  - project (épisodique)         : append-only — un fichier existant bloque
  //    l'écriture (perte de fait silencieuse sinon), sauf --force explicite.
  //  - feedback (procédural)        : remplacement versionné — l'ancien
  //    contenu part dans <base>.vN.md avant d'être remplacé, jamais perdu.
  // Un type inconnu garde l'écrasement inconditionnel d'origine.
  if (type === 'project' && !opts.force) {
    // Réserve HAUTE 3d906ce7d7f9. C'était un check-then-write : `existsSync`
    // puis `writeFileSync`, deux syscalls entre lesquelles un second process
    // constate la même absence — et le second écrase le fait du premier en
    // silence, ce que le régime append-only existe précisément pour empêcher.
    // `wx` fait le contrôle et l'écriture EN UNE syscall : le noyau tranche.
    try {
      fs.writeFileSync(file, body, { flag: 'wx' });
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      throw new Error(`store refuse d'écraser "${path.basename(file)}" (type project = append-only, le fait existant serait perdu) — relancez avec --force pour l'autoriser explicitement.`);
    }
  } else if (type === 'feedback') {
    // Réserve HAUTE 6e708b04ecfa. Le versionnage choisissait `n`, copiait, puis
    // remplaçait — trois temps, aucun verrou. Deux écritures concurrentes
    // élisent le même `.vN`, archivent toutes deux l'ANCIENNE valeur, puis la
    // dernière écrase la nouvelle valeur de l'autre : un fait perdu sans trace,
    // alors que « jamais perdu » est le contrat du régime. Les trois temps ne
    // se rendent pas atomiques séparément — c'est la SÉQUENCE qui doit l'être.
    withFileLock(file, () => {
      if (fs.existsSync(file)) {
        let n = 1;
        while (fs.existsSync(file.replace(/\.md$/, `.v${n}.md`))) n++;
        fs.copyFileSync(file, file.replace(/\.md$/, `.v${n}.md`));
      }
      fs.writeFileSync(file, body);
    });
  } else {
    fs.writeFileSync(file, body);      // user/reference : upsert, inchangé
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
  let entry = `- [${title}](${path.basename(file)}) — ${today} ${desc}\n`;
  if (entry.length - 1 > ENTRY_MAX) entry = entry.slice(0, ENTRY_MAX - 1).trimEnd() + '…\n';
  if (opts.sandbox && !fs.existsSync(index)) fs.writeFileSync(index, '# Sandbox Memory Index\n\n');
  fs.appendFileSync(index, entry);
  // Le fait n'est jamais perdu (il est dans son fichier) — mais l'index qui
  // déborde doit se voir, sinon la dérive reprend. Alerte, pas exception.
  const indexBytes = fs.statSync(index).size;
  const INDEX_MAX = 16000;
  if (indexBytes > INDEX_MAX) {
    console.error(`[brain] MEMORY.md ${indexBytes} c > budget ${INDEX_MAX} c — lancer la skill memory-gc`);
  }
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
