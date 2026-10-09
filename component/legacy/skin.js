(function () {
  const F = window.F2;
  const bows = new Map();
  function bowOf(i) {
    if (!bows.has(i)) bows.set(i, (((i * 2654435761) % 2) ? 1 : -1) * (0.07 + ((i * 97) % 13) / 13 * 0.09));
    return bows.get(i);
  }
  function ctrl(a, b, i) {
    const bw = bowOf(i);
    return [(a.x + b.x) / 2 - (b.y - a.y) * bw, (a.y + b.y) / 2 + (b.x - a.x) * bw];
  }
  function pointOn(a, b, i, t) {
    const [cx, cy] = ctrl(a, b, i), u = 1 - t;
    return [u * u * a.x + 2 * u * t * cx + t * t * b.x, u * u * a.y + 2 * u * t * cy + t * t * b.y];
  }

  const skin = {
    key: 'final',
    forceTheme: 'dark',
    onlyAgents: [],
    sizeMul: { app: 3, routine: 2 },
    layerColors: { S: '#ff6b1a' },
    tightClusters: true,
    clusterLayers: true,
    hubOrbit: true,
    labelMinZoom: 1.15,
    freeDrop: true,
    transStyle: 'orbit',
    alwaysCurved: true,
    title: 'GEEKOM workspace — nuveo',
    tagline: '',
    defaultTheme: 'dark',
    st: {
      fog: 0.5, flow: 0.5, glow: 0.7, twinkle: 0.5, dist: 0.5, shapes: 'celestial',
      spin: 0.17, link: 0.46, gap: 0.43, span: 0.59, armsSize: 0.4, bandLabels: 0.41, msat: 0.52,
      fog: 0.75, flow: 0, glow: 0.39, twinkle: 0,
      grav_content: 0.86, grav_community: 0.84, grav_product: 0.84, grav_personal: 0.85, grav_business: 0.84,
      grav_S: 0.4, grav_R: 0.32,
      dist_content: 0, dist_community: 0, dist_product: 0, dist_personal: 0, dist_business: 0,
      g_pull: 0, g_charge: 0.67, g_reach: 0.53, g_hub: 0, g_link: 0, g_dhold: 0.21,
      g_lhubd: 0.32, g_rim: 0.69, g_pad: 1, boundSize: 0.34,
      r_skills: 0.51, r_memoff: 0.4, r_routoff: 0.57, r_appoff: 0.55,
      t_ang: 0, t_sk: 0, t_mem: 0.21, t_rout: 0.25, t_app: 0.21,
      fileLabels: true,
    },
    variantSeg: {
      key: 'shapes', label: 'Node shapes',
      options: [{ v: 'celestial', label: 'Celestial' }, { v: 'crystal', label: 'Crystal' }, { v: 'biolume', label: 'Biolume' }],
    },
    sliders: [
      { k: 'fog', label: 'Nebula fog' },
      { k: 'flow', label: 'Comet flow' },
      { k: 'glow', label: 'Node glow' },
      { k: 'twinkle', label: 'Star twinkle' },
    ],
    themes: {
      dark: {
        routerColor: '#ff944d',
        canvasBg: '#05060d', guide: 'rgba(160,175,215,0.09)', inkLine: '165,175,205',
        labelInk: 'rgba(190,198,222,0.62)', labelHot: '#ffffff', labelHalo: 'rgba(5,6,13,0.9)',
        css: {
          font: 'Outfit', bg: '#05060d', panel: 'rgba(10,13,24,0.9)', ink: '#f5f7ff', muted: '#8b93ad',
          faint: '#5a6a9a', border: 'rgba(79,107,255,0.16)', accent: '#4f6bff', 'input-bg': 'rgba(79,107,255,0.055)',
          'tip-bg': '#0b0e1a', 'viewer-bg': '#080a14', hover: 'rgba(160,175,215,0.08)',
          shadow: '0 16px 48px rgba(0,0,0,0.6)', 'seg-on-bg': '#dfe4f2', 'seg-on-ink': '#0a0d18',
        },
      },
      light: {
        routerColor: '#e05e10',
        canvasBg: '#edf0f7', guide: 'rgba(35,45,80,0.09)', inkLine: '35,45,80',
        labelInk: 'rgba(35,45,80,0.62)', labelHot: '#1a2033', labelHalo: 'rgba(237,240,247,0.9)',
        css: {
          font: 'Outfit', bg: '#edf0f7', panel: 'rgba(250,251,254,0.94)', ink: '#1a2033', muted: '#5a6480',
          faint: '#9aa3bd', border: 'rgba(35,45,80,0.13)', accent: '#e05e10', 'input-bg': 'rgba(35,45,80,0.05)',
          'tip-bg': '#fafbfe', 'viewer-bg': '#fafbfe', hover: 'rgba(35,45,80,0.05)',
          shadow: '0 16px 48px rgba(40,50,90,0.16)', 'seg-on-bg': '#1a2033', 'seg-on-ink': '#f5f7fc',
        },
      },
    },

    // ---------- backdrop: seeded starfield / daylight observatory ----------
    drawBackdrop(g, W, H, S) {
      // option 1's hexFade backdrop VERBATIM (original engine): distance fade +
      // radial vignette - hexes glow near centre, melt away at the edges
      g.fillStyle = '#0a0a0a'; g.fillRect(0, 0, W, H);
      const hexSize = 20, hS = hexSize * Math.sqrt(3), vS = hexSize * 1.5, cx0 = W / 2, cy0 = H / 2;
      const maxD = Math.sqrt(cx0 * cx0 + cy0 * cy0);
      const k = 0.55;
      for (let row = -1; row < H / vS + 2; row++) for (let col = -1; col < W / hS + 2; col++) {
        const hx = col * hS + (row % 2 ? hS / 2 : 0), hy = row * vS;
        const dist = Math.sqrt((hx - cx0) ** 2 + (hy - cy0) ** 2), fade = Math.max(0, 1 - (dist / maxD) * 0.6);
        const alpha = 0.064 * fade * fade * (k * 2);
        if (alpha < 0.005) continue;
        g.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 3 * i - Math.PI / 6;
          const px = hx + hexSize * Math.cos(a), py = hy + hexSize * Math.sin(a);
          i === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
        }
        g.closePath(); g.strokeStyle = 'rgba(255,255,255,' + alpha + ')'; g.lineWidth = 0.6; g.stroke();
      }
      const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.72);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.4)');
      g.fillStyle = v; g.fillRect(0, 0, W, H);
    },

    // ---------- under: fog + guides ----------
    underLayer(ctx, S) {
      const st = S.st;
      if (st.fog > 0.03) {
        const anchors = st.view === 'context'
          ? S.visible.filter(n => n.type === 'hub' && n.hubKind === 'dept' && S.pass(n))
          : S.visible.filter(n => n._fhub && S.pass(n));
        const alpha = (S.theme === 'dark' ? 0.32 : 0.16) * st.fog;
        for (const h of anchors) {
          if (h._offstage) continue;
          const fr = 110 + st.fog * 170;
          ctx.globalAlpha = alpha;
          ctx.drawImage(F.glowSprite(S.colorOf(h)), h.x - fr, h.y - fr, fr * 2, fr * 2);
        }
        for (const ag of (S.agentNodes || [])) {
          if (ag._hidden || !S.pass(ag)) continue;
          const fr = 45 + st.fog * 40;
          ctx.globalAlpha = alpha * 0.8;
          ctx.drawImage(F.glowSprite(S.colorOf(ag)), ag.x - fr, ag.y - fr, fr * 2, fr * 2);
        }
        ctx.globalAlpha = 1;
      }
      if (st.layout === 'rings' && S.ringsRadii) S.drawArmsGuides(ctx, { labelsOut: true, memAlpha: S.theme === 'dark' ? 0.07 : 0.06, halo: S.T.labelHalo });
      if (S.boundGeom) S.drawBoundGuide(ctx, 1.2);
      if (st.layout === 'deck') {
        const T = S.T;
        // radar sweep
        if (ctx.createConicGradient) {
          const ang = S.tick * 0.0035;
          const cg = ctx.createConicGradient(ang, 0, 0);
          const col = S.theme === 'dark' ? 'rgba(120,160,255,0.13)' : 'rgba(50,80,180,0.1)';
          cg.addColorStop(0, col); cg.addColorStop(0.1, 'rgba(0,0,0,0)'); cg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = cg;
          ctx.beginPath(); ctx.arc(0, 0, S.deckRing + 240, 0, 7); ctx.fill();
        }
        ctx.setLineDash([4, 9]); ctx.strokeStyle = T.guide; ctx.lineWidth = 1 / S.cam.k;
        [130, 230, S.deckRing, S.deckRing + 112, S.deckRing + 205].forEach(r => {
          ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
        });
        ctx.setLineDash([]);
        const A = S.anchors, STEP = Math.PI * 2 / Math.max(1, A.length);
        A.forEach((a, i) => {
          const ang = -Math.PI / 2 + i * STEP;
          ctx.globalCompositeOperation = S.theme === 'dark' ? 'lighter' : 'source-over';
          ctx.strokeStyle = F.hexToRgba(a.color, 0.5); ctx.lineWidth = 2 / S.cam.k + 0.4;
          ctx.beginPath(); ctx.arc(0, 0, S.deckRing, ang - 0.3, ang + 0.3); ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
        });
      }
    },

    // ---------- links: curved beams ----------
    drawLink(ctx, l, i, inF, S) {
      const st = S.st, a = l.sn, b = l.tn;
      const dimmed = S.focusLinks && !inF;
      ctx.globalAlpha = dimmed ? 0.07 : 1;
      if (inF) {
        const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        g.addColorStop(0, F.hexToRgba(S.colorOf(a), 0.9));
        g.addColorStop(1, F.hexToRgba(S.colorOf(b), 0.9));
        ctx.strokeStyle = g; ctx.lineWidth = 1.4 / S.cam.k + 0.35;
      } else if (l.k === 'sync') {
        ctx.strokeStyle = F.hexToRgba(S.hermesColor, (S.theme === 'dark' ? 0.4 : 0.5) * Math.max(0.35, st.link));
        ctx.lineWidth = Math.min(3, 0.7 + Math.sqrt(l.w || 1) * 0.13) / S.cam.k + 0.15;
        ctx.setLineDash([2, 10]); ctx.lineDashOffset = -S.tick * 0.35;
      } else if (l.k === 'route') {
        ctx.strokeStyle = F.hexToRgba('#ff8a3d', 0.4 * Math.max(0.3, st.link + 0.15));
        ctx.lineWidth = 1.2 / S.cam.k;
      } else if (l.k === 'wire') {
        ctx.strokeStyle = F.hexToRgba(S.layerColor.A || '#50e3c2', 0.25 * st.link * 2); ctx.lineWidth = 0.6 / S.cam.k;
      } else if (l.k === 'spoke') {
        ctx.strokeStyle = `rgba(${S.T.inkLine},${0.08 * st.link * 2})`; ctx.lineWidth = 0.5 / S.cam.k;
      } else if (l.k === 'xlink') {
        ctx.strokeStyle = F.hexToRgba(S.colorOf(a), 0.15 * st.link * 2);
        ctx.lineWidth = Math.min(2.4, 0.55 + (l.w || 1) * 0.1) / S.cam.k;
      } else {
        ctx.strokeStyle = `rgba(${S.T.inkLine},${0.1 * st.link * 2})`;
        ctx.lineWidth = Math.min(2.4, 0.5 + (l.w || 1) * 0.1) / S.cam.k;
      }
      const [cx, cy] = ctrl(a, b, i);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(cx, cy, b.x, b.y); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    },

    // ---------- comets with trails ----------
    _pool: null,
    midLayer(ctx, S) {
      const st = S.st;
      if (st.flow < 0.03 || !S.drawLinks.length) return;
      if (!this._pool) {
        this._pool = [];
        for (let i = 0; i < 52; i++) this._pool.push({ j: i * 137, t: (i * 0.37) % 1, sp: 0.0032 + (i % 7) * 0.001 });
      }
      const n = Math.round(st.flow * 52);
      if (S.theme === 'dark') ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i++) {
        const p = this._pool[i];
        p.t += p.sp;
        if (p.t > 1) { p.t = 0; p.j = p.j * 7 + 13; }
        const li = p.j % S.drawLinks.length;
        const l = S.drawLinks[li];
        if (!l || !S.pass(l.sn) || !S.pass(l.tn)) continue;
        if (S.focusLinks && !S.focusLinks.has(li) && i % 4 !== 0) continue;
        const col = l.k === 'route' ? S.accent : l.k === 'sync' ? S.hermesColor : S.colorOf(l.sn);
        for (let k = 0; k < 4; k++) {
          const tt = p.t - k * 0.02;
          if (tt < 0) break;
          const [px, py] = pointOn(l.sn, l.tn, li, tt);
          ctx.globalAlpha = (1 - k / 4) * (S.theme === 'dark' ? 0.6 : 0.45);
          ctx.fillStyle = F.hexToRgba(col, 0.9);
          ctx.beginPath(); ctx.arc(px, py, (1.6 - k * 0.28) / Math.sqrt(S.cam.k), 0, 7); ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    },

    // ---------- nodes: orbs, planets, sparks, beacons ----------
    drawNode(ctx, n, r, on, dim, S) {
      const st = S.st, c = S.colorOf(n);
      const alpha = (!on ? 0.05 : dim ? 0.12 : 1) * (0.2 + (S.st.nodeAlpha ?? 0.8));
      ctx.globalAlpha = alpha;

      if (n.type === 'router') {
        // the sun: corona + rays + robo sprite
        const gr = 58 + Math.sin(S.tick * 0.02) * 5;
        ctx.globalAlpha = S.theme === 'dark' ? 0.85 : 0.5;
        ctx.drawImage(F.glowSprite('#ff8a3d'), n.x - gr, n.y - gr, gr * 2, gr * 2);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = F.hexToRgba('#ff8a3d', 0.5); ctx.lineWidth = 1 / S.cam.k;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * 7 + S.tick * 0.004;
          ctx.beginPath();
          ctx.moveTo(n.x + Math.cos(a) * 30, n.y + Math.sin(a) * 30);
          ctx.lineTo(n.x + Math.cos(a) * (36 + Math.sin(S.tick * 0.05 + i) * 3), n.y + Math.sin(a) * (36 + Math.sin(S.tick * 0.05 + i) * 3));
          ctx.stroke();
        }
        F.sprite(ctx, 'robo', n.x, n.y, 20, '#ffb37a', '#160c05', '#ff8a3d');
        ctx.globalAlpha = 1; return;
      }
      if (n.type === 'agent') {
        const ac = S.colorOf(n);
        const wob = Math.sin(S.tick * 0.03) * 1.5;
        ctx.save(); ctx.translate(n.x, n.y + wob); ctx.rotate(Math.sin(S.tick * 0.008) * 0.08);
        ctx.fillStyle = F.hexToRgba(ac, 0.28);
        ctx.fillRect(-r - 9, -3, 7, 6); ctx.fillRect(r + 2, -3, 7, 6);
        ctx.strokeStyle = F.hexToRgba(ac, 0.7); ctx.lineWidth = 1 / S.cam.k + 0.3;
        ctx.strokeRect(-r - 9, -3, 7, 6); ctx.strokeRect(r + 2, -3, 7, 6);
        F.sprite(ctx, n.sprite || 'hermes', 0, 0, r, ac, S.theme === 'dark' ? '#060a14' : '#f2f6ff', ac);
        ctx.restore();
        const bl = 0.4 + 0.6 * Math.abs(Math.sin(S.tick * 0.06));
        ctx.fillStyle = F.hexToRgba(ac, bl);
        ctx.beginPath(); ctx.arc(n.x, n.y - r - 5 + wob, 1.8, 0, 7); ctx.fill();
        ctx.globalAlpha = 1; return;
      }
      if (n.type === 'hub') {
        const gr = r * 2.4;
        if (S.theme === 'dark') { ctx.globalAlpha = alpha * 0.8; ctx.drawImage(F.glowSprite(c), n.x - gr, n.y - gr, gr * 2, gr * 2); ctx.globalAlpha = alpha; }
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 7);
        ctx.fillStyle = c; ctx.fill();
        ctx.strokeStyle = S.theme === 'dark' ? 'rgba(5,6,13,0.8)' : 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1.6 / S.cam.k + 0.4; ctx.stroke();
        F.icon(ctx, n.x, n.y, r - 1, n._fhub ? 'data' : (n.hubKind === 'dept' ? S.deptIcon[n.dept] : n.layer === 'S' ? 'build' : n.layer === 'R' ? 'clock' : 'api'), S.theme === 'dark' ? '#05060d' : '#ffffff');
        ctx.globalAlpha = 1; return;
      }

      if (st.glow > 0.04 && on && !dim && !S.dense) {
        const gr = r * (2.1 + st.glow * 2.6);
        ctx.globalAlpha = alpha * (S.theme === 'dark' ? 0.62 : 0.3) * st.glow;
        ctx.drawImage(F.glowSprite(c), n.x - gr, n.y - gr, gr * 2, gr * 2);
        ctx.globalAlpha = alpha;
      }

      const V = st.shapes || 'celestial';
      if (n.type === 'app') {
        const blink = n.status === 'needs-auth' ? 0 : 0.3 + 0.7 * Math.abs(Math.sin(S.tick * 0.05 + (n.id.length % 9)));
        if (V === 'crystal') {
          // pentagon prism
          ctx.beginPath();
          for (let i = 0; i < 5; i++) { const a = (i / 5) * 7 - Math.PI / 2; i ? ctx.lineTo(n.x + r * Math.cos(a), n.y + r * Math.sin(a)) : ctx.moveTo(n.x + r * Math.cos(a), n.y + r * Math.sin(a)); }
          ctx.closePath();
        } else if (V === 'biolume') {
          // five-point sea star
          ctx.beginPath();
          for (let i = 0; i < 10; i++) { const a = (i / 10) * 7 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r * 1.1; i ? ctx.lineTo(n.x + rr * Math.cos(a), n.y + rr * Math.sin(a)) : ctx.moveTo(n.x + rr * Math.cos(a), n.y + rr * Math.sin(a)); }
          ctx.closePath();
        } else F.hex(ctx, n.x, n.y, r);
        ctx.fillStyle = F.hexToRgba(c, S.theme === 'dark' ? 0.2 : 0.3); ctx.fill();
        ctx.strokeStyle = c; ctx.lineWidth = 1.1 / S.cam.k + 0.3; ctx.stroke();
        S.drawAppIcon(ctx, n, r * 0.7, S.theme === 'dark' ? '#eaf0ff' : '#1a2033');
      } else if (n.type === 'routine') {
        if (V === 'crystal') {
          // split ring: two counter-arcs + core
          const a0 = S.tick * 0.02 + (n.id.length % 10);
          ctx.strokeStyle = F.hexToRgba(c, 0.9); ctx.lineWidth = 1.4 / S.cam.k + 0.3;
          ctx.beginPath(); ctx.arc(n.x, n.y, r, a0, a0 + 2.2); ctx.stroke();
          ctx.beginPath(); ctx.arc(n.x, n.y, r * 0.62, -a0, -a0 + 2.2); ctx.stroke();
          ctx.fillStyle = c; ctx.beginPath(); ctx.arc(n.x, n.y, r * 0.22, 0, 7); ctx.fill();
        } else if (V === 'biolume') {
          // breathing jelly: double pulse rings
          const p = 0.5 + 0.5 * Math.sin(S.tick * 0.04 + (n.id.length % 7));
          ctx.strokeStyle = F.hexToRgba(c, 0.85 - p * 0.4); ctx.lineWidth = 1.1 / S.cam.k + 0.3;
          ctx.beginPath(); ctx.arc(n.x, n.y, r * (0.7 + p * 0.5), 0, 7); ctx.stroke();
          ctx.strokeStyle = F.hexToRgba(c, 0.4);
          ctx.beginPath(); ctx.arc(n.x, n.y, r * (1 + p * 0.35), 0, 7); ctx.stroke();
          ctx.fillStyle = c; ctx.beginPath(); ctx.arc(n.x, n.y, r * 0.3, 0, 7); ctx.fill();
        } else {
          // orbit ring with a moon on schedule
          ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 7);
          ctx.strokeStyle = F.hexToRgba(c, 0.85); ctx.lineWidth = 1 / S.cam.k + 0.3; ctx.stroke();
          const ma = S.tick * 0.02 + (n.id.length % 10);
          ctx.fillStyle = c;
          ctx.beginPath(); ctx.arc(n.x + Math.cos(ma) * r, n.y + Math.sin(ma) * r, 1.8, 0, 7); ctx.fill();
          ctx.beginPath(); ctx.arc(n.x, n.y, r * 0.3, 0, 7); ctx.fill();
        }
      } else if (n.layer === 'S') {
        const tw = 1 + (st.twinkle || 0) * 0.25 * Math.sin(S.tick * 0.06 + (n.id.length % 13));
        const s = r * 1.25 * tw;
        if (V === 'crystal') {
          // upward shard triangle with a facet line
          ctx.beginPath(); ctx.moveTo(n.x, n.y - s); ctx.lineTo(n.x + s * 0.85, n.y + s * 0.75); ctx.lineTo(n.x - s * 0.85, n.y + s * 0.75); ctx.closePath();
          ctx.fillStyle = c; ctx.fill();
          ctx.strokeStyle = F.hexToRgba('#ffffff', 0.35); ctx.lineWidth = 0.7 / S.cam.k;
          ctx.beginPath(); ctx.moveTo(n.x, n.y - s); ctx.lineTo(n.x, n.y + s * 0.75); ctx.stroke();
        } else if (V === 'biolume') {
          // teardrop plankton
          ctx.beginPath();
          ctx.moveTo(n.x, n.y - s * 1.15);
          ctx.bezierCurveTo(n.x + s * 0.9, n.y - s * 0.1, n.x + s * 0.6, n.y + s * 0.85, n.x, n.y + s * 0.85);
          ctx.bezierCurveTo(n.x - s * 0.6, n.y + s * 0.85, n.x - s * 0.9, n.y - s * 0.1, n.x, n.y - s * 1.15);
          ctx.fillStyle = c; ctx.fill();
          ctx.fillStyle = F.hexToRgba('#ffffff', 0.4);
          ctx.beginPath(); ctx.arc(n.x, n.y + s * 0.25, s * 0.2, 0, 7); ctx.fill();
        } else {
          // four-point spark
          ctx.beginPath();
          ctx.moveTo(n.x, n.y - s); ctx.quadraticCurveTo(n.x + s * 0.18, n.y - s * 0.18, n.x + s, n.y);
          ctx.quadraticCurveTo(n.x + s * 0.18, n.y + s * 0.18, n.x, n.y + s);
          ctx.quadraticCurveTo(n.x - s * 0.18, n.y + s * 0.18, n.x - s, n.y);
          ctx.quadraticCurveTo(n.x - s * 0.18, n.y - s * 0.18, n.x, n.y - s);
          ctx.closePath();
          ctx.fillStyle = c; ctx.fill();
        }
        if (n.type === 'dir' && n.expanded) {
          ctx.strokeStyle = F.hexToRgba(c, 0.5); ctx.lineWidth = 0.8 / S.cam.k;
          ctx.beginPath(); ctx.arc(n.x, n.y, s + 3 / S.cam.k, 0, 7); ctx.stroke();
        }
      } else if (n.type === 'dir') {
        if (V === 'crystal') {
          // faceted hex gem with count
          F.hex(ctx, n.x, n.y, r * 1.1);
          ctx.fillStyle = n.expanded ? F.hexToRgba(c, 0.3) : c; ctx.fill();
          ctx.strokeStyle = F.hexToRgba('#ffffff', 0.3); ctx.lineWidth = 0.8 / S.cam.k;
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * 7 - Math.PI / 6;
            ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(n.x + r * 1.1 * Math.cos(a), n.y + r * 1.1 * Math.sin(a)); ctx.stroke();
          }
          ctx.strokeStyle = n.expanded ? c : F.hexToRgba(c, 0.5); ctx.lineWidth = 1 / S.cam.k + 0.2;
          F.hex(ctx, n.x, n.y, r * 1.1); ctx.stroke();
        } else if (V === 'biolume') {
          // cell: membrane + nucleus
          const wob = 1 + 0.06 * Math.sin(S.tick * 0.03 + (n.id.length % 11));
          ctx.strokeStyle = F.hexToRgba(c, n.expanded ? 0.95 : 0.6); ctx.lineWidth = 1.2 / S.cam.k + 0.3;
          ctx.beginPath(); ctx.arc(n.x, n.y, r * 1.15 * wob, 0, 7); ctx.stroke();
          ctx.drawImage(F.orbSprite(c, S.theme === 'dark' ? 0.45 : 0.25), n.x - r * 0.7, n.y - r * 0.7, r * 1.4, r * 1.4);
        } else {
          // ringed planet; the ring brightens when expanded
          if (n.expanded) ctx.globalAlpha = alpha * 0.5;
          ctx.drawImage(F.orbSprite(c, S.theme === 'dark' ? 0.45 : 0.25), n.x - r, n.y - r, r * 2, r * 2);
          ctx.globalAlpha = alpha;
          ctx.save();
          ctx.translate(n.x, n.y); ctx.rotate(-0.5);
          ctx.strokeStyle = F.hexToRgba(c, n.expanded ? 0.9 : 0.55);
          ctx.lineWidth = 1.1 / S.cam.k + 0.3;
          ctx.beginPath(); ctx.ellipse(0, 0, r * 1.65, r * 0.5, 0, 0, 7); ctx.stroke();
          ctx.restore();
        }
        if (r * S.cam.k > 11) {
          ctx.fillStyle = S.theme === 'dark' ? '#05060d' : '#ffffff';
          ctx.font = `700 ${Math.max(4.5, r * 0.6)}px Outfit`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(n.files || 0), n.x, n.y + 0.5);
          ctx.textBaseline = 'alphabetic';
        }
      } else {
        const rr = n === S.hover ? r + 1 : r;
        if (V === 'crystal') {
          // rotated gem: diamond with a facet seam
          F.diamond(ctx, n.x, n.y, rr * 1.15);
          ctx.fillStyle = c; ctx.fill();
          ctx.strokeStyle = F.hexToRgba('#ffffff', 0.3); ctx.lineWidth = 0.6 / S.cam.k;
          ctx.beginPath(); ctx.moveTo(n.x - rr * 1.15, n.y); ctx.lineTo(n.x + rr * 1.15, n.y); ctx.stroke();
        } else if (V === 'biolume') {
          // soft blob with a lit core
          const seed = n.id.length % 13;
          ctx.beginPath();
          for (let i = 0; i <= 12; i++) {
            const a = (i / 12) * 7;
            const rad = rr * (1 + 0.14 * Math.sin(a * 3 + seed));
            i ? ctx.lineTo(n.x + rad * Math.cos(a), n.y + rad * Math.sin(a)) : ctx.moveTo(n.x + rad * Math.cos(a), n.y + rad * Math.sin(a));
          }
          ctx.closePath();
          ctx.fillStyle = F.hexToRgba(c, 0.85); ctx.fill();
          ctx.fillStyle = F.hexToRgba('#ffffff', 0.35);
          ctx.beginPath(); ctx.arc(n.x - rr * 0.25, n.y - rr * 0.25, rr * 0.3, 0, 7); ctx.fill();
        } else {
          // file orb with luminous core (cached sprite - no per-frame gradients)
          ctx.drawImage(F.orbSprite(c, S.theme === 'dark' ? 0.55 : 0.3), n.x - rr, n.y - rr, rr * 2, rr * 2);
        }
        if (n === S.hover) {
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2 / S.cam.k;
          ctx.beginPath(); ctx.arc(n.x, n.y, rr + 1, 0, 7); ctx.stroke();
        }
      }
      if (n.secret) {
        ctx.globalAlpha = Math.min(1, alpha + 0.2);
        F.icon(ctx, n.x + r + 4 / S.cam.k, n.y - r, Math.max(4, 5 / S.cam.k), 'lock', '#ff6b6b');
      }
      ctx.globalAlpha = 1;
    },

    overLayer() { },

    drawSelection(ctx, n, r, S) {
      const p = Math.sin(S.tick * 0.08);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1.3 / S.cam.k;
      ctx.beginPath(); ctx.arc(n.x, n.y, r + 5 + p * 1.5, 0, 7); ctx.stroke();
      ctx.strokeStyle = F.hexToRgba(S.colorOf(n), 0.5);
      ctx.beginPath(); ctx.arc(n.x, n.y, r + 10 + p * 2.5, 0, 7); ctx.stroke();
    },

    drawLabels(ctx, cands, S) {
      const T = S.T;
      ctx.textAlign = 'center';
      for (const [n, sx, sy, r, isFocus, big] of cands) {
        const dim = S.focusSet && !S.focusSet.has(n.id);
        if (big) {
          const label = n.type === 'router' ? 'CLAUDE.MD' : n.label.toUpperCase();
          try { ctx.letterSpacing = '2px'; } catch (_) { }
          ctx.font = n.type === 'router' || n.type === 'agent' ? '600 12px Outfit' : '600 10.5px Outfit';
          ctx.globalAlpha = dim ? 0.25 : 1;
          ctx.fillStyle = T.labelHalo; ctx.fillText(label, sx + 1, sy + r * S.cam.k + 16 + 1);
          ctx.fillStyle = n.type === 'agent' ? S.colorOf(n) : T.labelHot;
          ctx.fillText(label, sx, sy + r * S.cam.k + 16);
          ctx.font = '500 8px Outfit';
          ctx.globalAlpha = 1;
          continue;
        }
        ctx.font = '400 9.5px Outfit';
        ctx.globalAlpha = dim ? 0.18 : 1;
        const oy = sy + r * S.cam.k + 10;
        ctx.fillStyle = T.labelHalo; ctx.fillText(n.label, sx + 1, oy + 1);
        ctx.fillStyle = isFocus ? T.labelHot : T.labelInk;
        ctx.fillText(n.label, sx, oy);
        ctx.globalAlpha = 1;
      }
    },
  };

  // the tagline carries a serif italic accent
  window.BRAIN_SKIN = skin;
})();
