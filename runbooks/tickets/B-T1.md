RÉPERTOIRE DE TRAVAIL : `/home/nuveo/hermes-os-plan-b`. Tout chemin relatif s'y
résout, et tout fichier que tu produis doit y atterrir.

# Ticket B-T1 — Le contrat d'injection : quel verdict écrit quelle règle

**Modèle : `claude-opus-5` · effort : `high`.** C'est une décision de contrat,
pas de l'implémentation : ce que tu écris ici sera lu comme une norme par B-T2,
par B-T3 et par l'audit. Un fait faux y devient une exigence.

Tu n'écris **aucun code** dans ce ticket. Deux livrables, le second étant la
forme exécutable du premier :

- `docs/plans/2026-08-21-b-contrat-injection.md` — le contrat rédigé ;
- `docs/plans/2026-08-21-b-contrat-injection.matrice.json` — la **matrice de
  verdicts**, machine-lisible, décrite en bas de ce prompt. C'est elle que le
  `check:` de B-T2 exécutera, verdict par verdict, sur l'implémentation.

## Le problème

`ops/plan_runner.py` fait passer chaque ticket par un gate Codex. Le gate rend un
verdict et un rapport de findings. Quand un défaut est réel, la règle qui devrait
en découler est écrite **à la main, après coup, si quelqu'un y pense** — et le
plus souvent personne n'y pense. B câble la réinjection automatique.

Le magasin de règles est `brain.js` (dépôt jarvis-cortex), commande
`node brain.js store "<fait>" --type feedback --name <slug> --why "<pourquoi>"`.
Depuis M-T1, `--type feedback` est au **régime procédural** : si le fichier
existe déjà, l'ancien contenu est copié dans `<base>.vN.md` **avant** d'être
remplacé. Rien n'est perdu, mais rien n'est fusionné non plus.

## L'état des lieux, déjà relevé — vérifie-le, ne le refais pas de zéro

- `VERDICT_RE` (l. 193) ; domaine des verdicts : `GO`, `GO_AVEC_RESERVES`,
  `NO_GO`, `NO_VERDICT`, plus deux sentinelles de **panne** qui ne viennent
  jamais du reviewer : `NO_REVIEWER` et `REVIEWER_DOWN`.
- `classer_findings(report)` (l. 4708) rend
  `{"critiques", "hautes", "mineures", "neutralises", "moteur"}`.
- Une ligne de finding a quatre champs :
  `SEVERITE | fichier:ligne | problème | correctif`.
- `verdict_recalibre()` (l. 4748) re-décide un `NO_GO` selon les comptes.
- **Point d'accroche retenu : `plan_runner.py:7327`**, juste après
  `ts["verdict_motif"] = motif_verdict` et avant le branchement sur `verdict`.
  À cet endroit le verdict est stable et recalibré, le rapport est complet, et
  `save_state` n'a pas encore été appelé.
- Le module ne shelle **jamais** vers `node` aujourd'hui : `_run_bounded()`
  (l. 2882) est la primitive `Popen` unique. Aucune constante ne désigne
  `brain.js` ni le magasin de mémoire — tout est à créer.

Ouvre le fichier et confirme ces points avant d'écrire. Si l'un est faux, c'est
ta trouvaille : consigne-la, elle prime sur ce prompt.

## Ce que le contrat doit trancher

1. **Le déclencheur.** Quels verdicts arment l'écriture, lesquels ne l'arment
   jamais. Traite explicitement `GO_AVEC_RESERVES` (un GO peut porter un défaut
   réel), `NO_VERDICT`, et les deux sentinelles de panne — une panne de reviewer
   n'est pas un défaut du code et ne doit produire **aucune** règle.
2. **Le filtre de sévérité.** Quelles familles méritent une règle. Une règle par
   `mineures`/`INFO` noierait la mémoire ; c'est le coût à arbitrer.
3. **Le slug.** La dérivation est **imposée**, tu ne la choisis pas :

   ```
   slug = "feedback_" + sha256(cle.encode("utf-8")).hexdigest()[:12]
   ```

   Elle est cryptographique et non pas « déterministe » au sens vague : le
   `hash()` de Python change d'un processus à l'autre (`PYTHONHASHSEED`), et un
   défaut récurrent créerait alors un fichier par session au lieu d'une règle
   versionnée. Le check de B-T2 recalcule le slug par `sha256` et refuse tout
   autre procédé.

   Ce que tu tranches, c'est la **clé** : quels champs du finding entrent dans
   `cle`, dans quel ordre, avec quelle normalisation (espaces, casse), et surtout
   **ce qui n'y entre pas** — un numéro de ligne qui bouge à chaque refactor
   ferait diverger le slug d'un défaut inchangé. Justifie ce choix : c'est la
   décision de conception de ce ticket.

   Le préfixe `feedback_` reste dans le slug ; `brain.js` ne le redouble pas
   s'il est déjà là (brain.js:170-176).
