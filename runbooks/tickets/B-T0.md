RÉPERTOIRE DE TRAVAIL : `/home/nuveo/hermes-os-plan-b`. Tout chemin relatif s'y
résout, et tout fichier que tu produis doit y atterrir.

# Ticket B-T0 — Le vérificateur : les cinq sondes de B, en un script

**Modèle : `claude-opus-5` · effort : `high`.** Tu écris l'instrument qui juge
les cinq tickets suivants. Une sonde permissive ne se voit pas : elle rend
`done` sur du code cassé, et le défaut ressort trois blocs plus loin.

Tu écris ce vérificateur **avant** les modules qu'il juge. C'est délibéré : un
contrôle écrit après le code se taille toujours, un peu, pour le laisser passer.
Ici tu n'as rien à ménager.

## Les deux livrables

- `ops/checks/sonde_b.py` — le vérificateur, un seul fichier, bibliothèque
  standard uniquement ;
- `ops/checks/sonde_b.sha256` — le **sceau**, au **format standard `sha256sum`** :
  une seule ligne, `<64 hex><deux espaces>ops/checks/sonde_b.py`. C'est
  exactement ce que produit `sha256sum ops/checks/sonde_b.py` lancé depuis la
  racine du dépôt, et c'est ce qui rend le sceau vérifiable par
  `sha256sum -c ops/checks/sonde_b.sha256` — ce que fait le `check:` de ce
  ticket, en premier. Écris-le en dernier, après le gel du script : un sceau
  faux ferait échouer les quatre `check:` suivants, qui passent tous `--sceau`.

## Pourquoi un script et pas du YAML

Un `check:` est un appel, pas un programme. Les cinq `check:` de session de ce
runbook sont donc des lignes de la forme :

```
sortie=$("$HERMES_CHECK_PYTHON" ops/checks/sonde_b.py <sonde> --facts "$HERMES_TICKET_FACTS" --sceau ops/checks/sonde_b.sha256 --module <artefact>) \
  && cas=$(printf '%s' "$sortie" | grep -c '^cas_ok=') && test "$cas" -ge <seuil> \
  && echo "$sortie" && echo "<ticket> sonde=<sonde> cas_ok=${cas}"
```

Le compteur n'est pas décoratif : `plan_factory` refuse un ticket qui produit du
code sans qu'aucune quantité ne soit mesurée sur l'artefact déclaré. C'est ce
que `--module` et le décompte des `cas_ok=` rendent au `check:`. **stderr n'est
jamais capturé** — sur échec, la chaîne `&&` s'arrête avant l'impression et le
diagnostic doit rester lisible dans le journal du runner.

Le vérificateur est relu par un gate Codex, testé par son propre autotest, et
corrigeable sans réécrire un runbook. C'est le seul endroit de B où de la
logique de contrôle a le droit de vivre.

## Interface

```
sonde_b.py {contrat|decision|pont|entree|raccordement|autotest} --facts <json> [--sceau <fichier>] [--racine <dir>] [--module <chemin>] [--oracle <chemin>] [--moteur <dir>]
```

- `--facts` porte la valeur de `$HERMES_TICKET_FACTS`. **Parse-la** (`json.loads`)
  et échoue si elle n'est pas un JSON valide : un contrôle qui ne sait pas dans
  quel ticket il tourne ne contrôle rien.
- `--sceau`, s'il est fourni : relis ta propre source, calcule son sha256,
  compare au **premier champ de la première ligne** du fichier (format
  `sha256sum`), **abandonne sur écart**. Une session aval qui bricolerait la sonde
  pour se faire passer devrait aussi rééditer le sceau — un geste de plus, hors
  du modèle de menace borné ci-dessous. `autotest` n'exige pas le sceau, qui
  n'existe pas encore quand il tourne.
- `--racine`, par défaut le répertoire courant : la racine du dépôt où les
  livrables sont cherchés. C'est ce qui rend `autotest` possible.
- `--module`, pour `decision`, `pont` et `entree` : le chemin de l'artefact
  jugé, relatif à `--racine`. La sonde le compare au chemin qu'elle attend
  (`ops/verdict_regles.py`, `ops/brain_bridge.py`, `ops/verdict_hook.py`
  respectivement) et **abandonne sur écart** — un `check:` recopié d'un ticket
  à l'autre sans changer le module se voit tout de suite. C'est aussi ce qui
  rattache le compteur du `check:` à l'artefact du ticket. Absent, la sonde
  utilise son chemin attendu ; `contrat` et `autotest` l'ignorent.
- `--moteur`, pour `raccordement` seul : la racine du dépôt **gouverné** à
  observer, distincte de `--racine`. C'est un argument et non une constante pour
  la même raison que `--oracle` : l'autotest doit pouvoir y pointer ses faux
  moteurs. Le `check:` de B-T6 lui passe `/home/nuveo/hermes-os`.
- **Sortie** : chaque sonde imprime des **grandeurs calculées** — jamais un « OK »
  constant, jamais un compte littéral. « 6/6 » codé en dur est un mensonge dès
  que la matrice en porte cinq. Sortie non nulle et message explicite en cas
  d'échec, nommant ce qui a divergé et la valeur attendue.

