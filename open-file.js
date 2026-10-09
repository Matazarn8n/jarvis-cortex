'use strict';
/* Ouvre un fichier sur la machine. Résout {ok:true} si le lanceur démarre et n'échoue pas
   dans la fenêtre d'attente ; rejette si le lanceur est absent (ENOENT) ou sort en erreur. */
const { spawn: realSpawn } = require('child_process');

function openCommand(platform, abs, isHtml) {
  if (platform === 'win32') return { cmd: 'cmd', args: isHtml ? ['/c', 'start', 'chrome', abs] : ['/c', 'start', '', abs] };
  if (platform === 'darwin') return { cmd: 'open', args: [abs] };
  return { cmd: 'xdg-open', args: [abs] };
}

function openFile(abs, isHtml, { platform = process.platform, spawn = realSpawn, waitMs = 1500 } = {}) {
  const { cmd, args } = openCommand(platform, abs, isHtml);
  return new Promise((resolve, reject) => {
    let done = false;
    const end = (fn, v) => { if (!done) { done = true; clearTimeout(timer); fn(v); } };
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.on('error', (e) => end(reject, new Error(`${cmd}: ${e.message}`)));
    child.on('exit', (code) => (code === 0 || code === null)
      ? end(resolve, { ok: true })
      : end(reject, new Error(`${cmd} a échoué (code ${code})`)));
    const timer = setTimeout(() => { child.unref(); end(resolve, { ok: true }); }, waitMs);
  });
}

module.exports = { openCommand, openFile };

if (require.main === module) {
  const assert = require('assert');
  const { EventEmitter } = require('events');
  const fake = (ev) => () => { const c = new EventEmitter(); c.unref = () => {}; setImmediate(() => c.emit(...ev)); return c; };
  (async () => {
    assert.deepStrictEqual(openCommand('linux', '/a', false), { cmd: 'xdg-open', args: ['/a'] });
    assert.strictEqual(openCommand('win32', 'C:/a.html', true).args[2], 'chrome');
    assert.deepStrictEqual(await openFile('/a', false, { spawn: fake(['exit', 0]) }), { ok: true });
    await assert.rejects(openFile('/a', false, { spawn: fake(['error', Object.assign(new Error('spawn xdg-open ENOENT'), { code: 'ENOENT' })]) }), /ENOENT/);
    await assert.rejects(openFile('/a', false, { spawn: fake(['exit', 3]) }), /code 3/);
    console.log('open-file OK');
  })().catch((e) => { console.error(e); process.exit(1); });
}
