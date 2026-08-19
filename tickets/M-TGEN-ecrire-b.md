# M-TGEN — Constater l'état réel de la mémoire, puis écrire le maillon B

**Modèle : `claude-opus-5` · effort : `high`.** Choix d'architecture du
programme, pas de l'implémentation.

Tu travailles dans `/home/nuveo/projects/jarvis-cortex-plan-m`. Ne merge pas, ne pousse pas.

## Pourquoi ce ticket existe

M-T1 a posé les régimes d'écriture pour l'**avenir**. Il ne dit rien de ce que les
431 fichiers déjà écrits contiennent de contradictoire avec ces régimes. Or le
maillon suivant — B, la boucle « verdict de gate → règle » — écrira des fichiers
`feedback` au régime procédural défini en M-T1. Le écrire à l'aveugle, sans savoir
combien de règles existantes n'ont pas d'historique ni combien d'événements ont
déjà été écrasés, produirait un plan qui suppose au lieu de mesurer.

Un maillon qui finirait sans écrire son successeur finirait `done` **muet** —
c'est le défaut consigné le 2026-08-10 (8 runbooks sur 11 sans `chain:`, et une
phase P2 jamais écrite après G3).

## Partie 1 — Le constat

Écris `docs/plans/2026-08-20-m-constat-memoire.md`. Il doit répondre, chiffres à
l'appui, en lisant réellement
`/home/nuveo/.claude/projects/-home-nuveo/memory/*.md` :

1. **Répartition par `metadata.type`** — combien de `user`, `feedback`, `project`,
   `reference`, et combien de fichiers sans `type` exploitable.
2. **Combien de `feedback` (procédural) portent déjà une trace de révision** — une
   mention « mis à jour », « RÉVOQUÉE », « CORRECTION », une seconde date. Ces
   fichiers ont été révisés à la main, sans version conservée : ils sont la preuve
   que le régime procédural manquait.
3. **Combien de `project` portent plusieurs dates** dans leur corps — signe d'un
   événement réécrit plutôt qu'ajouté, donc d'écrasement épisodique déjà subi.
4. **L'index `MEMORY.md`** — combien de lignes, combien pointent vers un fichier
   qui n'existe plus, combien de fichiers n'ont aucune ligne d'index.
5. **Ce qu'une migration coûterait**, si elle vaut le coup, et pourquoi. Une
   recommandation « ne rien migrer » est une réponse valide si les chiffres la
   soutiennent — ne fabrique pas un chantier.

Le `check:` du ticket vérifie que ce document **cite au moins trois noms de
fichiers réellement présents** dans le dossier de mémoire. Des noms plausibles ne
passeront pas.

## Partie 2 — Écrire le runbook B

Écris `runbooks/handoff-2026-08-21-b-boucle-verdict-regle.runbook.yaml`.

**Objet de B :** aujourd'hui les gates Codex rendent des verdicts et les fichiers
de règles (`feedback_*.md`) sont écrits **à la main, après coup**. B câble la
réinjection : un verdict de gate qui révèle un défaut écrit lui-même sa règle via
`brain.js store --type feedback`, donc au régime procédural versionné posé en
M-T1. C'est la seule idée du lot Instagram qui attaque la faiblesse déjà
identifiée du chaînage.

Contraintes de forme, non négociables — le moteur refuse le runbook sinon :

- `phase: "B"`.
- `repo:` = un worktree dédié de `/home/nuveo/hermes-os` (le code des gates y
  vit), pas ce dépôt-ci. Nomme-le et donne la commande `git worktree add` dans le
  constat.
- Chaque ticket `kind: session` porte `model:` **explicite**, `effort:`,
  `prompt_file:` et `check:`.
- **`model:` se choisit par ticket, jamais par runbook.** Un runbook dont tous les
  tickets portent le même modèle est un signal d'alarme à l'écriture, pas une
  convention (règle du 2026-08-08). Le `check:` de ce ticket refuse un B
  multi-tickets à modèle unique.
- `codex_gate: true` sur **chaque** ticket — l'Owner a demandé une revue Codex à
  chaque étape.
- Tout `check:` emploie `"$HERMES_CHECK_PYTHON"` et lit les faits du moteur dans
  `$HERMES_TICKET_FACTS`. Jamais `.venv/bin/python`, jamais un `*.state.json`
  rouvert à la main.
- Aucun `check:` ne fait confiance à un marqueur imprimé par la session. Prévois
  une preuve de mutation comme celle de M-T1.
- `max_budget_usd` dimensionné sur le périmètre réel du ticket, pas sur
  l'importance du sujet. Découpe plutôt que de gonfler.
- Si B est le dernier maillon, **n'invente pas de `chain:`** — un bloc `chain:`
  absent est licite et déclenche le gate humain de fin de bloc. Si B appelle un
  successeur, alors `chain:` complet avec `generator_ticket` et
  `require_codex_go: true` littéral.

Piège à éviter, déjà payé ailleurs : n'écris pas dans B un critère de GO du type
« aucun défaut CRITIQUE ni HAUTE ». C'est inatteignable et bloque le plan. Borne
le critère au modèle de menace du ticket et laisse le reste se déclarer au gate.

## Étapes

- [ ] **1.** Lire réellement le dossier de mémoire et produire les cinq chiffres.
- [ ] **2.** Écrire `docs/plans/2026-08-20-m-constat-memoire.md`.
- [ ] **3.** Écrire le runbook B et ses `prompt_file` sous `tickets/`.
- [ ] **4.** Valider la forme du runbook produit :

```bash
"$HERMES_CHECK_PYTHON" -c "import yaml;d=yaml.safe_load(open('runbooks/handoff-2026-08-21-b-boucle-verdict-regle.runbook.yaml',encoding='utf-8'));print(d['phase'],len(d['tickets']),{t['model'] for t in d['tickets']})"
```

- [ ] **5. Commit**

```bash
git add docs/plans/2026-08-20-m-constat-memoire.md runbooks/ tickets/
git commit -m "docs(m): constat sur les 431 fichiers de memoire + runbook B"
```

## Ce qui casse si tu te trompes

Un B écrit sur des suppositions automatise l'écriture de règles à partir de
verdicts — si le régime procédural est mal compris, la boucle écrasera des règles
au lieu de les versionner, et à grande vitesse. C'est précisément pourquoi B vient
**après** M-T1 et pas avant.
