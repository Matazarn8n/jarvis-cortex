# M-T1 — Brancher trois régimes d'écriture sur `metadata.type`

**Modèle : `claude-sonnet-5` · effort : `medium`.** Implémentation bornée à une
fonction et à son test.

Tu travailles dans `/home/nuveo/jarvis-cortex-plan-m` (worktree dédié, branche
`plan/m-memoire-regimes-2026-08-20`).

## Tu n'as pas Bash — et c'est le cœur du dispositif

Ce ticket déclare `allow_tools: [Read, Grep, Glob, Edit, Write]`. Tu ne peux ni
exécuter de commande, ni lancer `node`, ni commiter.

La raison est directe : le bac à sable du runner monte le système de fichiers en
lecture-écriture. Tant qu'un ticket garde Bash, il peut écrire dans la vraie
mémoire de l'Owner — 431 fichiers personnels — pendant toute sa session, et
aucun contrôle a posteriori ne le rattrape. Un plan dont l'objet est de protéger
cette mémoire ne peut pas commencer par pouvoir l'abîmer.

**C'est le `check:` qui exécute tout** : ta suite de tests, la preuve de mutation
contre `brain.js@507f278`, et une sonde comportementale indépendante qui pilote
la CLI. Tu écris le code et le test ; le contrôle les joue et te dit précisément
ce qui cloche — chaque défaut sort en `ECHEC: <description>`. Lis ces lignes, ce
sont ton retour de test.

Écris donc avec soin plutôt qu'en tâtonnant : tu as moins de tours qu'en TDD
local.

## Lis ceci en premier — l'isolation n'est pas optionnelle

`brain.js` calcule son dossier de mémoire ainsi :

```js
const WS   = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'workspace.json')));
const ROOT = path.resolve(__dirname, WS.root || '..');
const MEM  = path.join(ROOT, ...(WS.memoryDir || 'shared/memory').split('/'));
```

`MEM` dépend donc de **où se trouve `brain.js`** et du `config/workspace.json`
posé à côté de lui. Un test qui appelle `store()` sur le `brain.js` du dépôt écrit
dans la **vraie mémoire de l'Owner** — 431 fichiers et un `MEMORY.md` réel.

**Ta suite de tests doit donc travailler sur une copie.** Pour chaque cas :

1. créer un `mkdtemp` ;
2. y copier `brain.js` **et** écrire un `config/workspace.json` à côté :
   `{"root": ".", "memoryDir": "memoire", "memoryIndex": "MEMORY.md"}` ;
3. importer la copie, pas l'original.

Aucune autre isolation n'est acceptable : `opts.sandbox` écrit dans
`.cache/sandbox-memory` **du dépôt**, ce qui pollue le worktree et ne prouve rien
sur le chemin réel. Et surtout, ce mécanisme fonctionne **avant** que tu aies
écrit une seule ligne — c'est ce qui rend la première exécution rouge inoffensive.

Le `check:` du ticket prend une **empreinte complète** du dossier de mémoire réel
(noms, tailles, contenus) juste avant de lancer `node --test`, et la recompare
juste après. Le moindre octet qui bouge fait échouer le ticket. Chercher quelques
noms de fichiers n'aurait rien prouvé : ta suite en écrit d'autres.

## Ce qui est cassé

`brain.js`, fonction `store()` :

```js
fs.writeFileSync(file, body);
```

Écrasement inconditionnel. Le `type` est déjà calculé quelques lignes plus haut
(`const type = opts.type || 'project'`) et sert déjà à choisir le préfixe du nom
de fichier — il ne pilote pas l'écriture.

## Le comportement attendu

| `type` | Régime | Comportement exact |
|---|---|---|
| `user`, `reference` | sémantique | **upsert** — écrasement, comportement actuel inchangé, aucune version créée |
| `project` | épisodique | **append-only** — si le fichier existe, `store` **lève** et n'écrit rien |
| `feedback` | procédural | **remplacement versionné** — si le fichier existe, le copier en `<base>.v<N>.md` (N = plus petit entier libre à partir de 1) **avant** d'écrire |

