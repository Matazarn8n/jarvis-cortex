/* brain-v2 workspace scanner.
   Walks the whole workspace (everything-scope), classifies every entry into the
   ARMS model (Applications / Routines / Memory / Skills), assigns departments +
   access, extracts markdown links, and builds the default-visible graph.
   Zero dependencies. Used by server.js; can also run standalone: node scan.js */
'use strict';
const fs = require('fs');
const path = require('path');

const WS = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'workspace.json'), 'utf8')); } catch { return {}; } })();
const ROOT = path.resolve(__dirname, WS.root || '..'); // the workspace this brain maps
const CONFIG_DIR = path.join(__dirname, 'config');
const CACHE_FILE = path.join(__dirname, '.cache', 'links-cache.json');

const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', '.venv', 'venv', '__pycache__', '.next', '.cache',
  '.stversions', '.stfolder', 'dist', 'coverage', '.turbo', '.parcel-cache',
  '.pytest_cache', '.idea', '.vscode-server',
]);
const EXCLUDE_FILES = /^(thumbs\.db|desktop\.ini|\.ds_store|~\$|\.syncthing\.)/i;
const MD_MAX_READ = 1024 * 1024; // don't parse md files above 1MB

// Directories whose direct children are visible by default. Everything else
// folds into a single expandable node at its highest non-spine ancestor.
const SPINE = new Set(WS.visibleRoots || ['', 'shared', '.claude', 'shared/memory', 'shared/docs', 'shared/projects', '.claude/skills', '.claude/commands']);

function loadJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

function loadConfig() {
  const dep = loadJSON(path.join(CONFIG_DIR, 'departments.json'), { departments: [], layers: [], projectPrefixes: {}, pathRules: [], memoryKeywords: [], default: 'business' });
  const apps = loadJSON(path.join(CONFIG_DIR, 'apps.json'), { apps: [] }).apps;
  const routines = loadJSON(path.join(CONFIG_DIR, 'routines.json'), { routines: [] }).routines;
  const agentRoster = loadJSON(path.join(CONFIG_DIR, 'agents.json'), { agents: [] }).agents;
  const overrides = loadJSON(path.join(CONFIG_DIR, 'access-overrides.json'), { overrides: [] }).overrides;
  const tweaks = loadJSON(path.join(CONFIG_DIR, 'tweaks.json'), { hidden: [], edits: {} });
  // longest-prefix-first ordering so J-0002 beats J- style rules
  dep._prefixes = Object.entries(dep.projectPrefixes || {}).sort((a, b) => b[0].length - a[0].length);
  overrides.sort((a, b) => (b.prefix || '').length - (a.prefix || '').length);
  return { dep, apps, routines, agentRoster, overrides, tweaks };
}

// ---------- classification ----------
// secrets never count as Hermes-reachable, wherever they live
const SECRET_RE = /(^|\/)\.env(\.|$)|\.pem$|\.key$|(^|[-_.])secrets?([-_.]|$)|credential|token\.json$|apikey/i;

function isSecret(rel) { return SECRET_RE.test(rel); }

function accessOf(rel, overrides) {
  if (isSecret(rel)) return 'claude';
  for (const o of overrides) if (rel.startsWith(o.prefix)) return o.access;
  for (const p of (WS.sharedPrefixes || ['shared/'])) if (rel.startsWith(p)) return 'both';
  return 'claude';
}

const SKILL_DIRS = (WS.skillDirs || ['.claude/skills', '.claude/commands']).map(d => d.replace(/\/+$/, '') + '/');
function layerOf(rel) {
  for (const d of SKILL_DIRS) if (rel.startsWith(d)) return 'S';
  return 'M';
}

