Le correctif reste insuffisant : plusieurs défauts du tour précédent demeurent, dont un faux vert structurel et un blocage certain.

### A. Fermeture

| Finding précédent | État | Preuve dans le diff |
|---|---|---|
| Sceau coécrit avec la sonde | **OUVERT** | `runbook.yaml:103-108` ne fait qu’augmenter le compteur à 35. Aucun hash indépendant, aucune comparaison de la sonde au `base_sha`, aucun contrôle d’un ensemble de noms d’axes uniques. |
| Racine arbitraire inexistante dans `brain.js` | **OUVERT** | **Aucune ligne du diff ne fournit cette API.** `B-T3.md:52-59` conserve le contrat impossible alors que `brain.js` n’offre toujours que son `SANDBOX` fixe. Le blocage certain reste plus coûteux ici. |
| `brain.js` externe inscriptible et non épinglé | **OUVERT** | **Aucune ligne du diff** n’ajoute son chemin/SHA à `requires_access` ni au check. Les nouvelles exigences de `B-T3.md:123-175` dépendent toujours d’un oracle externe mutable. |
| Marqueur fabricable dans les fichiers de gouvernance | **PARTIEL** | La comparaison octet à octet est bien demandée (`B-T0.md:381-383`, `B-T4.md:58-60`), mais `runbook.yaml:42` affirme encore que l’exception au marqueur subsiste, et les prompts conservent ensuite la route « avec marqueur, rend 0 » (`B-T0.md:394-402`, `B-T4.md:71-79`). Une session pressée reçoit deux contrats contradictoires. |
| Sept décisions non mécanisées | **FERMÉ** | Le bloc `decisions`, ses invariants et sa cohérence avec les six cas sont ajoutés dans `B-T0.md:115-146` et `B-T1.md:145-235`; les omissions et contradictions visées deviennent refusables mécaniquement. |
| Course entre deux gates sur `MEMORY.md` | **PARTIEL** | Verrou, remplacement atomique et test concurrent sont exigés (`B-T3.md:123-163`, `B-T0.md:225-259`). Mais la sonde exige seulement d’observer au moins un refus de verrou : elle ne prouve pas que celui-ci couvre réellement jusqu’au `os.replace()`. Un pont qui libère trop tôt peut passer si l’unique essai concurrent se sérialise. Ici, le faux vert avec perte d’index coûte plus que le durcissement supplémentaire. |
| Bornes `max_turns`/`timeout_minutes` absentes | **FERMÉ** | Les cinq tickets portent désormais des bornes explicites : `runbook.yaml:82-83,124-125,169-170,208-209,268-269`. |
| Pipeline final masquant l’autotest | **PARTIEL** | `set -o pipefail` est ajouté (`B-T0.md:478-487`) et l’affirmation « commande exacte du check » est corrigée (`494-500`). Mais le pipeline est suivi de `sha256sum` sans `&&` ni `set -e`; le statut final de la séquence peut donc encore être zéro après l’échec du pipeline. |
| Raccordement automatique absent — moteur | **PARTIEL, MOTEUR hors verdict** | Le mensonge de périmètre est corrigé : `runbook.yaml:11-17,55-58` dit clairement que rien n’est automatique à la livraison. Le raccordement après `verdict_motif` reste néanmoins absent et demeure une dette moteur. |
| Shell réel `/bin/sh`, checks POSIX | **FERMÉ / constat maintenu** | Les checks modifiés restent POSIX (`runbook.yaml:103-110,149-155,186-193,246-253,290-297`). Le seul `pipefail` ajouté est explicitement réservé au bloc manuel lancé sous Bash (`B-T0.md:487`). |

### B. Régression

INFO | diff complet `dae726f..HEAD` | Aucun défaut nouveau distinct n’est introduit : les défauts matériels observés sont des corrections incomplètes des findings précédents, pas de nouvelles régressions. | Corriger les findings encore OUVERTS/PARTIELS sans élargir le périmètre.

INFO | runbook.yaml:51,75-83,119-125,164-170,202-209,263-269 | Mécanique conforme : phase B, modèles/budgets/bornes explicites, `codex_gate: true` sur les cinq sessions; absence de `chain:` cohérente pour ce dernier maillon. | Aucun correctif.

VERDICT: NO_GO
