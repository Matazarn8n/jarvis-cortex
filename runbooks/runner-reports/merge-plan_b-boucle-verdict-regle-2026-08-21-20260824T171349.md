# Rapport de merge — b-boucle-verdict-regle-2026-08-21

- branche du plan : `plan/b-boucle-verdict-regle-2026-08-21`
- cible d'intégration : `main` — provenance : manifest.integration_branch
- base du diff : `d6116f6fe9b98ca526eebac2fa801f359fcea7b7`
- dépôt : `/home/nuveo/hermes-os-plan-b`
- généré : 2026-08-24T17:13:49.071385+00:00

## Commits du plan

```
50ad5c6 merge: rafraîchir sur main après la consolidation du 2026-08-24 (branch_stale)
5b3d856 Merge PR #26 — consolidation hermes-os du 2026-08-24 (2/2)
3e2c0fa Merge pull request #25 from Matazarn8n/fix/decompose-repli-audible
7f4018d Merge pull request #23 from Matazarn8n/fix/builder-cible-et-sortie
e45132c merge: sonde de sante et decoupage F2-T1 dans la consolidation du 2026-08-24
4708610 fix(kiosque): un plan declare en chemin ABSOLU redevient visible, et garde sa cle
6dc8aef fix(f2): decouper F2-T1 en quatre tickets — le format echouait, pas le modele
84b23cd feat(ops): sonde de sante des runbooks — un plan casse ne reste pas casse en silence
196b385 fix(builder): le repli du décomposeur cesse d'être muet et de passer pour une convergence
91a8d6f merge: plan/b-boucle-verdict-regle-2026-08-21 dans la consolidation du 2026-08-24
8d80bdf merge: plan/hermes-os-h1-gateway-source-2026-08-13 dans la consolidation du 2026-08-24
9123b33 merge: content/exemplaires-juillet-2026-08-21 dans la consolidation du 2026-08-24
c495ba5 merge: content/visuel-autonome-2026-08-21 dans la consolidation du 2026-08-24
b6fec50 merge: content/blacklist-redirection-pro-2026-08-23 dans la consolidation du 2026-08-24
6be1ee6 Merge PR #20 — consolidation hermes-os du 2026-08-24
af3339c feat(builder): répertoire de sortie configurable, nettoyé contre la traversée
3d7a482 fix(builder): la chaîne idée réelle -> PR n'avait jamais tourné une seule fois
bd10379 chore(_project): declare the S4A runbook as pending — visible, not armed
7e93479 merge: fiabilite-0820 (H2-1..H2-6, dashboard) dans la consolidation du 2026-08-24
229a190 docs: handoffs, inventaire routage, registre d'arbitrage aligne, runbook A1 resynchronise
20db31a chore(rapports): fiches de plan et pages de lignee regenerees par plan_doctor
3e4ab88 feat(content): revue Slack interactive, etage visuel autonome et pont CDP
7e5d015 docs: handoff B — trois tours de ré-audit, et le registre rempli par ailleurs
a18a766 fix(B): quatre trous de la sonde, dont trois qui prolongeaient mes propres correctifs
0588b99 fix(boucle B): l'oracle épinglé prime, et un index en double se dégonfle au rejeu
3e50050 chore(app-radar): sortir le projet du monorepo, il a son dépôt
a50eb94 feat(builder): répertoire de sortie configurable, nettoyé contre la traversée
2723c88 fix(builder): la chaîne idée réelle -> PR n'avait jamais tourné une seule fois
bb4ff2f fix(app-radar): brief de construction dégraissé, budget d'horloge du dispatch
bd92bda chore(_project): arm G and F2 — Owner decision of 2026-08-24
565620a fix(chain): a machine arbiter must not re-arm a generator over a hand-fixed file
47b432c fix(app-radar): le pouce ne lançait aucune construction — json.loads sur du jsonb
04f045e feat(merge): un plan qui ne peut RIEN exhiber ne se solde pas tout seul (L5)
c6dc93d fix(B): la sonde `entree` exige un écrivain au résultat contractuel
f9de71d fix(boucle B): un résultat d'écrivain hors contrat est un échec, pas un succès
bd2db5b Merge pull request #19 from Matazarn8n/fix/armement-maillon-et-reprise-2026-08-22
8461fc9 fix(app-radar): signaler une cohorte de pairs trop étroite pour le percentile
92bf9e5 fix: les deux findings de l'audit Codex, plus le piège de chemin qui allait coûter une session
f7b3e49 feat(app-radar): prospection Apple, correction store en dur, code mort supprimé
afb10fb Merge pull request #18 from Matazarn8n/fix/armement-maillon-et-reprise-2026-08-22
7d577b8 fix(dashboard): the probe index must lead with started_at, not job_id
3c7855f perf(dashboard): the kiosk probe loop stops costing a third of a worker
c6f7fe3 feat(fiche): la page de lignée — la portée du RUNBOOK COMPLET, pas du maillon
b15c545 feat(fiche): un plan soldé exhibe sa preuve de livraison, figée et cliquable
107ef2c fix(chaîne): un livrable généré corrigé à la main ne se réécrit pas tout seul
f853051 fix(B): les six réserves du ré-audit qui visent la sonde, et les trois du pont
d4c3059 fix(boucle B): les trois réserves du ré-audit qui visent le code qui tourne
ba3e124 chore(_project): armer A1 — chemin ABSOLU, verdict NO_GO passé outre et consigné
da36fe7 Merge pull request #17 from Matazarn8n/fix/armement-maillon-et-reprise-2026-08-22
18b935d fix(phase-4): the five Codex findings on the S4A runbook, each reproduced first
68e5a01 feat(check): distinguer « je ne peux pas mesurer » de « je refuse »
ec320cc feat(phase-4): chain the deletion phase, starting where it can actually run
b496d6d Merge pull request #16 from Matazarn8n/docs/registre-arbitrage-b-2026-08-23
546fa76 docs(arbitrage): inscrire les douze empreintes de B, chacune avec sa preuve
81fbc2d fix(chaîne): un arbitre machine ne signe plus une dépense de gate de chaîne
8e52084 fix(gate-arbiter): the orphan reclassification must survive the early returns
47c1702 fix(hermes-core): keep the caller's transaction, free orphaned reservations, lock the arbitration queue, stop swallowing real SQLite failures
30423b8 fix(plan-runner): a vanished gate no longer kills the runner, an unknown severity no longer passes, and spending is capped in the engine
a18217b Merge pull request #15 from Matazarn8n/fix/armement-maillon-et-reprise-2026-08-22
3ff399c feat(app-radar): ajout du projet app-radar sur main
91dbef7 fix(h4): le gate terminal n'annonce plus que rien ne le suit
0bbf1f5 fix(merge_report): un chemin déclaré écrit mais ABSENT n'est pas un livrable égaré
885175a fix(B): fermer les quatre dernières réserves HAUTE dans le dépôt AUDITÉ
8926eeb fix(boucle B): refuser le lien AVANT `_prepare_runtime`, et prouver `--verdict`
4780c0d fix(kiosque): un `chain_state` FIGÉ ne réclame plus un geste au mauvais plan
61dc81b feat(h3-t2): le maillon H4 que la ligne CAUSE autorise — une clôture, pas un correctif
f240d7a fix(outreach): charger le .env racine et écrire l'Agent_Log dans la base unique
2ec6123 test(sonde_b): les deux pièges d'appel que le ticket croyait déjà posés
ed6d688 docs(h3-t1): le constat de gain du cache — 996/1327 hits, plafond atteint
8d31e0f fix(sonde_b): exiger les deux ensembles doctrinaux à l'exact, pas en sous-ensemble
36fdfb7 Merge pull request #14 from Matazarn8n/fix/armement-maillon-et-reprise-2026-08-22
a3d39b4 fix(content): généralise la blacklist redirection-pro (formule qui varie)
68094fd fix(sonde_b): fermer les deux trous du contrôle de raccordement
6a47f62 chore(manifeste): solder les deux dettes de déclaration de runbook
246155f fix(boucle B): fermer les quatre réserves HAUTE du code qui tourne
3ac717b fix(h3): les gates terminaux annonçaient que rien ne suit — le juge l'exige maintenant
9774cd9 chore(chaine): resynchroniser h3-gain-cache (gate de fin de bloc herite)
782d799 fix(h3): la graphie canonique annoncee etait accentuee, le juge exige l ASCII
7eab081 chore(chaine): resynchroniser h3-gain-cache (graphie ASCII du fragment gouverne)
37a14e0 chore(chaine): resynchroniser la copie de h3-gain-cache apres le correctif de l'amorce
466d9bb fix(h3): l'amorce disait « Un tap le fait » — le juge l'atteste maintenant
a7e5051 fix(H2-3): retirer claude-fable-5 du défaut d'arbitrage moteur
a3e38f6 docs(arbitrage): trancher les 24 réserves de M et B — 8 arbitrées, 16 à corriger
0e004ed fix(chaine): réconcilier les deux copies de h3-gain-cache — H3 ne pouvait pas s'armer
02cfea0 fix(h2/h3): arbitrage Owner rendu, et le gate de déploiement redit les gestes
7f481a6 fix(verdict_hook): un pont absent ne fait plus tomber le ticket
04abd8d feat(B-T5): installer les modules de la boucle verdict → règle, et la raccorder
ab9dea9 fix(arbitre): rendre codex joignable, et cesser de promettre un arbitrage
1f1b191 feat(reprise): une TROISIÈME issue — constater qu'un ticket coupé a livré
f0a5ff4 docs(b-t6): constat du raccordement — cinq axes verts, appelé après ancre.
f4fa618 docs(b-t6): constat du raccordement — cinq axes verts, appelé après ancre.
7875765 feat(chaine): armer le maillon suivant dans `runbooks:`, en une transaction
c5bd4b0 fix(kiosque): un refus de merge FIGÉ ne dit plus « à solder »
b7a173a docs(arbitrage): les deux réserves de r-recette, vérifiées sur l'export réel
2e3ee05 merge: kiosque par catégories + maillon actif (#13)
0eefb7a fix(h2-tgen): le juge de H3 verdissait sur un H4 que le moteur refuse
33a8329 feat(content): le générateur vise la campagne Ondaya de juillet, pas ses propres brouillons
66b34ae fix(h2-tgen): H3 imposait a H4 un remede que rien n avait mesure
99eaed7 fix(checks): sonde_b lit base_sha ou le moteur l'ecrit, pas ou l'autotest le fixe
1a3e458 feat(verdict): verdict_hook — injecter_regles, sa CLI, et l'echec qui se voit
4be2969 fix(pont): un succes se verifie, un type s'impose, un lien ne se suit pas
fa8c750 feat(pont): brain_bridge — versionner, indexer une fois, ne rien empiler
2bfe7e8 feat(kiosque): nommer le journal ACTIF d'un plan
38c8297 feat(kiosque): dire QUI tranche un gate, au lieu de trois boutons identiques
34d554f fix(kiosque): le filtre serveur devient opt-in, et les onglets ont un style
bb29a28 fix(chaine): rendre l'arbitre machine atteignable, et voir le travail du parent
1adaca4 fix(content): une clé R2 par tour, pas par brouillon
96becd3 fix(content): l'attente n'est pas un échec, et le bandeau tient en deux temps
6e15e4b chore(b-boucle-verdict-regle-2026-08-21): travail du bloc — B-T0, B-T1, B-T2, B-TM, B-T3, B-T4, B-T5, B-T6
426ed96 feat(content): l'étage visuel se passe du navigateur piloté à la main
db5811b fix(h2-tgen): le juge exigeait de H4 un controle absent de son monde vert
ddbe195 feat(verdict): regles_depuis_verdict — la decision, pure et deterministe
01a62b7 fix(contrat): NO_VERDICT est une conclusion, la revision est un procede, et les assertions partielles sont nommees
0af4609 fix(h2-tgen): l effet du correctif de H4 n etait atteste par rien
7a4f7eb feat(contrat): le contrat d'injection et sa matrice de verdicts
17c6e9c feat(kiosque): une tuile = un maillon actif, et quatre catégories filtrables
ce75a1f fix(checks): sonde_b mord sur l'appel mort, la matrice arbitraire et le marqueur constant
a51e6eb fix(h2-tgen): l epreuve comportementale de H4-T1 etait verte sans correctif
46f4cf1 feat(checks): sonde_b, le verificateur des cinq tickets du bloc B
```

