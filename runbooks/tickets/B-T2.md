RÉPERTOIRE DE TRAVAIL : `/home/nuveo/hermes-os-plan-b`. Tout chemin relatif s'y
résout, et tout fichier que tu produis doit y atterrir.

# Ticket B-T2 — `regles_depuis_verdict()` : la décision, pure et déterministe

**Modèle : `claude-sonnet-5` · effort : `medium`.** Plomberie : le contrat est
déjà tranché par B-T1, tu l'implémentes.

**Lis d'abord `docs/plans/2026-08-21-b-contrat-injection.md`.** Il fait foi. Si
ce prompt et le contrat divergent, le contrat gagne — et signale la divergence
dans ton message de commit.

## Le livrable

Une seule fonction, ajoutée à `ops/plan_runner.py` :

```python
def regles_depuis_verdict(verdict: str, report: str) -> list[dict]:
```

Elle rend une liste de règles à écrire. Chaque règle est un `dict` portant au
moins `slug`, `fait`, `why`.

**Elle est pure.** Elle n'écrit rien, ne lit aucun fichier, ne lance aucun
sous-processus, ne touche pas au `state`. L'écriture est le travail de B-T3.
C'est ce qui rend la sonde du `check:` possible : on peut l'appeler cent fois
sans effet de bord.

**Elle est déterministe.** La même entrée rend la même sortie, slug compris.
Aucun horodatage, aucun aléa, aucun compteur global dans le slug — sinon un
défaut récurrent crée un fichier par tour au lieu d'une règle versionnée.

## Le comportement attendu

- Verdict portant un défaut retenu par le contrat → une règle par défaut retenu.
- Verdict `GO` sans finding → **liste vide**.
- Sentinelles de panne (`NO_REVIEWER`, `REVIEWER_DOWN`) → **liste vide**, quel
  que soit le contenu du rapport. Une panne de reviewer n'est pas un défaut du
  code.
- Le filtre de sévérité et le traitement de `GO_AVEC_RESERVES` / `NO_VERDICT`
  suivent le contrat.

Réutilise ce qui existe : `classer_findings()` (l. 4708) sait déjà découper le
rapport par famille de sévérité, et une ligne de finding a quatre champs
`SEVERITE | fichier:ligne | problème | correctif`. N'écris pas un second
parseur.

Le slug porte le préfixe `feedback_`. `brain.js` ne le redouble pas s'il est
déjà là (brain.js:170-176) — c'est voulu, ne compense pas côté Python.

## Ce que le check fera — sache-le avant d'écrire

Il **importe** `ops/plan_runner.py` et **appelle** ta fonction trois fois :

1. sur un `NO_GO` portant une ligne `CRITIQUE` → exige **exactement 1** règle ;
2. sur un `GO` sans finding → exige **0** ;
3. sur `REVIEWER_DOWN` → exige **0**.

Puis il rappelle (1) et exige **le même slug**, et que ce slug commence par
`feedback_`.

Les cas 2 et 3 sont un test de mutation : un stub qui produit toujours une règle
échoue, et un contrôle qui ne sait pas dire non ne mesure rien. Ne cherche pas à
faire passer la sonde — fais marcher la fonction, la sonde suivra.

Le module doit rester **importable sans effet de bord** : le `check:` charge
`plan_runner.py` par `importlib`. Si ton ajout déclenche du travail à l'import,
le check meurt sur l'outillage et pas sur ton code.

## Portée

N'ajoute que cette fonction. Pas de pont vers `node` (c'est B-T3), pas d'appel
depuis `process_session_ticket` (c'est B-T4). Un diff qui déborde se fera
refuser au gate.

Commit atomique. Aucun secret, aucune donnée personnelle.
