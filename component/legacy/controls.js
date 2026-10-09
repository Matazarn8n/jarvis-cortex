// FINAL: collapsible menu + legend fabs, and the one tweak that stays -
// ring spin (drives the rings AND Hermes' orbit)
window.BRAIN_CONTROLS = () => {
  const fabM = document.createElement('button'); fabM.id = 'fab-menu'; fabM.className = 'fab'; fabM.textContent = '\u2630 MENU';
  const fabL = document.createElement('button'); fabL.id = 'fab-legend'; fabL.className = 'fab'; fabL.textContent = '\u25C6 LEGEND';
  window.BrainCore.S.root.append(fabM, fabL);
  fabM.onclick = () => window.BrainCore.S.root.classList.toggle('menu-open');
  fabL.onclick = () => window.BrainCore.S.root.classList.toggle('lg-open');
  const iv = window.BrainCore.S.controlsInterval = setInterval(() => {
    const S3 = window.BrainCore && BrainCore.S;
    const anchor = document.querySelector('#brain-panel [data-sec="view"]');
    if (!S3 || !anchor || document.getElementById('spin3')) return;
    const w = document.createElement('div');
    w.innerHTML = '<div class="p-sub">Ring spin (rings + Hermes)</div><div class="sl"><input type="range" min="0" max="100" id="spin3"></div>';
    anchor.after(w);
    const sl = w.querySelector('#spin3');
    sl.value = Math.round((S3.st.spin ?? 0.22) * 100);
    sl.oninput = () => { S3.st.spin = sl.value / 100; save3(); };
    const fl = document.createElement('label');
    fl.className = 'chk';
    fl.innerHTML = '<input type="checkbox" id="chk-filelabels"' + (S3.st.fileLabels === false ? '' : ' checked') + '> File names';
    w.appendChild(fl);
    fl.querySelector('input').onchange = e => { S3.st.fileLabels = e.target.checked; save3(); };
    // ---- GRAVITY mixing desk (circle + hex) ----
    const LAYOUTS = ['force', 'circle', 'hex', 'rings', 'deck'];
    function save3() { try { localStorage.setItem('brain-v2-' + S3.skin.key, JSON.stringify(S3.st)); } catch (e) { } }
    function reheat3() {
      clearTimeout(window._g3);
      window._g3 = setTimeout(() => {
        if (S3.st.layout !== 'circle' && S3.st.layout !== 'hex') return;
        const btn = document.querySelectorAll('#seg-layout button')[LAYOUTS.indexOf(S3.st.layout)];
        if (btn) btn.click(); // re-running the active layout rebuilds the sim with new dials
      }, 180);
    }
    if (S3.st.layout === 'deck') { const b0 = document.querySelectorAll('#seg-layout button')[3]; if (b0) b0.click(); } // Deck retired
    const GRAV = [
      ['g_link', 'Link springs'],
      ['boundSize', 'Circle / Hex size'],
    ];
    const gw = document.createElement('div');
    let gh = '';
    for (const [k, label] of GRAV) {
      if (k.startsWith('#')) { gh += '<div class="p-sub" style="margin-top:12px">' + k.slice(1) + '</div>'; continue; }
      gh += '<div class="sl"><div class="sl-head"><span style="font-size:11px">' + label + '</span><span class="sl-val" id="gv-' + k + '">' + ((S3.st[k] ?? 0.5)).toFixed(2) + '</span></div><input type="range" min="0" max="100" value="' + Math.round((S3.st[k] ?? 0.5) * 100) + '" data-gk="' + k + '"></div>';
    }
    gw.innerHTML = gh;
    w.after(gw);
    gw.querySelectorAll('input[data-gk]').forEach(inp => {
      inp.oninput = () => {
        const k = inp.dataset.gk, v = inp.value / 100;
        S3.st[k] = v;
        document.getElementById('gv-' + k).textContent = v.toFixed(2);
        save3(); reheat3();
      };
    });
    clearInterval(iv);
  }, 300);
};