## Fichiers touchés (commités)

```
.claude/handoff-2026-08-21-airtable-reorg-prompt.md
.gitignore
_project.yaml
dashboard/src/kiosk/KioskApp.tsx
dashboard/src/kiosk/kiosk.css
dashboard/src/lib/api.ts
dashboard_api.py
docs/ops/2026-08-08-inventaire-routage-llm.md
docs/ops/2026-08-14-arbitrage-objections-codex.md
docs/ops/rapports/a1-router-section.html
docs/ops/rapports/b-boucle-verdict-regle-2026-08-21.html
docs/ops/rapports/chaine-h1-gateway-source.html
docs/ops/rapports/chaine-m-memoire-regimes.html
docs/ops/rapports/demo.html
docs/ops/rapports/h1-gateway-source.html
docs/ops/rapports/h3-gain-cache.html
docs/ops/rapports/hermes-os-h2-cache-exact.html
docs/ops/rapports/index.html
docs/ops/rapports/jarvis-android-p0p1.html
docs/ops/rapports/m-memoire-regimes.html
docs/ops/rapports/p4-conductor-board.html
docs/ops/rapports/r-recette-site.html
docs/ops/rapports/r1-investigator.html
docs/ops/rapports/veille.html
docs/plans/2026-08-21-b-contrat-injection.matrice.json
docs/plans/2026-08-21-b-contrat-injection.md
docs/plans/2026-08-21-b-raccordement-constate.md
docs/plans/2026-08-22-h3-gain-cache.md
docs/plans/handoff-2026-08-03-hermes-os-opportunity-installation-reelle.md
docs/plans/handoff-2026-08-23-hermes-os-reserves-boucle-b.md
docs/plans/handoff-2026-08-23-hermes-os-solder-b-quatre-reserves.md
docs/plans/handoff-2026-08-24-hermes-os-solder-b-trois-tours-de-reaudit.md
docs/plans/plan-2026-08-13-headroom-emplacement-et-objectif.md
domains/builder/agents/decompose_worker.py
domains/builder/agents/verify_worker.py
domains/builder/build_loop.py
domains/content/agent.py
domains/content/exemplaires.json
domains/content/higgsfield_web.py
domains/content/portes.py
domains/content/visuel.py
domains/opportunity/integration_report.py
domains/outreach/config/.env.example
domains/outreach/config/settings.py
domains/outreach/skills/airtable.py
hermes_core/agents/base.py
hermes_core/cdp.py
hermes_core/db/schema.py
hermes_core/loop.py
hermes_core/permission_gate.py
hermes_core/task_grades.py
ops/arbitration_triage.py
ops/brain_bridge.py
ops/checks/sonde_b.py
ops/checks/sonde_b.sha256
ops/content_revue_slack.py
ops/gate_arbiter.py
ops/oauth_health.py
ops/plan_doctor.py
ops/plan_factory.py
ops/plan_report.py
ops/plan_runner.py
ops/sante_runbooks.py
ops/slack_socket_listener.py
ops/systemd/hermes-sante-runbooks.service
ops/systemd/hermes-sante-runbooks.timer
ops/systemd/hermes-slack-listener.service
ops/verdict_hook.py
ops/verdict_regles.py
pyproject.toml
runbooks/codex-waivers.md
runbooks/fixtures/H3-T2.sh
runbooks/handoff-2026-08-10-p3-roster-unifie.runbook.yaml
runbooks/handoff-2026-08-11-e-zero-qui-ment.runbook.yaml
runbooks/handoff-2026-08-11-f1-garde-fraicheur.runbook.yaml
runbooks/handoff-2026-08-12-f-disjoncteur-et-perimetre.runbook.yaml
runbooks/handoff-2026-08-12-f2-gate-fin-et-merge.runbook.yaml
runbooks/handoff-2026-08-14-c-merge-approbation.runbook.yaml
runbooks/handoff-2026-08-14-g-pose-ou-cloture.runbook.yaml
runbooks/handoff-2026-08-14-h2-gateway-rafales.runbook.yaml
runbooks/handoff-2026-08-20-a1-router-section.runbook.yaml
runbooks/handoff-2026-08-20-r1-investigator.runbook.yaml
runbooks/handoff-2026-08-22-h3-gain-cache.runbook.yaml
runbooks/handoff-2026-08-23-s4a-hermes-domains-suppression.runbook.yaml
runbooks/handoff-2026-08-25-h4-suite-cache.runbook.yaml
runbooks/tickets/A-TGEN-generer-b.md
runbooks/tickets/B-TGEN-generer-c.md
runbooks/tickets/E-TGEN-maillon-f.md
runbooks/tickets/F-TGEN-maillon-g.md
runbooks/tickets/F1-TGEN-generer-f2.md
runbooks/tickets/F2-T1-spec-primitive-et-patch.md
runbooks/tickets/F2-T1a-spec-et-patch.md
runbooks/tickets/F2-T1b-applicateur-a-ancres.md
runbooks/tickets/F2-T1c-echafaudage-amorce-et-integre.md
runbooks/tickets/F2-T1d-sonde-du-gate-de-merge.md
runbooks/tickets/H1-TGEN-ecrire-h2.md
runbooks/tickets/P3-TGEN-generer-p4.md
runbooks/tickets/P4-TGEN-generer-p4b.md
runbooks/tickets/S4A-T1-mort-certain.md
runbooks/tickets/S4A-T2-une-fonction-pas-une-abstraction.md
runbooks/tickets/S4A-TGEN-maillon-growth-os.md
scripts/check_h3.py
tests/conftest.py
tests/test_arbitration_queue_atomic.py
tests/test_brain_bridge.py
tests/test_build_fix_cycle.py
tests/test_build_loop.py
tests/test_build_workers.py
tests/test_chain_arming.py
tests/test_chain_autonomy.py
tests/test_chain_gate_approbation_machine.py
tests/test_check_contract_missing.py
tests/test_dashboard_probe_cost.py
tests/test_garde_fraicheur.py
tests/test_gate_arbiter.py
tests/test_gate_disparu.py
tests/test_loop.py
tests/test_origin_guard_mutations.py
tests/test_plan_doctor.py
tests/test_plan_doctor_merge.py
tests/test_plan_report.py
tests/test_plan_runner.py
tests/test_plan_runner_api.py
tests/test_runbooks_declared.py
tests/test_task_grades.py
tests/test_verdict_hook.py
tests/test_verdict_recalibre.py
tests/test_verdict_regles.py
tests/test_visuel.py
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
