### A. Fermeture

Application stricte de la règle demandée : une correction absente du diff reste `OUVERT`, même si elle avait été validée au tour précédent.

| Finding précédent | État | Preuve dans le diff |
|---|---|---|
| Sceau coécrit avec la sonde | **OUVERT** | [B-T0.md:503](/home/nuveo/jarvis-cortex-plan-m/runbooks/tickets/B-T0.md:503) continue de vérifier le sceau produit par la même session. Aucun hash indépendant ni ensemble exact d’axes n’est ajouté. |
| Racine arbitraire inexistante dans `brain.js` | **OUVERT** | Aucune ligne du diff ne corrige le contrat de `racine=<dossier>` ni ne fournit cette capacité à `brain.js`. |
| `brain.js` externe inscriptible et non épinglé | **PARTIEL** | Le chemin est désormais déclaré dans `requires_access` ([runbook:64](/home/nuveo/jarvis-cortex-plan-m/runbooks/handoff-2026-08-21-b-boucle-verdict-regle.runbook.yaml:64)) et comparé après résolution ([B-T0.md:181](/home/nuveo/jarvis-cortex-plan-m/runbooks/tickets/B-T0.md:181)). Mais son SHA est seulement imprimé, explicitement « comparé à rien » ([B-T0.md:191](/home/nuveo/jarvis-cortex-plan-m/runbooks/tickets/B-T0.md:191)); `requires_access` ne vérifie que l’existence et ne rend pas le fichier immuable. |
| Marqueur fabricable dans les fichiers de gouvernance | **FERMÉ** | La route « avec marqueur, rend 0 » est explicitement interdite dans [B-T0.md:424](/home/nuveo/jarvis-cortex-plan-m/runbooks/tickets/B-T0.md:424) et supprimée de B-T4 au profit d’un échec sans exception ([B-T4.md:71](/home/nuveo/jarvis-cortex-plan-m/runbooks/tickets/B-T4.md:71)). |
| Sept décisions non mécanisées | **OUVERT** | Aucune ligne du diff ne porte sur ce finding ; ouvert par la règle bornée imposée. |
| Course entre les deux gates sur `MEMORY.md` | **PARTIEL** | Le nouvel axe exige bien que le verrou couvre jusqu’au remplacement ([B-T0.md:276](/home/nuveo/jarvis-cortex-plan-m/runbooks/tickets/B-T0.md:276)), mais le diff ne relève pas le seuil réel de la sonde : l’axe peut être omis tout en conservant les onze anciens `cas_ok`. |
| Bornes `max_turns`/`timeout_minutes` absentes | **OUVERT** | Aucune ligne du diff ne porte sur ce finding ; ouvert par la règle bornée imposée. |
| Pipeline final masquant l’autotest | **FERMÉ** | Le pipeline et `sha256sum` sont maintenant reliés par `&&` ([B-T0.md:503](/home/nuveo/jarvis-cortex-plan-m/runbooks/tickets/B-T0.md:503)); avec `pipefail`, un autotest rouge ne peut plus être reverdi par le sceau. |
| Raccordement automatique absent | **OUVERT, MOTEUR hors verdict** | Aucune ligne du diff ne raccorde `injecter_regles` après `verdict_motif`. Cela demeure une modification du moteur/Owner, donc hors verdict générateur. |
| Shell réel `/bin/sh`, checks POSIX | **FERMÉ / constat maintenu** | Le seul `pipefail` modifié reste explicitement un bloc Bash ([B-T0.md:512](/home/nuveo/jarvis-cortex-plan-m/runbooks/tickets/B-T0.md:512)). Les cinq vrais checks passent l’analyse syntaxique `/bin/sh`; le moteur les exécute avec `shell=True` ([plan_runner.py:3231](/home/nuveo/hermes-os-plan-b/ops/plan_runner.py:3231)), tandis que le pré-vol emploie Bash ([plan_runner.py:889](/home/nuveo/hermes-os-plan-b/ops/plan_runner.py:889)). |

### B. Régression

HAUTE | [B-T0.md:185](/home/nuveo/jarvis-cortex-plan-m/runbooks/tickets/B-T0.md:185) | Le diff rend `--oracle` obligatoire et affirme que B‑T3 le passe, mais le check B‑T3 appelle toujours la sonde sans cet argument ([runbook:253](/home/nuveo/jarvis-cortex-plan-m/runbooks/handoff-2026-08-21-b-boucle-verdict-regle.runbook.yaml:253)). Une sonde correctement implémentée bloque donc certainement. Ici, le blocage coûte plus que l’assouplissement. | Ajouter `--oracle /home/nuveo/projects/jarvis-cortex/brain.js` au check B‑T3.

HAUTE | [B-T0.md:241](/home/nuveo/jarvis-cortex-plan-m/runbooks/tickets/B-T0.md:241) | Le diff ajoute deux axes à `pont` — oracle et couverture du verrou — mais conserve le seuil réel à 11 ([runbook:258](/home/nuveo/jarvis-cortex-plan-m/runbooks/handoff-2026-08-21-b-boucle-verdict-regle.runbook.yaml:258)). Il annonce aussi un autotest ≥37 ([B-T0.md:515](/home/nuveo/jarvis-cortex-plan-m/runbooks/tickets/B-T0.md:515)) alors que le check réel reste ≥35. Une session pressée peut conserver les anciennes sondes et verdir sans les nouvelles preuves. Ici, le faux vert est le risque le plus coûteux. | Porter les seuils YAML à `pont >= 13` et `autotest >= 37`, puis aligner commentaires et tableau.

BASSE | [runbook:43](/home/nuveo/jarvis-cortex-plan-m/runbooks/handoff-2026-08-21-b-boucle-verdict-regle.runbook.yaml:43) | Le nouveau commentaire affirme que le moteur n’expose pas de preuve antérieure à la session et que le raccordement restera rouge. Or le moteur fournit précisément `base_sha` dans `$HERMES_TICKET_FACTS` ([plan_runner.py:3097](/home/nuveo/hermes-os-plan-b/ops/plan_runner.py:3097)), comme l’expliquent correctement les nouveaux prompts. | Aligner le commentaire : une modification Owner déjà commitée avant le ticket entre dans son nouveau `base_sha`.

La mécanique générale reste cohérente : phase B, cinq sessions bornées, budgets explicites, `codex_gate: true` partout et absence licite de `chain:`. Le blocage certain de B‑T3 et le faux vert des seuils imposent néanmoins le refus.

VERDICT: NO_GO
