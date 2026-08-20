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

**Elle est déterministe, au sens cryptographique.** Le slug est imposé par le
contrat :

```python
slug = "feedback_" + hashlib.sha256(cle.encode("utf-8")).hexdigest()[:12]
```

La composition de `cle` est tranchée par B-T1 — applique-la, ne la réinvente pas.
N'utilise **pas** `hash()` : il est salé par processus (`PYTHONHASHSEED`), donc
un défaut récurrent créerait un fichier par session au lieu d'une règle
versionnée, et le check recalcule le slug par `sha256` de toute façon. Aucun
horodatage, aucun aléa, aucun compteur global.

## Le comportement attendu

Il est **entièrement écrit** dans `2026-08-21-b-contrat-injection.matrice.json`,
livré par B-T1 : un cas par verdict du domaine, avec le nombre exact de règles
attendu et la clé de chacune. Lis ce fichier en premier — c'est à la fois la
spécification et le jeu d'épreuves.

En résumé de ce qu'il fixe :

- Verdict portant un défaut retenu par le contrat → une règle par défaut retenu.
- Verdict `GO` sans finding → **liste vide**.
- Sentinelles de panne (`NO_REVIEWER`, `REVIEWER_DOWN`) → **liste vide**, quel
  que soit le contenu du rapport. Une panne de reviewer n'est pas un défaut du
  code, et la matrice te donne exprès des rapports chargés sur ces deux cas.
- `GO_AVEC_RESERVES` et `NO_VERDICT` ne sont pas des cas d'école : ce sont les
  deux branches où une implémentation se trompe sans que ça se voie. Le chiffre
  posé par la matrice fait foi, même s'il te surprend.

Réutilise ce qui existe : `classer_findings()` (l. 4708) sait déjà découper le
rapport par famille de sévérité, et une ligne de finding a quatre champs
`SEVERITE | fichier:ligne | problème | correctif`. N'écris pas un second
parseur.

Le slug porte le préfixe `feedback_`. `brain.js` ne le redouble pas s'il est
déjà là (brain.js:170-176) — c'est voulu, ne compense pas côté Python.

## Ce que le check fera — sache-le avant d'écrire

Il **importe** `ops/plan_runner.py`, charge la matrice, et **appelle** ta
fonction une fois par cas — les six verdicts, pas trois. Pour chaque cas il
exige le nombre de règles annoncé ; et pour chaque règle attendue, il recalcule
`"feedback_" + sha256(cle)[:12]` depuis la clé de la matrice et exige ce slug
**exactement**.

Les cas à zéro sont un test de mutation : un stub qui produit toujours une règle
échoue, et un contrôle qui ne sait pas dire non ne mesure rien. Le recalcul du
slug en est un second : une dérivation maison qui « marche » dans ton processus
mais ne reproduit pas le `sha256` du contrat échoue ici, et pas six mois plus
tard sur un dossier de mémoire dupliqué.

Ne cherche pas à faire passer la sonde — fais marcher la fonction, la sonde
suivra. Si un chiffre de la matrice te paraît faux, **ne le contourne pas dans
le code** : le contrat fait foi, signale la divergence dans ton commit.

Le module doit rester **importable sans effet de bord** : le `check:` charge
`plan_runner.py` par `importlib`. Si ton ajout déclenche du travail à l'import,
le check meurt sur l'outillage et pas sur ton code.

## Portée

N'ajoute que cette fonction. Pas de pont vers `node` (c'est B-T3), pas d'appel
depuis `process_session_ticket` (c'est B-T4). Un diff qui déborde se fera
refuser au gate.

Commit atomique. Aucun secret, aucune donnée personnelle.
