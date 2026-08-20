RÉPERTOIRE DE TRAVAIL : `/home/nuveo/hermes-os-plan-b`. Tout chemin relatif s'y
résout, et tout fichier que tu produis doit y atterrir.

# Ticket B-T4 — Le point d'entrée : `injecter_regles()`, sa CLI, et l'échec qui se voit

**Modèle : `claude-sonnet-5` · effort : `medium`.** Plomberie : la décision est
tranchée par B-T1, la fonction pure est livrée par B-T2, le pont par B-T3. Tu
les relies, tu n'en réécris aucun.

**Lis `docs/plans/2026-08-21-b-contrat-injection.md`.** Il fait foi.

## Le périmètre, avant tout le reste

Une session de plan **ne modifie jamais** un fichier de gouvernance du moteur —
ni `ops/plan_runner.py`, ni `ops/plan_doctor.py`, ni `ops/plan_factory.py`. Ce
ticket ne fait donc **pas** le raccordement dans le moteur : il livre un point
d'entrée autonome et exerçable, et le raccordement reste une **dette** consignée
par le contrat de B-T1, que l'Owner tranche ensuite.

Le check le vérifie dans les deux sens : ton module doit marcher seul, et le nom
`injecter_regles` doit rester **absent** de `ops/plan_runner.py`. Un diff qui
déborde échoue mécaniquement, avant même le gate.

## Le livrable — un module neuf, `ops/verdict_hook.py`

### 1. La fonction

```python
def injecter_regles(verdict: str, report: str, ts: dict, *, ecrire=None) -> None:
```

Elle appelle `regles_depuis_verdict(verdict, report)` (module
`ops/verdict_regles.py`, B-T2) puis, pour chaque règle rendue, l'écrivain —
`ecrire` s'il est fourni, sinon `brain_bridge.ecrire_regle` (B-T3), **importé
paresseusement dans le corps de la fonction**. Ce paramètre n'est pas une
commodité de test : c'est ce qui permet au `check:` d'exercer le chemin réel sans
écrire sur le disque de l'Owner, et ce qui évite qu'un `brain.js` absent fasse
échouer le simple chargement du module.

### 2. L'échec ne doit ni tomber, ni disparaître

**Un défaut d'écriture de règle ne doit jamais faire tomber un ticket.** La
boucle est un bénéfice, pas une dépendance : enveloppe l'appel à l'écrivain,
laisse le gate suivre son cours. Un plan qui casse parce que la mémoire n'a pas
pu s'écrire serait une régression pire que l'oubli qu'on corrige.

Mais **journaliser puis oublier ne suffit pas** : une ligne de log dans un
runner qui en produit des milliers n'est lue par personne, et une boucle
silencieusement morte se confond avec une boucle qui n'avait rien à écrire. Le
résultat de chaque règle atterrit donc dans le state du ticket, sous
`ts["regles_memoire"]` : une liste de `dict` portant au moins `slug` et `etat`.

- succès → l'`etat` rendu par le pont (`"ecrite"` ou `"inchangee"`) ;
- exception → un `etat` **commençant par `echec`**, suivi de la raison.

Rien à écrire (GO sans finding, panne de reviewer) → n'ajoute pas la clé, ou
laisse-la vide : une liste vide et une boucle cassée ne doivent pas se lire
pareil.

### 3. La ligne de commande

C'est elle qui rend le bloc utilisable sans toucher au moteur, et c'est elle qui
produit la preuve observable :

```
python3 ops/verdict_hook.py --verdict NO_GO --rapport <fichier|-> [--dry-run]
```

- `--rapport -` lit le rapport sur l'entrée standard ;
- `--dry-run` **n'écrit rien** : il passe un écrivain qui simule, et imprime une
  ligne par règle qui serait écrite, slug compris (`feedback_…`) ;
- sans `--dry-run`, l'écriture passe par le pont de B-T3 ;
- la sortie finale rapporte des grandeurs — nombre de règles, états — pas un
  « OK » constant ;
- code de retour 0 quand la décision a abouti, même si zéro règle en découle :
  « aucune règle à écrire » est un résultat, pas une panne.

Documente en tête du module, en trois lignes, comment le moteur s'y raccordera :
le nom de la fonction, sa signature, et l'endroit visé (juste après
`ts["verdict_motif"] = motif_verdict`, vers la ligne 7327). C'est la dette, elle
se lit là où elle sera payée.

## Ce que le check fera — sache-le avant d'écrire

Il importe `ops/verdict_hook.py` et **appelle** `injecter_regles` trois fois avec
son propre écrivain injecté :

1. un `NO_GO` portant une ligne `CRITIQUE`, écrivain qui réussit → exige
   **exactement 1** écriture et `ts["regles_memoire"] == [{... "etat": "ecrite"}]` ;
2. un `GO` sans finding → exige **aucune** entrée ;
3. le même `NO_GO`, écrivain qui **lève** → exige que l'appel **ne lève pas** et
   qu'une entrée porte un `etat` commençant par `echec`.

Puis il lance la CLI en sous-processus, `--dry-run`, rapport sur l'entrée
standard, et exige un code 0 et un `feedback_` dans la sortie réelle. Enfin il
lit `ops/plan_runner.py` et exige que `injecter_regles` n'y figure pas.

Le cas 2 est un test de mutation : un chemin qui écrit toujours échoue. Le cas 3
aussi : un `try/except: pass` échoue. Ne cherche pas à faire passer la sonde —
fais marcher le point d'entrée, la sonde suivra.

## Modèle de menace — borné

La session est négligente ou opportuniste, pas un attaquant motivé. Pas de
contre-mesure contre une attaque délibérée ; pas de critère de GO du type
« aucun défaut CRITIQUE ni HAUTE », qui est inatteignable et bloque le plan.

## Fin — la commande finale et sa preuve observable

Commit atomique du seul module. Aucun secret, aucune donnée personnelle : ce
dépôt est public à l'échelle de l'équipe et git garde ce qu'on y met.

Termine en lançant, depuis `/home/nuveo/hermes-os-plan-b`, la commande qui
exerce ton point d'entrée de bout en bout sans rien écrire :

```bash
printf 'VERDICT: NO_GO\nCRITIQUE | ops/x.py:12 | le verdict n%s ecrit aucune regle | cabler l appel\n' "'" \
  | python3 ops/verdict_hook.py --verdict NO_GO --rapport - --dry-run
```

Colle sa sortie dans ton message de fin : elle doit nommer au moins un slug
`feedback_…`. Rejoue-la avec `--verdict GO` sur un rapport vide et colle aussi
cette sortie — zéro règle. Les deux ensemble sont la preuve ; une seule ne prouve
que la moitié.
