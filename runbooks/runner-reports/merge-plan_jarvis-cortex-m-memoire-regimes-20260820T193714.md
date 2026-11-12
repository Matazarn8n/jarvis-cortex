# Rapport de merge — jarvis-cortex-m-memoire-regimes

- branche du plan : `plan/jarvis-cortex-m-memoire-regimes`
- cible d'intégration : `main` — provenance : défaut « main » — DEVINÉ, aucune cible déclarée
- base du diff : `22419eaf318960d8233ec91e3bca01f6a2364fad`
- dépôt : `/home/nuveo/jarvis-cortex-plan-m`
- généré : 2026-08-20T19:37:14.556951+00:00

## Commits du plan

```
f8fe8a4 chore(jarvis-cortex-m-memoire-regimes): travail du bloc — M-T0, M-T1, M-TGEN
7774de9 chore(jarvis-cortex-m-memoire-regimes): travail du bloc — M-T0, M-T1, M-TGEN
9ed149c chore(jarvis-cortex-m-memoire-regimes): travail du bloc — M-T0, M-T1, M-TGEN
63deb1f fix(B): retirer le marqueur de raccordement — un texte que la session peut ecrire
0e7ea7f chore(jarvis-cortex-m-memoire-regimes): travail du bloc — M-T0, M-T1, M-TGEN
dc707b7 chore(jarvis-cortex-m-memoire-regimes): travail du bloc — M-T0, M-T1, M-TGEN
dae726f chore(jarvis-cortex-m-memoire-regimes): travail du bloc — M-T0, M-T1, M-TGEN
6c206d7 releve du corpus de memoire 2026-08-20
7587f8b feat(M-T0): script de releve du corpus de memoire, hors session
7ac4621 chore(jarvis-cortex-m-memoire-regimes): travail du bloc — M-T1, M-TGEN
e51dcc6 docs(B-T0): contrat de sortie de la sonde — compteur sur stdout, echecs sur stderr
af8b91c fix(B): la non-regression de perimetre devenait un blocage le jour ou la dette est payee
6f19755 chore(jarvis-cortex-m-memoire-regimes): travail du bloc — M-T1, M-TGEN
6744866 chore(jarvis-cortex-m-memoire-regimes): travail du bloc — M-T1, M-TGEN
5f142e6 chore(jarvis-cortex-m-memoire-regimes): travail du bloc — M-T1, M-TGEN
fbce9bb chore(jarvis-cortex-m-memoire-regimes): travail du bloc — M-T1, M-TGEN
30d7007 chore(jarvis-cortex-m-memoire-regimes): travail du bloc — M-T1, M-TGEN
c9426d0 chore(jarvis-cortex-m-memoire-regimes): travail du bloc — M-T1, M-TGEN
ccd41dd plan: le runbook et ses prompts vivent dans le depot principal; ce worktree ne porte que le travail
bffcf0d fix(plan): repo hors ~/projects — un worktree la-bas casse validate_manifests
d997bfe plan(m): runbook + prompts, revue Codex par ticket
507f278 fix(brain): ne plus doubler le préfixe de type, et rendre le budget d'index exécutoire
```

## Fichiers touchés (commités)

```
.hermes/branch-claim.json
.hermes/branch-claim.lock
.hermes/session.lock
brain.js
docs/plans/2026-08-20-m-constat-memoire.md
docs/plans/2026-08-20-recu-memoire.txt
runbooks/handoff-2026-08-21-b-boucle-verdict-regle.runbook.yaml
runbooks/tickets/B-T0.md
runbooks/tickets/B-T1.md
runbooks/tickets/B-T2.md
runbooks/tickets/B-T3.md
runbooks/tickets/B-T4.md
scripts/releve-memoire.py
tests/test_store_regimes.mjs
```

## Travail NON COMMITÉ sur la branche

Rien — tout ce que le plan a produit est commité.

## Conflits potentiels avec la cible

Aucun conflit détecté par `git merge-tree` — le merge passerait tel quel.

## Intégration (geste EXPLICITE, jamais fait par le runner)

```bash
cd /home/nuveo/jarvis-cortex-plan-m
git checkout main
git merge --no-ff plan/jarvis-cortex-m-memoire-regimes
```

Le runner ne fusionne pas, ne rebase pas, ne supprime pas cette branche : elle reste la trace intégrale du plan, y compris en cas d'échec.
