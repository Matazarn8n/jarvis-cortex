/* brain-v2 shared canvas helpers: colors, cached glow sprites, node shapes,
   line-art icons, pixel sprites (Claude bot + Hermes). Extends the brain-styles
   _flows.js language for the v2 chassis. */
window.F2 = (function () {
  function norm(hex) { return hex.length === 4 ? '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3] : hex; }
  function hexToRgba(hex, a) {
    hex = norm(hex);
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  function mix(a, b, t) {
    a = norm(a); b = norm(b);
    const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
    return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }

  // stable per-link curvature (the nebula bow) - deterministic by link index
  const _bows = new Map();
  function bowOf(i) {
    if (!_bows.has(i)) _bows.set(i, (((i * 2654435761) % 2) ? 1 : -1) * (0.07 + ((i * 97) % 13) / 13 * 0.09));
    return _bows.get(i);
  }
  function linkCtrl(a, b, i) {
    const bw = bowOf(i);
    return [(a.x + b.x) / 2 - (b.y - a.y) * bw, (a.y + b.y) / 2 + (b.x - a.x) * bw];
  }
  function linkPoint(a, b, i, t) {
    const [cx, cy] = linkCtrl(a, b, i), u = 1 - t;
    return [u * u * a.x + 2 * u * t * cx + t * t * b.x, u * u * a.y + 2 * u * t * cy + t * t * b.y];
  }

  // cached luminous orb (radial-lit sphere) - one canvas per color+lightness,
  // so heavy skins never build gradients per node per frame
  const _orb = {};
  function orbSprite(color, litMix) {
    const key = color + '|' + litMix;
    if (_orb[key]) return _orb[key];
    const S = 48, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(S * 0.38, S * 0.38, S * 0.05, S / 2, S / 2, S / 2);
    grd.addColorStop(0, mix(color, '#ffffff', litMix));
    grd.addColorStop(1, color);
    g.fillStyle = grd;
    g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, 7); g.fill();
    _orb[key] = c; return c;
  }

  const _glow = {};
  function glowSprite(color) {
    color = norm(color);
    if (_glow[color]) return _glow[color];
    const S = 64, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, hexToRgba(color, 0.55)); grd.addColorStop(0.4, hexToRgba(color, 0.22)); grd.addColorStop(1, hexToRgba(color, 0));
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    _glow[color] = c; return c;
  }

  // ---- shapes (ARMS layers use distinct silhouettes) ----
  function rrect(ctx, x, y, s, rad) {
    ctx.beginPath();
    ctx.moveTo(x - s + rad, y - s); ctx.arcTo(x + s, y - s, x + s, y + s, rad); ctx.arcTo(x + s, y + s, x - s, y + s, rad);
    ctx.arcTo(x - s, y + s, x - s, y - s, rad); ctx.arcTo(x - s, y - s, x + s, y - s, rad); ctx.closePath();
  }
  function diamond(ctx, x, y, s) {
    ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath();
  }
  function hex(ctx, x, y, s) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i - Math.PI / 6; i ? ctx.lineTo(x + s * Math.cos(a), y + s * Math.sin(a)) : ctx.moveTo(x + s * Math.cos(a), y + s * Math.sin(a)); }
    ctx.closePath();
  }
  function folderShape(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x - s, y - s * 0.55); ctx.lineTo(x - s * 0.15, y - s * 0.55); ctx.lineTo(x + s * 0.02, y - s * 0.28);
    ctx.lineTo(x + s, y - s * 0.28); ctx.lineTo(x + s, y + s * 0.62); ctx.lineTo(x - s, y + s * 0.62); ctx.closePath();
  }

  // ---- pixel sprites (8x8, 4-col arrays mirrored). Canonical dashboard data. ----
  const SPRITES = {
    robo:  [[0, 0, 1, 0], [1, 1, 1, 1], [1, 1, 1, 1], [1, 0, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1], [1, 0, 0, 1], [0, 0, 0, 0]],
    hermes: [[0, 0, 1, 0], [0, 1, 1, 1], [1, 1, 1, 1], [0, 1, 0, 1], [0, 1, 1, 1], [1, 1, 1, 0], [0, 0, 1, 0], [0, 0, 0, 0]],
    carla: [[0, 0, 1, 0], [0, 0, 1, 1], [0, 1, 1, 1], [1, 1, 0, 1], [1, 1, 1, 1], [1, 1, 1, 1], [1, 0, 0, 1], [0, 0, 0, 0]],
    xavier: [[1, 0, 0, 0], [1, 1, 0, 0], [0, 1, 1, 1], [0, 1, 1, 1], [1, 1, 0, 1], [0, 1, 1, 1], [0, 1, 0, 1], [0, 0, 0, 0]],
  };
  function sprite(ctx, key, ox, oy, r, col, discFill, discStroke) {
    ctx.beginPath(); ctx.arc(ox, oy, r, 0, 7);
    ctx.fillStyle = discFill || '#0a0a0a'; ctx.fill();
    if (discStroke) { ctx.strokeStyle = discStroke; ctx.lineWidth = 1.5; ctx.stroke(); }
    const pix = SPRITES[key] || SPRITES.robo;
    const g = 8, px = (r * 0.95) / g, sx = ox - (g * px) / 2, sy = oy - (g * px) / 2;
    ctx.fillStyle = col;
    for (let y = 0; y < pix.length; y++) for (let x = 0; x < pix[y].length; x++) if (pix[y][x]) {
      ctx.fillRect(sx + x * px, sy + y * px, px, px);
      ctx.fillRect(sx + (g - 1 - x) * px, sy + y * px, px, px);
    }
  }

  // ---- small line-art icons ----
  function icon(ctx, ox, oy, r, type, col) {
    const s = r * 0.55;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(1, r * 0.09); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    switch (type) {
      case 'visual':
        ctx.beginPath(); ctx.moveTo(ox, oy - s * 0.7); ctx.lineTo(ox + s * 0.65, oy); ctx.lineTo(ox, oy + s * 0.7); ctx.lineTo(ox - s * 0.65, oy); ctx.closePath(); ctx.stroke(); break;
      case 'people':
        ctx.beginPath(); ctx.arc(ox - s * 0.32, oy - s * 0.18, s * 0.26, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.arc(ox + s * 0.32, oy - s * 0.18, s * 0.26, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.arc(ox, oy + s * 0.62, s * 0.5, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); break;
      case 'build':
        ctx.beginPath(); ctx.moveTo(ox - s * 0.2, oy - s * 0.5); ctx.lineTo(ox - s * 0.6, oy); ctx.lineTo(ox - s * 0.2, oy + s * 0.5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ox + s * 0.2, oy - s * 0.5); ctx.lineTo(ox + s * 0.6, oy); ctx.lineTo(ox + s * 0.2, oy + s * 0.5); ctx.stroke(); break;
      case 'pen':
        ctx.beginPath(); ctx.moveTo(ox - s * 0.55, oy + s * 0.55); ctx.lineTo(ox - s * 0.35, oy + s * 0.1); ctx.lineTo(ox + s * 0.35, oy - s * 0.6); ctx.lineTo(ox + s * 0.6, oy - s * 0.35); ctx.lineTo(ox - s * 0.1, oy + s * 0.35); ctx.closePath(); ctx.stroke(); break;
      case 'data':
        ctx.beginPath(); ctx.ellipse(ox, oy - s * 0.4, s * 0.5, s * 0.2, 0, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ox - s * 0.5, oy - s * 0.4); ctx.lineTo(ox - s * 0.5, oy + s * 0.4); ctx.moveTo(ox + s * 0.5, oy - s * 0.4); ctx.lineTo(ox + s * 0.5, oy + s * 0.4); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(ox, oy + s * 0.4, s * 0.5, s * 0.2, 0, 0, Math.PI); ctx.stroke(); break;
      case 'pulse':
        ctx.beginPath(); ctx.moveTo(ox - s * 0.7, oy); ctx.lineTo(ox - s * 0.3, oy); ctx.lineTo(ox - s * 0.1, oy - s * 0.5); ctx.lineTo(ox + s * 0.1, oy + s * 0.5); ctx.lineTo(ox + s * 0.3, oy); ctx.lineTo(ox + s * 0.7, oy); ctx.stroke(); break;
      case 'book':
        ctx.beginPath(); ctx.moveTo(ox, oy - s * 0.5); ctx.lineTo(ox, oy + s * 0.55); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ox, oy - s * 0.5); ctx.quadraticCurveTo(ox - s * 0.6, oy - s * 0.65, ox - s * 0.7, oy - s * 0.3); ctx.lineTo(ox - s * 0.7, oy + s * 0.4); ctx.quadraticCurveTo(ox - s * 0.4, oy + s * 0.25, ox, oy + s * 0.55); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ox, oy - s * 0.5); ctx.quadraticCurveTo(ox + s * 0.6, oy - s * 0.65, ox + s * 0.7, oy - s * 0.3); ctx.lineTo(ox + s * 0.7, oy + s * 0.4); ctx.quadraticCurveTo(ox + s * 0.4, oy + s * 0.25, ox, oy + s * 0.55); ctx.stroke(); break;
      case 'clock':
        ctx.beginPath(); ctx.arc(ox, oy, s * 0.62, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy - s * 0.38); ctx.moveTo(ox, oy); ctx.lineTo(ox + s * 0.28, oy + s * 0.1); ctx.stroke(); break;
      case 'api':
        ctx.beginPath(); ctx.arc(ox, oy, s * 0.28, 0, 7); ctx.stroke();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * 7;
          ctx.beginPath(); ctx.moveTo(ox + Math.cos(a) * s * 0.28, oy + Math.sin(a) * s * 0.28); ctx.lineTo(ox + Math.cos(a) * s * 0.62, oy + Math.sin(a) * s * 0.62); ctx.stroke();
        } break;
      case 'lock':
        ctx.beginPath(); ctx.rect(ox - s * 0.45, oy - s * 0.05, s * 0.9, s * 0.65); ctx.stroke();
        ctx.beginPath(); ctx.arc(ox, oy - s * 0.15, s * 0.3, Math.PI, 0); ctx.stroke(); break;
      default:
        ctx.beginPath(); ctx.arc(ox, oy, s * 0.35, 0, 7); ctx.stroke();
    }
  }

  return { hexToRgba, mix, glowSprite, orbSprite, rrect, diamond, hex, folderShape, sprite, icon, norm, bowOf, linkCtrl, linkPoint };
})();
