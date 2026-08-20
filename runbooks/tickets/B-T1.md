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

Le `check:` de ce ticket **compte** les lignes `cas_ok=` que la sonde `contrat`
imprime : il en exige **sept** — un par cas de la matrice (les six verdicts du
domaine, ni plus ni moins) plus l'axe du document rédigé. Une matrice amputée
d'un verdict ne peut pas atteindre le seuil.

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
- **Point d'accroche documenté — et laissé au moteur.** L'endroit juste après
  `ts["verdict_motif"] = motif_verdict` (vers la ligne 7327) et avant le
  branchement sur `verdict` est le bon : à cet endroit le verdict est stable et
  recalibré, le rapport est complet, et `save_state` n'a pas encore été appelé.
  Aucun ticket de B ne pose cet appel : une session de plan **ne modifie jamais**
  un fichier de gouvernance du moteur. Le contrat consigne donc ce raccordement
  en **dette**, nommément, avec le nom de la fonction à appeler et sa signature ;
  B s'arrête au point d'entrée CLI livré par B-T4, que l'Owner branche ensuite.
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

   Le piège est de trancher trop court. L'égalité qui décide de s'abstenir porte
   sur **tout le contenu persistant** de la règle — au minimum `fait`, `why` et
   `type` — et pas sur le seul `fait`. Une règle dont la seule justification a
   changé **est** une révision : la déclarer inchangée la perd sans version ni
   trace, et le cas est fréquent puisqu'un même défaut se reconstate d'un gate à
   l'autre avec un motif reformulé. Énumère donc nommément les champs comparés,
   ceux qui sont exclus (horodatage, tout champ que le magasin regénère) et la
   normalisation appliquée des deux côtés — un espace de fin non normalisé
   suffit à empiler une version par rejeu, soit le défaut d'en face. B-T3
   implémente cette règle et la sonde `pont` l'exerce dans les deux sens.
5. **Le contenu.** Ce qui part dans le fait, ce qui part dans `--why`. Le fait
   doit rester lisible seul, des mois plus tard, sans le rapport d'origine.
6. **L'index `MEMORY.md`.** Le constat du bloc M mesure 328 fichiers sur 436
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
      "cles": ["<la cle exacte que ce rapport doit produire>"],
      "attendus": [{ "fait": "<fragment que le fait doit contenir>", "why": "<fragment que le why doit contenir>" }]
    },
    { "verdict": "GO", "rapport": "VERDICT: GO\nRAS", "regles": 0, "cles": [], "attendus": [] }
  ]
}
```

Règles de forme, toutes vérifiées par la sonde `contrat` de `ops/checks/sonde_b.py`
(livré par B-T0 — **lis-le**, il est écrit avant ton ticket et fait autorité sur
le format) :

- La racine porte **exactement** `derivation_slug` et `cas`.
- **Les six verdicts du domaine ont chacun leur cas, une fois et une seule** :
  `GO`, `GO_AVEC_RESERVES`, `NO_GO`, `NO_VERDICT`, `NO_REVIEWER`,
  `REVIEWER_DOWN`. Ni doublon, ni manquant, ni cas hors domaine — la sonde
  compare l'ensemble **et** la longueur. Rien n'est laissé implicite : c'est
  précisément sur les branches qu'on n'écrit pas qu'une implémentation se trompe
  sans qu'on le voie.
- Chaque cas porte **exactement** les clés `verdict`, `rapport`, `regles`,
  `cles`, `attendus`. Pas une de moins, pas une de plus.
- `regles` est le nombre **exact** de règles attendu. `cles` et `attendus` ont
  **toujours** la longueur `regles` — donc deux listes vides sur un cas à zéro.
  Un `cles` non vide sur un cas qui n'écrit rien est une contradiction, et la
  sonde la refuse.
- `attendus[i]` porte `fait` et `why` : les **fragments de texte** que la règle
  produite devra contenir. Ce n'est pas décoratif — la sonde `decision` vérifie
  chaque règle en entier, et une règle au bon compte mais au corps vide échoue
  là. C'est toi qui fixes ce que « la bonne règle » veut dire ; ne mets pas des
  fragments si génériques qu'ils passeraient sur n'importe quel texte.
- **Les deux sentinelles de panne sont à `0`**, quel que soit le rapport que tu
  leur donnes — et donne-leur un rapport chargé de findings, sinon le cas ne
  teste rien.
- `derivation_slug` mentionne `sha256`.
- Au moins un cas produit une règle. Une matrice tout à zéro passerait n'importe
  quelle implémentation muette : la sonde la refuse.

Prends `GO_AVEC_RESERVES` au sérieux. Un GO peut porter un défaut réel, et c'est
toi qui décides si la boucle écrit dans ce cas. Le chiffre que tu poses dans la
matrice devient la norme que B-T2 devra tenir.

Choisis les rapports d'exemple **fictifs et anodins** : `ops/x.py:12` et
compagnie. Ils sont commités.

## Ce que le check vérifiera

Le `check:` de ton ticket est un appel d'une ligne à la sonde `contrat` de
`ops/checks/sonde_b.py`. Sur le document : la présence littérale de
`verdict_motif`, `GO_AVEC_RESERVES`, `NO_VERDICT`, `REVIEWER_DOWN`, `brain.js`,
`sha256`, `idempotence`, `MEMORY.md` et `dette`, et l'absence de la formule
interdite. Sur la matrice : les règles de forme ci-dessus, toutes.

Ces ancres sont le plancher, pas le plafond : un document qui les contient sans
trancher les sept points ci-dessus passera le check et se fera refuser au gate
Codex.

## Fin — la commande finale et sa preuve observable

Commit atomique des deux livrables. Aucun secret, aucune donnée personnelle : ce
dépôt est public à l'échelle de l'équipe et git garde ce qu'on y met.

Termine ta session en lançant, depuis `/home/nuveo/hermes-os-plan-b`, la commande
qui rend la preuve — elle lit la matrice et rapporte des grandeurs, elle ne se
déclare pas vraie :

```bash
python3 -c 'import json;m=json.load(open("docs/plans/2026-08-21-b-contrat-injection.matrice.json"));print("cas="+str(len(m["cas"])),"regles="+str(sum(c["regles"] for c in m["cas"])),"productifs="+str([c["verdict"] for c in m["cas"] if c["regles"]]))'
```

Colle sa sortie dans ton message de fin. Six cas, au moins un productif, zéro sur
les deux sentinelles de panne : si un chiffre te surprend, c'est la matrice qui
est fausse, pas la commande.
