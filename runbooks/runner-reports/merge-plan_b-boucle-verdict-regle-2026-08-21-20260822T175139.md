# Rapport de merge — b-boucle-verdict-regle-2026-08-21

- branche du plan : `plan/b-boucle-verdict-regle-2026-08-21`
- cible d'intégration : `main` — provenance : manifest.integration_branch
- base du diff : `d6116f6fe9b98ca526eebac2fa801f359fcea7b7`
- dépôt : `/home/nuveo/hermes-os-plan-b`
- généré : 2026-08-22T17:51:39.657035+00:00

## Commits du plan

```
f0a5ff4 docs(b-t6): constat du raccordement — cinq axes verts, appelé après ancre.
f4fa618 docs(b-t6): constat du raccordement — cinq axes verts, appelé après ancre.
99eaed7 fix(checks): sonde_b lit base_sha ou le moteur l'ecrit, pas ou l'autotest le fixe
1a3e458 feat(verdict): verdict_hook — injecter_regles, sa CLI, et l'echec qui se voit
4be2969 fix(pont): un succes se verifie, un type s'impose, un lien ne se suit pas
fa8c750 feat(pont): brain_bridge — versionner, indexer une fois, ne rien empiler
6e15e4b chore(b-boucle-verdict-regle-2026-08-21): travail du bloc — B-T0, B-T1, B-T2, B-TM, B-T3, B-T4, B-T5, B-T6
ddbe195 feat(verdict): regles_depuis_verdict — la decision, pure et deterministe
01a62b7 fix(contrat): NO_VERDICT est une conclusion, la revision est un procede, et les assertions partielles sont nommees
7a4f7eb feat(contrat): le contrat d'injection et sa matrice de verdicts
ce75a1f fix(checks): sonde_b mord sur l'appel mort, la matrice arbitraire et le marqueur constant
46f4cf1 feat(checks): sonde_b, le verificateur des cinq tickets du bloc B
```

## Fichiers touchés (commités)

```
docs/plans/2026-08-21-b-contrat-injection.matrice.json
docs/plans/2026-08-21-b-contrat-injection.md
docs/plans/2026-08-21-b-raccordement-constate.md
ops/brain_bridge.py
ops/checks/sonde_b.py
ops/checks/sonde_b.sha256
ops/verdict_hook.py
ops/verdict_regles.py
tests/test_verdict_regles.py
```

## Travail NON COMMITÉ sur la branche

Rien — tout ce que le plan a produit est commité.

## Conflits potentiels avec la cible

Aucun conflit détecté par `git merge-tree` — le merge passerait tel quel.

## Intégration (geste EXPLICITE, jamais fait par le runner)

```bash
cd /home/nuveo/hermes-os-plan-b
git checkout main
git merge --no-ff plan/b-boucle-verdict-regle-2026-08-21
```

Le runner ne fusionne pas, ne rebase pas, ne supprime pas cette branche : elle reste la trace intégrale du plan, y compris en cas d'échec.
