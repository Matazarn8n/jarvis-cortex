RÉPERTOIRE DE TRAVAIL : `/home/nuveo/hermes-os-plan-b`. Tout chemin relatif s'y
résout, et tout fichier que tu produis doit y atterrir.

# Ticket B-T2 — `regles_depuis_verdict()` : la décision, pure et déterministe

**Modèle : `claude-sonnet-5` · effort : `medium`.** Plomberie : le contrat est
déjà tranché par B-T1, tu l'implémentes.

**Lis d'abord `docs/plans/2026-08-21-b-contrat-injection.md`.** Il fait foi. Si
ce prompt et le contrat divergent, le contrat gagne — et signale la divergence
dans ton message de commit.

## Le livrable — un module neuf, `ops/verdict_regles.py`

Une seule fonction publique :

```python
def regles_depuis_verdict(verdict: str, report: str) -> list[dict]:
```

Elle rend une liste de règles à écrire. Chaque règle est un `dict` portant
**exactement** quatre clés :

| clé     | contenu                                                              |
|---------|----------------------------------------------------------------------|
| `slug`  | `"feedback_" + sha256(cle)[:12]`, la clé étant tranchée par B-T1      |
| `fait`  | l'énoncé de la règle, non vide, lisible seul des mois plus tard       |
| `why`   | la raison, non vide — ce qui part dans `--why` de `brain.js`          |
| `type`  | la chaîne `"feedback"`, toujours                                     |

Ni clé en moins, ni clé en plus. La sonde `decision` vérifie **chaque règle en
entier**, pas seulement le compte : une règle bien comptée mais au corps vide
passait l'ancien contrôle et cassait au pont, une étape plus loin, dans un ticket
qui n'en était pas responsable. `fait` et `why` doivent en outre contenir les
fragments que la matrice annonce dans `attendus[i]`.

**Le module est neuf et autonome.** Il n'importe rien du moteur : ni
`ops/plan_runner.py`, ni `ops/plan_doctor.py`, ni `ops/plan_factory.py`, que ce
bloc **ne modifie jamais** et dont il ne dépend pas non plus. Une ligne de
finding tient en quatre champs séparés par des `|` —
`SEVERITE | fichier:ligne | problème | correctif` — et un `split("|", 3)` avec
`strip()` suffit. Un import du moteur rendrait ce module inchargeable seul, et
c'est précisément seul que le `check:` le charge.

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

Le slug porte le préfixe `feedback_`. `brain.js` ne le redouble pas s'il est
déjà là (brain.js:170-176) — c'est voulu, ne compense pas côté Python.

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

## Ce que le check fera — sache-le avant d'écrire

Le `check:` de ton ticket est un appel d'une ligne à la sonde `decision` de
`ops/checks/sonde_b.py`, livré par B-T0 — il est écrit **avant** ton module,
donc il n'a pas été taillé pour le laisser passer. Lis-le.

Il **importe** `ops/verdict_regles.py` par `importlib`, charge la matrice, et
**appelle** ta fonction une fois par cas — les six verdicts, pas trois. Pour
chaque cas il exige le nombre de règles annoncé, puis, règle par règle et dans
l'ordre :

- les quatre clés exactes, et `type == "feedback"` ;
- `fait` et `why` non vides ;
- `attendus[i]["fait"]` contenu dans `fait`, `attendus[i]["why"]` dans `why` ;
- `slug` égal à `"feedback_" + sha256(cles[i])[:12]`, **recalculé** par la sonde.

Les cas à zéro sont un test de mutation : un stub qui produit toujours une règle
échoue, et un contrôle qui ne sait pas dire non ne mesure rien. Le recalcul du
slug en est un second : une dérivation maison qui « marche » dans ton processus
mais ne reproduit pas le `sha256` du contrat échoue ici, et pas six mois plus
tard sur un dossier de mémoire dupliqué. La vérification du corps en est un
troisième : renvoyer le bon nombre de dictionnaires vides ne passe pas.

Le `check:` de ce ticket appelle la sonde avec `--module ops/verdict_regles.py`
et **compte** les lignes `cas_ok=` qu'elle imprime : il en exige **six**, une par
verdict du domaine réellement exercé. Une fonction qui n'en couvre que la moitié
n'atteint pas le seuil, même si tout ce qu'elle rend est juste.

Ne cherche pas à faire passer la sonde — fais marcher la fonction, la sonde
suivra. Si un chiffre de la matrice te paraît faux, **ne le contourne pas dans
le code** : le contrat fait foi, signale la divergence dans ton commit.

Le module doit rester **importable sans effet de bord** : aucun travail au
chargement, pas de lecture de fichier à l'import.

## Portée

Ce module, rien d'autre. Pas de pont vers `node` (c'est B-T3), pas de point
d'entrée en ligne de commande (c'est B-T4), et **aucune retouche** d'un fichier
de gouvernance du moteur — un diff qui déborde se fera refuser au gate.

## Fin — la commande finale et sa preuve observable

Commit atomique du seul module. Aucun secret, aucune donnée personnelle.

Termine en lançant, depuis `/home/nuveo/hermes-os-plan-b`, la commande qui exerce
ta fonction sur toute la matrice et rapporte ce qu'elle a produit :

```bash
python3 -c 'import importlib.util,json,pathlib;s=importlib.util.spec_from_file_location("vr",pathlib.Path("ops/verdict_regles.py").resolve());m=importlib.util.module_from_spec(s);s.loader.exec_module(m);mat=json.load(open("docs/plans/2026-08-21-b-contrat-injection.matrice.json"));print(" ".join(c["verdict"]+"="+str(len(m.regles_depuis_verdict(c["verdict"],c["rapport"])))+"/"+str(c["regles"]) for c in mat["cas"]))'
```

Colle sa sortie dans ton message de fin : six couples `obtenu/attendu`, tous
égaux. Un couple qui diverge est le vrai résultat de ta session — rapporte-le
tel quel plutôt que de le maquiller.
