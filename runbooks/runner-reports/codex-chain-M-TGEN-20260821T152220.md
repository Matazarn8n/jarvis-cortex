## A. Fermeture

Je traite les quatre findings formellement émis au tour précédent.

OUVERT — HAUTE | [B-T0.md:574](/home/nuveo/jarvis-cortex-plan-m/runbooks/tickets/B-T0.md:574) | Le cas négatif « `bb.BRAIN_JS` différent de `--oracle` » manque toujours. Le seuil passe à 42 grâce aux six cas de `raccordement`, pas grâce au piège demandé sur l’oracle. Une sonde qui accepte l’argument sans le comparer peut encore verdir. | Ajouter ce piège explicite et porter le seuil à 43.

OUVERT — MOTEUR | [B-TM.md:7](/home/nuveo/jarvis-cortex-plan-m/runbooks/tickets/B-TM.md:7) | Le correctif continue de dépendre du `brain.js` externe par son seul chemin, sans empreinte antérieure fournie par le moteur. Le ticket humain fusionne M-T1 mais n’établit pas une frontière de confiance contre une modification ultérieure. | Faire figer par le runner le SHA des `requires_access` ou monter l’oracle en lecture seule.

PARTIEL — MOTEUR | [B-T5.md:56](/home/nuveo/jarvis-cortex-plan-m/runbooks/tickets/B-T5.md:56) | Le raccordement n’est plus une dette muette : B‑T5 prescrit l’édition du moteur et B‑T6 en contrôle la structure. Mais le correctif exige précisément une modification d’`ops/plan_runner.py`, et le diff reconnaît qu’aucun verdict réel n’est exercé de bout en bout ([runbook:69](/home/nuveo/jarvis-cortex-plan-m/runbooks/handoff-2026-08-21-b-boucle-verdict-regle.runbook.yaml:69)). Selon la règle imposée, le générateur ne peut pas fermer ce finding moteur. | Poser le raccordement côté Owner/moteur, puis exercer un vrai gate sous un runner redémarré.

FERMÉ — HAUTE | [runbook:253](/home/nuveo/jarvis-cortex-plan-m/runbooks/handoff-2026-08-21-b-boucle-verdict-regle.runbook.yaml:253) | Le blocage certain dû à l’oracle canonique sans M‑T1 est maintenant traité par B‑TM, placé avant B‑T3 via `depends_on` ([runbook:289](/home/nuveo/jarvis-cortex-plan-m/runbooks/handoff-2026-08-21-b-boucle-verdict-regle.runbook.yaml:289)). Le contrôle humain est comportemental et B‑T3 revalide ensuite `.v1`; une simple approbation de B‑TM ne suffit donc pas à verdir. | Aucun correctif supplémentaire sur ce finding.

## B. Régressions

HAUTE | [B-T0.md:443](/home/nuveo/jarvis-cortex-plan-m/runbooks/tickets/B-T0.md:443) | La nouvelle sonde admet explicitement qu’un appel placé dans une branche morte passe. Plus réaliste encore, l’Owner peut placer l’appel après un retour ou sous la mauvaise condition : AST, fonction, ordre et arguments sont corrects, mais aucun verdict utile ne l’exécute. Le contrôle verdit sans boucle réelle; ici le faux vert coûte davantage qu’un contrôle structurel plus strict. | Exiger que l’import tolérant et l’appel soient dans le bloc exécutable directement rattaché à l’affectation de `ts["verdict_motif"]`, ou exercer ce chemin dans une copie isolée du moteur.

HAUTE | [B-T0.md:574](/home/nuveo/jarvis-cortex-plan-m/runbooks/tickets/B-T0.md:574) | Les cinq pièges de `raccordement` ne couvrent ni le receveur `cs` au lieu de `ts`, ni une autre fonction porteuse, ni la mauvaise arité, ni `foo, bar, baz`, ni l’absence de liaison/import d’`injecter_regles`. Une implémentation pressée peut conserver une sonde AST plus faible et atteindre exactement les 42 cas exigés. | Ajouter un piège négatif pour chacune de ces contraintes, tester aussi la liaison de l’import, puis augmenter tous les seuils d’autotest.

INFO | [B-T0.md:395](/home/nuveo/jarvis-cortex-plan-m/runbooks/tickets/B-T0.md:395) | Les sous-processus sont prescrits avec le binaire littéral `python`, y compris le dry-run à [B-T0.md:437](/home/nuveo/jarvis-cortex-plan-m/runbooks/tickets/B-T0.md:437). Sur cette machine, `/usr/bin/python` n’existe pas et la résolution tombe sur un Python utilisateur. Son remplacement serait une fabrication volontaire de binaire, donc INFO sous le modèle borné. | Imposer `sys.executable`, hérité du lancement par `$HERMES_CHECK_PYTHON`, pour tous les sous-processus Python.

MOTEUR | [B-T6.md:20](/home/nuveo/jarvis-cortex-plan-m/runbooks/tickets/B-T6.md:20) | L’affirmation « aucune session ne peut fabriquer » est trop forte : la session ne peut effectivement pas écrire `/home/nuveo/hermes-os` sous `bwrap`, mais son `sonde_b.py` est ensuite exécuté par `run_check()` hors de ce bac. Le script produit par B‑T0 possède alors les droits du runner sur le moteur gouverné. | Exécuter les checks dans un bac en lecture seule ou fournir au check une sonde de confiance épinglée hors du dépôt du plan.

Les checks passent tous `sh -n` et `bash -n`. Les six tickets `kind: session` ont modèle, budget, tours, timeout explicites et `codex_gate: true`. La phase est bien B, les dépendances nouvelles sont valides et l’absence de `chain:` est cohérente.

VERDICT: NO_GO
