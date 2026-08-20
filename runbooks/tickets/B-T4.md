RÉPERTOIRE DE TRAVAIL : `/home/nuveo/hermes-os-plan-b`. Tout chemin relatif s'y
résout, et tout fichier que tu produis doit y atterrir.

# Ticket B-T4 — Le point d'entrée : `injecter_regles()`, sa CLI, et l'échec qui se voit

**Modèle : `claude-sonnet-5` · effort : `medium`.** Plomberie : la décision est
tranchée par B-T1, la fonction pure est livrée par B-T2, le pont par B-T3. Tu
les relies, tu n'en réécris aucun.

**Lis `docs/plans/2026-08-21-b-contrat-injection.md`.** Il fait foi.

Le `check:` appelle la sonde avec `--module ops/verdict_hook.py` et **compte**
les lignes `cas_ok=` qu'elle imprime : il en exige **huit** — les cinq passes
détaillées plus bas, les **deux** invocations de la CLI en sous-processus (celle
qui réussit et celle qui doit rater), la non-régression de périmètre. Un chemin
non exercé n'imprime rien et fait manquer le seuil.

## Le périmètre, avant tout le reste

Une session de plan **ne modifie jamais** un fichier de gouvernance du moteur —
ni `ops/plan_runner.py`, ni `ops/plan_doctor.py`, ni `ops/plan_factory.py`. Ce
ticket ne fait donc **pas** le raccordement dans le moteur : il livre un point
d'entrée autonome et exerçable, et le raccordement reste une **dette** consignée
par le contrat de B-T1, que l'Owner tranche ensuite.

Le check le vérifie dans les deux sens : ton module doit marcher seul, et les
noms `injecter_regles`, `regles_depuis_verdict` et `ecrire_regle` doivent rester
**absents** des trois fichiers de gouvernance.

Sache exactement ce que cela vaut, et ne compte pas sur plus. Un `check:` ne peut
pas lire la liste des fichiers du diff de ton ticket — la capacité n'existe pas
dans le moteur, et la dette est consignée en tête du runbook. Le contrôle borne
donc le **contenu** de ces trois fichiers ; ce n'est pas une whitelist du commit,
et une retouche ailleurs ne se ferait pas arrêter mécaniquement. Le périmètre
tient parce que tu le respectes et parce que le gate Codex relit ton diff, pas
parce qu'une barrière l'impose.

**Et la porte de sortie, sans laquelle ce contrôle devient un blocage
incorrigible.** La finalité de B est qu'un jour `injecter_regles` **apparaisse**
dans `ops/plan_runner.py` — c'est la dette que l'Owner paiera à la main. Le jour
où il la paie, une non-régression écrite naïvement ferait rougir la sonde sur son
geste légitime, à chaque rejeu, ré-audit de chaîne ou maillon suivant qui
réutilise cette sonde. Défaut déjà payé ici : le texte d'un runbook est lu comme
une norme, et une norme absolue devient un blocage que personne ne peut lever.

La non-régression tolère donc la présence de ces noms dans un fichier de
gouvernance. **Aucune exception, et surtout pas un marqueur.**

Une version antérieure de ce prompt tolérait la présence si le fichier portait un
marqueur daté « posé à la main par l'Owner ». C'était une faute, relevée par
l'audit adverse du 2026-08-20 : `governed_files()` protège
`/home/nuveo/hermes-os`, PAS les copies sous `/home/nuveo/hermes-os-plan-b`. Une
session peut donc raccorder le hook elle-même, recopier le marqueur qu'elle vient
de lire dans son propre prompt, et verdir sur une modification hors périmètre.
Un marqueur que la session connaît n'est pas une preuve : c'est une chaîne de
caractères qu'elle sait écrire.

Pour ce run : la sonde compare ces trois fichiers **octet à octet** à leur version
dans le `base_sha` fourni par `$HERMES_TICKET_FACTS`. Toute différence est un
échec, quel que soit son contenu.

La dette de raccordement ne disparaît pas pour autant : `injecter_regles` devra un
jour être appelée depuis `ops/plan_runner.py:7327`, et c'est l'Owner qui posera
cette ligne à la main. Elle est consignée en tête du runbook et dans son
« Encore à Faire ». Ce qui change, c'est qu'elle cesse d'être auto-certifiable :
une exception future devra s'appuyer sur une preuve ANTÉRIEURE à la session — un
sha épinglé avant son lancement — jamais sur un texte que la session peut
produire.