function deptOf(rel, name, cfg) {
  const d = cfg.dep;
  if (rel.startsWith((WS.projectsDir || 'shared/projects') + '/')) {
    const seg = rel.split('/')[2] || '';
    for (const [pre, dept] of d._prefixes) if (seg.startsWith(pre)) return dept;
    return d.default;
  }
  if (rel.startsWith((WS.memoryDir || 'shared/memory') + '/')) {
    const lower = name.toLowerCase();
    for (const rule of d.memoryKeywords || []) {
      if (rule.match.some(k => lower.includes(k))) return rule.dept;
    }
    return d.default;
  }
  for (const r of d.pathRules || []) if (rel.startsWith(r.prefix)) return r.dept;
  return d.default;
}

// ---------- filesystem walk ----------
function walk(rootAbs) {
  const files = [];   // { rel, name, ext, size, mtime, parent }
  const dirs = new Map(); // rel -> { rel, name, parent, files: 0, mdFiles: 0, bytes: 0, childDirs: [] , childFiles: []}
  dirs.set('', { rel: '', name: 'ROBO', parent: null, files: 0, mdFiles: 0, bytes: 0, childDirs: [], childFiles: [] });

  function rec(abs, rel) {
    let entries;
    try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
    const dnode = dirs.get(rel);
    for (const e of entries) {
      const name = e.name;
      if (e.isDirectory()) {
        if (EXCLUDE_DIRS.has(name) || name.startsWith('.stversions')) continue;
        const crel = rel ? rel + '/' + name : name;
        dirs.set(crel, { rel: crel, name, parent: rel, files: 0, mdFiles: 0, bytes: 0, childDirs: [], childFiles: [] });
        dnode.childDirs.push(crel);
        rec(path.join(abs, name), crel);
      } else if (e.isFile()) {
        if (EXCLUDE_FILES.test(name)) continue;
        const crel = rel ? rel + '/' + name : name;
        let st;
        try { st = fs.statSync(path.join(abs, name)); } catch { continue; }
        const ext = path.extname(name).toLowerCase();
        files.push({ rel: crel, name, ext, size: st.size, mtime: st.mtimeMs, parent: rel });
        dnode.childFiles.push(files.length - 1);
      }
    }
  }
  rec(rootAbs, '');

  // roll up recursive counts (children before parents: iterate deepest-first)
  const byDepth = [...dirs.values()].sort((a, b) => b.rel.split('/').length - a.rel.split('/').length);
  for (const d of byDepth) {
    for (const fi of d.childFiles) {
      const f = files[fi];
      d.files++; d.bytes += f.size;
      if (f.ext === '.md') d.mdFiles++;
    }
    if (d.parent !== null) {
      const p = dirs.get(d.parent);
      p.files += d.files; p.bytes += d.bytes; p.mdFiles += d.mdFiles;
    }
  }
  return { files, dirs };
}

