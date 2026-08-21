RÉPERTOIRE DE TRAVAIL : `/home/nuveo/hermes-os-plan-b`. Tout chemin relatif s'y
résout, et tout fichier que tu produis doit y atterrir.

DÉPÔT OBSERVÉ : `/home/nuveo/hermes-os` — le moteur **gouverné**, en **lecture
seule**. Tu n'y écris rien, et `governed_files()` te l'interdirait de toute façon.

# Ticket B-T6 — Constater le raccordement, sur le dépôt gouverné

**Modèle : `claude-haiku-4-5` · effort : `low`.** C'est un lookup et une note
courte. Toute la substance est dans le `check:`, et le `check:` ne te lit pas.

## Pourquoi ce ticket existe

B-T5 est un ticket `kind: human` : l'Owner y installe les trois modules dans
`/home/nuveo/hermes-os` puis y pose l'appel à `injecter_regles`. Le runner ferme
un ticket humain sur **approbation** et **n'exécute pas** son `check:`. Sans toi,
un clic finissait donc le plan `done` sur une boucle restée ouverte — exactement
le défaut que B-T5 prétendait fermer, déplacé d'un cran.

Ton ticket est une session, donc son `check:` tourne pour de bon. Et il tombe sur
un dépôt où **aucune session ne peut écrire** : ce qu'il y constate, le bloc ne
peut pas se l'être donné.

## Ce que tu fais

Rien qui puisse influencer le verdict, et c'est voulu.

1. Lance la sonde toi-même, telle que le `check:` la lancera :

   ```bash
   python3 ops/checks/sonde_b.py raccordement --facts '{}' \
     --sceau ops/checks/sonde_b.sha256 --moteur /home/nuveo/hermes-os
   ```

   (Le `check:`, lui, appelle `"$HERMES_CHECK_PYTHON"` et passe
   `--facts "$HERMES_TICKET_FACTS"`. Même substance, habillage plus commode.)

2. Écris `docs/plans/2026-08-21-b-raccordement-constate.md` : **colle la sortie
   réelle de la sonde**, puis quelques lignes de lecture — ce qui est raccordé,
   ce qui reste hors de portée d'un contrôle, ce qu'il faudra regarder au
   prochain gate réel.

Ce document est une **note de constat**, pas une attestation. Le `check:` ne le
lit pas et ne lui fait aucune confiance : il refait l'observation lui-même. Si tu
étais tenté d'y écrire « raccordement vérifié » sans avoir lancé la sonde, sache
que ça ne servirait à rien — et que le gate Codex le verrait.

## Si la sonde rouge

**C'est le résultat utile de ta session, pas un contretemps.** Rapporte-le tel
quel, en nommant l'axe qui a manqué :

- `modules:presents` — l'Owner a posé l'appel sans installer les trois modules
  (geste 1 de B-T5). Le hook est inerte : le moteur journalise un `ImportError` à
  chaque gate et rien d'autre ne se passe.
- `appel:apres_ancre` — le nom `injecter_regles` figure dans le fichier, mais
  aucun nœud `ast.Call` ne le porte après l'affectation de `ts["verdict_motif"]`.
  Un import, un commentaire ou une chaîne de caractères ne sont pas un appel.
- `invocation:dry_run` — les modules sont là mais cassés à l'import, ou le point
  d'entrée sort non nul.

**Ne « répare » rien toi-même.** Le geste est celui de l'Owner, sur un dépôt où
tu n'as pas le droit d'écrire. Ton travail s'arrête au constat, et il vaut mieux
un ticket rouge qui nomme l'axe manquant qu'un ticket vert obtenu de biais.

## Ce que ce ticket ne prouve pas

Qu'un verdict réel ait écrit une règle en production. Le moteur n'expose à aucun
`check:` le moyen de l'observer — dette consignée en tête du runbook. Un appel
posé dans une branche morte franchirait les cinq axes. Écris-le dans ta note :
la preuve de bout en bout est l'exécution suivante d'un vrai gate, où l'on
regarde le fichier `feedback_*` apparaître et sa ligne dans `MEMORY.md`.

## Modèle de menace — borné

La session est négligente ou opportuniste, pas un attaquant motivé. Pas de
contre-mesure contre une attaque délibérée ; pas de critère de GO du type
« aucun défaut CRITIQUE ni HAUTE », qui est inatteignable et bloque le plan.

## Fin — la commande finale et sa preuve observable

Commit atomique de la seule note. Aucun secret, aucune donnée personnelle : ce
dépôt est public à l'échelle de l'équipe et git garde ce qu'on y met. En
particulier, la sortie que tu colles vient d'un moteur, pas d'un dossier de
mémoire — vérifie qu'elle ne porte ni chemin personnel inattendu, ni contenu de
règle.

Termine en relançant la commande du point 1 et en collant sa sortie dans ton
message de fin. Elle doit lister **cinq** lignes `cas_ok=` et finir sur sa ligne
de compteurs.