Aucune sonde ne fait confiance à un marqueur imprimé par la session jugée. Aucune
ne rouvre un `*.state.json`.

## Sonde `contrat` — juge B-T1

Lit `docs/plans/2026-08-21-b-contrat-injection.md` et
`docs/plans/2026-08-21-b-contrat-injection.matrice.json`.

Sur le document : présence littérale de `verdict_motif`, `GO_AVEC_RESERVES`,
`NO_VERDICT`, `REVIEWER_DOWN`, `brain.js`, `sha256`, `idempotence`, `MEMORY.md`
et `dette`. Et **absence** d'un critère de GO inatteignable — la formule qui
exige zéro défaut d'une sévérité donnée. Construis ces motifs interdits par
concaténation dans le code, pour que le fichier de sonde ne les porte pas
lui-même en clair et ne se refuse pas s'il venait à être scanné.

Sur la matrice, sois **strict** — c'est ici que la version précédente de ce
contrôle laissait passer n'importe quoi :

- l'ensemble des `verdict` des cas est **exactement** `{GO, GO_AVEC_RESERVES,
  NO_GO, NO_VERDICT, NO_REVIEWER, REVIEWER_DOWN}` : ni doublon, ni manquant, ni
  cas supplémentaire. Compare des ensembles **et** les longueurs, sinon un
  doublon passe ;
- le schéma de la racine est celui du bloc `decisions` plus bas — **trois** clés,
  `derivation_slug`, `decisions` et `cas` ; ne le vérifie qu'une fois, là-bas ;
- chaque cas porte exactement les clés `verdict`, `rapport`, `regles`, `cles`,
  `attendus` — pas une de moins, pas une de plus ;
- `regles` est un entier `>= 0` ; `rapport` est une chaîne non vide ;
- `len(cles) == regles` **et** `len(attendus) == regles`. Un cas à zéro porte
  donc deux listes vides : `cles` sur un cas qui n'écrit rien est une
  contradiction, pas une tolérance ;
- chaque entrée de `cles` est une chaîne non vide ; chaque entrée de `attendus`
  est un objet portant `fait` et `why`, deux chaînes non vides — c'est le contenu
  que la sonde `decision` exigera de retrouver ;
- `NO_REVIEWER` et `REVIEWER_DOWN` sont à `regles == 0`, et leurs `rapport`
  portent chacun au moins une ligne de finding : un cas de panne avec un rapport
  vide ne teste rien ;
- au moins un cas a `regles > 0` ;
- `derivation_slug` mentionne `sha256`.

**Le bloc `decisions` — c'est là que porte le renfort.** L'audit a montré qu'un
document ne portant que les ancres, flanqué d'une matrice formellement valide
mais arbitraire, franchissait ce contrôle sans avoir tranché quoi que ce soit :
la substance était déléguée au gate Codex, et un faux contrat aurait été exécuté
fidèlement par B-T2. B-T1 met donc ses sept décisions dans la matrice, en champs
machine-lisibles, et tu en vérifies un invariant chacune — **sept axes** :

- la racine porte exactement `derivation_slug`, `decisions` et `cas` ;
  `decisions` porte exactement `verdicts_armes`, `severites_retenues`,
  `cle_champs`, `cle_exclus`, `cle_normalisation`, `egalite_champs`,
  `contenu_fait`, `contenu_why`, `lignes_index_par_regle`, `jamais` ;
- `verdicts_armes` : liste non vide, incluse dans le domaine des six verdicts, et
  **sans `NO_REVIEWER` ni `REVIEWER_DOWN`** ;
- `severites_retenues` : liste non vide, incluse dans `{CRITIQUE, HAUTE,
  MOYENNE, BASSE, INFO, MOTEUR}` ;
- `cle_champs` et `cle_exclus` non vides et **disjoints**, `cle_normalisation`
  chaîne non vide ;
- `egalite_champs` contient au moins `fait`, `why` et `type` — l'invariant qui
  empêche une idempotence trop large de perdre les révisions, en amont de B-T3 ;
- `contenu_fait` et `contenu_why` : chaînes non vides et **différentes** ;
- `lignes_index_par_regle == 1` ;
- `jamais` : au moins trois chaînes non vides.

Et la **cohérence entre `decisions` et `cas`**, vérifiée dans l'axe de chaque
cas, sans axe supplémentaire — c'est elle qui interdit une matrice arbitraire :

- `regles > 0` ⟹ le `verdict` est dans `verdicts_armes`, **et** le `rapport`
  porte au moins une ligne dont le premier champ est une sévérité de
  `severites_retenues` ;
- `verdict` hors de `verdicts_armes` ⟹ `regles == 0` ;
- `verdict` armé et `regles == 0` ⟹ le `rapport` ne porte **aucune** ligne
  d'une sévérité retenue. Sinon la doctrine et l'exemple se contredisent.

Imprime les comptes que tu as **calculés** : nombre de cas, liste des verdicts
productifs, total des règles attendues, dérivation annoncée, verdicts armés,
sévérités retenues.

## Sonde `decision` — juge B-T2

Charge `ops/verdict_regles.py` par `importlib`, charge la matrice, appelle
`regles_depuis_verdict(cas["verdict"], cas["rapport"])` pour **chacun** des six
cas. Pour chaque cas :

- le nombre de règles rendues égale `regles` ;
- **chaque règle est vérifiée en entier**, pas seulement comptée. C'est le défaut
  relevé par l'audit : une règle sans `fait` ni `why` passait le compte, puis
  cassait au pont, une étape plus loin, dans un ticket qui n'en était pas
  responsable. Donc, règle par règle, dans l'ordre :
  - c'est un `dict` portant exactement `slug`, `fait`, `why`, `type` ;
  - `type == "feedback"` ;
  - `fait` et `why` sont des chaînes non vides ;
  - `attendus[i]["fait"]` est contenu dans `fait`, et `attendus[i]["why"]` dans
    `why` — la matrice dit ce que la règle doit porter, pas seulement combien ;
  - `slug == "feedback_" + sha256(cles[i].encode("utf-8")).hexdigest()[:12]`,
    **recalculé ici**. Une dérivation maison qui « marche » dans le processus de
    la session mais ne reproduit pas ce condensat échoue ici, et pas six mois
    plus tard sur un dossier de mémoire dupliqué.

Les cas à zéro sont le test de mutation : un stub qui produit toujours échoue.

Imprime le détail par verdict, `obtenu/attendu`, plus le total.

## Sonde `pont` — juge B-T3

Charge `ops/brain_bridge.py`, vérifie que `BRAIN_JS` **existe** sur le disque.

**L'oracle est épinglé, et c'est un axe à part entière** (`cas_ok=oracle:epingle`).
Tout ce que cette sonde prouve — le versionnement, le `.v1`, le `.v2` — est en
réalité un comportement de `brain.js`, un fichier qui vit hors du dépôt de B et
que n'importe qui peut réécrire. Une sonde qui se contente de « ça existe » verdit
donc sur un oracle quelconque. Prends un argument `--oracle <chemin>` : la sonde
exige que `bb.BRAIN_JS`, **résolu** (`Path.resolve()`), soit exactement ce
chemin, lui aussi résolu, et refuse sinon. Le `check:` de B-T3 lui passe le
chemin épinglé dans le `requires_access` du runbook ; l'autotest, lui, passe le
chemin de son faux `brain.js` — c'est pourquoi c'est un argument et non une
constante gravée dans la sonde. Imprime en clair, sur la ligne de compteurs, le
chemin retenu et son `sha256` (`brain_js=<chemin> brain_js_sha256=<64 hex>`) : le
condensat n'est comparé à rien — il n'existe aucune valeur antérieure à laquelle
le comparer, c'est la dette consignée en tête du runbook — mais il part au
journal du runner, et deux runs verts sur deux oracles différents cessent d'être
indiscernables.

**Bac à sable propre à l'exécution.** Le contrôle précédent écrivait dans le
`.cache/sandbox-memory` partagé et réécrivait son `MEMORY.md` en entier sans
verrou : deux exécutions concurrentes pouvaient perdre ou ressusciter les lignes
l'une de l'autre, malgré des slugs distincts. Tu ne partages plus rien :

- fabrique un dossier neuf par `tempfile.mkdtemp(prefix="sonde-b-")` — aucun
  chemin fixe, aucun glob de nettoyage, donc rien à effacer qui appartienne à
  une autre exécution — et passe-le à `ecrire_regle(..., racine=<ce dossier>)` ;
- **ne présuppose pas la disposition interne de cette racine.** C'est B-T3 qui
  la choisit (il se creuse un sous-dossier à lui et y dépose une copie de
  l'oracle et un `config/workspace.json` — jamais à la racine même, cf. son
  prompt) : localise l'index par `next(Path(racine).rglob("MEMORY.md"))`
  et les fichiers de règles par `rglob("<slug>*.md")`. Une sonde qui code en dur
  `<racine>/memory/` juge une implémentation au lieu d'un comportement ;
- le `MEMORY.md` de ce dossier n'appartient qu'à cette exécution : aucune course,
  aucun verrou nécessaire, et le nettoyage est un `shutil.rmtree` du dossier —
  il ne peut emporter que ce que cette exécution a créé. Nettoie dans un
  `finally`.

**Quatre** appels sur le même slug, dans cet ordre — le quatrième ne change que
le `why`, et c'est lui qui distingue une idempotence correcte d'une idempotence
qui perd les révisions :

| # | `fait`    | `why`   | attendu                              |
|---|-----------|---------|--------------------------------------|
| 1 | `PREMIER` | `WHY_A` | `etat == "ecrite"`                   |
| 2 | `SECOND`  | `WHY_A` | `etat == "ecrite"`, `.v1` apparaît   |
| 3 | `SECOND`  | `WHY_A` | `etat == "inchangee"`, rien n'apparaît |
| 4 | `SECOND`  | `WHY_B` | `etat == "ecrite"`, `.v2` apparaît   |

Exigences, une par axe :

- `<slug>.v1.md` existe et contient `PREMIER` — la réécriture a versionné ;
- `<slug>.md` contient `SECOND` ;
- `<slug>.v2.md` **absent après le troisième appel** — le rejeu à l'identique
  n'a rien empilé ;
- le `MEMORY.md` du bac à sable porte **une** ligne mentionnant le slug après
  chacun des trois premiers appels — pas zéro, pas une par rejeu ;
- le troisième appel rend `etat == "inchangee"` : l'idempotence doit être
  *décidée*, pas obtenue par accident ;
- **le quatrième appel rend `etat == "ecrite"`, `<slug>.v2.md` apparaît et
  contient `WHY_A`, et `<slug>.md` contient `WHY_B`.** L'égalité qui décide de
  l'idempotence porte sur **tout le contenu persistant** de la règle — `fait`,
  `why`, `type` — pas sur le seul `fait`. Un pont qui ne compare que le `fait`
  déclare `inchangee` une règle dont la justification a été corrigée : la
  révision est perdue en silence, sans version, sans trace. C'est exactement le
  défaut que M-T1 ferme, et une boucle automatique le reproduirait à la cadence
  des gates ;
- `MEMORY.md` porte **toujours une seule** ligne après le quatrième appel : une
  révision versionne le fichier, elle ne duplique pas l'index.

**Puis la concurrence — cinq axes de plus, et le trou que l'audit a nommé.**
`brain.js` indexe en append-only (l. 208-220) : tenir *une* ligne par règle
oblige le pont à relire, dédoublonner et réécrire `MEMORY.md`. C'est un cycle
lecture-modification-écriture sur un fichier que **la mémoire réelle partage**
entre tous les gates. Une suite séquentielle ne peut pas voir ce défaut : elle
reste verte pendant que deux gates simultanés se perdent une ligne. Exerce-le
donc pour de bon, dans un sous-dossier **partagé** du bac à sable :

- deux écrivains **simultanés** (`threading.Thread` ou deux sous-processus) sur
  **deux slugs distincts**, joints avant de mesurer ;
- les deux `<slug>.md` existent — aucune écriture perdue ;
- `MEMORY.md` porte **exactement une** ligne par slug, donc deux au total.

Ces deux derniers axes sont nécessaires et **insuffisants** : deux fils lancés une
seule fois peuvent être ordonnancés bout à bout, et un pont dépourvu de tout
verrou les franchit alors sans rien prouver. Ne t'arrête donc pas là — les trois
axes qui suivent ne dépendent pas de l'ordonnanceur, et c'est sur eux que porte
la preuve :

- **prise du verrou, observée directement.** Pendant qu'un `ecrire_regle` est en
  vol dans un fil, tente toi-même, en boucle serrée jusqu'à la jonction,
  `fcntl.flock(open("<racine>/.memory.lock"), LOCK_EX | LOCK_NB)` et exige **au
  moins un `BlockingIOError`**. B-T3 impose ce nom de fichier, tu peux donc le
  nommer. L'appel à `node` dure des dizaines de millisecondes : la fenêtre est
  large et l'observation reproductible. Un pont qui n'ouvre jamais ce verrou ne
  te refusera jamais rien, et échoue ici ;
- **un écrivain direct concurrent ne perd pas sa ligne.** Le verrou du pont ne
  lie que ce qui passe par le pont ; `brain.js` reste appelable directement.
  Joue donc ce rôle, à un moment **choisi et non espéré** : dès que l'axe
  précédent t'a montré le verrou tenu — donc qu'un cycle est en cours — ajoute
  toi-même, sans prendre le verrou, une ligne d'index pour un **troisième** slug
  à la fin de `MEMORY.md`. Après la jonction, cette ligne doit **toujours y
  être**. Un pont qui réécrit l'index depuis un instantané pris avant l'appel à
  `node` l'a effacée ; celui qui ne retire que les doublons de son propre slug et
  revérifie `os.stat()` avant `os.replace()` l'a conservée.
- **le verrou couvre jusqu'au `os.replace()`, pas seulement jusqu'à `node`.**
  L'axe de prise ci-dessus constate un refus, il ne dit rien de l'instant du
  relâchement : un pont qui libère le verrou avant de remplacer l'index laisse
  béante exactement la fenêtre qu'il prétend fermer, et l'unique essai concurrent
  peut se sérialiser sans le montrer. Alors continue la même boucle
  `LOCK_EX | LOCK_NB` **au-delà du premier refus** et retiens le premier essai
  qui *réussit*, le fil étant toujours en vol : à cet instant précis — verrou
  relâché — le cycle du pont doit être **fini sur le disque**, donc `MEMORY.md`
  porte déjà la ligne du slug en vol et `<slug>.md` existe. S'ils manquent, le
  verrou a été rendu avant le remplacement. Relâche aussitôt ce que tu viens de
  prendre. Un pont qui garde le verrou jusqu'au bout ne te le cède qu'après son
  `os.replace()`, et cet axe est vert sans dépendre d'aucun ordonnancement ; si
  la jonction du fil arrive avant ta première prise, l'axe n'est **pas exercé** —
  ne l'imprime pas, et ne le remplace pas par une acceptation par défaut.

Reste une fenêtre que ce contrôle ne prétend pas fermer : un ajout direct tombant
entre la dernière vérification de `os.stat()` et le `os.replace()` est perdu. La
fermer exigerait que `brain.js` prenne le même verrou, ce qui est hors du dépôt
de B — B-T3 la consigne en dette, et ta sonde ne la sonde pas.

Imprime l'état du disque constaté, pas un verdict binaire.

## Sonde `entree` — juge B-T4

Charge `ops/verdict_hook.py`. L'audit a relevé que la version précédente
n'exerçait que des écrivains injectés et un `--dry-run` : le chemin utile
(`ecrire=None`), l'import paresseux du pont, la mutation réelle et le
comportement d'échec pouvaient tous être cassés sans que rien ne le dise. Cinq
passes, donc.

1. **Écrivain injecté qui réussit**, `NO_GO` portant une ligne `CRITIQUE` →
   exactement une entrée dans `ts["regles_memoire"]`, `etat == "ecrite"`, et
   l'écrivain a bien été appelé une fois.
2. **`GO` sans finding** → aucune entrée. Test de mutation : un chemin qui écrit
   toujours échoue.
3. **Écrivain injecté qui lève** → l'appel **ne lève pas**, et une entrée porte
   un `etat` commençant par `echec`. Un `try/except: pass` échoue ici.
4. **Chemin par défaut, `ecrire=None`**, contre un bac à sable propre à
   l'exécution (même discipline que la sonde `pont` : dossier neuf, `rmtree` en
   `finally`). C'est la passe qui exerce l'import paresseux du pont et la
   mutation réelle. **La preuve est le fichier apparu sur le disque** — le
   `<slug>.md` attendu, cherché par `rglob` sous la racine comme pour `pont`,
   existe et porte le fait — pas l'état rendu par la fonction, qu'un stub peut
   fabriquer.
5. **Chemin par défaut contre une racine impossible** (un chemin non
   inscriptible, ou un `BRAIN_JS` pointé sur un fichier inexistant via
   l'environnement) → aucune exception, et un `etat` commençant par `echec`.
   C'est le comportement d'échec du chemin réel, celui que les écrivains
   injectés ne peuvent pas prouver.

Puis la **CLI** en sous-processus, sur ses **deux** chemins — deux axes, pas un :

6. `--verdict NO_GO --rapport - --dry-run`, rapport sur l'entrée standard. Exige
   un code de retour **0** et un `feedback_` dans la sortie réelle — c'est le
   texte produit qui compte, pas le code seul.
7. `--verdict NO_GO --rapport - --racine <chemin impossible>`, **sans
   `--dry-run`** : la mutation est tentée pour de bon et ne peut que rater.
   Exige un code de retour **non nul** *et* une ligne portant `echec` sur la
   sortie réelle. Les deux, pas l'un ou l'autre : le défaut visé est une CLI qui
   imprime `echec…` puis sort en 0, auquel cas un appelant qui ne lit que le
   code croit que tout s'est bien passé. Un code non nul sans message ne
   diagnostique rien ; un message sans code ne se voit pas.

   Cet axe porte sur la **CLI**, qui est un outil qu'on lance à la main ou
   depuis un script. Il ne contredit pas la passe 5 : `injecter_regles()` reste
   non bloquante et ne lève jamais, pour que le raccordement futur au moteur ne
   puisse pas faire tomber un ticket. C'est la CLI qui traduit l'état `echec` en
   code de sortie, à sa frontière à elle.

Enfin la **non-régression de périmètre**, et elle a **un seul** énoncé : les
trois fichiers de gouvernance — `ops/plan_runner.py`, `ops/plan_doctor.py`,
`ops/plan_factory.py` — sont **identiques octet pour octet** à leur version au
`base_sha` que porte `$HERMES_TICKET_FACTS`. Toute différence est un échec, quel
que soit son contenu, et il n'existe aucune route « avec marqueur, rend 0 ».

**N'ajoute pas, en plus, un contrôle d'absence des symboles** `injecter_regles`,
`regles_depuis_verdict`, `ecrire_regle` dans ces fichiers. Les deux exigences
sont incompatibles, et c'est la seconde qui est fausse : la finalité de B est
qu'`injecter_regles` **apparaisse** un jour dans `ops/plan_runner.py` (B-T5). Le
jour où cette ligne est commitée, elle est dans le `base_sha` des tickets
suivants, la comparaison repart de ce commit-là et reste verte d'elle-même —
alors qu'une absence absolue rougirait pour toujours sur un geste légitime, sans
que personne puisse lever le blocage. Une norme absolue écrite dans un runbook
est un blocage incorrigible : défaut déjà payé ici.

Ne prétends pas plus que cela non plus. Un contrôle ne peut pas lire la liste des
fichiers du diff du ticket : cette non-régression borne le **contenu** de ces
trois fichiers, elle n'est pas une whitelist du commit. La dette est déjà
consignée en tête du runbook ; ne la maquille pas en garantie.

## Sonde `raccordement` — juge B-T6, et c'est la seule qui sort de `repo:`

Elle observe le dépôt **gouverné** que `--moteur` désigne — pas le worktree de B.
C'est ce qui la rend infalsifiable : `governed_files()` y interdit l'écriture à
toute session, donc rien de ce qu'elle constate là-bas n'a pu être fabriqué par
le bloc. Elle n'écrit **rien** dans ce dépôt, et n'y importe rien en processus :
tout ce qui exécute du code de là-bas passe par un sous-processus.

Cinq axes, et deux d'entre eux existent parce qu'un audit a montré que leur
absence laissait la boucle définitivement inerte :

1. `cas_ok=moteur:parse` — `<moteur>/ops/plan_runner.py` s'analyse par
   `ast.parse()`. Un fichier cassé s'arrête ici, avec sa `SyntaxError` en clair.
2. `cas_ok=modules:presents` — `ops/verdict_regles.py`, `ops/brain_bridge.py` et
   `ops/verdict_hook.py` existent **sous `<moteur>`** et s'y importent. B-T0 à
   B-T4 les livrent dans le worktree, que le moteur ne lit pas ; sans cet axe,
   un import paresseux tolérant à l'absence laisse le hook silencieusement mort
   pour toujours. Importe-les en **sous-processus**
   (`python -c "import ops.verdict_hook"`, `cwd=<moteur>`), pas dans le tien : un
   module de gouvernance chargé dans le processus du contrôle y reste.
3. `cas_ok=ancre:verdict_motif` — dans l'AST, une affectation dont une cible est
   un `Subscript` d'indice littéral `verdict_motif`. Retiens sa `lineno`.
4. `cas_ok=appel:apres_ancre` — dans l'AST, un nœud **`ast.Call`** dont la
   fonction se nomme `injecter_regles` (`Name.id` ou `Attribute.attr`), dont la
   `lineno` est **strictement supérieure** à celle de l'affectation de l'axe 3.
   **Par l'AST, jamais par sous-chaîne** : c'est le défaut relevé par l'audit —
   un `import injecter_regles`, un commentaire, une chaîne de caractères ou une
   ligne de docstring portant ce nom satisfaisaient un `in` et ne sont pas des
   appels. Imprime les deux `lineno` réellement trouvées.
5. `cas_ok=invocation:dry_run` — lance en sous-processus, `cwd=<moteur>`, le
   point d'entrée **installé là-bas** :
   `python ops/verdict_hook.py --verdict NO_GO --rapport - --dry-run`, rapport
   sur l'entrée standard. Exige le code **0** et un `feedback_` dans la sortie
   réelle. Le dry-run ne mute rien : c'est la seule invocation qu'un contrôle
   puisse se permettre sur la mémoire réelle, et elle suffit à distinguer un
   module copié d'un module copié **et fonctionnel**.

Ce qu'elle ne prouve **pas**, et ne prétends pas le contraire : qu'un verdict
réel ait écrit une règle en production. Le moteur n'expose à aucun `check:` le
moyen de l'observer — dette consignée en tête du runbook. Un appel posé dans une
branche morte franchirait ces cinq axes. La preuve de bout en bout est
l'exécution suivante d'un vrai gate.

Imprime les grandeurs constatées — lignes du moteur, `lineno` de l'ancre et de
l'appel, modules trouvés — jamais un verdict binaire.

## Contrat de SORTIE de la sonde — les `check:` en dépendent

Chaque sous-commande écrit **sur stdout, et seulement en cas de succès** :

1. **une ligne `cas_ok=<nom>` par axe réellement exercé ET franchi** — un axe
   non exercé n'imprime rien, un axe échoué fait échouer la sonde. Le nom est
   celui de l'axe (`cas_ok=verdict:NO_GO`, `cas_ok=index:une_ligne`,
   `cas_ok=piege:cles_non_vide_sur_regles_zero`…) ;
2. **puis une ligne finale de compteurs mesurés**, `cle=valeur` séparés par des
   espaces — par exemple `cas=7 rejetes=6 regles=3`.

Ce sont des grandeurs réellement comptées pendant la passe, jamais des
constantes : une sortie constante satisfait « stdout non vide » sans rien
mesurer, et c'est le faux positif exact que la règle vise.

Le nombre de lignes `cas_ok=` **est** la quantité que chaque `check:` compte, et
chacun porte un seuil. Tu dois les atteindre, et ils sont des planchers, pas des
cibles :

| sonde      | seuil du `check:` | ce que les axes couvrent                        |
|------------|-------------------|-------------------------------------------------|
| `contrat`  | 14                | les 6 cas de matrice + les 7 décisions + l'axe du document |
| `decision` | 6                 | un par verdict du domaine                        |
| `pont`     | 13                | `oracle:epingle`, `.v1`, `.md`, `.v2` absent, index, `inchangee`, révision du `why`, index après révision (8 séquentiels) + les 5 axes concurrents |
| `entree`   | 8                 | les 5 passes, les 2 CLI, la non-régression       |
| `raccordement` | 5             | parse, modules installés, ancre AST, appel AST après l'ancre, dry-run |
| `autotest` | 42                | 5 arbres valides + les 37 pièges énumérés plus bas |

Ces six nombres sont ceux du YAML du runbook, et `tickets/B-T3.md` énumère les
treize axes de `pont` un par un. Trois listes, un seul décompte : si tu en
trouves une qui diverge, c'est un défaut à signaler, pas un choix à faire.

Un seuil manqué fait échouer le ticket jugé — c'est voulu : une sonde amputée de
ses axes ne doit pas pouvoir rendre `done`.

**Tout diagnostic d'échec part sur stderr**, jamais sur stdout, et la sonde rend
un code non nul. Les `check:` du runbook capturent stdout dans une substitution
et n'impriment qu'au succès : un échec court-circuite avant l'impression, et
c'est stderr qui porte alors l'explication. Une sonde qui écrirait ses échecs sur
stdout les rendrait invisibles au moment où on en a besoin.

## Sonde `autotest` — juge le vérificateur

**Et la porte de sortie, sans laquelle ce contrôle devient un blocage
incorrigible.** La finalité de B est qu'un jour `injecter_regles` **apparaisse**
dans `ops/plan_runner.py` — c'est le geste de B-T5, que l'Owner pose à la main.
Le jour où il le pose, une non-régression écrite naïvement ferait rougir la sonde sur son
geste légitime, à chaque rejeu, ré-audit de chaîne ou maillon suivant qui
réutilise cette sonde. Défaut déjà payé ici : le texte d'un runbook est lu comme
une norme, et une norme absolue devient un blocage que personne ne peut lever.

La porte de sortie n'est donc pas une exception dans la sonde : c'est le
`base_sha` qui bouge. Le jour où l'Owner pose sa ligne et la commite, la
comparaison ci-dessous repart de ce commit-là et redevient verte d'elle-même,
sans qu'aucune session n'ait rien à déclarer. **Aucune exception dans le code de
la sonde, et surtout pas un marqueur.**

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

Le raccordement ne disparaît pas pour autant, et ce n'est PAS une dette : c'est
**B-T5**, un ticket humain du même runbook, où l'Owner installe les trois modules
dans `/home/nuveo/hermes-os` puis y appelle `injecter_regles` depuis
`ops/plan_runner.py` — et **B-T6**, un ticket de session, le constate ensuite par
ta sonde `raccordement`. Ce qui change, c'est qu'il cesse d'être auto-certifiable :
une exception future devra s'appuyer sur une preuve ANTÉRIEURE à la session — un
sha épinglé avant son lancement — jamais sur un texte que la session peut
produire. N'écris donc **aucune** route « avec marqueur, rend 0 » : sur cet axe,
la sonde n'a qu'une sortie possible, la différence est un échec.

C'est le `check:` de ce ticket. Aucun livrable de B n'existe encore : tu
fabriques donc des arbres synthétiques dans un répertoire temporaire
(`tempfile.mkdtemp`), et tu appelles chaque sonde dessus via `--racine`.

Pour chaque sonde, un arbre **valide** — que la sonde doit accepter — et une
série d'arbres **cassés** de façon plausible, que la sonde doit refuser. Au
minimum, et chacun doit être refusé :

- `contrat` : un verdict dupliqué ; un verdict manquant ; un cas supplémentaire
  hors domaine ; une clé en trop sur un cas ; `cles` non vide sur un cas à
  `regles: 0` ; `len(cles) != regles` ; un `attendus` sans `why` ; une matrice
  tout à zéro ; `REVIEWER_DOWN` produisant une règle ; un document portant la
  formule de GO inatteignable ; un document amputé d'une ancre ; **`decisions`
  absent** ; **`REVIEWER_DOWN` dans `verdicts_armes`** ; **un cas productif dont
  le verdict n'est pas armé** ; **`egalite_champs` sans `why`** ;
  **`lignes_index_par_regle: 2`**.
- `decision` : un module qui rend le bon compte mais des règles sans `fait` ;
  un qui rend un `type` autre que `feedback` ; un qui dérive le slug autrement
  que par `sha256` ; un stub qui rend toujours une règle.
- `pont` : un faux pont qui n'écrit pas de `.v1` ; un qui empile un `.v2` au
  rejeu ; un qui ajoute une ligne d'index par appel ; **un qui ne compare que le
  `fait` et rend donc `inchangee` quand seul le `why` change** — c'est le piège
  qui garde l'idempotence honnête ; **un qui réécrit `MEMORY.md` sans verrou et
  perd donc une ligne quand deux écrivains le font en même temps** ; **un qui
  n'ouvre jamais `<racine>/.memory.lock`** — celui-là doit être refusé par l'axe
  de prise du verrou, et pas seulement par chance d'ordonnancement ; **un qui
  prend bien le verrou mais réécrit l'index depuis un instantané pris avant
  l'appel à `node`**, et efface donc la ligne de l'écrivain direct ; **un qui
  relâche le verrou avant son `os.replace()`** — celui-là n'est refusé que par
  l'axe 13, et sans ce piège cet axe n'aurait jamais été exercé à vide.
  Rends ces
  pièges *déterministes* plutôt qu'aléatoires : le faux pont dort quelques
  dizaines de millisecondes entre sa lecture de l'index et sa réécriture, ce qui
  garantit l'entrelacement au lieu de l'espérer — un piège qui ne mord qu'une
  fois sur dix rend la sonde intermittente, ce qui est pire qu'un piège absent.
  Le dernier est le plus important des trois : il est *correct au sens du verrou*
  et faux quand même, et c'est le seul que le couple « deux fils, deux slugs » ne
  peut pas distinguer d'un pont sain.
- `entree` : un module qui lève au lieu de journaliser l'échec ; un qui écrit
  même sur `GO` ; un dont le chemin par défaut ne touche jamais le disque ;
  **une CLI qui imprime `echec…` mais sort quand même en 0** sur une racine
  impossible.
- `raccordement` : un faux moteur **sans aucune** mention d'`injecter_regles` ;
  **un où le nom n'apparaît qu'en `import` et en commentaire, sans aucun nœud
  d'appel** — c'est le piège central, celui qu'un contrôle par sous-chaîne
  laissait passer, et sans lui l'axe 4 ne vaudrait rien ; un où l'appel est
  **avant** l'affectation de `ts["verdict_motif"]` ; un dépôt gouverné où l'un
  des trois modules **manque** ; un où `ops/verdict_hook.py` est présent mais
  **lève à l'import**, donc dont le dry-run sort non nul. Ces faux moteurs sont
  des fichiers de quelques lignes écrits dans le temporaire, et
  `--moteur <ce temporaire>` est justement ce qui les rend atteignables.

Les faux modules sont de quelques lignes chacun, écrits dans le temporaire — ils
ne sont pas commités ailleurs que dans le corps de `sonde_b.py`.

**La sortie de l'autotest nomme les cas rejetés**, un par ligne au format
`cas_ok=<nom>` du contrat de sortie ci-dessus — un arbre valide accepté et un
piège refusé comptent chacun pour une ligne. Les trente-sept pièges énumérés
ci-dessus plus les cinq arbres valides font le seuil de 42 ; en ajouter est
bienvenu. Un autotest qui imprime « tout va bien » ne prouve rien ; celui qui
nomme chaque piège refusé prouve que l'instrument mord.

Si un cas cassé **passe**, l'autotest échoue en le nommant. C'est le résultat
utile de ta session, pas un contretemps : rapporte-le tel quel.

## Modèle de menace — borné

La session qui exécutera B est négligente ou opportuniste, **pas un attaquant
motivé**. N'écris aucune contre-mesure contre une attaque délibérée : pas de
signature, pas de chiffrement, pas de détection d'altération au-delà du sceau
sha256 décrit plus haut.

Le vrai risque est bête et mécanique : une sonde qui compte sans vérifier, ou qui
n'exerce qu'un chemin injecté. C'est là que porte ce ticket.

**Interdit :** un critère de GO du type « aucun défaut d'une sévérité donnée ».
Il est inatteignable et bloque le plan.

## Fin — la commande finale et sa preuve observable

Commit atomique des deux livrables. Aucun secret, aucune donnée personnelle : ce
dépôt est public à l'échelle de l'équipe et git garde ce qu'on y met.

Écris le sceau **après** le gel du script, puis termine en lançant, depuis
`/home/nuveo/hermes-os-plan-b`, les deux commandes qui rendent la preuve :

```bash
set -o pipefail
python3 ops/checks/sonde_b.py autotest --facts '{}' | tee /dev/stderr | grep -c '^cas_ok=' \
  && sha256sum -c ops/checks/sonde_b.sha256