```
# raccordement B verdict->regle, pose a la main le YYYY-MM-DD par l'Owner
```

Sans marqueur, la présence reste un échec. Avec marqueur, la sonde consigne la
présence dans sa sortie (elle l'imprime, elle ne la tait pas) et rend 0 sur cet
axe. Le marqueur est une déclaration humaine, pas une preuve : c'est assumé — il
n'existe pas de contrôle mécanique qui distingue le raccordement voulu par
l'Owner d'un contournement, et prétendre le contraire serait la vraie faute.

## Le livrable — un module neuf, `ops/verdict_hook.py`

### 1. La fonction

```python
def injecter_regles(verdict: str, report: str, ts: dict, *, ecrire=None, racine=None) -> None:
```

Elle appelle `regles_depuis_verdict(verdict, report)` (module
`ops/verdict_regles.py`, B-T2) puis, pour chaque règle rendue, l'écrivain —
`ecrire` s'il est fourni, sinon `brain_bridge.ecrire_regle` (B-T3), **importé
paresseusement dans le corps de la fonction**. L'import paresseux évite qu'un
`brain.js` absent fasse échouer le simple chargement du module.

`racine` est transmis tel quel à l'écrivain par défaut (`racine=None` → mémoire
réelle ; `racine=<dossier>` → ce dossier, cf. B-T3). C'est ce qui permet au
contrôle d'exercer le **chemin par défaut**, celui qui servira en production,
sans écrire dans la mémoire de l'Owner. Ne le traite pas comme un paramètre de
confort : la version précédente de ce ticket n'était vérifiée qu'à travers des
écrivains injectés, si bien que `ecrire=None`, l'import paresseux et la mutation
réelle pouvaient tous être cassés sans que rien ne le dise.

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
python3 ops/verdict_hook.py --verdict NO_GO --rapport <fichier|-> [--racine <dir>] [--dry-run]
```

- `--rapport -` lit le rapport sur l'entrée standard ;
- `--racine <dir>` est transmis tel quel à `injecter_regles` : c'est ce qui rend
  la CLI exerçable hors de la mémoire réelle, dans les deux sens (un bac à sable
  qui marche, une racine qui ne peut pas marcher) ;
- `--dry-run` **n'écrit rien** : il passe un écrivain qui simule, et imprime une
  ligne par règle qui serait écrite, slug compris (`feedback_…`) ;
- sans `--dry-run`, l'écriture passe par le pont de B-T3 ;
- la sortie finale rapporte des grandeurs — nombre de règles, états — pas un
  « OK » constant.

**Le code de retour de la CLI.** Il est à toi de le poser, et c'est le seul
endroit de B où un échec d'écriture se traduit en code non nul :

- **0** quand la décision a abouti et qu'aucune règle n'est en `echec` — y
  compris si zéro règle en découle : « aucune règle à écrire » est un résultat,
  pas une panne ;
- **non nul** dès qu'au moins une règle a fini en `echec`, **et** la ligne
  correspondante part sur la sortie, nommément. Les deux ensemble : un code non
  nul muet ne diagnostique rien, et un `echec…` imprimé qui sort en 0 est
  exactement le défaut relevé par l'audit — l'appelant qui ne lit que le code
  croit que la boucle a écrit.

Cela **ne contredit pas** le §2 ci-dessus. `injecter_regles()` reste non
bloquante et ne lève jamais : c'est elle que le moteur appellera un jour, et une
règle non écrite ne doit pas faire tomber un ticket. La CLI, elle, est un outil
qu'on lance à la main ou depuis un script : à cette frontière-là, un échec doit
se voir dans `$?`. La traduction se fait dans le `main()`, en lisant
`ts["regles_memoire"]` — pas en changeant le comportement de la fonction.

Documente en tête du module, en trois lignes, comment le moteur s'y raccordera :
le nom de la fonction, sa signature, et l'endroit visé (juste après
`ts["verdict_motif"] = motif_verdict`, vers la ligne 7327). C'est la dette, elle
se lit là où elle sera payée.

## Ce que le check fera — sache-le avant d'écrire

Le `check:` de ton ticket est un appel d'une ligne à la sonde `entree` de
`ops/checks/sonde_b.py`, livré par B-T0 — lis-la. Elle importe
`ops/verdict_hook.py` et **appelle** `injecter_regles` cinq fois.

Trois passes avec son propre écrivain injecté :

1. un `NO_GO` portant une ligne `CRITIQUE`, écrivain qui réussit → exige
   **exactement 1** écriture et `ts["regles_memoire"] == [{... "etat": "ecrite"}]` ;
2. un `GO` sans finding → exige **aucune** entrée ;
3. le même `NO_GO`, écrivain qui **lève** → exige que l'appel **ne lève pas** et
   qu'une entrée porte un `etat` commençant par `echec`.

Puis deux passes sur le **chemin par défaut**, `ecrire=None` — celles qui
exercent l'import paresseux du pont et la mutation réelle :

4. `racine=<dossier neuf, propre à l'exécution>` → **le fichier de la règle doit
   apparaître dans ce dossier**, avec le fait dedans. La preuve est le disque,
   pas l'état rendu : un stub qui renvoie `"ecrite"` sans rien écrire échoue ici.
   La sonde efface ensuite le dossier entier, qu'elle a créé elle-même ;
