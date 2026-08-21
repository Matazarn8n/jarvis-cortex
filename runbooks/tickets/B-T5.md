DÉPÔT VISÉ : `/home/nuveo/hermes-os` — le moteur **gouverné**, pas le worktree
`/home/nuveo/hermes-os-plan-b` où B-T0 à B-T4 ont travaillé.

# Ticket B-T5 — Raccorder le moteur, à la main

**`kind: human`. Il n'y a pas de modèle, pas de session, pas de budget.** Ce
ticket est pour l'Owner. Il est le dernier du bloc, et c'est lui qui referme la
boucle : sans lui, B a livré quatre modules exerçables et aucun verdict de gate
n'écrit jamais de règle.

Il est un ticket et non une ligne de dette pour une raison mesurée : un plan dont
la dernière marche est un commentaire finit `done` sur une boucle ouverte, et
personne ne le voit. Ici, le plan ne peut pas conclure tant que ce geste n'a pas
été posé **et constaté**.

## Le geste

Dans `ops/plan_runner.py`, appeler `injecter_regles(...)` **juste après**
l'affectation de `ts["verdict_motif"]`, dans le chemin qui vient de recevoir le
verdict d'un gate Codex.

Repère l'ancre par son **nom**, `verdict_motif`, jamais par un numéro de ligne :
les numéros dérivent à chaque commit du moteur, et une mémoire antérieure en
portait un qui était déjà faux. Le contrôle de ce ticket cherche le nom, lui
aussi, et imprime les lignes qu'il trouve.

Trois exigences sur cet appel :

1. **Non bloquant.** `injecter_regles()` ne lève jamais — c'est son contrat, posé
   par B-T4 et exercé par la sonde. N'ajoute pas de `try` décoratif, mais ne
   compte pas non plus sur une exception pour t'avertir : l'échec se lit dans
   l'`etat` rendu, qui commence par `echec`. Journalise-le.
2. **Import tolérant au module absent.** Le moteur doit continuer à démarrer si
   `ops/verdict_hook.py` n'est pas là — le module vit dans le worktree de B tant
   que celui-ci n'est pas fusionné. Import paresseux dans le corps, ou `except
   ImportError` qui laisse passer.
3. **`racine=None`.** C'est la mémoire réelle. Ne passe pas de racine : la seule
   raison d'en passer une est un test, et un test ne s'écrit pas dans le moteur.

## Ce que le contrôle constate, et ce qu'il ne constate pas

Il ouvre `/home/nuveo/hermes-os/ops/plan_runner.py`, imprime le nombre de lignes,
les lignes portant `verdict_motif` et celles portant `injecter_regles`, et exige
qu'un appel tombe après une ancre. Il tombe sur le dépôt gouverné, où
`governed_files()` interdit l'écriture à toute session : aucune session du bloc
ne peut fabriquer cette observation, ce qui est exactement pourquoi elle est prise
là et pas dans le worktree.

Il ne constate **pas** qu'un verdict a réellement écrit une règle en production :
le moteur n'expose à aucun `check:` le moyen de l'observer, et la dette est
consignée en tête du runbook. Un appel posé dans une branche morte du fichier
passerait donc ce contrôle. La preuve de bout en bout est l'exécution suivante
d'un vrai gate — regarde le fichier `feedback_*` apparaître, et sa ligne dans
`MEMORY.md`.

## Avant de commiter

Vérifie que le fichier parse (`python -m py_compile ops/plan_runner.py`) et
qu'un `plan_runner` déjà lancé n'est pas en train de tourner : le raccordement
change un fichier de gouvernance, et un runner en vol l'a déjà chargé.
