# M-TGEN — Constater l'état réel de la mémoire, puis écrire le maillon B

**Modèle : `claude-opus-5` · effort : `high`.** Choix d'architecture du
programme, pas de l'implémentation.

Tu travailles dans `/home/nuveo/jarvis-cortex-plan-m`.

**Tu n'as pas Bash.** Ce ticket declare `allow_tools: [Read, Grep, Glob, Edit,
Write]` : ni commande, ni commit. Tu lis le dossier de memoire avec `Read` et
`Grep`, tu ecris tes fichiers avec `Write`. La raison est que le bac a sable du
runner monte le systeme en lecture-ecriture : un ticket qui garde Bash peut
ecrire dans les 431 fichiers personnels de l'Owner pendant toute sa session, et
aucun controle a posteriori ne le rattrape.

C'est le `check:` qui recalcule les metriques, verifie l'empreinte et **compile**
le runbook B avec le moteur. Ce que tu ecris reste un diff local, c'est normal
ici.

## Pourquoi ce ticket existe

M-T1 a posé les régimes d'écriture pour l'**avenir**. Il ne dit rien de ce que les
fichiers déjà écrits contiennent de contradictoire avec ces régimes. Or B — la
boucle « verdict de gate → règle » — écrira des fichiers `feedback` au régime
procédural défini en M-T1. L'écrire à l'aveugle produirait un plan qui suppose au
lieu de mesurer.

Un maillon qui finirait sans écrire son successeur finirait `done` **muet** —
défaut consigné le 2026-08-10 (8 runbooks sur 11 sans `chain:`, et une phase P2
jamais écrite après G3).

## Partie 1 — Le constat

Écris `docs/plans/2026-08-20-m-constat-memoire.md` en lisant réellement
`/home/nuveo/.claude/projects/-home-nuveo/memory/*.md`.

**Le document ouvre par un bloc de métriques structuré**, une ligne `clé: valeur`
par métrique. Le `check:` recalcule les neuf valeurs et refuse toute divergence :

```markdown
user: 12
feedback: 68
project: 214
reference: 9
sans_type: 3
feedback_revises: 21
project_multidate: 40
index_pointeurs_morts: 5
fichiers_non_indexes: 17
```

(Les nombres ci-dessus sont un exemple de forme, pas des valeurs à recopier.)

Puis **cinq rubriques rédigées**, qui expliquent ces chiffres :

1. **Répartition par `metadata.type`** — combien de `user`, `feedback`,
   `project`, `reference`, et combien sans `type` exploitable.
2. **Révisions** — combien de `feedback` (procédural) portent déjà une trace de
   révision (« mis à jour », « RÉVOQUÉE », « CORRECTION », une seconde date).
   Ces fichiers ont été révisés à la main, sans version conservée : ils prouvent
   que le régime procédural manquait.
3. **Dates multiples** — combien de `project` portent plusieurs dates dans leur
   corps, signe d'un événement réécrit plutôt qu'ajouté.
4. **Index `MEMORY.md`** — combien de lignes, combien pointent vers un fichier
   disparu, combien de fichiers n'ont aucune ligne d'index.
5. **Migration** — ce qu'elle coûterait, si elle vaut le coup, et pourquoi.
   « Ne rien migrer » est une réponse valide si les chiffres la soutiennent. Ne
   fabrique pas un chantier.

### Interdiction : ni nom, ni contenu, ni exemple

Ces fichiers portent des clients, des personnes et des projets privés. Le constat
est commité dans un dépôt git, et l'historique garde ce qu'on y met même après
suppression.

- **Aucun nom de fichier** du dossier de mémoire (sauf `MEMORY.md`, qui est
  l'index et que la rubrique 4 traite nommément).
- **Aucun extrait, aucune citation, aucun exemple** tiré de ces fichiers — y
  compris « anonymisé ». Le `check:` compare le constat au corpus et refuse toute
  phrase de 60 caractères ou plus qui s'y retrouve telle quelle. Juger soi-même
  qu'un extrait est assez anonyme n'est pas une garantie, c'est une appréciation.
- Le livrable se borne aux **agrégats** et à une **recommandation générique**.

La preuve de lecture est une **empreinte**, pas une liste : le SHA-256 des noms
de fichiers `*.md` du dossier, tries par ordre croissant, joints par un saut de
ligne, tronque aux **16 premiers caracteres hexadecimaux**. Inscris-la dans le
document sous la forme `empreinte: <16 hex>`, avec le nombre de fichiers.

Tu n'as pas Bash pour la calculer : etablis-la depuis la liste que `Glob` te
rend. Le `check:` la recalcule et exige de la retrouver — elle prouve que tu as
enumere le dossier entier sans en divulguer le contenu. Une empreinte fausse fait
echouer le ticket, donc trie et joins exactement comme decrit.

Les agrégats — compteurs, pourcentages, distributions — sont la matière du
document. Une observation qualitative s'écrit sans citer la source : « une part
des règles porte une trace de révision manuscrite » et non « la règle X dit Y ».

## Partie 2 — Écrire le runbook B

Écris `runbooks/handoff-2026-08-21-b-boucle-verdict-regle.runbook.yaml` et ses
prompts sous `runbooks/tickets/`.

**Objet de B :** aujourd'hui les gates Codex rendent des verdicts et les fichiers
de règles (`feedback_*.md`) sont écrits **à la main, après coup**. B câble la
réinjection : un verdict de gate qui révèle un défaut écrit lui-même sa règle via
`brain.js store --type feedback`, donc au régime procédural versionné posé en
M-T1.

### Le dépôt de B est déjà préparé — ne le choisis pas

`repo: /home/nuveo/hermes-os-plan-b`, worktree de `~/hermes-os` **déjà créé et
déjà inscrit à l'allowlist du runner**. N'invente pas un autre chemin : un
`repo:` absent de l'allowlist, ou inexistant sur le disque, rend B inlançable et
la chaîne se bloque au pré-vol. Déclare-le en plus dans `requires_access` :

```yaml
requires_access:
  - cmd: "test -d /home/nuveo/hermes-os-plan-b/.git || test -f /home/nuveo/hermes-os-plan-b/.git"
```

### Contraintes de forme — le moteur refuse le runbook sinon

- `phase: "B"`.
- Chaque ticket `kind: session` porte `model:` **explicite**, `effort:`,
  `prompt_file:` et `check:`.
- **`prompt_file:` est résolu sous le DOSSIER DU RUNBOOK**, pas sous le dépôt.
  Un runbook dans `runbooks/` avec `prompt_file: tickets/B-T1.md` fait chercher
  `runbooks/tickets/B-T1.md`. Écris les prompts là, et vérifie leur présence.
- **`generates_runbook:` est joint sous `<repo>/runbooks`** : mets un nom de
  fichier nu, jamais `runbooks/...` — sinon le moteur cherche sous
  `runbooks/runbooks/` et rejoue la session génératrice à chaque approbation.
  `produces:`, lui, se résout depuis la racine du dépôt : `runbooks/xxx.yaml`.
- **`model:` se choisit par ticket, jamais par runbook.** Un runbook dont tous
  les tickets portent le même modèle est un signal d'alarme à l'écriture, pas une
  convention (règle du 2026-08-08). Le `check:` refuse un B multi-tickets à
  modèle unique.
- `codex_gate: true` sur **chaque** ticket — l'Owner a demandé une revue Codex à
  chaque étape.
- Tout `check:` emploie `"$HERMES_CHECK_PYTHON"` et lit `$HERMES_TICKET_FACTS`.
  Jamais `.venv/bin/python`, jamais un `*.state.json` rouvert à la main — le
  `check:` de ce ticket refuse les trois.
- Aucun `check:` ne fait confiance à un marqueur imprimé par la session. Prévois
  une sonde comportementale indépendante, comme celle de M-T1.
- `max_budget_usd` dimensionné sur le périmètre réel du ticket. Découpe plutôt
  que de gonfler.
- Si B est le dernier maillon, **n'invente pas de `chain:`** — un bloc absent est
  licite et déclenche le gate humain de fin de bloc.

Piège à éviter, déjà payé ailleurs : n'écris pas dans B un critère de GO du type
« aucun défaut CRITIQUE ni HAUTE ». C'est inatteignable et bloque le plan. Borne
le critère au modèle de menace du ticket.

## Étapes

- [ ] **1.** Lire le dossier de mémoire, produire le bloc des neuf métriques,
      les cinq rubriques et l'empreinte.
- [ ] **2.** Écrire `docs/plans/2026-08-20-m-constat-memoire.md` — sans aucun nom
      de fichier de mémoire.
- [ ] **3.** Écrire le runbook B et ses prompts sous `runbooks/tickets/`.
- [ ] **4.** Relire B contre ce que le `check:` va exiger. Il le **compile** avec
      `plan_runner --compile` : un `chain.require_codex_go` non litteral, un
      `generates_runbook` mal resolu, un `prompt_file` introuvable ou un graphe
      `consumes` mort le feront echouer. Relis aussi, a la main :

    - chaque ticket porte `model`, `effort`, `prompt_file` (present sous
      `runbooks/tickets/`), `check` et `codex_gate: true` ;
    - les modeles ne sont pas tous identiques si B a plus d'un ticket ;
    - chaque `check:` emploie `"$HERMES_CHECK_PYTHON"` et lit
      `$HERMES_TICKET_FACTS`, et aucun ne rouvre un `*.state.json`.

Il n'y a pas d'etape de commit : tu n'as pas Bash, et le `check:` lit les
fichiers du worktree, pas l'historique.

## Ce qui casse si tu te trompes

Un B écrit sur des suppositions automatise l'écriture de règles à partir de
verdicts — si le régime procédural est mal compris, la boucle écrasera des règles
au lieu de les versionner, et à grande vitesse. C'est pourquoi B vient **après**
M-T1. Et un nom de fichier privé recopié dans un dépôt git n'en ressort plus :
l'historique le garde même après suppression.