4. **L'idempotence.** Un même gate rejoué (correction, re-tour) ne doit pas
   empiler une version par tentative. Dis à quelle condition on réécrit et à
   quelle condition on s'abstient. C'est le point le plus coûteux à rater : la
   boucle tourne vite.
5. **Le contenu.** Ce qui part dans le fait, ce qui part dans `--why`. Le fait
   doit rester lisible seul, des mois plus tard, sans le rapport d'origine.
6. **L'index `MEMORY.md`.** Le constat du bloc M mesure 328 fichiers sur 432
   sans aucune ligne d'index : trois sur quatre ne sont atteignables que si l'on
   connaît déjà leur existence. Une règle que B écrit doit poser sa ligne
   d'index **au moment de l'écriture**, pas plus tard. `brain.js` l'appose déjà
   (l. 208-220), mais **en append-only** : dis explicitement combien de lignes
   une règle vaut, et ce qui se passe à la réécriture. C'est le même arbitrage
   que le point 4, vu depuis l'index.
7. **Ce que la boucle ne fera jamais.** Borne-la. Au minimum : elle n'efface
   rien, elle n'écrit pas hors du magasin, elle ne fusionne pas deux règles.

## Modèle de menace — borné

La session qui exécutera B est négligente ou opportuniste, **pas un attaquant
motivé**. N'écris aucune contre-mesure contre une attaque délibérée.

Le vrai risque de B est bête et mécanique : une boucle qui écrit vite et mal
écrase ou duplique des règles à la cadence des gates. C'est là que porte le
contrat, nulle part ailleurs.

**Interdit :** un critère de GO du type « aucun défaut CRITIQUE ni HAUTE ». Il
est inatteignable, il bloque le plan, et le `check:` de ce ticket refuse le
document s'il contient cette formule.

## Le second livrable — la matrice de verdicts

Un contrat que personne n'exécute se contredit en silence. Le tien devient un
jeu d'épreuves : `docs/plans/2026-08-21-b-contrat-injection.matrice.json`.

```json
{
  "derivation_slug": "feedback_ + sha256(cle)[:12]  — cle = <ce que tu tranches au point 3>",
  "cas": [
    {
      "verdict": "NO_GO",
      "rapport": "VERDICT: NO_GO\nCRITIQUE | ops/x.py:12 | le verdict n'ecrit aucune regle | cabler l'appel",
      "regles": 1,
      "cles": ["<la cle exacte que ce rapport doit produire>"]
    },
    { "verdict": "GO", "rapport": "VERDICT: GO\nRAS", "regles": 0 }
  ]
}
```

Règles de forme, toutes vérifiées par le check :

- **Les six verdicts du domaine ont chacun leur cas** : `GO`,
  `GO_AVEC_RESERVES`, `NO_GO`, `NO_VERDICT`, `NO_REVIEWER`, `REVIEWER_DOWN`.
  Rien n'est laissé implicite — c'est précisément sur les branches qu'on
  n'écrit pas qu'une implémentation se trompe sans qu'on le voie.
- `regles` est le nombre **exact** de règles attendu ; `cles` porte une clé par
  règle attendue, dans l'ordre, et n'apparaît que si `regles > 0`.
- **Les deux sentinelles de panne sont à `0`**, quel que soit le rapport que tu
  leur donnes — et donne-leur un rapport chargé de findings, sinon le cas ne
  teste rien.
- `derivation_slug` mentionne `sha256`.
- Au moins un cas produit une règle. Une matrice tout à zéro passerait n'importe
  quelle implémentation muette : le check la refuse.

Prends `GO_AVEC_RESERVES` au sérieux. Un GO peut porter un défaut réel, et c'est
toi qui décides si la boucle écrit dans ce cas. Le chiffre que tu poses dans la
matrice devient la norme que B-T2 devra tenir.

Choisis les rapports d'exemple **fictifs et anodins** : `ops/x.py:12` et
compagnie. Ils sont commités.

## Ce que le check vérifiera

Sur le document : la présence littérale de `plan_runner.py:7327`,
`GO_AVEC_RESERVES`, `NO_VERDICT`, `REVIEWER_DOWN`, `brain.js`, `sha256`,
`idempotence`, `MEMORY.md`, et l'absence de la formule interdite. Sur la
matrice : les règles de forme ci-dessus.

Ces ancres sont le plancher, pas le plafond : un document qui les contient sans
trancher les sept points ci-dessus passera le check et se fera refuser au gate
Codex.

## Fin

Commit atomique des deux livrables. Aucun secret, aucune donnée personnelle : ce
dépôt est public à l'échelle de l'équipe et git garde ce qu'on y met.