Un `type` inconnu garde le comportement actuel. Ce ticket ne change pas la
surface d'appel.

`--force` (ou `opts.force`) autorise l'écrasement épisodique. Explicite, jamais
par défaut.

Le refus épisodique doit être **bruyant** : la CLI (`brain.js`, branche
`cmd === 'store'`) sort en **code non nul** quand `store` lève, avec un message
qui nomme le fichier et propose `--force`. Un `catch` qui renvoie un stub, un
`|| true`, ou un retour silencieux recréerait la classe de panne consignée dans
`instagram-pipeline-silent-failure`.

## La preuve de mutation

Le `check:` rejoue **ta suite** contre `brain.js` au sha `507f278` et exige
qu'elle **échoue**. Charge donc le module par variable d'environnement :

```js
const SRC = process.env.BRAIN_UNDER_TEST || new URL('../brain.js', import.meta.url).pathname;
```

C'est `SRC` que tu copies dans le `mkdtemp`. Sans ce point d'entrée, la mutation
n'est pas prouvable et le ticket sera refusé.

## Étapes

- [ ] **1. Écrire la suite** — `tests/test_store_regimes.mjs`.

Structure imposée (l'assistant d'isolation d'abord, les cas ensuite) :

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SRC = process.env.BRAIN_UNDER_TEST || new URL('../brain.js', import.meta.url).pathname;

function bac() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-'));
  fs.mkdirSync(path.join(d, 'config'));
  fs.copyFileSync(SRC, path.join(d, 'brain.js'));
  fs.writeFileSync(path.join(d, 'config', 'workspace.json'),
    JSON.stringify({ root: '.', memoryDir: 'memoire', memoryIndex: 'MEMORY.md' }));
  return { dir: d, mem: path.join(d, 'memoire'), mod: path.join(d, 'brain.js') };
}

async function chargeStore(b) {
  const m = await import(b.mod + '?t=' + Math.random());  // pas de cache entre cas
  return m.store;
}
```

Quatre cas, chacun sur son propre bac : refus épisodique · `--force` qui l'ouvre ·
versionnage procédural (`feedback_regle_a.v1.md` porte l'ancien contenu) · upsert
sémantique sans version créée.

Le `BRAIN_UNDER_TEST` n'est pas décoratif : c'est par lui que le `check:` rejoue
ta suite contre `brain.js@507f278` et exige qu'elle **échoue**. Une suite qui
passe des deux côtés ne prouve rien et fait échouer le ticket.

- [ ] **2. Implémenter dans `store()`**

Le branchement va juste avant `fs.writeFileSync(file, body)`. Trois branches sur
`type`, plus la copie de version pour `feedback`. Ne touche pas au calcul de
`MEM` : c'est lui qui rend l'isolation possible.

- [ ] **3. Relire contre ce que le `check:` va exiger**, dans l'ordre :

1. la sonde écrit un `project`, en réécrit un second → **exit non nul**, message
   contenant `project_sonde_evt.md` **et** `--force` ;
2. `--force` sur ce même `project` → exit 0 **et** contenu remplacé ;
3. deux `feedback` de suite → les deux exit 0, `feedback_sonde_regle.v1.md`
   porte l'ancien contenu, le fichier courant porte le nouveau ;
4. deux `user` puis deux `reference` → **quatre** exit 0, contenu remplacé,
   **aucun** `.v1.md` créé ;
5. aucune trace des sondes dans la vraie mémoire, dont l'empreinte complète est
   comparée avant/après ta suite.

Relis ton code contre ces cinq points avant de rendre : ils sont la définition
exacte du succès.

## Ce qui casse si tu te trompes

Un régime mal branché perd des faits : un `project` écrasé est un événement
disparu, sans trace. Deux filets tiennent : le dossier de mémoire est sous git,
et ta suite écrit dans un `mkdtemp` avec son propre `workspace.json`. Le second
est le tien — ne le retire jamais, et ne fais jamais pointer un test vers le
`brain.js` du dépôt sans l'avoir recopié.
