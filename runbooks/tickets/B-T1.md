RÉPERTOIRE DE TRAVAIL : `/home/nuveo/hermes-os-plan-b`. Tout chemin relatif s'y
résout, et tout fichier que tu produis doit y atterrir.

# Ticket B-T1 — Le contrat d'injection : quel verdict écrit quelle règle

**Modèle : `claude-opus-5` · effort : `high`.** C'est une décision de contrat,
pas de l'implémentation : ce que tu écris ici sera lu comme une norme par B-T2,
par B-T3 et par l'audit. Un fait faux y devient une exigence.

Tu n'écris **aucun code** dans ce ticket. Un seul livrable :
`docs/plans/2026-08-21-b-contrat-injection.md`.

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
3. **Le slug.** Dérivation **déterministe** depuis le finding — le même défaut
   doit rendre le même slug à chaque tour, sinon un défaut récurrent crée N
   fichiers au lieu d'une règle versionnée. Le slug porte le préfixe
   `feedback_`. Attention : `brain.js` ne recolle pas le préfixe si le nom le
   porte déjà (brain.js:170-176).
4. **L'idempotence.** Un même gate rejoué (correction, re-tour) ne doit pas
   empiler une version par tentative. Dis à quelle condition on réécrit et à
   quelle condition on s'abstient. C'est le point le plus coûteux à rater : la
   boucle tourne vite.
5. **Le contenu.** Ce qui part dans le fait, ce qui part dans `--why`. Le fait
   doit rester lisible seul, des mois plus tard, sans le rapport d'origine.
6. **Ce que la boucle ne fera jamais.** Borne-la. Au minimum : elle n'efface
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

## Ce que le check vérifiera

Il lit ton document et exige d'y trouver, littéralement :
`plan_runner.py:7327`, `GO_AVEC_RESERVES`, `NO_VERDICT`, `REVIEWER_DOWN`,
`brain.js`, `slug`, `idempotence` — et l'absence de la formule interdite.

Ces ancres sont le plancher, pas le plafond : un document qui les contient sans
trancher les six points ci-dessus passera le check et se fera refuser au gate
Codex.

## Fin

Commit atomique du seul document. Aucun secret, aucune donnée personnelle : ce
dépôt est public à l'échelle de l'équipe et git garde ce qu'on y met.