5. le même chemin par défaut contre une racine impossible → **aucune exception**,
   et un `etat` commençant par `echec`. C'est le comportement d'échec du chemin
   réel ; les écrivains injectés ne peuvent pas le prouver.

Puis elle lance la CLI en sous-processus **deux fois** :

6. `--dry-run`, rapport sur l'entrée standard → code **0** et un `feedback_`
   dans la sortie réelle ;
7. **sans `--dry-run`**, `--racine <chemin impossible>` → code **non nul** *et*
   une ligne portant `echec` dans la sortie réelle. C'est la seule passe qui
   exerce le chemin de mutation *à travers la CLI* : sans elle, un `main()` qui
   imprime `echec…` puis sort en 0 passait le contrôle sans que rien ne le dise.

Enfin elle lit les trois fichiers de gouvernance et exige qu'aucun ne mentionne
`injecter_regles`, `regles_depuis_verdict` ni `ecrire_regle`.

Le cas 2 est un test de mutation : un chemin qui écrit toujours échoue. Le cas 3
aussi : un `try/except: pass` échoue. Le cas 4 en est un troisième, et c'est le
plus important : il n'y a aucun moyen de le passer sans que le chemin de
production fonctionne. Le cas 7 en est un quatrième, sur la frontière : il
n'existe aucun moyen de le passer en avalant l'échec. Ne cherche pas à faire
passer la sonde — fais marcher le point d'entrée, la sonde suivra.

## Modèle de menace — borné

La session est négligente ou opportuniste, pas un attaquant motivé. Pas de
contre-mesure contre une attaque délibérée ; pas de critère de GO du type
« aucun défaut CRITIQUE ni HAUTE », qui est inatteignable et bloque le plan.

## Fin — la commande finale et sa preuve observable

Commit atomique du seul module. Aucun secret, aucune donnée personnelle : ce
dépôt est public à l'échelle de l'équipe et git garde ce qu'on y met.

Termine en lançant, depuis `/home/nuveo/hermes-os-plan-b`, les **trois**
commandes qui exercent tes deux chemins et ta frontière — aucune n'écrit dans la
mémoire réelle :

```bash
rapport() { printf 'VERDICT: NO_GO\nCRITIQUE | ops/x.py:12 | le verdict n%s ecrit aucune regle | cabler l appel\n' "'"; }

rapport | python3 ops/verdict_hook.py --verdict NO_GO --rapport - --dry-run;      echo "code = $?"
printf '' | python3 ops/verdict_hook.py --verdict GO --rapport - --dry-run;       echo "code = $?"
rapport | python3 ops/verdict_hook.py --verdict NO_GO --rapport - --racine /proc/impossible-b-t4; echo "code = $?"
```

Colle les trois sorties dans ton message de fin :

1. au moins un slug `feedback_…`, `code = 0` ;
2. zéro règle, `code = 0` — « rien à écrire » n'est pas une panne ;
3. une ligne portant `echec`, et un `code` **non nul** — la mutation réelle a été
   tentée à travers la CLI et a raté, visiblement.

Les trois ensemble sont la preuve ; deux n'en prouvent que les deux tiers. Si la
troisième sort en 0, ta CLI avale ses échecs : dis-le plutôt que de la relancer.
