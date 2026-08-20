RÉPERTOIRE DE TRAVAIL : `/home/nuveo/hermes-os-plan-b`. Tout chemin relatif s'y
résout, et tout fichier que tu produis doit y atterrir.

# Ticket B-T4 — Le branchement : l'appel à 7327, et l'échec qui se voit

**Modèle : `claude-sonnet-5` · effort : `medium`.** Plomberie : la décision est
tranchée par B-T1, la fonction pure est livrée par B-T2, le pont par B-T3. Tu
les relies, tu n'en réécris aucun.

**Lis `docs/plans/2026-08-21-b-contrat-injection.md`.** Il fait foi.

## Le livrable

Une fonction ajoutée à `ops/plan_runner.py`, et son appel :

```python
def injecter_regles(verdict: str, report: str, ts: dict, *, ecrire=None) -> None:
```

Elle appelle `regles_depuis_verdict(verdict, report)` (B-T2) puis, pour chaque
règle rendue, l'écrivain — `ecrire` s'il est fourni, sinon
`brain_bridge.ecrire_regle` (B-T3), **importé paresseusement dans le corps de la
fonction**. Ce paramètre n'est pas une commodité de test : c'est ce qui permet
au `check:` d'exercer le branchement réel sans écrire sur le disque de l'Owner,
et c'est ce qui évite d'ajouter un import de `brain_bridge` au chargement du
module — le check de B-T2 charge `plan_runner.py` par `importlib` et mourrait sur
l'outillage si l'import de tête échouait.

### Le point d'accroche

À **`plan_runner.py:7327`**, juste après `ts["verdict_motif"] = motif_verdict`
et avant le branchement sur `verdict`. À cet endroit le verdict est stable et
recalibré, le rapport est complet, et `save_state` n'a pas encore été appelé.

Un seul appel, à cet endroit. Le check lit la source autour de
`ts["verdict_motif"] = motif_verdict` et exige d'y trouver `injecter_regles(` :
définir la fonction sans la brancher ne passe pas.

### L'échec ne doit ni tomber, ni disparaître

**Un défaut d'écriture de règle ne doit jamais faire tomber un ticket.** La
boucle est un bénéfice, pas une dépendance : enveloppe l'appel, laisse le gate
suivre son cours. Un plan qui casse parce que la mémoire n'a pas pu s'écrire
serait une régression pire que l'oubli qu'on corrige.

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

## Portée

N'ajoute que cette fonction et son appel. Ne retouche ni `regles_depuis_verdict`
ni `brain_bridge` : s'ils sont faux, dis-le dans ton message de commit, ne les
corrige pas ici. Un diff qui déborde se fera refuser au gate.

## Ce que le check fera — sache-le avant d'écrire

Il importe `ops/plan_runner.py` et **appelle** `injecter_regles` trois fois avec
son propre écrivain injecté :

1. un `NO_GO` portant une ligne `CRITIQUE`, écrivain qui réussit → exige
   **exactement 1** écriture et `ts["regles_memoire"] == [{... "etat": "ecrite"}]` ;
2. un `GO` sans finding → exige **aucune** entrée ;
3. le même `NO_GO`, écrivain qui **lève** → exige que l'appel **ne lève pas** et
   qu'une entrée porte un `etat` commençant par `echec`.

Puis il lit la source pour vérifier le point d'accroche.

Le cas 2 est un test de mutation : un branchement qui écrit toujours échoue. Le
cas 3 aussi : un `try/except: pass` échoue. Ne cherche pas à faire passer la
sonde — fais marcher le branchement, la sonde suivra.

## Modèle de menace — borné

La session est négligente ou opportuniste, pas un attaquant motivé. Pas de
contre-mesure contre une attaque délibérée ; pas de critère de GO du type
« aucun défaut CRITIQUE ni HAUTE », qui est inatteignable et bloque le plan.

## Fin

Commit atomique. Aucun secret, aucune donnée personnelle : ce dépôt est public à
l'échelle de l'équipe et git garde ce qu'on y met.
