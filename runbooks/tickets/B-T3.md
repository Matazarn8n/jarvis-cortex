RÉPERTOIRE DE TRAVAIL : `/home/nuveo/hermes-os-plan-b`. Tout chemin relatif s'y
résout, et tout fichier que tu produis doit y atterrir.

# Ticket B-T3 — Le pont vers `brain.js`, et la preuve que la réécriture versionne

**Modèle : `claude-opus-5` · effort : `high`.** C'est le ticket où la boucle
touche le disque, et où une erreur s'industrialise à la cadence des gates.

**Lis `docs/plans/2026-08-21-b-contrat-injection.md`** (fait foi) et la fonction
`regles_depuis_verdict()` livrée par B-T2, qui te fournit les règles à écrire.

## Les livrables

### 1. `ops/brain_bridge.py`

Le pont, isolé dans son propre module — pas noyé dans `plan_runner.py`.

Il expose exactement deux noms :

- **`BRAIN_JS`** — un `pathlib.Path` vers `brain.js`, **résolu**, pas deviné.
  Le dépôt jarvis-cortex n'est pas ce dépôt-ci ; le chemin canonique est à
  établir sur le disque, avec un secours par variable d'environnement. Consigne
  dans le module comment tu l'as résolu et ce qui se passe s'il est absent.
- **`ecrire_regle(regle: dict, *, sandbox: bool = False) -> None`** — écrit une
  règle via `node brain.js store ... --type feedback`. Avec `sandbox=True`, il
  passe `--sandbox` : `brain.js` écrit alors dans son `.cache/sandbox-memory`
  et **ne touche pas à la mémoire réelle**.

Le `--sandbox` n'est pas un confort de test : c'est ce qui rend ce ticket
vérifiable sans écrire dans la mémoire de l'Owner. Ne le contourne pas.

Points de vigilance, tous mécaniques :

- Le texte d'un finding vient d'un rapport Codex : il contient des guillemets,
  des retours à la ligne, des pipes. **Passe les arguments en liste à
  `subprocess`, jamais une chaîne de shell.** Ce n'est pas une contre-mesure
  anti-attaquant — c'est qu'un rapport quelconque casse une commande construite
  par concaténation, et une commande cassée écrit n'importe quoi.
- `brain.js store` sort en **code 1** avec `[brain] ...` sur stderr quand il
  refuse (cas `project` append-only). Traite l'échec, ne l'avale pas.
- Borne le temps d'exécution et remonte l'erreur. `_run_bounded()` (l. 2882) est
  la primitive existante ; réutilise-la si elle convient, sinon dis pourquoi.

### 2. Le branchement dans `ops/plan_runner.py`

À **`plan_runner.py:7327`**, juste après `ts["verdict_motif"] = motif_verdict`
et avant le branchement sur `verdict` : appeler `regles_depuis_verdict()` puis
`ecrire_regle()` pour chaque règle rendue.

**Un défaut d'écriture de règle ne doit jamais faire tomber un ticket.** La
boucle est un bénéfice, pas une dépendance : enveloppe l'appel, journalise
l'échec, laisse le gate suivre son cours. Un plan qui casse parce que la mémoire
n'a pas pu s'écrire serait une régression pire que l'oubli qu'on corrige.

## Le régime procédural — le point à ne pas rater

M-T1 a posé, dans `brain.js` (l. 190-206), que `--type feedback` **versionne** :
si le fichier existe, l'ancien contenu part dans `<base>.vN.md` avant d'être
remplacé. C'est exactement ce que B doit préserver. Une boucle qui écraserait au
lieu de versionner détruirait des règles à grande vitesse — c'est la raison pour
laquelle B vient après M-T1.

Ton travail est de **ne pas casser** ce régime : n'écris pas le fichier
toi-même, ne pré-supprime rien, ne passe pas `--force`. Laisse `brain.js` faire.

## Ce que le check fera

Il importe `ops/brain_bridge.py`, vérifie que `BRAIN_JS` **existe** sur le
disque, puis appelle `ecrire_regle(..., sandbox=True)` **deux fois** sur le même
slug, avec deux faits différents. Il exige ensuite :

- `feedback_sonde_b_t3.v1.md` présent — sinon la réécriture a écrasé ;
- `.v1.md` contient le **premier** fait — la version précédente est conservée ;
- `feedback_sonde_b_t3.md` contient le **second** — la réécriture a bien eu lieu.

C'est une sonde comportementale : elle exerce le pont réel, elle ne lit aucun
marqueur que ta session aurait imprimé.

## Modèle de menace — borné

La session est négligente ou opportuniste, pas un attaquant motivé. Pas de
contre-mesure contre une attaque délibérée ; pas de critère de GO du type
« aucun défaut CRITIQUE ni HAUTE », qui est inatteignable et bloque le plan.

## Fin

Commits atomiques (le pont, puis le branchement). Aucun secret, aucune donnée
personnelle, et **aucun contenu de la mémoire recopié dans le dépôt** : les
fichiers de règles portent des clients et des personnes, et git garde ce qu'on y
met même après suppression.
