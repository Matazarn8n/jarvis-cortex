# JARVIS Cortex

Full-screen workspace-graph visualizer for JARVIS OS: scans the GEEKOM
workspace (`scan.js`), serves an interactive rings/orbit canvas
(`public/`, `server.js` on `127.0.0.1:5210`), embedded as an iframe in the
JARVIS dashboard ("Open Cortex"). `brain.js` is the fast store/recall CLI
for the file-based memory.

## Run

```bash
node server.js          # http://127.0.0.1:5210
```

Prod: systemd user service `jarvis-cortex.service`.

## Composant embarqué

`component/WorkspaceGraph.tsx` monte le Cortex directement dans la coquille React. Il consomme le graphe et les projets déjà chargés par la coquille : aucun serveur Cortex, iframe ou appel réseau propre au composant. Vérification : `node --test tests/network-inventory.test.mjs`.

Le serveur autonome ci-dessous reste disponible pour le développement historique.

## Layout

- `server.js` — Node server: static files + API (`/api/graph|expand|search|file|open|rescan`)
- `scan.js` — workspace walker/classifier
- `public/` — canvas engine (`_core.js`), theme (`_core.css`), icons, flows
- `config/*.json` — departments, apps, routines, workspace root, access overrides
- `brain.js` — memory store CLI (`node brain.js store "fact" --type project --name slug`)

## Attribution

The visual engine is a derivative of the "Second Brain" visualizer by
Jay E / RoboNuggets, CC BY 4.0 — see `NOTICE` and `LICENSE`.
