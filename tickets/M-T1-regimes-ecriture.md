# M-T1 — Brancher trois régimes d'écriture sur `metadata.type`

**Modèle : `claude-sonnet-5` · effort : `medium`.** Implémentation bornée à une
fonction et à son test.

Tu travailles dans `/home/nuveo/projects/jarvis-cortex-plan-m` (worktree dédié, branche
`plan/m-memoire-regimes-2026-08-20`). Ne merge pas, ne pousse pas.

## Ce qui est cassé

`brain.js`, fonction `store()`, ligne ~176 :

```js
fs.writeFileSync(file, body);
```

Écrasement inconditionnel. Les 431 fichiers de
`~/.claude/projects/-home-nuveo/memory/` sont écrits ainsi, quel que soit leur
`metadata.type`. Un événement passé (`project`) et un fait durable (`user`)
subissent le même traitement. Le `type` est déjà calculé quelques lignes plus
haut (`const type = opts.type || 'project'`) et sert déjà à choisir le préfixe de
nom de fichier — il ne pilote pas l'écriture.

## Le comportement attendu

| `type` | Régime | Comportement exact |
|---|---|---|
| `user`, `reference` | sémantique | **upsert** — écrasement, comportement actuel inchangé |
| `project` | épisodique | **append-only** — si le fichier existe déjà, `store` **lève** (`throw`) et n'écrit rien |
| `feedback` | procédural | **remplacement versionné** — si le fichier existe, le copier en `<base>.v<N>.md` (N = plus petit entier libre à partir de 1) **avant** d'écrire la nouvelle version |

Un `type` inconnu garde le comportement actuel (upsert) : ce ticket ne change pas
la surface d'appel.

Le refus épisodique doit être **bruyant**. Un `catch` qui renvoie un stub, un
`|| true`, ou un retour silencieux recréerait exactement la classe de panne
consignée dans `instagram-pipeline-silent-failure`. La CLI (`brain.js` ligne ~254,
branche `cmd === 'store'`) doit sortir en code non nul quand `store` lève.

Une échappatoire explicite est acceptable et souhaitable : `--force` (ou
`opts.force`) autorise l'écrasement épisodique. Explicite, jamais par défaut.

## Testabilité — à lire avant d'écrire

Le `check:` du ticket rejoue **la même suite** contre `brain.js` tel qu'il était
au branchement (sha `507f278`) et exige qu'elle **échoue**. Ta suite doit donc
charger le module sous test par une variable d'environnement :

```js
const BRAIN = process.env.BRAIN_UNDER_TEST || new URL('../brain.js', import.meta.url).pathname;
```

Sans cela, la preuve de mutation est impossible et le ticket sera refusé.

Les tests écrivent dans un répertoire temporaire, **jamais** dans
`~/.claude/projects/-home-nuveo/memory/`. `store()` accepte déjà `opts.sandbox`
qui bascule sur `SANDBOX` ; si ce chemin ne suffit pas pour isoler, ajoute un
paramètre de répertoire explicite plutôt que de toucher au vrai dossier.

## Étapes

- [ ] **1. Écrire la suite qui échoue** — `tests/test_store_regimes.mjs`, quatre cas :

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BRAIN = process.env.BRAIN_UNDER_TEST || new URL('../brain.js', import.meta.url).pathname;
const { store } = await import(BRAIN);

function frais() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mem-'));
}

test('episodique: un project existant n\'est jamais ecrase', () => {
  const dir = frais();
  store('premier evenement', { type: 'project', name: 'evt-1', dir });
  assert.throws(() => store('reecriture', { type: 'project', name: 'evt-1', dir }));
  assert.match(fs.readFileSync(path.join(dir, 'project_evt_1.md'), 'utf8'), /premier evenement/);
});

test('episodique: --force autorise explicitement l\'ecrasement', () => {
  const dir = frais();
  store('premier', { type: 'project', name: 'evt-2', dir });
  store('second', { type: 'project', name: 'evt-2', dir, force: true });
  assert.match(fs.readFileSync(path.join(dir, 'project_evt_2.md'), 'utf8'), /second/);
});

test('procedural: un feedback remplace garde sa version precedente', () => {
  const dir = frais();
  store('regle v1', { type: 'feedback', name: 'regle-a', dir });
  store('regle v2', { type: 'feedback', name: 'regle-a', dir });
  assert.match(fs.readFileSync(path.join(dir, 'feedback_regle_a.md'), 'utf8'), /regle v2/);
  assert.match(fs.readFileSync(path.join(dir, 'feedback_regle_a.v1.md'), 'utf8'), /regle v1/);
});

test('semantique: un user est bien un upsert', () => {
  const dir = frais();
  store('fait v1', { type: 'user', name: 'fait-a', dir });
  store('fait v2', { type: 'user', name: 'fait-a', dir });
  assert.match(fs.readFileSync(path.join(dir, 'user_fait_a.md'), 'utf8'), /fait v2/);
  assert.equal(fs.existsSync(path.join(dir, 'user_fait_a.v1.md')), false);
});
```

- [ ] **2. La lancer et vérifier qu'elle échoue**

```bash
node --test tests/test_store_regimes.mjs
```

Attendu : les cas épisodique et procédural échouent (l'écrasement passe
aujourd'hui sans lever, aucune `.v1.md` n'est écrite). Si un cas passe déjà,
c'est que le test ne teste pas ce qu'il prétend — corrige le test, pas le code.

- [ ] **3. Implémenter le minimum dans `store()`**

Le branchement va juste avant `fs.writeFileSync(file, body)`. Trois branches sur
`type`, plus la copie de version pour `feedback`. `opts.dir` (utilisé par les
tests) doit être respecté s'il est fourni, sinon le comportement actuel
(`opts.sandbox ? SANDBOX : MEM`) est conservé.

- [ ] **4. Relancer, vérifier que tout passe**

```bash
node --test tests/test_store_regimes.mjs
```

Attendu : 4/4.

- [ ] **5. Vérifier la mutation à la main avant de commiter**

```bash
tmp=$(mktemp -d) && git show 507f278:brain.js > "$tmp/brain.js" \
  && cp tests/test_store_regimes.mjs "$tmp/suite.mjs" \
  && (cd "$tmp" && BRAIN_UNDER_TEST="$tmp/brain.js" node --test suite.mjs); echo "exit=$?"
```

Attendu : `exit` **non nul**. Un `exit=0` signifie que la suite ne prouve rien.

- [ ] **6. Vérifier que la CLI sort non nul sur refus**

```bash
node brain.js store "test" --type project --name evt-cli --sandbox; echo "1er=$?"
node brain.js store "test" --type project --name evt-cli --sandbox; echo "2e=$?"
```

Attendu : `1er=0`, `2e` **non nul**, avec un message qui nomme le fichier et
propose `--force`.

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
disparu, sans trace. Le dépôt de mémoire est sous git — c'est la seule chose qui
borne le dégât. Ne désactive jamais ce filet en écrivant hors du dépôt.
