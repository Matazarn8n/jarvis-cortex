# M-T1 — Brancher trois régimes d'écriture sur `metadata.type`

**Modèle : `claude-sonnet-5` · effort : `medium`.** Implémentation bornée à une
fonction et à son test.

Tu travailles dans `/home/nuveo/jarvis-cortex-plan-m` (worktree dédié, branche
`plan/m-memoire-regimes-2026-08-20`). Ne merge pas, ne pousse pas.

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

- [ ] **1. Écrire la suite qui échoue** — `tests/test_store_regimes.mjs`.

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

- [ ] **2. La lancer et vérifier qu'elle échoue**

```bash
node --test tests/test_store_regimes.mjs
```

Attendu : les cas épisodique et procédural échouent. Si un cas passe déjà, c'est
que le test ne teste pas ce qu'il prétend — corrige le test, pas le code.

Vérifie aussi que **ton test** n'a rien fait bouger dans la vraie mémoire. Ne
compare pas à « propre » : ce dépôt a des modifications préexistantes de l'Owner,
sans rapport avec ce ticket, et exiger un état initial vierge serait un blocage
que tu ne peux pas lever. Compare **avant/après** :

```bash
MEM=/home/nuveo/.claude/projects/-home-nuveo/memory
avant=$(git -C "$MEM" status --porcelain)
node --test tests/test_store_regimes.mjs; echo "test_exit=$?"
apres=$(git -C "$MEM" status --porcelain)
[ "$avant" = "$apres" ] && echo "ISOLATION OK" || { echo "FUITE — diff:"; diff <(printf '%s\n' "$avant") <(printf '%s\n' "$apres"); }
```

Si tu vois `FUITE` : **arrête-toi et signale-le**. N'exécute **aucune** commande de
restauration — surtout pas `git checkout .` : ce dépôt contient 431 fichiers
personnels et du travail non commité de l'Owner. Les effacer serait détruire la
donnée que ce plan existe pour protéger. Rapporte le diff, laisse l'Owner
trancher, et corrige l'isolation de ta suite avant toute autre exécution.

Le `check:` du ticket fait la même comparaison, en empreinte complète.

- [ ] **3. Implémenter le minimum dans `store()`**

Le branchement va juste avant `fs.writeFileSync(file, body)`. Trois branches sur
`type`, plus la copie de version pour `feedback`. Ne touche pas au calcul de
`MEM` : c'est lui qui rend l'isolation possible.

- [ ] **4. Relancer, vérifier que tout passe** — attendu 4/4, et la vraie mémoire
      toujours propre.

- [ ] **5. Vérifier la mutation à la main**

```bash
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
git show 507f278:brain.js > "$tmp/brain.js" || { echo "git show a echoue — mutation NON jouee"; exit 1; }
BRAIN_UNDER_TEST="$tmp/brain.js" node --test tests/test_store_regimes.mjs
echo "mutation_exit=$?"
```

Attendu : `mutation_exit` **non nul**. Le `git show` est testé séparément :
sinon un `exit` non nul pouvait venir de lui, sans que la mutation ait jamais
tourné.

- [ ] **6. Vérifier le code de sortie de la CLI**, dans un bac, jamais sur la
      vraie mémoire :

```bash
bac=$(mktemp -d) && mkdir "$bac/config" && cp brain.js "$bac/" \
  && printf '{"root":".","memoryDir":"memoire","memoryIndex":"MEMORY.md"}' > "$bac/config/workspace.json"
(cd "$bac" && node brain.js store "t" --type project --name evt-cli; echo "1er=$?")
(cd "$bac" && node brain.js store "t" --type project --name evt-cli; echo "2e=$?")
rm -rf "$bac"
```

Attendu : `1er=0`, `2e` **non nul**, message nommant le fichier et proposant
`--force`.

- [ ] **7. Commit**

```bash
git add brain.js tests/test_store_regimes.mjs
git commit -m "feat(brain): trois regimes d'ecriture selon metadata.type

Un project (episodique) ne s'ecrase plus en silence, un feedback (procedural)
garde sa version precedente, un user/reference reste un upsert. Le refus
episodique sort en code non nul et propose --force."
```

## Ce qui casse si tu te trompes

Un régime mal branché perd des faits : un `project` écrasé est un événement
disparu, sans trace. Le dossier de mémoire est sous git — c'est le filet. Ne le
retire jamais, et n'écris jamais dedans depuis un test.