// ---------- markdown link extraction (mtime-cached) ----------
function extractLinks(files, cache) {
  const mdFiles = files.filter(f => f.ext === '.md' && f.size <= MD_MAX_READ);
  // basename -> [rels] for wiki-link resolution
  const base = new Map();
  for (const f of mdFiles) {
    const key = f.name.slice(0, -3).toLowerCase();
    if (!base.has(key)) base.set(key, []);
    base.get(key).push(f.rel);
  }
  const relSet = new Set(files.map(f => f.rel));
  const out = [];      // [srcRel, tgtRel]
  const newCache = {};
  let read = 0, cached = 0;

  for (const f of mdFiles) {
    const c = cache[f.rel];
    let raw;
    if (c && c.m === f.mtime) { raw = null; cached++; newCache[f.rel] = c; }
    else {
      let txt = '';
      try { txt = fs.readFileSync(path.join(ROOT, f.rel), 'utf8'); read++; } catch { continue; }
      const targets = new Set();
      // [[wiki links]]
      for (const m of txt.matchAll(/\[\[([^\]|#\n]+)/g)) {
        const key = m[1].trim().replace(/\.md$/i, '').toLowerCase();
        const hits = base.get(key);
        if (hits && hits.length) targets.add(pickClosest(f.rel, hits));
      }
      // [text](relative/path.md) style links (md / pdf / html)
      for (const m of txt.matchAll(/\]\(([^)#?\s]+\.(?:md|pdf|html?))(?:[#?][^)]*)?\)/gi)) {
        let t = m[1];
        if (/^[a-z]+:\/\//i.test(t) || t.startsWith('mailto:')) continue;
        t = t.replace(/\\/g, '/');
        let resolved;
        if (t.startsWith('/')) resolved = t.slice(1);
        else resolved = path.posix.normalize(path.posix.join(path.posix.dirname(f.rel.replace(/\\/g, '/')), t));
        if (resolved.startsWith('..')) continue;
        try { resolved = decodeURIComponent(resolved); } catch { }
        if (relSet.has(resolved)) targets.add(resolved);
      }
      targets.delete(f.rel);
      newCache[f.rel] = { m: f.mtime, t: [...targets] };
    }
    for (const t of (newCache[f.rel].t || [])) out.push([f.rel, t]);
  }
  return { links: out, newCache, stats: { mdParsed: mdFiles.length, read, cached } };
}

function pickClosest(fromRel, candidates) {
  if (candidates.length === 1) return candidates[0];
  const fromDir = fromRel.split('/').slice(0, -1).join('/');
  let best = candidates[0], bestScore = -1;
  for (const c of candidates) {
    const cd = c.split('/').slice(0, -1).join('/');
    let score = 0;
    const a = fromDir.split('/'), b = cd.split('/');
    while (score < a.length && score < b.length && a[score] === b[score]) score++;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

// ---------- visible graph assembly ----------
function isDefaultVisibleDirChild(dirRel) {
  return SPINE.has(dirRel);
}

function buildGraph(model, cfg) {
  const { files, dirs } = model;
  const nodes = [];
  const push = n => { nodes.push(n); return n; };

  // router
  push({ id: 'CLAUDE.md', type: 'router', layer: 'M', label: 'CLAUDE.md', dept: 'business', access: 'both', size: sizeOf(files, 'CLAUDE.md'), path: 'CLAUDE.md' });

  // department hubs (context view anchors) + layer hubs
  for (const d of cfg.dep.departments) push({ id: 'hub:' + d.key, type: 'hub', hubKind: 'dept', layer: 'M', label: d.label, dept: d.key, access: 'both' });
  for (const l of cfg.dep.layers) if (l.key !== 'M') push({ id: 'lhub:' + l.key, type: 'hub', hubKind: 'layer', layer: l.key, label: l.label, dept: null, access: 'both' });

  // real files + folded dirs, per SPINE rules
  const fileIdx = new Map(files.map((f, i) => [f.rel, i]));
  const visible = new Set();

  function addFile(f) {
    if (f.rel === 'CLAUDE.md') return; // router already added
    const layer = layerOf(f.rel);
    const n = {
      id: f.rel, type: 'file', layer, label: f.name,
      dept: deptOf(f.rel, f.name, cfg), access: accessOf(f.rel, cfg.overrides),
      size: f.size, mtime: f.mtime, ext: f.ext, path: f.rel, top: topOf(f.rel),
    };
    if (isSecret(f.rel)) n.secret = true;
    push(n);
    visible.add(f.rel);
  }
  function addFoldedDir(rel) {
    const d = dirs.get(rel);
    const name = d.name;
    const layer = rel.startsWith('.claude/skills/') || rel.startsWith('.claude/commands/') ? 'S' : 'M';
    push({
      id: rel, type: 'dir', layer, label: name, folded: true,
      dept: deptOf(rel + '/', name, cfg), access: accessOf(rel + '/', cfg.overrides),
      size: d.bytes, files: d.files, mdFiles: d.mdFiles, path: rel, top: topOf(rel),
    });
    visible.add(rel);
  }

  for (const spineRel of SPINE) {
    const d = dirs.get(spineRel);
    if (!d) continue;
    for (const fi of d.childFiles) addFile(files[fi]);
    for (const cd of d.childDirs) if (!SPINE.has(cd)) addFoldedDir(cd);
  }

  // apps + routines (virtual)
  for (const a of cfg.apps) push({ id: a.id, type: 'app', layer: 'A', label: a.label, dept: null, access: a.access, status: a.status, kind: a.kind, desc: a.desc, links: a.links });
  for (const r of cfg.routines) push({ id: r.id, type: 'routine', layer: 'R', label: r.label, dept: null, access: r.access, schedule: r.schedule, runner: r.runner, desc: r.desc, links: r.links });

  // Agent roster: Hermes (real reach = everything synced) + employee agents
  // with explicit skill/memory grants from config/agents.json
  for (const a of cfg.agentRoster) {
    const node = {
      id: a.id, type: 'agent', layer: 'A', label: a.name, dept: null,
      access: a.kind === 'vps' ? 'hermes' : 'claude',
      color: a.color, sprite: a.sprite, kind: a.kind, desc: a.desc,
      enabledDefault: a.enabled !== false,
    };
    if (a.access === 'synced') {
      const reach = {};
      for (const d of cfg.dep.departments) reach[d.key] = 0;
      let total = 0, secretCount = 0;
      for (const f of files) {
        const acc = accessOf(f.rel, cfg.overrides);
        if (isSecret(f.rel)) secretCount++;
        if (acc !== 'claude') { total++; const dk = deptOf(f.rel, f.name, cfg); if (reach[dk] !== undefined) reach[dk]++; }
      }
      node.reach = reach; node.reachTotal = total; node.secretsExcluded = secretCount;
    } else {
      node.links = [...(a.skills || []), ...(a.memory || [])];
    }
    push(node);
  }

  // structural links
  const links = [];
  for (const d of cfg.dep.departments) links.push({ s: 'CLAUDE.md', t: 'hub:' + d.key, k: 'route' });
  for (const l of cfg.dep.layers) if (l.key !== 'M') links.push({ s: 'CLAUDE.md', t: 'lhub:' + l.key, k: 'route' });
  for (const n of nodes) {
    if (n.type === 'file' || n.type === 'dir') {
      if (n.layer === 'S') links.push({ s: n.id, t: 'lhub:S', k: 'spoke' });
      else links.push({ s: n.id, t: 'hub:' + n.dept, k: 'spoke' });
    }
    if (n.type === 'app') links.push({ s: n.id, t: 'lhub:A', k: 'spoke' });
    if (n.type === 'routine') links.push({ s: n.id, t: 'lhub:R', k: 'spoke' });
  }
  // app/routine -> skill/file edges from config link lists
  const nodeIds = new Set(nodes.map(n => n.id));
  for (const n of nodes) {
    if ((n.type === 'app' || n.type === 'routine') && Array.isArray(n.links)) {
      for (const t of n.links) if (nodeIds.has(t)) links.push({ s: n.id, t, k: 'wire' });
    }
  }
  // Agent beams: Hermes gets department sync beams weighted by reach + wires to
  // both-access apps; employee agents get direct beams to their granted nodes
  for (const ag of nodes.filter(n => n.type === 'agent')) {
    if (ag.reach) {
      for (const d of cfg.dep.departments) {
        if (ag.reach[d.key] > 0) links.push({ s: ag.id, t: 'hub:' + d.key, k: 'sync', w: ag.reach[d.key] });
      }
      for (const n of nodes) if (n.type === 'app' && n.access !== 'claude') links.push({ s: ag.id, t: n.id, k: 'sync', w: 1 });
    } else if (Array.isArray(ag.links)) {
      for (const t2 of ag.links) if (nodeIds.has(t2)) links.push({ s: ag.id, t: t2, k: 'sync', w: 2 });
    }
  }
  // Jay's UI tweaks: hidden nodes vanish (links too), edits override label/desc
  const tw = cfg.tweaks || { hidden: [], edits: {} };
  const hid = new Set(tw.hidden || []);
  let nodesOut = nodes, linksOut = links;
  if (hid.size) {
    nodesOut = nodes.filter(n => !hid.has(n.id));
    linksOut = links.filter(l => !hid.has(l.s) && !hid.has(l.t));
  }
  for (const [id, e] of Object.entries(tw.edits || {})) {
    const n = nodesOut.find(x => x.id === id);
    if (n) { if (e.label) n.label = e.label; if (e.desc !== undefined) n.desc = e.desc; }
  }
  return { nodes: nodesOut, links: linksOut, visible, hiddenCount: hid.size };
}

function topOf(rel) { return rel.includes('/') ? rel.split('/')[0] : '(root)'; }
function sizeOf(files, rel) { const f = files.find(x => x.rel === rel); return f ? f.size : 0; }

// ---------- public API ----------
function runScan() {
  const t0 = Date.now();
  const cfg = loadConfig();
  const model = walk(ROOT);
  const cache = loadJSON(CACHE_FILE, {});
  const { links: mdLinks, newCache, stats } = extractLinks(model.files, cache);
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(newCache));
  } catch { }
  const graph = buildGraph(model, cfg);

  // md links attach at file level; the client re-targets endpoints that sit
  // inside folded folders to their deepest visible ancestor
  const scanMs = Date.now() - t0;
  return {
    cfg, model, graph, mdLinks,
    meta: {
      scannedAt: new Date().toISOString(), scanMs,
      totalFiles: model.files.length, totalDirs: model.dirs.size,
      mdParsed: stats.mdParsed, mdRead: stats.read, mdCached: stats.cached,
      visibleNodes: graph.nodes.length, mdLinks: mdLinks.length, hiddenCount: graph.hiddenCount || 0,
    },
  };
}

// children of one directory, for lazy expand
function expandDir(model, cfg, rel) {
  const d = model.dirs.get(rel);
  if (!d) return null;
  const out = [];
  for (const fi of d.childFiles) {
    const f = model.files[fi];
    const n = {
      id: f.rel, type: 'file', layer: layerOf(f.rel), label: f.name,
      dept: deptOf(f.rel, f.name, cfg), access: accessOf(f.rel, cfg.overrides),
      size: f.size, mtime: f.mtime, ext: f.ext, path: f.rel, top: topOf(f.rel),
    };
    if (isSecret(f.rel)) n.secret = true;
    out.push(n);
  }
  for (const cd of d.childDirs) {
    const c = model.dirs.get(cd);
    out.push({
      id: cd, type: 'dir', layer: layerOf(cd + '/'), label: c.name, folded: true,
      dept: deptOf(cd + '/', c.name, cfg), access: accessOf(cd + '/', cfg.overrides),
      size: c.bytes, files: c.files, mdFiles: c.mdFiles, path: cd, top: topOf(cd),
    });
  }
  return out;
}

function search(model, cfg, q, limit) {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const scored = [];
  for (const f of model.files) {
    const name = f.name.toLowerCase();
    let score = -1;
    if (name === s) score = 100;
    else if (name.startsWith(s)) score = 80;
    else if (name.includes(s)) score = 60;
    else if (f.rel.toLowerCase().includes(s)) score = 30;
    if (score >= 0) scored.push({ score: score - Math.min(20, f.rel.split('/').length), f });
  }
  for (const [rel, d] of model.dirs) {
    if (!rel) continue;
    const name = d.name.toLowerCase();
    let score = -1;
    if (name === s) score = 95;
    else if (name.startsWith(s)) score = 75;
    else if (name.includes(s)) score = 55;
    if (score >= 0) scored.push({ score, dir: d });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit || 40).map(x => x.f
    ? { path: x.f.rel, name: x.f.name, type: 'file', ext: x.f.ext, size: x.f.size, dept: deptOf(x.f.rel, x.f.name, cfg), layer: layerOf(x.f.rel), access: accessOf(x.f.rel, cfg.overrides) }
    : { path: x.dir.rel, name: x.dir.name, type: 'dir', files: x.dir.files, dept: deptOf(x.dir.rel + '/', x.dir.name, cfg), layer: layerOf(x.dir.rel + '/'), access: accessOf(x.dir.rel + '/', cfg.overrides) });
}

module.exports = { ROOT, runScan, expandDir, search };

if (require.main === module) {
  const r = runScan();
  console.log(JSON.stringify(r.meta, null, 2));
}
