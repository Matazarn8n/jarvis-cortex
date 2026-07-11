/* jarvis-cortex server - local engine for the JARVIS Cortex workspace graph.
   Zero dependencies. Serves the two visual options + the graph API over the
   real workspace. Run:  node server.js   ->  http://localhost:5210
   Endpoints:
     GET  /api/graph[?fresh=1]  default-visible graph + all md links
     GET  /api/expand?path=rel  children of a folded folder
     GET  /api/search?q=...     whole-workspace search (44k files)
     GET  /api/file?path=rel    text content for the in-app viewer
     POST /api/open {path}      open a file on the device
     POST /api/rescan           force a full rescan
*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const scan = require('./scan');

const PORT = Number(process.env.PORT) || 5210;
const PUBLIC = path.join(__dirname, 'public');
const ROOT = scan.ROOT;

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
};
const TEXT_EXT = new Set(['.md', '.txt', '.json', '.js', '.ts', '.jsx', '.tsx', '.html', '.htm', '.css', '.py', '.yaml', '.yml', '.toml', '.csv', '.xml', '.bat', '.sh', '.ps1', '.svg', '.log', '.mjs', '.cjs', '.vtt', '.srt']);

// ---------- scan lifecycle ----------
let scanResult = null;
let scanPromise = null;
let scanStartedAt = 0;

function startScan() {
  scanStartedAt = Date.now();
  scanPromise = new Promise((resolve) => {
    // setImmediate so the server socket binds before the first heavy scan
    setImmediate(() => {
      try { scanResult = scan.runScan(); }
      catch (e) { scanResult = { error: e.message, meta: { error: e.message } }; }
      resolve(scanResult);
    });
  });
  return scanPromise;
}

function freshEnough() {
  return scanResult && Date.now() - scanStartedAt < 30 * 1000;
}

// ---------- helpers ----------
function sendJSON(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', c => b += c);
    req.on('end', () => resolve(b));
  });
}
function safeResolve(rel) {
  if (!rel || rel.includes('\0')) return null;
  const abs = path.resolve(ROOT, rel.replace(/\//g, path.sep));
  if (!abs.startsWith(ROOT)) return null;
  return abs;
}

// ---------- server ----------
const handle = async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  try {
    // static
    if (p === '/' || p === '/index.html') return serveStatic(res, 'index.html');
    if (!p.startsWith('/api/')) {
      const file = p.replace(/^\/+/, '');
      const abs = path.resolve(PUBLIC, file);
      if (abs.startsWith(PUBLIC) && fs.existsSync(abs) && fs.statSync(abs).isFile()) return serveStatic(res, file);
      res.writeHead(404); return res.end('Not found');
    }

    // api
    if (p === '/api/graph' && req.method === 'GET') {
      if (url.searchParams.get('fresh') === '1' && !freshEnough()) startScan();
      if (!scanPromise) startScan();
      const r = await scanPromise;
      if (r.error) return sendJSON(res, { error: r.error }, 500);
      return sendJSON(res, {
        meta: { ...r.meta, port: PORT },
        departments: r.cfg.dep.departments,
        layers: r.cfg.dep.layers,
        nodes: r.graph.nodes,
        links: r.graph.links,
        mdLinks: r.mdLinks,
      });
    }

    if (p === '/api/expand' && req.method === 'GET') {
      const r = await (scanPromise || startScan());
      if (r.error) return sendJSON(res, { error: r.error }, 500);
      const rel = (url.searchParams.get('path') || '').replace(/\\/g, '/');
      const children = scan.expandDir(r.model, r.cfg, rel);
      if (!children) return sendJSON(res, { error: 'Unknown folder' }, 404);
      return sendJSON(res, { path: rel, nodes: children });
    }

    if (p === '/api/search' && req.method === 'GET') {
      const r = await (scanPromise || startScan());
      if (r.error) return sendJSON(res, { error: r.error }, 500);
      const q = url.searchParams.get('q') || '';
      return sendJSON(res, { q, results: scan.search(r.model, r.cfg, q, 40) });
    }

    if (p === '/api/file' && req.method === 'GET') {
      const abs = safeResolve(url.searchParams.get('path') || '');
      if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) return sendJSON(res, { error: 'Not found' }, 404);
      const ext = path.extname(abs).toLowerCase();
      const size = fs.statSync(abs).size;
      if (!TEXT_EXT.has(ext) && ext !== '') return sendJSON(res, { error: 'binary', ext, size }, 400);
      if (size > 500 * 1024) return sendJSON(res, { error: 'File too large for the viewer (' + Math.round(size / 1024) + ' KB)' }, 400);
      return sendJSON(res, { content: fs.readFileSync(abs, 'utf8'), ext, size });
    }

    if (p === '/api/open' && req.method === 'POST') {
      let body = {};
      try { body = JSON.parse(await readBody(req)); } catch { }
      const abs = safeResolve(body.path || '');
      if (!abs || !fs.existsSync(abs)) return sendJSON(res, { error: 'Not found' }, 404);
      const ext = path.extname(abs).toLowerCase();
      if (ext === '.html' || ext === '.htm') spawn('cmd', ['/c', 'start', 'chrome', abs], { detached: true, stdio: 'ignore' }).unref();
      else spawn('cmd', ['/c', 'start', '', abs], { detached: true, stdio: 'ignore' }).unref();
      return sendJSON(res, { ok: true });
    }

    if (p === '/api/tweak' && req.method === 'POST') {
      let body = {};
      try { body = JSON.parse(await readBody(req)); } catch { return sendJSON(res, { error: 'Bad JSON' }, 400); }
      const twPath = path.join(__dirname, 'config', 'tweaks.json');
      let tw; try { tw = JSON.parse(fs.readFileSync(twPath, 'utf8')); } catch { tw = { hidden: [], edits: {} }; }
      tw.hidden = tw.hidden || []; tw.edits = tw.edits || {};
      if (body.action === 'hide' && body.id) { if (!tw.hidden.includes(body.id)) tw.hidden.push(body.id); }
      else if (body.action === 'unhide-all') tw.hidden = [];
      else if (body.action === 'edit' && body.id) tw.edits[body.id] = { label: body.label || undefined, desc: body.desc };
      else return sendJSON(res, { error: 'bad action' }, 400);
      fs.writeFileSync(twPath, JSON.stringify(tw, null, 2));
      return sendJSON(res, { ok: true, hidden: tw.hidden.length });
    }
    if (p === '/api/rescan' && req.method === 'POST') {
      startScan();
      const r = await scanPromise;
      return sendJSON(res, r.error ? { error: r.error } : { ok: true, meta: r.meta });
    }

    // POST /api/bake - snapshot the user's dialed-in settings to a file Jay can send back
    if (p === '/api/bake' && req.method === 'POST') {
      let body = {};
      try { body = JSON.parse(await readBody(req)); } catch { return sendJSON(res, { error: 'Bad JSON' }, 400); }
      const bakedDir = path.join(__dirname, 'baked');
      fs.mkdirSync(bakedDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
      const file = path.join(bakedDir, `bake-${(body.skin || 'brain')}-${stamp}.json`);
      fs.writeFileSync(file, JSON.stringify(body, null, 2));
      return sendJSON(res, { ok: true, path: file });
    }

    if (p === '/api/meta' && req.method === 'GET') {
      const r = await (scanPromise || startScan());
      return sendJSON(res, r.meta || {});
    }

    res.writeHead(404); res.end('Unknown endpoint');
  } catch (e) {
    try { sendJSON(res, { error: e.message }, 500); } catch { }
  }
};

const server = http.createServer(handle);

function serveStatic(res, rel) {
  const abs = path.join(PUBLIC, rel);
  if (!fs.existsSync(abs)) { res.writeHead(404); return res.end('Not found: ' + rel); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(abs));
}

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is taken. Run with another port:  PORT=${PORT + 1} node server.js`);
    process.exit(1);
  }
  throw e;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`JARVIS Cortex -> http://localhost:${PORT}`);
      startScan().then(r => {
    if (r.meta && !r.error) console.log(`Scan: ${r.meta.totalFiles} files, ${r.meta.mdLinks} md links, ${r.meta.visibleNodes} default nodes in ${r.meta.scanMs}ms`);
    else console.log('Scan failed:', r.error);
  });
});


