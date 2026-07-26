/* brain-v2 core chassis. One engine, two skins (option-1 / option-2).
   Owns: data load, expand/collapse, link aggregation, the three layouts
   (force / rings / deck), camera + interactions, search, viewer drawer,
   panels, theme, tweak sliders. Skins own every pixel of drawing style. */
window.BrainCore = (function () {
  const F = window.F2;
  const ACC = { hermes: '#58abf5', claude: '#ff7a2e', both: '#d7dcea' };
  const ACCL = { hermes: 'Hermes only', claude: 'Claude only', both: 'Hermes + Claude' };
  const TEXT_EXT = new Set(['.md', '.txt', '.json', '.js', '.ts', '.jsx', '.tsx', '.html', '.htm', '.css', '.py', '.yaml', '.yml', '.toml', '.csv', '.xml', '.bat', '.sh', '.ps1', '.svg', '.log', '.mjs', '.cjs', '.vtt', '.srt']);

  // ======================= state =======================
  const S = {
    skin: null, theme: 'dark', T: null,
    nodes: [], byId: new Map(), visible: [],
    mdLinks: [], baseLinks: [], aggLinks: [], drawLinks: [],
    departments: [], layers: [], meta: {},
    deptColor: {}, deptLabel: {}, deptIcon: {}, layerColor: {}, layerLabel: {}, layerShape: {},
    st: null, cam: { k: 0.5, x: 0, y: 0 }, fly: null,
    tick: 0, hover: null, sel: null, drag: null,
    focusSet: null, focusLinks: null, lastFocusKey: '',
    sim: null, simKind: '', repCache: new Map(), layoutEpoch: 0, dense: false,
    hermesColor: '#58abf5', accent: '#ff6b1a', colorOverrides: {},
    W: 0, H: 0, DPR: 1, canvas: null, ctx: null,
    ACC, ACCL, F,
    anchors: [], deckRing: 330, hermes: null, router: null,
    colorOf, pass, radiusOf, w2s, s2w, groupKeyOf,
    perf: { fps: 0, frames: 0, last: performance.now() },
  };

  const DEFAULT_ST = {
    layout: 'rings', view: 'context', colorBy: 'dept', acc: 'all',
    size: 1, link: 0.55, labels: 1, cross: true, spin: 0.12, gap: 0.4, span: 0.55,
    armsSize: 0.45, bandLabels: 0.45, ringWidth: 0.35, msat: 0.6,
    transOn: true, transSpd: 0.55, boundSize: 0.5,
    depts: {}, layers: {}, agents: {},
  };

  // ======================= boot =======================
  async function boot(skin) {
    S.skin = skin;
    S.theme = localStorage.getItem('robo-theme') || skin.defaultTheme || 'dark';
    const persisted = JSON.parse(localStorage.getItem('brain-v2-' + skin.key) || '{}');
    S.st = Object.assign({}, DEFAULT_ST, skin.st || {}, persisted);
    buildDOM();
    applyTheme();
    splash(true, 'Scanning the workspace');
    let data;
    try {
      const r = await fetch('api/graph?fresh=1');
      data = await r.json();
      if (data.error) throw new Error(data.error);
    } catch (e) {
      splash(true, 'Scan failed: ' + e.message + ' - is server.js running?');
      return;
    }
    ingest(data);
    splash(false);
    initCanvas();
    buildPanels();
    setLayout(S.st.layout, true);
    resetCam(80);
    loop();
  }

  function ingest(data) {
    S.meta = data.meta; S.departments = data.departments; S.layers = data.layers;
    for (const d of data.departments) { S.deptColor[d.key] = d.color; S.deptLabel[d.key] = d.label; S.deptIcon[d.key] = d.icon; }
    for (const l of data.layers) { S.layerColor[l.key] = l.color; S.layerLabel[l.key] = l.label; S.layerShape[l.key] = l.shape; }
    for (const d of data.departments) if (S.st.depts[d.key] === undefined) S.st.depts[d.key] = true;
    for (const l of data.layers) if (S.st.layers[l.key] === undefined) S.st.layers[l.key] = true;
    S.nodes = data.nodes; S.byId = new Map(S.nodes.map(n => [n.id, n]));
    S.mdLinks = data.mdLinks; S.baseLinks = data.links;
    S.router = S.byId.get('CLAUDE.md'); S.hermes = S.byId.get('agent:hermes');
    S.agentNodes = S.nodes.filter(n => n.type === 'agent');
    // v2: agent defaults changed (Carla/Xavier on) - one-time reset of stored toggles
    if (S.st.agentsV !== 2) { S.st.agents = {}; S.st.agentsV = 2; }
    for (const a of S.agentNodes) if (S.st.agents[a.id] === undefined) S.st.agents[a.id] = a.enabledDefault !== false;
    if (S.skin.onlyAgents) { // final option: Hermes only, no employee mocks
      for (const a of S.agentNodes) if (!S.skin.onlyAgents.includes(a.id)) a._hidden = true;
      S.agentNodes = S.agentNodes.filter(a => S.skin.onlyAgents.includes(a.id));
    }
    for (const n of S.nodes) seed(n);
    S.visible = S.nodes.slice();
    reaggregate();
    applyColors(); // dept/layer maps exist now - re-apply any saved palette overrides
    if (S.skin.layerColors) { // per-skin layer palette (e.g. final option: skills orange)
      Object.assign(S.layerColor, S.skin.layerColors);
      for (const l of S.layers) if (S.skin.layerColors[l.key]) l.color = S.skin.layerColors[l.key];
    }
    if (S.loadAppIcons) S.loadAppIcons();
  }

  function seed(n) {
    if (n.x === undefined) { const a = Math.random() * 7, r = 60 + Math.random() * 420; n.x = Math.cos(a) * r; n.y = Math.sin(a) * r; }
  }

  // ======================= representatives + aggregation =======================
  function repOf(path) {
    if (S.repCache.has(path)) return S.repCache.get(path);
    let rep = null;
    if (S.byId.has(path) && S.byId.get(path)._on) rep = path;
    else {
      const segs = path.split('/');
      for (let i = segs.length - 1; i > 0; i--) {
        const pre = segs.slice(0, i).join('/');
        const n = S.byId.get(pre);
        if (n && n._on) { rep = pre; break; }
      }
    }
    S.repCache.set(path, rep);
    return rep;
  }

  function reaggregate() {
    for (const n of S.nodes) n._on = true; // mark before repOf runs
    S.visible = S.nodes.filter(n => !n._hidden);
    for (const n of S.nodes) n._on = !n._hidden;
    S.repCache.clear();
    // aggregate md links to visible representatives
    const agg = new Map();
    for (const [a, b] of S.mdLinks) {
      const ra = repOf(a), rb = repOf(b);
      if (!ra || !rb || ra === rb) continue;
      const key = ra < rb ? ra + '|' + rb : rb + '|' + ra;
      let e = agg.get(key);
      if (!e) { e = { s: ra, t: rb, k: 'link', w: 0 }; agg.set(key, e); }
      e.w++;
    }
    S.aggLinks = [...agg.values()];
    for (const e of S.aggLinks) {
      const a = S.byId.get(e.s), b = S.byId.get(e.t);
      e.sn = a; e.tn = b;
      if (a.dept && b.dept && a.dept !== b.dept) e.k = 'xlink';
    }
    // structural links among visible
    const struct = [];
    const folderView = S.st.view === 'folders';
    // folder view swaps server hubs for synthesized folder-group hubs
    // (department + layer hubs disappear entirely in folder view - Jay)
    for (const n of S.nodes) if (n._fhub) n._hidden = !folderView;
    for (const n of S.nodes) if (n.type === 'hub' && !n._fhub) n._hidden = folderView;
    S.visible = S.nodes.filter(n => !n._hidden);
    for (const n of S.nodes) n._on = !n._hidden;
    S.repCache.clear();
    if (folderView) {
      const keys = new Set();
      for (const n of S.visible) {
        if (n.type === 'hub' || n.type === 'router' || n._fhub) continue;
        keys.add(groupKeyOf(n));
      }
      for (const key of keys) {
        const id = 'fhub:' + key;
        if (!S.byId.has(id)) {
          const fh = { id, type: 'hub', hubKind: 'folder', _fhub: true, layer: 'M', label: key.slice(2), access: 'both' };
          seed(fh); S.nodes.push(fh); S.byId.set(id, fh);
        }
        S.byId.get(id)._hidden = false;
      }
      S.visible = S.nodes.filter(n => !n._hidden);
      for (const n of S.nodes) n._on = !n._hidden;
      S.repCache.clear();
    }
    for (const l of S.baseLinks) {
      const a = S.byId.get(l.s), b = S.byId.get(l.t);
      if (!a || !b || a._hidden || b._hidden) continue;
      if (folderView && (b.type === 'hub' || a.type === 'hub')) continue; // server hub spokes are context-view only
      struct.push({ s: l.s, t: l.t, k: l.k, w: l.w || 1, sn: a, tn: b });
    }
    if (folderView) {
      for (const n of S.visible) {
        if (n.type === 'hub' || n.type === 'router') continue;
        if (n._lazyParent) continue; // parented below
        const fh = S.byId.get('fhub:' + groupKeyOf(n));
        if (fh) struct.push({ s: n.id, t: fh.id, k: 'spoke', w: 1, sn: n, tn: fh });
      }
      for (const n of S.visible) if (n._fhub) {
        struct.push({ s: 'CLAUDE.md', t: n.id, k: 'route', w: 1, sn: S.router, tn: n });
      }
    }
    // spokes for lazily expanded children -> their parent dir
    for (const n of S.visible) {
      if (n._lazyParent) {
        const p = S.byId.get(n._lazyParent);
        if (p && !p._hidden) struct.push({ s: n.id, t: n._lazyParent, k: 'spoke', w: 1, sn: n, tn: p });
      }
    }
    S.drawLinks = struct.concat(S.aggLinks);
    S.lastFocusKey = ''; // force focus rebuild
    S.layoutEpoch++;
    S.dense = S.visible.length > 3500;
    updateStatsHUD();
  }

  // ======================= expand / collapse =======================
  async function expandDir(id, quiet) {
    const dir = S.byId.get(id);
    if (!dir || dir.type !== 'dir' || dir.expanded) return;
    let data;
    try {
      const r = await fetch('api/expand?path=' + encodeURIComponent(id));
      data = await r.json();
      if (data.error) { toast(data.error); return; }
    } catch (e) { toast('Expand failed: ' + e.message); return; }
    insertChildren(dir, data.nodes);
    reaggregate();
    refreshLayout(0.5);
    if (!quiet) toast('Expanded ' + dir.label + ' - ' + data.nodes.length + ' items');
  }

  function collapseDir(id) {
    const dir = S.byId.get(id);
    if (!dir || !dir.expanded) return;
    const prefix = id + '/';
    for (const n of S.nodes) {
      if (n.id.startsWith(prefix)) { n._hidden = true; n.expanded = false; n.fx = null; n.fy = null; n._pin = null; }
    }
    dir.expanded = false;
    if (S.sel && S.sel.id.startsWith(prefix)) select(null);
    reaggregate();
    refreshLayout(0.4);
  }

  function insertChildren(dir, nodes) {
    dir.expanded = true;
    const spread = Math.max(26, radiusOf(dir) * 3);
    for (const c of nodes) {
      if (S.byId.has(c.id)) { S.byId.get(c.id)._hidden = false; continue; }
      c._lazyParent = dir.id;
      const a = Math.random() * 7;
      c.x = dir.x + Math.cos(a) * spread * (0.4 + Math.random());
      c.y = dir.y + Math.sin(a) * spread * (0.4 + Math.random());
      S.nodes.push(c); S.byId.set(c.id, c);
    }
  }

  async function expandAll() {
    const targets = S.visible.filter(n => n.type === 'dir' && !n.expanded && !n._hidden);
    if (!targets.length) { toast('Nothing left to expand'); return; }
    const projected = S.visible.length + targets.reduce((s, d) => s + Math.min(d.files || 0, 60), 0);
    if (projected > 6500 && !confirm('This expands roughly ' + projected + ' nodes and may get heavy. Continue?')) return;
    splash(true, 'Expanding ' + targets.length + ' folders');
    const results = await Promise.all(targets.map(d =>
      fetch('api/expand?path=' + encodeURIComponent(d.id)).then(r => r.json()).catch(() => null)));
    targets.forEach((dir, i) => {
      const data = results[i];
      if (!data || data.error) return;
      insertChildren(dir, data.nodes);
    });
    reaggregate();
    refreshLayout(0.6);
    splash(false);
    toast('Expanded one level: ' + targets.length + ' folders · ' + S.visible.length.toLocaleString() + ' nodes');
  }

  function collapseAll() {
    // single pass: hide every lazily-loaded node, reset expansion flags
    for (const n of S.nodes) {
      if (n._lazyParent) { n._hidden = true; n.fx = null; n.fy = null; n._pin = null; }
      if (n.type === 'dir') n.expanded = false;
    }
    if (S.sel && S.sel._hidden) select(null);
    reaggregate();
    refreshLayout(0.5);
    toast('Collapsed to the default view');
  }

  async function ensureVisible(path) {
    if (S.byId.has(path) && !S.byId.get(path)._hidden) return S.byId.get(path);
    const segs = path.split('/');
    for (let i = 1; i < segs.length; i++) {
      const pre = segs.slice(0, i).join('/');
      const n = S.byId.get(pre);
      if (n && n.type === 'dir' && !n._hidden && !n.expanded) await expandDir(pre, true);
    }
    return S.byId.get(path) && !S.byId.get(path)._hidden ? S.byId.get(path) : null;
  }

  // ======================= grouping =======================
  function groupKeyOf(n) {
    if (S.st.view === 'context') {
      if (n.type === 'app' || n.type === 'agent') return 'L:A';
      if (n.type === 'routine') return 'L:R';
      if (n.layer === 'S') return 'L:S';
      return 'D:' + (n.dept || 'business');
    }
    if (n.type === 'app' || n.type === 'routine' || n.type === 'agent') return 'F:(system)';
    return 'F:' + (n.top || '(root)');
  }

  function anchorsFor() {
    if (S.st.view === 'context') {
      return S.departments.map(d => ({ key: 'D:' + d.key, label: d.label, color: d.color, icon: d.icon, hubId: 'hub:' + d.key }));
    }
    const tops = new Map();
    for (const n of S.visible) {
      if (n.type === 'hub' || n.type === 'router') continue;
      const k = groupKeyOf(n);
      if (!tops.has(k)) tops.set(k, 0);
      tops.set(k, tops.get(k) + 1);
    }
    const palette = ['#2196f3', '#e040fb', '#00bcd4', '#56d97a', '#f5a623', '#b47aff', '#8fa3ad', '#ff7043', '#fdd835', '#58abf5', '#50e3c2', '#ef8354'];
    return [...tops.keys()].sort().map((k, i) => {
      const fh = S.byId.get('fhub:' + k);
      const color = palette[i % palette.length];
      if (fh) fh.color = color;
      return { key: k, label: k.slice(2), color, icon: 'data', hubId: 'fhub:' + k };
    });
  }

  // ======================= layouts =======================
  function setLayout(kind, first) {
    S.st.layout = kind; persistSt();
    if (S.sim) { S.sim.stop(); S.sim = null; }
    S.simKind = '';
    S.boundGeom = null;
    S.layoutEpoch++;
    S.anchors = anchorsFor();
    const anchorColor = {}; S.anchors.forEach(a => anchorColor[a.key] = a.color);
    S.anchorColor = anchorColor;
    if (kind === 'rings') initRings();
    else buildSim(kind);
    syncSegButtons();
    const names = { rings: 'Rings layout', force: 'Force layout', circle: 'Circle layout', hex: 'Hexagon layout', deck: 'Deck layout' };
    if (!first) toast(names[kind] || kind);
  }

  function refreshLayout(alpha) {
    S.layoutEpoch++;
    S.anchors = anchorsFor();
    const anchorColor = {}; S.anchors.forEach(a => anchorColor[a.key] = a.color);
    S.anchorColor = anchorColor;
    if (S.st.layout === 'rings') initRings();
    else if (S.sim) {
      buildSim(S.st.layout, alpha);
    }
    rebuildLegend();
  }

  // ---- rings (deterministic; sector easing like brain-style 24) ----
  const ringsState = { vis: {}, target: {}, rot: 0 };
  function initRings() {
    for (const a of S.anchors) {
      if (ringsState.vis[a.key] === undefined) { ringsState.vis[a.key] = 1; ringsState.target[a.key] = 1; }
    }
    // layout transition: remember where every node is NOW, glide to ring slots
    if (S.st.transOn) {
      S.rTrans = { t0: S.tick };
      for (const n of S.visible) { n._trX = n.x; n._trY = n.y; }
      if (S.router) { S.router._trX = S.router.x; S.router._trY = S.router.y; }
    } else S.rTrans = null;
  }

  // transition progress for this frame (1 = settled)
  function transK() {
    if (!S.rTrans) return 1;
    if (!S.st.transOn) { S.rTrans = null; return 1; }
    const dur = 26 + (1 - (S.st.transSpd ?? 0.55)) * 110;
    const t = (S.tick - S.rTrans.t0) / dur;
    if (t >= 1) { S.rTrans = null; return 1; }
    return t;
  }

  // blends a node from where it was toward its ring target.
  // option-1 'orbit': polar sweep - routines + apps take a fast lap around
  // the centre on their way in. option-2 'drift': staggered floaty settle.
  function ringBlend(n, tx, ty) {
    if (n._sprF) { // drag release: ease back home
      const kk = (S.tick - n._sprF.t0) / 36;
      if (kk >= 1) delete n._sprF;
      else {
        const e = 1 - Math.pow(1 - kk, 3);
        return [n._sprF.x + (tx - n._sprF.x) * e, n._sprF.y + (ty - n._sprF.y) * e];
      }
    }
    const k = S._tk;
    if (k >= 1 || n._trX === undefined) return [tx, ty];
    if ((S.skin.transStyle || 'drift') === 'orbit') {
      const r0 = Math.hypot(n._trX, n._trY), a0 = Math.atan2(n._trY, n._trX);
      const r1 = Math.hypot(tx, ty), a1 = Math.atan2(ty, tx);
      let da = a1 - a0; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      const e = k * k * (3 - 2 * k);
      const lap = (n.type === 'app' || n.type === 'routine') ? (1 - e) * (1 - e) * 5.5 : 0;
      const ang = a0 + da * e + lap, rr = r0 + (r1 - r0) * e;
      return [Math.cos(ang) * rr, Math.sin(ang) * rr];
    }
    const h = ((n.id.length * 37) % 13) / 13;
    const kk = Math.min(1, Math.max(0, k * 1.25 - h * 0.25));
    const e = (1 - Math.pow(1 - kk, 2.2)) * (1 + 0.07 * Math.sin(kk * Math.PI));
    return [n._trX + (tx - n._trX) * e, n._trY + (ty - n._trY) * e];
  }

  const HERMES_ANG = 0.52; // down-right, clear of the control panel

  function ringsGeom() {
    const st = S.st;
    const gap = 20 + st.gap * 30;
    const skillsR = 40 + (st.r_skills ?? 0.35) * 160; // Skills ring radius dial
    // measure the skills rings first so the memory band starts beyond them
    const skillCount = S.visible.filter(n => n.layer === 'S' && (n.type === 'file' || n.type === 'dir')).length;
    let r = skillsR, left = skillCount;
    while (left > 0) { left -= Math.max(6, Math.floor((2 * Math.PI * r) / 15)); if (left > 0) r += 17; }
    const skillsEnd = r;
    return { skillsR, skillsEnd, hubR: skillsEnd + 30, memR: skillsEnd + 20 + (st.r_memoff ?? 0.26) * 160, gap, spanBase: 0.30 + st.span * 0.36 };
  }

  // targets are computed once per layout epoch; the frame loop only applies
  // rotation, wobble and collapse easing - no sorting or filtering per frame
  let ringsCacheKey = '';
  function ringsKey() {
    const st = S.st;
    return S.layoutEpoch + '|' + st.gap.toFixed(2) + '|' + st.span.toFixed(2) + '|' + st.view
      + '|' + (st.r_skills ?? 0.35).toFixed(2) + '|' + (st.r_memoff ?? 0.26).toFixed(2)
      + '|' + (st.r_routoff ?? 0.26).toFixed(2) + '|' + (st.r_appoff ?? 0.275).toFixed(2);
  }

  function placeRings() {
    const st = S.st;
    ringsState.rot += st.spin * 0.0014;
    for (const k in ringsState.target) {
      const d = ringsState.target[k] - ringsState.vis[k];
      if (Math.abs(d) > 0.001) ringsState.vis[k] += d * 0.1; else ringsState.vis[k] = ringsState.target[k];
    }
    if (ringsCacheKey !== ringsKey()) { computeRingTargets(); ringsCacheKey = ringsKey(); }
    const rot = ringsState.rot;
    const ease = t => t * t * (3 - 2 * t);
    S._tk = transK();
    if (S.router) {
      if (S.router._pin) { S.router.x = S.router._pin.x; S.router.y = S.router._pin.y; }
      else { const [rx, ry] = ringBlend(S.router, 0, 0); S.router.x = rx; S.router.y = ry; }
    }
    for (const n of S.visible) {
      if (n._rA === undefined) continue;
      if (n.type === 'hub') {
        if (n._offstage) continue;
        if (n._pin) { n.x = n._pin.x; n.y = n._pin.y; continue; }
        const [hx, hy] = ringBlend(n, Math.cos(n._rA + rot) * n._rR, Math.sin(n._rA + rot) * n._rR);
        n.x = hx; n.y = hy;
        continue;
      }
      const vis = ease(ringsState.vis[n._rGroup] ?? 1);
      placeRingNode(n, n._rA + rot * n._rSpin, n._rR, n._rHub ? S.byId.get(n._rHub) : null, vis);
    }
  }

  function computeRingTargets() {
    const st = S.st;
    const rot = 0;
    const G = ringsGeom();
    for (const n of S.visible) { delete n._rA; delete n._offstage; }
    if (S.router) { S.router.x = 0; S.router.y = 0; }

    const setT = (n, ang, r, group, hubId, spin) => { n._rA = ang; n._rR = r; n._rGroup = group; n._rHub = hubId; n._rSpin = spin; };

    if (st.view === 'context') {
      const depts = S.anchors;
      // sector widths proportional to sqrt(file count) so Operations doesn't
      // drown its neighbours and small departments stay readable
      const pools = depts.map(a => S.visible.filter(n => (n.type === 'file' || n.type === 'dir') && n.layer !== 'S' && 'D:' + n.dept === a.key)
        .sort((x, y) => (y.size || 0) - (x.size || 0)));
      const weights = pools.map(p => Math.sqrt(Math.max(4, p.length)));
      const wSum = weights.reduce((s, w) => s + w, 0);
      let acc = -Math.PI / 2;
      let maxMemR = G.memR;
      depts.forEach((a, ci) => {
        const width = (weights[ci] / wSum) * Math.PI * 2;
        const a0 = acc + width / 2;
        acc += width;
        const span = Math.min(width * 0.42, width / 2 - 0.03) * (0.6 + G.spanBase);
        const hub = S.byId.get(a.hubId);
        if (hub) setT(hub, a0, G.hubR, a.key, null, 1);
        const pool = pools[ci];
        let r = G.memR, idx = 0;
        while (idx < pool.length) {
          const cap = Math.max(3, Math.floor((2 * span * r) / 15));
          const count = Math.min(cap, pool.length - idx);
          for (let j = 0; j < count; j++) {
            const f = pool[idx + j];
            const frac = count === 1 ? 0.5 : j / (count - 1);
            setT(f, a0 - span + frac * 2 * span, r, a.key, a.hubId, 1);
          }
          idx += count; r += G.gap;
        }
        maxMemR = Math.max(maxMemR, r);
      });
      // skills: innermost rings, full circle, faster spin
      const skills = S.visible.filter(n => n.layer === 'S' && (n.type === 'file' || n.type === 'dir')).sort((x, y) => (y.size || 0) - (x.size || 0));
      let r = G.skillsR, idx = 0;
      for (const k of ['lhub:S', 'lhub:R', 'lhub:A']) { const h = S.byId.get(k); if (h) h._offstage = true; }
      while (idx < skills.length) {
        const cap = Math.max(6, Math.floor((2 * Math.PI * r) / 15));
        const count = Math.min(cap, skills.length - idx);
        for (let j = 0; j < count; j++) {
          setT(skills[idx + j], -Math.PI / 2 + (j / count) * Math.PI * 2, r, 'L:S', null, 1.6);
        }
        idx += count; r += 17;
      }
      // routines ring, then apps ring, then Hermes on the far edge
      const routines = S.visible.filter(n => n.type === 'routine');
      const routR = maxMemR + 10 + (st.r_routoff ?? 0.26) * 140; // Routines ring offset dial
      routines.forEach((n, i) => setT(n, -Math.PI / 2 + (i / Math.max(1, routines.length)) * Math.PI * 2, routR, 'L:R', null, 0.7));
      const apps = S.visible.filter(n => n.type === 'app').sort((a, b) => (a.access === 'claude' ? 1 : 0) - (b.access === 'claude' ? 1 : 0));
      const appR = routR + 16 + (st.r_appoff ?? 0.275) * 160; // Apps ring offset dial
      apps.forEach((n, i) => setT(n, HERMES_ANG + ((i + 0.5) / apps.length - 0.5) * Math.PI * 2, appR, 'L:A', null, 0));
      S.ringsRadii = { skills: G.skillsR, mem: G.memR, memEnd: maxMemR, rout: routR, apps: appR };
    } else {
      // folder view: sector per top-level group, width proportional to contents
      const groups = S.anchors;
      const pools = groups.map(a => S.visible.filter(n => n.type !== 'hub' && n.type !== 'router' && n.type !== 'agent' && groupKeyOf(n) === a.key)
        .sort((x, y) => (x.path || x.id).split('/').length - (y.path || y.id).split('/').length || (y.size || 0) - (x.size || 0)));
      const weights = pools.map(p => Math.sqrt(Math.max(4, p.length)));
      const wSum = weights.reduce((s, w) => s + w, 0);
      let acc = -Math.PI / 2;
      let maxR = 190;
      groups.forEach((a, ci) => {
        const width = (weights[ci] / wSum) * Math.PI * 2;
        const a0 = acc + width / 2;
        acc += width;
        const span = Math.min(width * 0.42, width / 2 - 0.03) * (0.6 + G.spanBase);
        const pool = pools[ci];
        let r = 190, idx = 0;
        while (idx < pool.length) {
          const cap = Math.max(3, Math.floor((2 * span * r) / 15));
          const count = Math.min(cap, pool.length - idx);
          for (let j = 0; j < count; j++) {
            const f = pool[idx + j];
            const frac = count === 1 ? 0.5 : j / (count - 1);
            setT(f, a0 - span + frac * 2 * span, r, a.key, null, 1);
          }
          idx += count; r += G.gap;
        }
        maxR = Math.max(maxR, r);
      });
      for (const h of S.visible) if (h.type === 'hub') h._offstage = true;
      S.ringsRadii = null;
    }
  }

  function placeRingNode(n, ang, r, hub, vis) {
    if (n._pin) { n.x = n._pin.x; n.y = n._pin.y; return; }
    const w = Math.sin(S.tick * 0.008 + r + ang * 7) * 1.5;
    let x = Math.cos(ang) * (r + w), y = Math.sin(ang) * (r + w);
    if (vis < 0.999 && hub) { x = hub.x + (x - hub.x) * vis; y = hub.y + (y - hub.y) * vis; }
    [x, y] = ringBlend(n, x, y);
    n.x = x; n.y = y; n._rv = vis;
  }

  // ---- d3 force + deck ----
  function buildSim(kind, alpha) {
    S.simKind = kind;
    const st = S.st;
    const nodes = S.visible.filter(n => n.type !== 'agent'); // agents orbit the router, outside the sim
    const links = S.drawLinks.filter(l => l.sn.type !== 'agent' && l.tn.type !== 'agent')
      .map(l => ({ source: l.s, target: l.t, k: l.k, w: l.w }));
    if (S.sim) S.sim.stop();
    for (const n of nodes) { n.fx = null; n.fy = null; delete n._offstage; }
    S.router.fx = 0; S.router.fy = 0;

    const anchors = S.anchors;
    const STEP = Math.PI * 2 / Math.max(1, anchors.length);
    const anchorAngle = {}; anchors.forEach((a, i) => anchorAngle[a.key] = -Math.PI / 2 + i * STEP);

    if (kind === 'deck') {
      const RING = S.deckRing;
      anchors.forEach(a => {
        const hub = a.hubId ? S.byId.get(a.hubId) : null;
        if (hub) { hub.fx = Math.cos(anchorAngle[a.key]) * RING; hub.fy = Math.sin(anchorAngle[a.key]) * RING; }
      });
      const apps = S.visible.filter(n => n.type === 'app').sort((a, b) => (a.access === 'claude' ? 1 : 0) - (b.access === 'claude' ? 1 : 0));
      apps.forEach((n, i) => {
        const ang = HERMES_ANG + ((i + 0.5) / apps.length - 0.5) * Math.PI * 2;
        n.fx = Math.cos(ang) * (RING + 205); n.fy = Math.sin(ang) * (RING + 205);
      });
    } else {
      const bounded = kind === 'circle' || kind === 'hex';
      // R sized from the node count with slack so clusters float free inside
      // (a hard tight wall squashes departments into slabs against the rim);
      // the Circle / Hex size slider scales it 0.55x - 1.45x
      const R = bounded ? Math.max(300, (S.dense ? 16 : 30) * Math.sqrt(nodes.length / Math.PI)) * (0.55 + (st.boundSize ?? 0.5) * 0.9) : 0;
      if (bounded) S.boundGeom = { type: kind, R };
      // seed hubs at their sector angle so clusters start apart
      anchors.forEach(a => {
        const hub = a.hubId ? S.byId.get(a.hubId) : null;
        if (hub && !hub._seeded) { hub._seeded = true; hub.x = Math.cos(anchorAngle[a.key]) * (bounded ? R * 0.55 : 340); hub.y = Math.sin(anchorAngle[a.key]) * (bounded ? R * 0.55 : 340); }
      });
    }

    const dist = l => (l.k === 'route' ? 165 : l.k === 'spoke' ? 42 : l.k === 'wire' ? 70 : l.k === 'sync' ? 250 : l.k === 'xlink' ? 170 : 120) * st.dist0();
    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id)
        .distance(dist)
        .strength(l => l.k === 'spoke' ? 0.42 : l.k === 'route' ? 0.55 : l.k === 'wire' ? 0.25 : l.k === 'sync' ? 0.02 : 0.03))
      .force('charge', d3.forceManyBody()
        .strength(d => (d.type === 'router' ? -720 : d.type === 'hub' ? -420 : d.type === 'agent' ? -420 : d.type === 'dir' ? -70 : d.type === 'app' || d.type === 'routine' ? -60 : -26) * st.rep0())
        .distanceMax(S.dense ? 320 : 560).theta(S.dense ? 1.2 : 0.9))
      .alphaDecay(S.dense ? 0.05 : 0.022)
      // skin personality: option-1 sweeps in swishy, option-2 drifts floaty
      .velocityDecay((kind === 'circle' || kind === 'hex') ? (S.skin.transStyle === 'orbit' ? 0.38 : 0.52) : 0.46);
    if (!S.dense) sim.force('collide', d3.forceCollide(d => radiusOf(d) + 2.4).strength(0.6));
    else sim.alphaMin(0.02);

    if (kind === 'deck') {
      sim.force('radial', d3.forceRadial(d =>
        d.layer === 'S' ? 140 : d.type === 'routine' ? S.deckRing + 112 : (d.type === 'file' || d.type === 'dir') ? S.deckRing : 0
      ).strength(d => d.type === 'hub' || d.type === 'router' || d.fx != null ? 0 : d.layer === 'S' ? 0.3 : d.type === 'routine' ? 0.35 : 0.08));
    } else if (kind === 'circle' || kind === 'hex') {
      // Obsidian feel (Jay): departments stay force-directed - organic
      // starburst clusters around folders and dept hubs - while skills,
      // routines and apps SCATTER as lone dust evenly across the silhouette.
      // Layer hubs (SKILLS / ROUTINES / APPLICATIONS) don't exist here.
      const R = S.boundGeom.R, apothem = R * Math.cos(Math.PI / 6);
      const maxR = a => { const t = ((a % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3); return apothem / Math.cos(t - Math.PI / 6); };
      const hexF = a => maxR(a) / R;
      if (!S.skin.clusterLayers) for (const n of nodes) if (n.type === 'hub' && n.hubKind !== 'dept' && !n._fhub) n._offstage = true;
      const scatter = S.skin.clusterLayers ? [] : nodes.filter(n => n.type === 'app' || n.type === 'routine' || (n.layer === 'S' && n.type !== 'hub'));
      const scatterSet = new Set(scatter.map(n => n.id));
      if (S.skin.clusterLayers) {
        // apps line the boundary and FORM the silhouette - no app hub (Jay)
        const rim = nodes.filter(n => n.type === 'app').sort((a, b) => (a.id < b.id ? -1 : 1));
        rim.forEach((n, i) => {
          if (n._userHome) return;
          const ang = -Math.PI / 2 + (i / Math.max(1, rim.length)) * Math.PI * 2;
          const br = (kind === 'hex' ? maxR(ang) : R) - radiusOf(n) - 6;
          n._bTx = Math.cos(ang) * br; n._bTy = Math.sin(ang) * br;
          scatterSet.add(n.id);
        });
        const ah = S.byId.get('lhub:A');
        if (ah && !S.skin.hubOrbit) ah._offstage = true; // hubOrbit keeps it as one of the ring icons
      }
      const GA = Math.PI * (3 - Math.sqrt(5)); // golden angle - even dust
      scatter.forEach((n, i) => {
        if (n._userHome) return; // freely-moved nodes keep their chosen spot
        const t = (i + 0.5) / Math.max(1, scatter.length);
        const ang = i * GA;
        let r = Math.sqrt(t) * (R - 18);
        if (kind === 'hex') r *= hexF(ang);
        n._bTx = Math.cos(ang) * r; n._bTy = Math.sin(ang) * r;
      });
      const dustG = d => (S.st['grav_' + (d.type === 'app' ? 'A' : d.type === 'routine' ? 'R' : 'S')] ?? 0.5) * 0.32;
      const homeG = d => d._userHome ? 0.2 : (S.skin.clusterLayers ? 0.12 + (st.g_rim ?? 0.5) * 0.36 : dustG(d));
      sim.force('tx', d3.forceX(d => d._bTx ?? 0).strength(d => d.fx == null && (scatterSet.has(d.id) || d._userHome) ? homeG(d) : 0));
      sim.force('ty', d3.forceY(d => d._bTy ?? 0).strength(d => d.fx == null && (scatterSet.has(d.id) || d._userHome) ? homeG(d) : 0));
      if (S.skin.tightClusters) {
        // families hug their department hub - folder blobs don't shove each
        // other apart. Every constant here has a gravity dial (g_* keys).
        const gC = 0.3 + (st.g_charge ?? 0.5) * 1.4, gH = 0.3 + (st.g_hub ?? 0.5) * 1.4;
        sim.force('charge', d3.forceManyBody()
          .strength(d => (d.type === 'router' ? -720 : d.type === 'hub' ? -300 * gH * (S.skin.hubOrbit ? 0.15 : 1) : d.type === 'dir' ? -34 * gC : d.type === 'app' || d.type === 'routine' ? -60 * gC : -22 * gC) * st.rep0())
          .distanceMax(60 + (st.g_reach ?? 0.5) * 180).theta(0.95));
        if (!S.dense) sim.force('collide', d3.forceCollide(d => radiusOf(d) + 0.6 + (st.g_pad ?? 0.5) * 3.6).strength(0.7));
      }
      // dust is not dragged around by its wires - clusters keep their springs
      const lf = sim.force('link');
      lf.links(lf.links().filter(l =>
        !scatterSet.has(l.source.id ?? l.source) && !scatterSet.has(l.target.id ?? l.target)));
      const gL = (st.g_link ?? 0.5) * 2; // link-spring dial for the bounded layouts
      lf.strength(l => (l.k === 'spoke' ? 0.42 : l.k === 'route' ? 0.55 : l.k === 'wire' ? 0.25 : l.k === 'sync' ? 0.02 : 0.03) * gL);
      sim.force('bound', () => {
        for (const d of nodes) {
          if (d.fx != null) continue;
          const r = Math.hypot(d.x, d.y); if (r < 1) continue;
          const lim = (kind === 'circle' ? R : maxR(Math.atan2(d.y, d.x))) - radiusOf(d) - 6;
          if (r > lim) { const f2 = (lim / r - 1) * 0.22; d.vx += d.x * f2; d.vy += d.y * f2; }
        }
      });
      // department distance dials work inside the silhouette too (capped at the wall)
      const isLhub = d => S.skin.clusterLayers && d.type === 'hub' && String(d.id).startsWith('lhub:') && d.id !== 'lhub:A';
      if (S.skin.hubOrbit) {
        // ALL hub icons form a neat ring around CLAUDE.md at the centre (Jay)
        const ring = [];
        for (const a of anchors) { const hh = a.hubId && S.byId.get(a.hubId); if (hh && !hh._hidden) ring.push(hh); }
        for (const k2 of ['lhub:S', 'lhub:R', 'lhub:A']) { const hh = S.byId.get(k2); if (hh && !hh._hidden && !ring.includes(hh)) ring.push(hh); }
        ring.forEach((hh, i2) => {
          const a2 = -Math.PI / 2 + (i2 / Math.max(1, ring.length)) * Math.PI * 2;
          hh.x = Math.cos(a2) * 105; hh.y = Math.sin(a2) * 105; // seeded, not pinned - physics keeps the ring
          hh._offstage = false;
        });
        sim.force('deptDist', d3.forceRadial(d => d.type === 'hub' ? 105 : 0)
          .strength(d => d.type === 'hub' && d.fx == null && !d._userHome ? 0.85 : 0));
      } else {
        sim.force('deptDist', d3.forceRadial(
          d => (d.type === 'hub' && d.hubKind === 'dept') ? Math.min(80 + (st['dist_' + d.dept] ?? 0.5) * 520, R * 0.88)
            : isLhub(d) ? R * (0.44 + (st.g_lhubd ?? 0.5) * 0.48) : 0
        ).strength(d => ((d.type === 'hub' && d.hubKind === 'dept') || isLhub(d)) && d.fx == null && !d._userHome ? 0.32 * (0.4 + (st.g_dhold ?? 0.5) * 1.2) : 0));
        if (S.skin.clusterLayers) { // skills / routines form their own hubs-and-clusters
          const la = { 'lhub:S': -1.05, 'lhub:R': 1.15 };
          for (const [id, a] of Object.entries(la)) {
            const h = S.byId.get(id);
            if (h && !h._seeded) { h._seeded = true; h.x = Math.cos(a) * R * 0.68; h.y = Math.sin(a) * R * 0.68; }
          }
        }
      }
      sim.force('center', d3.forceCenter(0, 0));
    } else if (kind === 'force' && st.view === 'context') {
      // layer gravity: skills in, routines/apps out, dept hubs on a mid ring
      sim.force('radial', d3.forceRadial(d =>
        d.layer === 'S' && d.type !== 'hub' ? 150 : d.type === 'routine' ? 440 : d.type === 'app' ? 560 : (d.type === 'hub' && d.hubKind === 'dept') ? 330 : 0
      ).strength(d => d.fx != null ? 0
        : (d.layer === 'S' && d.type !== 'hub') ? 0.28 * (st.grav_S ?? 0.5)
        : d.type === 'routine' ? 0.6 * (st.grav_R ?? 0.5)
        : d.type === 'app' ? 0.68 * (st.grav_A ?? 0.5)
        : 0));
      // each department's distance from the central CLAUDE.md is its own dial
      sim.force('deptDist', d3.forceRadial(
        d => (d.type === 'hub' && d.hubKind === 'dept') ? 80 + (st['dist_' + d.dept] ?? 0.5) * 520 : 0
      ).strength(d => (d.type === 'hub' && d.hubKind === 'dept' && d.fx == null) ? 0.32 : 0));
      sim.force('center', d3.forceCenter(0, 0));
    } else {
      sim.force('radial', d3.forceRadial(340).strength(d => d.type === 'hub' && d._fhub && d.fx == null ? 0.22 : 0));
      sim.force('center', d3.forceCenter(0, 0));
    }
    if (kind === 'force' || kind === 'circle' || kind === 'hex') {
      // per-department gravity: each department's files get their own pull
      // toward their hub (the grav_<dept> sliders; 0 = off, 0.5 = default)
      sim.force('deptPull', a2 => {
        for (const d of nodes) {
          if (d.fx != null || d.type === 'hub' || d.type === 'router' || d.type === 'agent') continue;
          if (d._userHome) continue; // freely-placed nodes are exempt
          let hub;
          if (d.type === 'app') continue; // apps are rim-anchored, never pulled
          let gKey;
          if (d.type === 'routine' || d.layer === 'S') {
            if (!S.skin.clusterLayers) continue; // dust mode - no pull
            hub = S.byId.get(d.type === 'routine' ? 'lhub:R' : 'lhub:S');
            gKey = d.type === 'routine' ? 'grav_R' : 'grav_S'; // their own dials, not a dept's
          } else { hub = S.byId.get('hub:' + d.dept); gKey = 'grav_' + d.dept; }
          if (!hub || hub._hidden) continue;
          const v = S.st[gKey] ?? 0.5;
          if (!v) continue;
          const g = v * v * (S.skin.tightClusters ? 0.34 : 0.22) * (0.4 + (S.st.g_pull ?? 0.5) * 1.2) * a2;
          d.vx += (hub.x - d.x) * g; d.vy += (hub.y - d.y) * g;
        }
      });
    }
    sim.alpha(alpha === undefined ? 0.9 : Math.max(0.35, alpha));
    S.sim = sim;
  }

  // ======================= sizing / colors / filters =======================
  function radiusOf(n) {
    const z = S.st.size;
    if (n.type === 'router') return 24;
    if (n.type === 'agent') return 11; // small satellites orbiting the router
    if (n.type === 'hub') return n._offstage ? 0.001 : 8 + (S.st.hubSize ?? 0.39) * 18;
    const arms = 0.6 + (S.st.armsSize ?? 0.45) * 1.9;
    const mul = S.skin.sizeMul || {};
    if (n.type === 'app') return 7.5 * z * arms * (mul.app || 1);
    if (n.type === 'routine') return 6.5 * z * arms * (mul.routine || 1);
    if (n.type === 'dir') return Math.min(20, 5 + Math.sqrt(n.files || 1) * 0.34) * z;
    return Math.min(13, 2.3 + Math.log2(1 + (n.size || 0) / 800) * 1.15) * z;
  }

  function colorOf(n) {
    if (n.type === 'router') return S.T.routerColor;
    if (n.type === 'agent') return n.id === 'agent:hermes' ? S.hermesColor : (n.color || '#58abf5');
    if (n._fhub) return n.color || '#8fa3ad';
    if (S.st.colorBy === 'access') return ACC[n.access] || ACC.both;
    if (S.st.view === 'folders' && (n.type === 'file' || n.type === 'dir')) return S.anchorColor[groupKeyOf(n)] || '#8fa3ad';
    if (n.type === 'hub') return n.hubKind === 'dept' ? S.deptColor[n.dept] : S.layerColor[n.layer];
    if (n.layer === 'S') return S.layerColor.S;
    if (n.type === 'app') return S.layerColor.A;
    if (n.type === 'routine') return S.layerColor.R;
    // memory files render desaturated so the vivid layers pop; msat slider dials it
    const base = S.deptColor[n.dept] || '#8fa3ad';
    return F.mix(base, '#8f959d', (1 - (S.st.msat ?? 0.6)) * 0.85);
  }

  function pass(n) {
    if (n.type === 'router') return true;
    if (n.type === 'agent') {
      if (S.st.agents[n.id] === false) return false;
      return n.reach ? S.st.acc !== 'claude' : true;
    }
    const st = S.st;
    if (n.type === 'hub') {
      if (n.hubKind === 'folder') return true;
      if (n.hubKind === 'dept') return st.depts[n.dept] !== false && st.layers.M !== false;
      return st.layers[n.layer] !== false;
    }
    if (n.layer === 'S') { if (st.layers.S === false) return false; }
    else if (n.type === 'app') { if (st.layers.A === false) return false; }
    else if (n.type === 'routine') { if (st.layers.R === false) return false; }
    else { if (st.layers.M === false) return false; if (n.dept && st.depts[n.dept] === false) return false; }
    const a = st.acc;
    if (a === 'hermes' && n.access === 'claude') return false;
    if (a === 'claude' && n.access === 'hermes') return false;
    return true;
  }

  // ======================= focus =======================
  function rebuildFocus() {
    const f = S.drag || S.hover || S.sel;
    const key = f ? f.id : '';
    if (key === S.lastFocusKey) return;
    S.lastFocusKey = key;
    if (!f) { S.focusSet = null; S.focusLinks = null; return; }
    if (f.type === 'agent' && f.reach) { // Hermes spotlight: everything it can reach
      S.focusSet = new Set([f.id]);
      for (const n of S.visible) if (n.access !== 'claude') S.focusSet.add(n.id);
      S.focusLinks = new Set();
      S.drawLinks.forEach((l, i) => { if (l.k === 'sync' && (l.s === f.id || l.t === f.id)) S.focusLinks.add(i); });
      return;
    }
    S.focusSet = new Set([f.id]);
    S.focusLinks = new Set();
    S.drawLinks.forEach((l, i) => {
      if (l.s === f.id) { S.focusSet.add(l.t); S.focusLinks.add(i); }
      else if (l.t === f.id) { S.focusSet.add(l.s); S.focusLinks.add(i); }
    });
  }

  // ======================= camera =======================
  function w2s(x, y) { return [x * S.cam.k + S.cam.x, y * S.cam.k + S.cam.y]; }
  function s2w(px, py) { return [(px - S.cam.x) / S.cam.k, (py - S.cam.y) / S.cam.k]; }
  function flyCam(to, dur) { S.fly = { from: { k: S.cam.k, x: S.cam.x, y: S.cam.y }, to, t: 0, dur: dur || 50 }; }
  function resetCam(dur) { flyCam({ k: Math.min(S.W, S.H) / 1500, x: S.W / 2, y: S.H / 2 }, dur || 55); }
  function flyToNode(n) { const k = Math.max(1.6, S.cam.k); flyCam({ k, x: S.W / 2 - n.x * k, y: S.H / 2 - n.y * k }, 50); }

  // ======================= canvas + interactions =======================
  function initCanvas() {
    const c = document.getElementById('brain-canvas');
    S.canvas = c; S.ctx = c.getContext('2d');
    resize();
    addEventListener('resize', resize);
    c.addEventListener('wheel', e => {
      e.preventDefault(); S.fly = null;
      const [wx, wy] = s2w(e.clientX, e.clientY);
      S.cam.k = Math.max(0.1, Math.min(8, S.cam.k * Math.exp(-e.deltaY * 0.0014)));
      const [sx, sy] = w2s(wx, wy);
      S.cam.x += e.clientX - sx; S.cam.y += e.clientY - sy;
    }, { passive: false });

    let pan = null, downAt = null;
    c.addEventListener('mousedown', e => {
      const hit = hitTest(e.clientX, e.clientY, true);
      downAt = { x: e.clientX, y: e.clientY, hit };
      if (hit) {
        // everything drags: files, folders, departments, the router, Hermes
        S.drag = hit;
        if (S.simKind) { hit.fx = hit.x; hit.fy = hit.y; S.sim.alphaTarget(0.28).restart(); }
        c.style.cursor = 'grabbing';
      } else pan = { sx: e.clientX, sy: e.clientY, cx: S.cam.x, cy: S.cam.y };
    });
    addEventListener('mousemove', e => {
      if (S.drag) {
        S.fly = null;
        const [wx, wy] = s2w(e.clientX, e.clientY);
        if (S.simKind) { S.drag.fx = wx; S.drag.fy = wy; }
        S.drag._pin = { x: wx, y: wy }; // rings and the fixed anchors honour the pin
        return;
      }
      if (pan) { S.fly = null; S.cam.x = pan.cx + (e.clientX - pan.sx); S.cam.y = pan.cy + (e.clientY - pan.sy); return; }
      S.hover = hitTest(e.clientX, e.clientY, false);
      c.style.cursor = S.hover ? 'pointer' : 'grab';
      showTip(e);
    });
    addEventListener('mouseup', e => {
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 5) {
        const hit = downAt.hit;
        if (hit) { hit._pin = null; if (S.simKind && hit.type !== 'hub' && hit.type !== 'router' && hit.type !== 'agent') { hit.fx = null; hit.fy = null; } }
        if (hit && hit.type === 'dir') { hit.expanded ? collapseDir(hit.id) : expandDir(hit.id); select(hit); }
        else if (hit && hit.type === 'hub') {
          const key = hit.hubKind === 'dept' ? hit.dept : null;
          if (key) { S.st.depts[key] = S.st.depts[key] === false; rebuildLegend(); }
        }
        else if (hit && hit.type === 'router') { S.st.layout = S.st.layout === 'rings' ? 'force' : 'rings'; setLayout(S.st.layout); }
        else if (hit && hit === S.sel && hit.type === 'file' && TEXT_EXT.has(hit.ext)) openViewer(hit.path); // second click on a selected md opens it in the side viewer
        else select(hit || null);
      }
      downAt = null;
      if (S.drag) {
        const d = S.drag;
        d._pin = null;
        const bounded = S.st.layout === 'circle' || S.st.layout === 'hex';
        if (bounded && S.skin.freeDrop && d.type !== 'router') {
          // final option: a dropped node adopts its new spot as home and the
          // physics re-balance around it (double-click sends it back)
          d._bTx = d.x; d._bTy = d.y; d._userHome = true;
          d.fx = null; d.fy = null;
          if (S.simKind) { S.sim.alphaTarget(0); S.sim.alpha(Math.max(S.sim.alpha(), 0.25)).restart(); }
        } else {
          // elsewhere: the layout pulls the node home again (no sticky pins)
          d._sprF = { x: d.x, y: d.y, t0: S.tick };
          if (S.simKind) {
            S.sim.alphaTarget(0);
            refreshLayout(0.5); // rebuild clears fx and re-anchors hubs, sim glides home
          }
        }
        S.drag = null; c.style.cursor = 'grab';
      }
      pan = null;
    });
    c.addEventListener('dblclick', () => {
      if (S.hover) {
        S.hover._pin = null;
        delete S.hover._userHome; // rejoin the layout's own gravity
        if (S.hover.type !== 'router') { S.hover.fx = null; S.hover.fy = null; }
        if (S.simKind) { refreshLayout(0.3); }
        flyToNode(S.hover);
      }
    });
    addEventListener('keydown', e => {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault(); document.getElementById('brain-search').focus();
      }
      if (e.key === 'Escape') { closeViewer(); select(null); }
    });
  }

  function resize() {
    S.DPR = Math.min(2, devicePixelRatio || 1);
    S.W = innerWidth; S.H = innerHeight;
    S.canvas.width = S.W * S.DPR; S.canvas.height = S.H * S.DPR;
    S.canvas.style.width = S.W + 'px'; S.canvas.style.height = S.H + 'px';
    S.ctx.setTransform(S.DPR, 0, 0, S.DPR, 0, 0);
    S.bgCache = null;
  }

  function hitTest(px, py, all) {
    const [wx, wy] = s2w(px, py);
    let hit = null, bd = 1e9;
    for (const n of S.visible) {
      if (!all && n.type === 'router') continue;
      if (!pass(n) || n._offstage) continue;
      const r = radiusOf(n) + 6 / S.cam.k;
      const d = (n.x - wx) ** 2 + (n.y - wy) ** 2;
      if (d < r * r && d < bd) { bd = d; hit = n; }
    }
    return hit;
  }

  // ======================= render loop =======================
  function loop() {
    const st = S.st; S.tick++;
    if (S.fly) {
      S.fly.t++;
      const p = Math.min(1, S.fly.t / S.fly.dur), e = 1 - Math.pow(1 - p, 3);
      S.cam.k = S.fly.from.k + (S.fly.to.k - S.fly.from.k) * e;
      S.cam.x = S.fly.from.x + (S.fly.to.x - S.fly.from.x) * e;
      S.cam.y = S.fly.from.y + (S.fly.to.y - S.fly.from.y) * e;
      if (p >= 1) S.fly = null;
    }
    if (st.layout === 'rings') placeRings();
    S.curved = !!S.skin.alwaysCurved || st.layout === 'force' || st.layout === 'circle' || st.layout === 'hex';
    // agents orbit the router in every layout - drag pins, double-click releases
    if (S.agentNodes && S.agentNodes.length) {
      const shown = S.agentNodes.filter(n => !n._hidden && pass(n));
      const orbitR = st.layout === 'rings' ? Math.max(50, (S.ringsRadii ? S.ringsRadii.skills : 96) - 36) : 62;
      const cx = S.router ? S.router.x : 0, cy = S.router ? S.router.y : 0;
      shown.forEach((a, i) => {
        if (a._pin) { a.x = a._pin.x; a.y = a._pin.y; return; }
        const ang = S.tick * (0.0015 + (S.st.spin ?? 0.12) * 0.03) + (i / Math.max(1, shown.length)) * Math.PI * 2; // ring-spin slider drives the agents too
        let ax = cx + Math.cos(ang) * orbitR, ay = cy + Math.sin(ang) * orbitR;
        if (a._sprF) { // released from a drag: ease back onto the orbit
          const kk = (S.tick - a._sprF.t0) / 36;
          if (kk >= 1) delete a._sprF;
          else { const e = 1 - Math.pow(1 - kk, 3); ax = a._sprF.x + (ax - a._sprF.x) * e; ay = a._sprF.y + (ay - a._sprF.y) * e; }
        }
        a.x = ax; a.y = ay;
      });
    }
    rebuildFocus();

    const ctx = S.ctx;
    ctx.clearRect(0, 0, S.W, S.H);
    if (!S.bgCache) {
      S.bgCache = document.createElement('canvas');
      S.bgCache.width = S.W * S.DPR; S.bgCache.height = S.H * S.DPR;
      const g = S.bgCache.getContext('2d');
      g.setTransform(S.DPR, 0, 0, S.DPR, 0, 0);
      S.skin.drawBackdrop(g, S.W, S.H, S);
    }
    ctx.drawImage(S.bgCache, 0, 0, S.W, S.H);
    ctx.save();
    ctx.translate(S.cam.x, S.cam.y);
    ctx.scale(S.cam.k, S.cam.k);

    if (S.skin.underLayer) S.skin.underLayer(ctx, S);

    // links (culled). In dense mode non-focus links batch into one path per
    // kind - 8k individual strokes per frame is what kills the frame budget.
    const m = 60 / S.cam.k;
    const [vx0, vy0] = s2w(-60, -60), [vx1, vy1] = s2w(S.W + 60, S.H + 60);
    const lbatch = S.dense ? {} : null;
    for (let i = 0; i < S.drawLinks.length; i++) {
      const l = S.drawLinks[i];
      const a = l.sn, b = l.tn;
      if ((l.k === 'link' || l.k === 'xlink') && !st.cross) continue;
      if (!pass(a) || !pass(b) || a._offstage || b._offstage) continue;
      if ((a.x < vx0 && b.x < vx0) || (a.x > vx1 && b.x > vx1) || (a.y < vy0 && b.y < vy0) || (a.y > vy1 && b.y > vy1)) continue;
      const inF = S.focusLinks && S.focusLinks.has(i);
      if (lbatch && !inF) {
        if (l.k === 'spoke' && S.cam.k < 0.9) continue; // shed noise when huge
        let p = lbatch[l.k];
        if (!p) p = lbatch[l.k] = new Path2D();
        p.moveTo(a.x, a.y);
        if (S.curved) { const [qx, qy] = F.linkCtrl(a, b, i); p.quadraticCurveTo(qx, qy, b.x, b.y); }
        else p.lineTo(b.x, b.y);
        continue;
      }
      S.skin.drawLink(ctx, l, i, inF, S);
    }
    if (lbatch) {
      const T = S.T;
      const styles = {
        route: [`rgba(${T.inkLine},${0.16 * st.link * 2})`, 0.9],
        spoke: [`rgba(${T.inkLine},${0.05 * st.link * 2})`, 0.45],
        sync: [F.hexToRgba(S.hermesColor, 0.35 * Math.max(0.4, st.link)), 0.8],
        wire: [F.hexToRgba('#50e3c2', 0.2 * st.link * 2), 0.6],
        link: [`rgba(${T.inkLine},${0.07 * st.link * 2})`, 0.5],
        xlink: [`rgba(${T.inkLine},${0.09 * st.link * 2})`, 0.5],
      };
      for (const k in lbatch) {
        const s = styles[k] || styles.link;
        ctx.strokeStyle = s[0]; ctx.lineWidth = s[1] / S.cam.k;
        ctx.stroke(lbatch[k]);
      }
    }
    if (S.skin.midLayer) S.skin.midLayer(ctx, S);

    // nodes - in dense mode, sub-3px nodes batch into one path per colour
    const batch = S.dense ? new Map() : null;
    for (const n of S.visible) {
      if (n.type === 'hub' && n._offstage) continue;
      if (n.x < vx0 - m || n.x > vx1 + m || n.y < vy0 - m || n.y > vy1 + m) continue;
      const on = pass(n);
      const dim = S.focusSet && !S.focusSet.has(n.id);
      const r = radiusOf(n);
      if (batch && (n.type === 'file' || n.type === 'dir') && r * S.cam.k < 4.2 && n !== S.hover && n !== S.sel) {
        const key = colorOf(n) + (!on ? '|off' : dim ? '|dim' : '');
        let arr = batch.get(key);
        if (!arr) { arr = { c: colorOf(n), a: !on ? 0.06 : dim ? 0.14 : 0.95, pts: [] }; batch.set(key, arr); }
        arr.pts.push(n.x, n.y, r);
        continue;
      }
      S.skin.drawNode(ctx, n, r, on, dim, S);
      // every routine wears its own glyph, in both skins and all shape variants
      if (n.type === 'routine' && on && !dim && r * S.cam.k > 5) {
        ctx.globalAlpha = 0.95;
        S.drawNodeIcon(ctx, n, r * 0.72, S.skin.glyphInk || (S.theme === 'dark' ? (S.skin.key === 'nebula' ? '#eaf0ff' : '#f2efe8') : '#1c1a16'));
        ctx.globalAlpha = 1;
      }
    }
    if (batch) {
      for (const g of batch.values()) {
        ctx.globalAlpha = g.a; ctx.fillStyle = g.c; ctx.beginPath();
        const p = g.pts;
        for (let i = 0; i < p.length; i += 3) ctx.rect(p[i] - p[i + 2], p[i + 1] - p[i + 2], p[i + 2] * 2, p[i + 2] * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (S.skin.overLayer) S.skin.overLayer(ctx, S);

    // selection ring
    if (S.sel && S.sel.x != null && pass(S.sel)) S.skin.drawSelection(ctx, S.sel, radiusOf(S.sel), S);
    ctx.restore();

    // labels (screen space, budgeted)
    if (st.labels > 0.02) drawLabels();

    S.perf.frames++;
    const now = performance.now();
    if (now - S.perf.last > 1000) {
      S.perf.fps = S.perf.frames; S.perf.frames = 0; S.perf.last = now;
      const el = document.getElementById('brain-fps');
      if (el) el.textContent = S.perf.fps + ' fps · ' + S.visible.length + ' nodes';
    }
    requestAnimationFrame(loop);
  }

  function drawLabels() {
    const ctx = S.ctx, st = S.st;
    const cand = [];
    for (const n of S.visible) {
      if (!pass(n) || n._offstage) continue;
      const r = radiusOf(n);
      const isFocus = n === S.hover || (S.sel && S.sel.id === n.id);
      const big = n.type === 'router' || n.type === 'agent' || n.type === 'hub';
      // app + routine names only past the skin's zoom threshold (Jay)
      if ((n.type === 'app' || n.type === 'routine') && S.skin.labelMinZoom && S.cam.k < S.skin.labelMinZoom && !isFocus) continue;
      // the names kill switch covers files, folders, routines and apps (Jay)
      if ((n.type === 'file' || n.type === 'dir' || n.type === 'app' || n.type === 'routine') && st.fileLabels === false && !isFocus) continue;
      const show = isFocus || big || (S.focusSet && S.focusSet.has(n.id) && S.cam.k > 0.85 && S.focusSet.size < 160) || r * S.cam.k > 9.6 - st.labels * 3;
      if (!show) continue;
      const [sx, sy] = w2s(n.x, n.y);
      if (sx < -40 || sx > S.W + 40 || sy < -40 || sy > S.H + 40) continue;
      cand.push([n, sx, sy, r, isFocus, big]);
    }
    cand.sort((a, b) => (b[5] ? 1e3 : b[3]) - (a[5] ? 1e3 : a[3]));
    const max = 30 + st.labels * 40;
    S.skin.drawLabels(ctx, cand.slice(0, max), S);
  }

  // ======================= tooltip =======================
  function showTip(e) {
    const tip = document.getElementById('brain-tip');
    const n = S.hover;
    if (!n) { tip.style.opacity = 0; return; }
    tip.style.opacity = 1;
    tip.style.left = Math.min(e.clientX + 14, innerWidth - 260) + 'px';
    tip.style.top = Math.min(e.clientY + 14, innerHeight - 120) + 'px';
    tip.innerHTML = tipHTML(n);
  }

  function fmtBytes(b) {
    if (b == null) return '';
    if (b > 1048576) return (b / 1048576).toFixed(1) + ' MB';
    if (b > 1024) return Math.round(b / 1024) + ' KB';
    return b + ' B';
  }
  function timeAgo(ms) {
    if (!ms) return '';
    const d = Date.now() - ms;
    if (d < 3600e3) return Math.max(1, Math.round(d / 60e3)) + 'm ago';
    if (d < 86400e3) return Math.round(d / 3600e3) + 'h ago';
    return Math.round(d / 86400e3) + 'd ago';
  }

  function accBadge(n) {
    return `<span class="badge" style="border-color:${ACC[n.access]};color:${ACC[n.access]}">${ACCL[n.access] || n.access}</span>`;
  }

  function tipHTML(n) {
    const c = colorOf(n);
    if (n.type === 'router') return `<b>CLAUDE.md - the router</b><div class="tmut">Every request starts here. Click to flip layout.</div>`;
    if (n.type === 'agent') {
      if (n.reach) return `<b style="color:${c}">${n.label} - VPS agent</b><div class="tmut">Reaches ${n.reachTotal} synced files over Syncthing. ${n.secretsExcluded} secret files locked out.</div>${accBadge(n)}`;
      return `<b style="color:${c}">${n.label} - employee agent</b><div class="tmut">${n.desc || ''}</div><div class="tfaint">${(n.links || []).length} skills + memory grants · click to spotlight</div>`;
    }
    if (n.type === 'hub') return `<b>${n.label}</b><div class="tmut">${n.hubKind === 'dept' ? 'Department - click to filter' : S.layerLabel[n.layer]}</div>`;
    if (n.type === 'app') return `<b>${n.label}</b><div class="tmut">${n.kind.toUpperCase()} · ${n.desc || ''}</div>${accBadge(n)}${n.status === 'needs-auth' ? '<span class="badge" style="border-color:#f5a623;color:#f5a623">needs auth</span>' : ''}`;
    if (n.type === 'routine') return `<b>${n.label}</b><div class="tmut">${n.schedule} · runs on ${n.runner}</div>${accBadge(n)}`;
    if (n.type === 'dir') return `<b style="color:${c}">${n.label}/</b><div class="tmut">${n.files} files · ${n.mdFiles} md · ${fmtBytes(n.size)}</div><div class="tmut">${n.path}</div><div class="tfaint">click to ${n.expanded ? 'collapse' : 'expand'}</div>${accBadge(n)}`;
    return `<b style="color:${c}">${n.label}</b><div class="tmut">${S.deptLabel[n.dept] || ''} · ${fmtBytes(n.size)} · ${timeAgo(n.mtime)}</div><div class="tmut">${n.path}</div><div class="tfaint">click to inspect · double-click to fly</div>${accBadge(n)}${n.secret ? '<span class="badge" style="border-color:#ef4444;color:#ef4444">secret - never syncs</span>' : ''}`;
  }

  // ======================= selection + detail card =======================
  function select(n) {
    S.sel = n;
    const card = document.getElementById('brain-card');
    if (!n) { card.style.display = 'none'; return; }
    card.style.display = 'block';
    const c = colorOf(n);
    let stats = '', actions = '', title = n.label;
    if (n.type === 'file') {
      stats = `${fmtBytes(n.size)} · ${timeAgo(n.mtime)} · ${n.ext || 'file'}`;
      const viewable = TEXT_EXT.has(n.ext);
      actions = `${viewable ? `<button class="act" data-act="view">View here</button>` : ''}<button class="act" data-act="open">Open on device</button><button class="act" data-act="copy">Copy path</button>`;
    } else if (n.type === 'dir') {
      title += '/';
      stats = `${n.files} files · ${n.mdFiles} md · ${fmtBytes(n.size)}`;
      actions = `<button class="act" data-act="toggle">${n.expanded ? 'Collapse' : 'Expand'}</button><button class="act" data-act="open">Open folder</button><button class="act" data-act="copy">Copy path</button>`;
    } else if (n.type === 'app') {
      stats = `${n.kind.toUpperCase()} · ${n.status}`;
    } else if (n.type === 'routine') {
      stats = `${n.schedule} · runs on ${n.runner}`;
    } else if (n.type === 'agent') {
      stats = n.reach
        ? `${n.reachTotal} files reachable · ${n.secretsExcluded} secrets locked out`
        : `Employee agent · ${(n.links || []).length} scoped grants (skills + memory)`;
    } else if (n.type === 'router') {
      stats = 'The single front door - routes every request';
      actions = `<button class="act" data-act="view">View here</button><button class="act" data-act="open">Open on device</button>`;
    } else if (n.type === 'hub') {
      stats = n.hubKind === 'dept' ? 'Department cluster' : S.layers.find(l => l.key === n.layer)?.blurb || '';
    }
    // neighbors
    const neigh = [];
    for (const l of S.drawLinks) {
      if (l.s === n.id && pass(l.tn)) neigh.push({ n: l.tn, k: l.k, w: l.w });
      else if (l.t === n.id && pass(l.sn)) neigh.push({ n: l.sn, k: l.k, w: l.w });
    }
    neigh.sort((a, b) => (b.w || 1) - (a.w || 1));
    const rows = neigh.slice(0, 16).map(e =>
      `<div class="nrow" data-id="${escapeAttr(e.n.id)}"><span class="dot" style="background:${colorOf(e.n)}"></span><span class="nlab">${e.n.label}</span><span class="nkind">${e.k}${e.w > 1 ? ' ×' + e.w : ''}</span></div>`).join('');
    card.innerHTML = `
      <div class="card-head">
        <div>
          <div class="card-title">${title}</div>
          <div class="card-badges">
            <span class="badge" style="border-color:${c};color:${c}">${n.type === 'file' || n.type === 'dir' ? (S.st.view === 'folders' ? (n.top || '(root)') : (S.deptLabel[n.dept] || n.layer)) : (S.layerLabel[n.layer] || n.type)}</span>
            ${n.access ? accBadge(n) : ''}
            ${n.secret ? '<span class="badge" style="border-color:#ef4444;color:#ef4444">secret</span>' : ''}
          </div>
        </div>
        <button id="card-close">×</button>
      </div>
      <div class="card-stats">${stats}</div>
      ${n.desc ? `<div class="card-desc">${n.desc}</div>` : ''}
      ${n.path ? `<div class="card-path">${n.path}</div>` : ''}
      <div class="card-actions">${actions}<button class="act" data-act="fly">Fly to</button>${(n.type === 'app' || n.type === 'routine' || n.type === 'agent') ? '<button class="act" data-act="edit">Edit</button>' : ''}${n.type !== 'router' ? '<button class="act" data-act="remove" style="border-color:#ef4444;color:#ef4444">Remove</button>' : ''}</div>
      ${rows ? `<div class="card-sub">Connections</div><div class="card-neigh">${rows}</div>` : ''}`;
    card.querySelector('#card-close').onclick = () => select(null);
    card.querySelectorAll('.act').forEach(b => b.onclick = async () => {
      const act = b.dataset.act;
      if (act === 'view') openViewer(n.path || 'CLAUDE.md');
      if (act === 'open') apiOpen(n.path);
      if (act === 'copy') { navigator.clipboard.writeText('C:/ROBO/' + (n.path || '')); toast('Path copied'); }
      if (act === 'toggle') { n.expanded ? collapseDir(n.id) : expandDir(n.id); select(n); }
      if (act === 'fly') flyToNode(n);
      if (act === 'edit') { // /tweak principle: pick an item, change it, it sticks
        const label = prompt('Label for this item:', n.label);
        if (label === null) return;
        const desc = prompt('Description (blank to keep):', n.desc || '');
        await fetch('api/tweak', { method: 'POST', body: JSON.stringify({ action: 'edit', id: n.id, label: label.trim() || n.label, desc: desc === null ? n.desc : desc }) });
        select(null); S.refreshData('Saving edit');
      }
      if (act === 'remove') { // /tweak principle: delete items you don't want on the map
        if (!confirm(`Remove "${n.label}" from the brain map?\n(Nothing is deleted on disk - restore any time from Tweak > Restore.)`)) return;
        await fetch('api/tweak', { method: 'POST', body: JSON.stringify({ action: 'hide', id: n.id }) });
        select(null); S.refreshData('Removing from the map');
      }
    });
    card.querySelectorAll('.nrow').forEach(r => r.onclick = () => {
      const t = S.byId.get(r.dataset.id);
      if (t) { select(t); flyToNode(t); }
    });
  }

  function escapeAttr(s) { return s.replace(/"/g, '&quot;'); }

  async function apiOpen(path) {
    if (!path) return;
    try {
      const r = await fetch('api/open', { method: 'POST', body: JSON.stringify({ path }) });
      const d = await r.json();
      toast(d.ok ? 'Opened on device' : (d.error || 'Could not open'));
    } catch (e) { toast('Open failed'); }
  }

  // ======================= viewer drawer =======================
  async function openViewer(path) {
    const n = S.byId.get(path);
    const ext = n && n.ext ? n.ext : ('.' + (path.split('.').pop() || '')).toLowerCase();
    if (n && n.type === 'file' && !TEXT_EXT.has(ext)) { apiOpen(path); return; }
    const drawer = document.getElementById('brain-viewer');
    drawer.classList.add('open');
    drawer.querySelector('.v-title').textContent = path.split('/').pop();
    drawer.querySelector('.v-path').textContent = path;
    const body = drawer.querySelector('.v-body');
    body.innerHTML = '<div class="v-loading">Loading…</div>';
    drawer.querySelector('.v-open').onclick = () => apiOpen(path);
    drawer.querySelector('.v-copy').onclick = () => { navigator.clipboard.writeText('C:/ROBO/' + path); toast('Path copied'); };
    try {
      const r = await fetch('api/file?path=' + encodeURIComponent(path));
      const d = await r.json();
      if (d.error === 'binary') { body.innerHTML = '<div class="v-loading">Binary file - opening on device instead.</div>'; apiOpen(path); return; }
      if (d.error) { body.innerHTML = '<div class="v-loading">' + d.error + '</div>'; return; }
      if (ext === '.md' && window.marked) {
        body.innerHTML = '<div class="md-body">' + marked.parse(d.content) + '</div>';
        body.querySelectorAll('a').forEach(a => {
          a.onclick = ev => {
            const href = a.getAttribute('href') || '';
            if (/^https?:/i.test(href)) { a.target = '_blank'; return; }
            ev.preventDefault();
            const baseDir = path.split('/').slice(0, -1).join('/');
            let target = href.replace(/\\/g, '/').replace(/^\.\//, '');
            const joined = (baseDir ? baseDir + '/' : '') + target;
            jumpTo(normalizePath(joined));
          };
        });
      } else {
        body.innerHTML = '<pre class="code-body"></pre>';
        body.querySelector('pre').textContent = d.content;
      }
    } catch (e) { body.innerHTML = '<div class="v-loading">Failed: ' + e.message + '</div>'; }
  }

  function normalizePath(p) {
    const out = [];
    for (const seg of p.split('/')) {
      if (seg === '..') out.pop();
      else if (seg !== '.' && seg !== '') out.push(seg);
    }
    return out.join('/');
  }

  function closeViewer() { document.getElementById('brain-viewer').classList.remove('open'); }

  async function jumpTo(path) {
    const n = await ensureVisible(path);
    if (!n) { toast('Not in the graph: ' + path); return; }
    refreshLayout(0.4);
    select(n);
    setTimeout(() => flyToNode(n), 60);
  }

  // ======================= panels DOM =======================
  function buildDOM() {
    document.body.insertAdjacentHTML('beforeend', `
      <canvas id="brain-canvas"></canvas>
      <div id="brain-splash"><div class="sp-inner"><div class="sp-pulse"></div><div class="sp-text">Loading</div></div></div>
      <div id="brain-tip"></div>
      <div id="brain-hud"></div>
      <div id="brain-card" style="display:none"></div>
      <div id="brain-panel"></div>
      <div id="brain-legend"></div>
      <div id="brain-viewer"><div class="v-head"><div class="v-meta"><div class="v-title"></div><div class="v-path"></div></div><div class="v-btns"><button class="v-open act">Open on device</button><button class="v-copy act">Copy path</button><button class="v-close act" onclick="this.closest('#brain-viewer').classList.remove('open')">×</button></div></div><div class="v-body"></div></div>
      <div id="brain-toast"></div>`);
  }

  function splash(showFlag, text) {
    const el = document.getElementById('brain-splash');
    el.style.display = showFlag ? 'flex' : 'none';
    if (text) el.querySelector('.sp-text').textContent = text;
  }

  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById('brain-toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function seg(id, options, value, onPick) {
    return `<div class="seg" id="${id}">` + options.map(o =>
      `<button data-v="${o.v}" class="${o.v === value ? 'on' : ''}">${o.label}</button>`).join('') + '</div>';
  }
  function wireSeg(id, cb) {
    const el = document.getElementById(id);
    el.querySelectorAll('button').forEach(b => b.onclick = () => {
      el.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      cb(b.dataset.v);
    });
  }
  function syncSegButtons() {
    const map = { 'seg-layout': S.st.layout, 'seg-view': S.st.view, 'seg-color': S.st.colorBy, 'seg-acc': S.st.acc };
    for (const [id, v] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (el) el.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    }
  }

  function buildPanels() {
    const skin = S.skin;
    // HUD (top-left): brand block
    const hexSvg = `<svg viewBox="0 0 48 48" width="30" height="30" fill="none" stroke="#4f6bff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M24 6l18 10v16L24 42 6 32V16Z"/><path d="M24 6v16l18 10" opacity="0.5"/><path d="M24 22L6 32" opacity="0.5"/></svg>`;
    document.getElementById('brain-hud').innerHTML = `
      <div class="hud-brand">${hexSvg}<span class="hud-name">JARVIS</span><span class="hud-product">CORTEX</span></div>
      <div class="hud-skin">${skin.title}</div>
      <div class="hud-tag">${skin.tagline}</div>
      <div class="hud-stats" id="brain-stats"></div>
      <div class="hud-fps" id="brain-fps"></div>`;

    // control panel (top-right)
    const st = S.st;
    const sliders = [
      { k: 'size', label: 'Node size' }, { k: 'link', label: 'Link opacity' }, { k: 'labels', label: 'Labels' },
      { k: 'spin', label: 'Ring spin' }, { k: 'gap', label: 'Ring gap' }, { k: 'span', label: 'Arc spread' },
      { k: 'armsSize', label: 'Apps + routines size' }, { k: 'bandLabels', label: 'Layer headers' }, { k: 'ringWidth', label: 'Ring lines' }, { k: 'msat', label: 'Memory saturation' },
      { k: 'transSpd', label: 'Transition speed' }, { k: 'boundSize', label: 'Circle / Hex size' },
      { k: 'nodeAlpha', label: 'Node opacity' }, { k: 'hubSize', label: 'Hub size' },
      ...(skin.sliders || []),
      // gravity pull, one dial per department + one per ARMS scatter layer
      ...S.departments.map(d => ({ k: 'grav_' + d.key, label: d.label + ' pull' })),
      { k: 'grav_S', label: 'Skills pull' }, { k: 'grav_R', label: 'Routines pull' }, { k: 'grav_A', label: 'Apps pull' },
      // distance of each department cluster from the central CLAUDE.md
      // (low = hugs the router, high = pushed to the rim)
      ...S.departments.map(d => ({ k: 'dist_' + d.key, label: d.label + ' distance' })),
    ];
    document.getElementById('brain-panel').innerHTML = `
      <div class="p-search" data-sec="search">
        <input id="brain-search" placeholder="Search ${(S.meta.totalFiles || 0).toLocaleString()} files… ( / )" autocomplete="off">
        <div id="brain-results"></div>
      </div>
      <div data-sec="layout"><div class="p-sub">Layout</div>
      ${seg('seg-layout', [{ v: 'force', label: 'Force' }, { v: 'circle', label: 'Circle' }, { v: 'hex', label: 'Hex' }, { v: 'rings', label: 'Rings' }, { v: 'deck', label: 'Deck' }], st.layout)}</div>
      <div data-sec="view"><div class="p-sub">View</div>
      ${seg('seg-view', [{ v: 'context', label: 'Departments' }, { v: 'folders', label: 'Folders' }], st.view)}</div>
      <div data-sec="color"><div class="p-sub">Colour by</div>
      ${seg('seg-color', [{ v: 'dept', label: 'Department' }, { v: 'access', label: 'Access' }], st.colorBy)}</div>
      <div data-sec="acc"><div class="p-sub">Access filter</div>
      ${seg('seg-acc', [{ v: 'all', label: 'All' }, { v: 'hermes', label: 'Hermes' }, { v: 'claude', label: 'Claude' }], st.acc)}</div>
      ${skin.variantSeg ? `<div data-sec="variant"><div class="p-sub">${skin.variantSeg.label}</div>` + seg('seg-variant', skin.variantSeg.options, st[skin.variantSeg.key]) + '</div>' : ''}
      <div data-sec="colours"><div class="p-sub row"><span>Colours</span><button id="clr-toggle" class="mini">show</button></div>
      <div id="clr-body" style="display:none"></div></div>
      <div data-sec="tweak"><div class="p-sub row"><span>Tweak</span><button id="tweak-toggle" class="mini">show</button></div>
      <div id="tweak-body" style="display:none">
        ${sliders.map(s => `
          <div class="sl"><div class="sl-head"><span>${s.label}</span><span class="sl-val" id="v-${s.k}">${(st[s.k] ?? 0.5).toFixed(2)}</span></div>
          <input type="range" min="0" max="100" value="${(st[s.k] ?? 0.5) * 100}" data-k="${s.k}"></div>`).join('')}
        <label class="chk"><input type="checkbox" id="chk-cross" ${st.cross ? 'checked' : ''}> Note-to-note links</label>
        <label class="chk"><input type="checkbox" id="chk-trans" ${st.transOn ? 'checked' : ''}> Layout transitions</label>
        <button class="act" id="tweak-restore" style="display:${(S.meta.hiddenCount || 0) > 0 ? 'block' : 'none'};margin-top:8px">Restore ${S.meta.hiddenCount || 0} removed item${(S.meta.hiddenCount || 0) === 1 ? '' : 's'}</button>
      </div></div>
      <div class="p-actions" data-sec="actions">
        <button class="act" id="btn-expand">Expand all</button>
        <button class="act" id="btn-collapse">Collapse all</button>
        <button class="act" id="btn-rescan">Rescan</button>
        <button class="act" id="btn-reset">Reset view</button>
        <button class="act" id="btn-theme"></button>
        <button class="act" id="btn-bake" style="border-color:var(--accent);color:var(--accent)">Bake settings</button>
      </div>`;

    wireSeg('seg-layout', v => setLayout(v));
    wireSeg('seg-view', v => { S.st.view = v; persistSt(); S.repCache.clear(); reaggregate(); refreshLayout(0.8); rebuildLegend(); });
    wireSeg('seg-color', v => { S.st.colorBy = v; persistSt(); });
    wireSeg('seg-acc', v => { S.st.acc = v; persistSt(); if (S.simKind) S.sim.alpha(0.2).restart(); });
    if (skin.variantSeg) wireSeg('seg-variant', v => { S.st[skin.variantSeg.key] = v; persistSt(); });

    document.getElementById('clr-toggle').onclick = e => {
      const b = document.getElementById('clr-body');
      const show = b.style.display === 'none';
      b.style.display = show ? 'block' : 'none';
      e.target.textContent = show ? 'hide' : 'show';
      if (show) buildColorPanel();
    };

    document.getElementById('tweak-toggle').onclick = e => {
      const b = document.getElementById('tweak-body');
      const show = b.style.display === 'none';
      b.style.display = show ? 'block' : 'none';
      e.target.textContent = show ? 'hide' : 'show';
    };
    document.querySelectorAll('#tweak-body input[type=range]').forEach(inp => {
      inp.oninput = () => {
        const k = inp.dataset.k, v = inp.value / 100;
        S.st[k] = v;
        document.getElementById('v-' + k).textContent = v.toFixed(2);
        persistSt();
        if ((k === 'size') && S.simKind) { S.sim.force('collide', d3.forceCollide(d => radiusOf(d) + 2.4).strength(0.6)); S.sim.alpha(0.18).restart(); }
        if (k === 'boundSize' && (S.st.layout === 'circle' || S.st.layout === 'hex')) refreshLayout(0.5);
        if ((k.startsWith('grav_') || k.startsWith('dist_')) && S.simKind) { clearTimeout(S._gravT); S._gravT = setTimeout(() => refreshLayout(0.35), 160); }
      };
    });
    document.getElementById('chk-cross').onchange = e => { S.st.cross = e.target.checked; persistSt(); };
    document.getElementById('chk-trans').onchange = e => { S.st.transOn = e.target.checked; persistSt(); };
    document.getElementById('btn-expand').onclick = expandAll;
    document.getElementById('btn-collapse').onclick = collapseAll;
    document.getElementById('btn-reset').onclick = () => resetCam();
    document.getElementById('btn-theme').onclick = toggleTheme;
    document.getElementById('btn-bake').onclick = async () => {
      // one portable snapshot of everything Jay dialed in - file + clipboard
      const bake = {
        skin: S.skin.key,
        theme: S.theme,
        settings: { ...S.st },
        colors: {
          departments: { ...S.deptColor },
          layers: { ...S.layerColor },
          hermes: S.hermesColor,
          access: { hermes: ACC.hermes, claude: ACC.claude, both: ACC.both },
          accent: S.accent,
          background: S.T.canvasBg,
          linkInk: S.T.inkLine,
        },
        overridesOnly: S.colorOverrides,
      };
      delete bake.settings.dist0; delete bake.settings.rep0;
      const json = JSON.stringify(bake, null, 2);
      try { await navigator.clipboard.writeText(json); } catch { }
      try {
        const r = await fetch('api/bake', { method: 'POST', body: json });
        const d = await r.json();
        toast(d.ok ? 'Baked → ' + d.path.split(/[\\/]/).slice(-2).join('/') + ' (also on clipboard)' : 'Bake failed: ' + (d.error || ''));
      } catch { toast('Copied to clipboard (server save failed)'); }
    };
    async function refreshData(msg) {
      splash(true, msg || 'Rescanning the workspace');
      try {
        await fetch('api/rescan', { method: 'POST' });
        const r = await fetch('api/graph');
        const data = await r.json();
        const keep = { cam: { ...S.cam } };
        S.nodes = []; S.byId.clear(); S.repCache.clear();
        ingest(data);
        refreshLayout(0.8);
        S.cam = keep.cam;
        const btn = document.getElementById('tweak-restore');
        if (btn) {
          const n2 = S.meta.hiddenCount || 0;
          btn.style.display = n2 > 0 ? 'block' : 'none';
          btn.textContent = `Restore ${n2} removed item${n2 === 1 ? '' : 's'}`;
        }
        toast('Rescanned: ' + data.meta.totalFiles.toLocaleString() + ' files in ' + data.meta.scanMs + 'ms');
      } catch (e) { toast('Rescan failed'); }
      splash(false);
    }
    S.refreshData = refreshData;
    document.getElementById('btn-rescan').onclick = () => refreshData();
    document.getElementById('tweak-restore').onclick = async () => {
      await fetch('api/tweak', { method: 'POST', body: JSON.stringify({ action: 'unhide-all' }) });
      refreshData('Restoring removed items');
    };
    themeButtonLabel();

    // search
    const input = document.getElementById('brain-search');
    const results = document.getElementById('brain-results');
    let debounce = null;
    input.oninput = () => {
      clearTimeout(debounce);
      debounce = setTimeout(async () => {
        const q = input.value.trim();
        if (!q) { results.innerHTML = ''; results.style.display = 'none'; return; }
        const r = await fetch('api/search?q=' + encodeURIComponent(q));
        const d = await r.json();
        results.style.display = 'block';
        results.innerHTML = d.results.slice(0, 14).map(x => `
          <div class="res" data-path="${escapeAttr(x.path)}" data-type="${x.type}">
            <span class="dot" style="background:${x.layer === 'S' ? S.layerColor.S : (S.deptColor[x.dept] || '#8fa3ad')}"></span>
            <span class="r-name">${x.name}${x.type === 'dir' ? '/' : ''}</span>
            <span class="r-path">${x.path}</span>
          </div>`).join('') || '<div class="res-none">No hits</div>';
        results.querySelectorAll('.res').forEach(el => el.onclick = () => {
          results.style.display = 'none'; input.value = '';
          jumpTo(el.dataset.path);
        });
      }, 180);
    };
    input.onblur = () => setTimeout(() => { results.style.display = 'none'; }, 250);

    rebuildLegend();
    updateStatsHUD();
  }

  function updateStatsHUD() {
    const el = document.getElementById('brain-stats');
    if (!el || !S.meta.totalFiles) return;
    el.innerHTML = `${S.meta.totalFiles.toLocaleString()} files · ${S.meta.mdLinks.toLocaleString()} links · scanned in ${(S.meta.scanMs / 1000).toFixed(1)}s · <b>${S.visible.filter(n => !n._hidden).length.toLocaleString()}</b> on canvas`;
  }

  function rebuildLegend() {
    const el = document.getElementById('brain-legend');
    const st = S.st;
    const deptRows = S.departments.map(d => {
      const count = S.visible.filter(n => (n.type === 'file' || n.type === 'dir') && n.layer !== 'S' && n.dept === d.key).length;
      return `<div class="lg-row ${st.depts[d.key] === false ? 'off' : ''}" data-dept="${d.key}">
        <span class="dot" style="background:${d.color}"></span><span>${d.label}</span><span class="lg-n">${count}</span></div>`;
    }).join('');
    const layerRows = S.layers.map(l => {
      const count = l.key === 'M' ? '' : S.visible.filter(n => (l.key === 'S' && n.layer === 'S' && (n.type === 'file' || n.type === 'dir')) || (l.key === 'A' && n.type === 'app') || (l.key === 'R' && n.type === 'routine')).length;
      return `<div class="lg-row ${st.layers[l.key] === false ? 'off' : ''}" data-layer="${l.key}">
        <span class="dot dot-${l.shape}" style="background:${l.color}"></span><span>${l.label}</span><span class="lg-n">${count}</span></div>`;
    }).join('');
    const h = S.hermes;
    el.innerHTML = `
      <div class="lg-sub">ARMS layers <span class="lg-hint">· click to filter</span></div>${layerRows}
      <div class="lg-sub">Departments</div>${deptRows}
      ${(S.agentNodes && S.agentNodes.length) ? `<div class="lg-sub">Agents <span class="lg-hint">· click to toggle · dot to spotlight</span></div>` +
      S.agentNodes.map(a => {
        const c = colorOf(a);
        const sub = a.reach ? a.reachTotal.toLocaleString() + ' files' : ((a.links || []).length + ' grants');
        return `<div class="lg-row ${st.agents[a.id] === false ? 'off' : ''}" data-agent="${a.id}">
          <span class="dot" data-spot="${a.id}" style="background:${c};border-radius:50%"></span><span>${a.label}</span><span class="lg-n">${sub}</span></div>`;
      }).join('') +
      (h && !h._hidden ? `<div class="lg-hint" style="margin-top:4px">Hermes: ${h.secretsExcluded} secrets locked out</div>` : '') : ''}`;
    el.querySelectorAll('[data-dept]').forEach(r => r.onclick = () => {
      const k = r.dataset.dept; st.depts[k] = st.depts[k] === false; persistSt(); rebuildLegend();
    });
    el.querySelectorAll('[data-layer]').forEach(r => r.onclick = () => {
      const k = r.dataset.layer; st.layers[k] = st.layers[k] === false; persistSt(); rebuildLegend();
    });
    el.querySelectorAll('[data-agent]').forEach(r => {
      r.onclick = e => {
        if (e.target.dataset.spot) { const a = S.byId.get(e.target.dataset.spot); select(a); flyToNode(a); return; }
        const k = r.dataset.agent; st.agents[k] = st.agents[k] === false; persistSt(); rebuildLegend();
      };
    });
  }

  // ======================= theme =======================
  function applyTheme() {
    if (S.skin.forceTheme) S.theme = S.skin.forceTheme; // e.g. the final option is dark-only
    S.T = Object.assign({}, S.skin.themes[S.theme]); // copy so colour overrides never poison the defaults
    const root = document.documentElement;
    for (const [k, v] of Object.entries(S.T.css || {})) root.style.setProperty('--' + k, v);
    root.dataset.theme = S.theme;
    S.bgCache = null;
    themeButtonLabel();
    loadColors();
    applyColors();
  }

  // ======================= per-element colours =======================
  function colorStoreKey() { return 'brain-v2-colors-' + S.skin.key + '-' + S.theme; }
  function loadColors() {
    try { S.colorOverrides = JSON.parse(localStorage.getItem(colorStoreKey()) || '{}'); }
    catch { S.colorOverrides = {}; }
  }
  function saveColors() { localStorage.setItem(colorStoreKey(), JSON.stringify(S.colorOverrides)); }

  function hexToTriplet(hex) {
    hex = F.norm(hex);
    return parseInt(hex.slice(1, 3), 16) + ',' + parseInt(hex.slice(3, 5), 16) + ',' + parseInt(hex.slice(5, 7), 16);
  }

  function applyColors() {
    const o = S.colorOverrides;
    for (const d of S.departments || []) S.deptColor[d.key] = (o.dept && o.dept[d.key]) || d.color;
    for (const l of S.layers || []) S.layerColor[l.key] = (o.layer && o.layer[l.key]) || l.color;
    S.hermesColor = o.hermes || '#58abf5';
    S.accent = o.accent || (S.T && S.T.css && S.T.css.accent) || '#ff6b1a';
    ACC.hermes = o.accHermes || S.hermesColor;
    ACC.claude = o.accClaude || '#ff7a2e';
    ACC.both = o.accBoth || (S.theme === 'dark' ? '#d7dcea' : '#9a958a');
    if (S.T) {
      const base = S.skin.themes[S.theme];
      S.T.canvasBg = o.bg || base.canvasBg;
      S.T.inkLine = o.ink ? hexToTriplet(o.ink) : base.inkLine;
      document.documentElement.style.setProperty('--bg', o.bg || (base.css && base.css.bg));
      document.documentElement.style.setProperty('--accent', S.accent);
    }
    // anchors carry their colour into fog, deck arcs and folder view
    if (S.anchors) for (const a of S.anchors) {
      if (a.key && a.key.startsWith('D:')) { a.color = S.deptColor[a.key.slice(2)]; S.anchorColor[a.key] = a.color; }
    }
    S.bgCache = null;
  }

  // the palette rows shown in the panel: [group, key, label, currentValue]
  function colorSlots() {
    const rows = [];
    for (const d of S.departments) rows.push(['dept', d.key, d.label, S.deptColor[d.key]]);
    for (const l of S.layers) if (l.key !== 'M') rows.push(['layer', l.key, l.label, S.layerColor[l.key]]);
    rows.push(['hermes', '', 'Hermes agent', S.hermesColor]);
    rows.push(['accHermes', '', 'Access: Hermes only', ACC.hermes]);
    rows.push(['accClaude', '', 'Access: Claude only', ACC.claude]);
    rows.push(['accBoth', '', 'Access: both', ACC.both]);
    rows.push(['accent', '', 'Accent / highlight', S.accent]);
    rows.push(['bg', '', 'Background', S.colorOverrides.bg || S.skin.themes[S.theme].canvasBg]);
    rows.push(['ink', '', 'Links / guide ink', S.colorOverrides.ink || '#' + (S.theme === 'dark' ? 'aaaaaa' : '333333')]);
    return rows;
  }

  function buildColorPanel() {
    const body = document.getElementById('clr-body');
    if (!body) return;
    body.innerHTML = colorSlots().map(([g, k, label, val]) => `
      <div class="clr"><span>${label}</span><input type="color" data-g="${g}" data-k="${k}" value="${F.norm(val || '#888888')}"></div>`).join('')
      + '<button class="act" id="clr-reset" style="width:100%;margin-top:8px">Reset colours</button>';
    body.querySelectorAll('input[type=color]').forEach(inp => {
      inp.oninput = () => {
        const g = inp.dataset.g, k = inp.dataset.k, v = inp.value;
        if (g === 'dept') { S.colorOverrides.dept = S.colorOverrides.dept || {}; S.colorOverrides.dept[k] = v; }
        else if (g === 'layer') { S.colorOverrides.layer = S.colorOverrides.layer || {}; S.colorOverrides.layer[k] = v; }
        else S.colorOverrides[g] = v;
        saveColors();
        applyColors();
        rebuildLegend();
      };
    });
    body.querySelector('#clr-reset').onclick = () => {
      S.colorOverrides = {};
      saveColors();
      applyColors();
      rebuildLegend();
      buildColorPanel();
      toast('Colours reset to the house palette');
    };
  }
  function toggleTheme() {
    S.theme = S.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('robo-theme', S.theme);
    applyTheme();
  }
  function themeButtonLabel() {
    const b = document.getElementById('btn-theme');
    if (b) b.textContent = S.theme === 'dark' ? 'Light mode' : 'Dark mode';
  }

  function persistSt() {
    // persist EVERYTHING scalar in st (functions drop out of JSON) - gravity
    // dials, distances, toggles included
    localStorage.setItem('brain-v2-' + S.skin.key, JSON.stringify(S.st));
  }

  // slider hooks the sims read
  DEFAULT_ST.dist0 = function () { return 0.7 + (this.gap ?? 0.4) * 0.9; };
  DEFAULT_ST.rep0 = function () { return 0.5 + (this.span ?? 0.5) * 1.1; };

  // ======================= shared guide drawing (skins call these) =======================
  // ARMS guides: memory as a filled band, coloured rings for the vivid layers,
  // band headlines sized by the Layer-headers slider
  function drawArmsGuides(ctx, opts) {
    const R = S.ringsRadii; if (!R) return;
    const st = S.st, k = S.cam.k;
    const w = (0.5 + st.ringWidth * 5.5) / k + 0.2;
    opts = opts || {};
    // complete annulus - separate subpaths with opposite winding (a 7-radian
    // sweep left a pac-man notch on the right; Jay caught it)
    const memIn = Math.max(1, R.mem - 22);
    ctx.beginPath();
    ctx.arc(0, 0, R.memEnd + 8, 0, Math.PI * 2);
    ctx.moveTo(memIn, 0);
    ctx.arc(0, 0, memIn, 0, Math.PI * 2, true);
    ctx.fillStyle = F.hexToRgba(S.layerColor.M || '#8fa3ad', opts.memAlpha ?? 0.055);
    ctx.fill();
    const ring = (r, col, alpha) => {
      ctx.strokeStyle = F.hexToRgba(col, alpha); ctx.lineWidth = w;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
    };
    ring(R.skills, S.layerColor.S, 0.4);
    ring(R.rout, S.layerColor.R, 0.55);
    ring(R.apps, S.layerColor.A, 0.55);
    const fs = (8 + st.bandLabels * 30) / k + 4;
    ctx.textAlign = 'center';
    ctx.font = `600 ${fs}px Outfit`;
    // every title has its own radial-offset dial, plus one shared angle dial
    const tAng = (st.t_ang ?? 0) * Math.PI * 2;
    const label = (r, name, col, offKey) => {
      const rr = Math.max(24, r + ((st[offKey] ?? 0.5) - 0.5) * 240);
      const lx = Math.sin(tAng) * rr, ly = -Math.cos(tAng) * rr - 9 / k;
      if (opts.halo) { ctx.fillStyle = opts.halo; ctx.fillText(name, lx + 1 / k, ly + 1 / k); }
      ctx.fillStyle = F.hexToRgba(col, 0.85);
      ctx.fillText(name, lx, ly);
    };
    if (opts.labelsOut) {
      // headers sit on top of their rings, just outside the band edge (Jay)
      label(Math.max(R.skills + 14, R.mem - 58), 'SKILLS', S.layerColor.S, 't_sk');
      label(R.memEnd + 10, 'MEMORY', S.layerColor.M || '#8fa3ad', 't_mem');
    } else {
      label(R.skills, 'SKILLS', S.layerColor.S, 't_sk');
      label((R.mem + R.memEnd) / 2 - 18, 'MEMORY', S.layerColor.M || '#8fa3ad', 't_mem');
    }
    label(R.rout, 'ROUTINES', S.layerColor.R, 't_rout');
    label(R.apps, 'APPLICATIONS', S.layerColor.A, 't_app');
  }

  // circle / hexagon silhouette for the bounded force layouts
  function drawBoundGuide(ctx, alphaMul) {
    const g = S.boundGeom; if (!g) return;
    ctx.strokeStyle = `rgba(${S.T.inkLine},${0.12 * (alphaMul || 1)})`;
    ctx.lineWidth = 1.2 / S.cam.k;
    ctx.setLineDash([5, 9]);
    ctx.beginPath();
    if (g.type === 'circle') ctx.arc(0, 0, g.R, 0, 7);
    else for (let i = 0; i <= 6; i++) {
      const a = (i % 6) * Math.PI / 3;
      i ? ctx.lineTo(Math.cos(a) * g.R, Math.sin(a) * g.R) : ctx.moveTo(Math.cos(a) * g.R, Math.sin(a) * g.R);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
  S.drawArmsGuides = drawArmsGuides;
  S.drawBoundGuide = drawBoundGuide;

  // ======================= real app icons (simple-icons CDN, cached, graceful fallback) =======================
  const appIconPaths = {};
  function loadAppIcons() {
    // baked paths first - every app gets its unique brand mark with zero CDN
    for (const [id, d] of Object.entries(window.BRAIN_ICON_PATHS || {})) {
      if (!appIconPaths[id]) { try { appIconPaths[id] = new Path2D(d); } catch (e) { } }
    }
    const apps = S.nodes.filter(n => n.type === 'app' && n.iconSlug);
    apps.forEach(n => {
      if (appIconPaths[n.id]) return;
      fetch('https://cdn.jsdelivr.net/npm/simple-icons@13/icons/' + n.iconSlug + '.svg')
        .then(r => r.ok ? r.text() : null)
        .then(svg => {
          if (!svg) return;
          const m = svg.match(/ d="([^"]+)"/);
          if (m) appIconPaths[n.id] = new Path2D(m[1]); // 24x24 viewBox
        }).catch(() => { });
    });
  }
  S.loadAppIcons = loadAppIcons;
  // hand-drawn unique icons (public/_icons.js) rasterized per colour - used by
  // every routine and by apps that have no simple-icons brand mark
  const iconImgCache = new Map();
  function nodeIconImg(id, color) {
    const svg = (window.BRAIN_ICONS || {})[id];
    if (!svg) return null;
    const key = id + '|' + color;
    let rec = iconImgCache.get(key);
    if (rec) return rec.ok ? rec.el : null;
    const recol = svg.replace(/\s(width|height)="[^"]*"/g, '')
      .replace(/<svg /, '<svg width="96" height="96" ')
      .replace(/#888/g, color);
    const el = new Image();
    rec = { el, ok: false };
    el.onload = () => { rec.ok = true; };
    el.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(recol);
    iconImgCache.set(key, rec);
    return null;
  }
  S.drawNodeIcon = function (ctx, n, r, color) {
    const img = nodeIconImg(n.id, color);
    if (!img) return false;
    ctx.drawImage(img, n.x - r, n.y - r, r * 2, r * 2);
    return true;
  };
  S.drawAppIcon = function (ctx, n, r, color) {
    const p = appIconPaths[n.id];
    if (!p) { if (S.drawNodeIcon(ctx, n, r, color)) return; F.icon(ctx, n.x, n.y, r * 0.95, 'api', color); return; }
    const s = (r * 1.3) / 24;
    ctx.save();
    ctx.translate(n.x - r * 0.65, n.y - r * 0.65);
    ctx.scale(s, s);
    ctx.fillStyle = color;
    ctx.fill(p);
    ctx.restore();
  };

  return { boot, S, expandDir, collapseDir, jumpTo, openViewer, apiOpen, toast, flyToNode, select };
})();
