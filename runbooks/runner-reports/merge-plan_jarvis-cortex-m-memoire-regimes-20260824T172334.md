# Rapport de merge — jarvis-cortex-m-memoire-regimes

- branche du plan : `plan/jarvis-cortex-m-memoire-regimes`
- cible d'intégration : `main` — provenance : manifest.integration_branch
- base du diff : `22419eaf318960d8233ec91e3bca01f6a2364fad`
- dépôt : `/home/nuveo/jarvis-cortex-plan-m`
- généré : 2026-08-24T17:23:34.859082+00:00

## Commits du plan

```
1bf4d0a chore(jarvis-cortex-m-memoire-regimes): travail du bloc — M-T0, M-T1, M-TGEN
75e6e7d chore(B): seuil d'autotest 84 → 90 après le troisième tour de ré-audit
e0856dc chore(B): seuil 84, et le seuil `entree` remis sur sa mesure réelle (8 → 14)
f5c17d3 chore(B): seuils 83 et 14 après le ré-audit, et ré-épinglage du runbook
652f5a0 chore(B): seuil d'autotest à 77 dans les six `check:`, et ré-épinglage du runbook
7420f4a fix(brain): les deux régimes d'écriture perdaient un fait sous concurrence
7d6342a chore(jarvis-cortex-m-memoire-regimes): travail du bloc — M-T0, M-T1, M-TGEN
c851311 merge(main): rafraîchit la branche de plan — déclaration integration_branch
49ff737 chore(manifeste): déclarer main comme branche d'intégration
9a4397f fix(M): lever les 6 reserves de l'audit Codex a5
2413cc6 fix(M): corriger les 3 HAUTE de l'audit a4 du 2026-08-21
2160fa7 chore(jarvis-cortex-m-memoire-regimes): travail du bloc — M-T0, M-T1, M-TGEN
11a8cc3 chore(jarvis-cortex-m-memoire-regimes): travail du bloc — M-T0, M-T1, M-TGEN
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
_project.yaml
brain.js
docs/plans/2026-08-20-m-constat-memoire.md
docs/plans/2026-08-20-recu-memoire.txt
docs/plans/2026-08-21-recu-memoire.txt
runbooks/handoff-2026-08-21-b-boucle-verdict-regle.runbook.doctor.json
runbooks/handoff-2026-08-21-b-boucle-verdict-regle.runbook.livraison.json
runbooks/handoff-2026-08-21-b-boucle-verdict-regle.runbook.lock
runbooks/handoff-2026-08-21-b-boucle-verdict-regle.runbook.state.json
runbooks/handoff-2026-08-21-b-boucle-verdict-regle.runbook.yaml
runbooks/runner-reports/chain-handoff-2026-08-21-b-boucle-verdict-regle.runbook-20260821T153042.log
runbooks/runner-reports/codex-B-T0-a1-20260821T155042.md
runbooks/runner-reports/codex-B-T0-a2-20260821T161021.md
runbooks/runner-reports/codex-B-T0-a3-20260823T085446.md
runbooks/runner-reports/codex-B-T0-a4-20260824T112538.md
runbooks/runner-reports/codex-B-T0-a4-20260824T133202.md
runbooks/runner-reports/codex-B-T1-a1-20260821T162213.md
runbooks/runner-reports/codex-B-T1-a2-20260821T163403.md
runbooks/runner-reports/codex-B-T2-a1-20260821T163951.md
runbooks/runner-reports/codex-B-T2-a2-20260821T164723.md
runbooks/runner-reports/codex-B-T3-a1-20260821T172110.md
runbooks/runner-reports/codex-B-T3-a2-20260821T172940.md
runbooks/runner-reports/codex-B-T3-a3-20260823T090244.md
runbooks/runner-reports/codex-B-T3-a4-20260824T115554.md
runbooks/runner-reports/codex-B-T3-a4-20260824T132518.md
runbooks/runner-reports/codex-B-T4-a2-20260821T174117.md
runbooks/runner-reports/codex-B-T4-a3-20260823T091144.md
runbooks/runner-reports/codex-B-T4-a4-20260824T131140.md
runbooks/runner-reports/codex-B-T6-a1-20260822T174901.md
runbooks/runner-reports/codex-B-T6-a2-20260822T175109.md
runbooks/runner-reports/merge-plan_b-boucle-verdict-regle-2026-08-21-20260822T175139.md
runbooks/runner-reports/merge-plan_b-boucle-verdict-regle-2026-08-21-20260824T171349.md
runbooks/tickets/B-T0.md
runbooks/tickets/B-T1.md
runbooks/tickets/B-T2.md
runbooks/tickets/B-T3.md
runbooks/tickets/B-T4.md
runbooks/tickets/B-T5.md
runbooks/tickets/B-T6.md
runbooks/tickets/B-TM.md
scripts/releve-memoire.py
tests/test_store_concurrence.mjs
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