```

`set -o pipefail` n'est pas décoratif : sans lui, le code de retour du pipeline
est celui de `grep`, et un autotest qui **échoue** après avoir imprimé trente
lignes afficherait quand même son compte et te laisserait croire que c'est passé. Le
`&&` ne l'est pas davantage : sur deux commandes séparées, le statut de la
séquence est celui de la dernière, et un `sha256sum -c` vert reverdirait un
autotest rouge. C'est du Bash — lance donc ce bloc sous `bash`, pas sous `sh`.

Colle les deux sorties dans ton message de fin. La première doit lister les cas
cassés refusés et finir sur un compte **≥ 42** — en dessous, le `check:` de ce
ticket échouera ; la seconde doit dire `ops/checks/sonde_b.py: OK`, ce qui exige
que le sceau soit au format standard décrit plus haut.

Ce n'est **pas** la commande exacte du `check:`, et ne te fie pas à l'idée
qu'elle le serait : le `check:` appelle `"$HERMES_CHECK_PYTHON"` et non `python3`,
il passe `--facts "$HERMES_TICKET_FACTS"` et non `'{}'`, et il capture stdout
dans une substitution au lieu d'un pipeline. C'est la même *substance* — le même
autotest, le même seuil, le même `sha256sum -c` — dans un habillage plus commode
à lire. Un sceau mal formé ou périmé rendrait les quatre `check:` suivants
impossibles : vérifie-le, ne le suppose pas.
