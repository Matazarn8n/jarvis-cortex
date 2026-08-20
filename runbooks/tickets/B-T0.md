RÉPERTOIRE DE TRAVAIL : `/home/nuveo/hermes-os-plan-b`. Tout chemin relatif s'y
résout, et tout fichier que tu produis doit y atterrir.

# Ticket B-T0 — Le vérificateur : les quatre sondes de B, en un script

**Modèle : `claude-opus-5` · effort : `high`.** Tu écris l'instrument qui juge
les quatre tickets suivants. Une sonde permissive ne se voit pas : elle rend
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

Un `check:` est un appel, pas un programme. Les quatre `check:` de ce runbook
sont donc des lignes de la forme :

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
sonde_b.py {contrat|decision|pont|entree|autotest} --facts <json> [--sceau <fichier>] [--racine <dir>] [--module <chemin>]
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
- la racine porte exactement les clés `derivation_slug` et `cas` ;
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

Imprime les comptes que tu as **calculés** : nombre de cas, liste des verdicts
productifs, total des règles attendues, dérivation annoncée.

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

**Bac à sable propre à l'exécution.** Le contrôle précédent écrivait dans le
`.cache/sandbox-memory` partagé et réécrivait son `MEMORY.md` en entier sans
verrou : deux exécutions concurrentes pouvaient perdre ou ressusciter les lignes
l'une de l'autre, malgré des slugs distincts. Tu ne partages plus rien :

- fabrique un dossier neuf, `<parent de brain.js>/.cache/sonde-b-<pid>-<ns>/`,
  et passe-le à `ecrire_regle(..., racine=<ce dossier>)` ;
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
   `<slug>.md` attendu existe et porte le fait — pas l'état rendu par la
   fonction, qu'un stub peut fabriquer.
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

Enfin la **non-régression de périmètre** : `injecter_regles`,
`regles_depuis_verdict` et `ecrire_regle` sont absents des trois fichiers de
gouvernance — `ops/plan_runner.py`, `ops/plan_doctor.py`, `ops/plan_factory.py`.

Ne prétends pas plus que cela. Un contrôle ne peut pas lire la liste des fichiers
du diff du ticket : cette non-régression borne le **contenu** de ces trois
fichiers, elle n'est pas une whitelist du commit. La dette est déjà consignée en
tête du runbook ; ne la maquille pas en garantie.

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
| `contrat`  | 7                 | les 6 cas de matrice + l'axe du document         |
| `decision` | 6                 | un par verdict du domaine                        |
| `pont`     | 7                 | `.v1`, `.md`, `.v2` absent, index, `inchangee`, révision du `why`, index après révision |
| `entree`   | 8                 | les 5 passes, les 2 CLI, la non-régression       |
| `autotest` | 27                | 4 arbres valides + les 23 pièges énumérés plus bas |

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
dans `ops/plan_runner.py` — c'est la dette que l'Owner paiera à la main. Le jour
où il la paie, une non-régression écrite naïvement ferait rougir la sonde sur son
geste légitime, à chaque rejeu, ré-audit de chaîne ou maillon suivant qui
réutilise cette sonde. Défaut déjà payé ici : le texte d'un runbook est lu comme
une norme, et une norme absolue devient un blocage que personne ne peut lever.

La non-régression tolère donc la présence de ces noms dans un fichier de
gouvernance **si et seulement si** ce fichier porte aussi, sur une de ses lignes,
un marqueur de raccordement daté de la forme :

```
# raccordement B verdict->regle, pose a la main le YYYY-MM-DD par l'Owner
```

Sans marqueur, la présence reste un échec. Avec marqueur, la sonde consigne la
présence dans sa sortie (elle l'imprime, elle ne la tait pas) et rend 0 sur cet
axe. Le marqueur est une déclaration humaine, pas une preuve : c'est assumé — il
n'existe pas de contrôle mécanique qui distingue le raccordement voulu par
l'Owner d'un contournement, et prétendre le contraire serait la vraie faute.

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
  formule de GO inatteignable ; un document amputé d'une ancre.
- `decision` : un module qui rend le bon compte mais des règles sans `fait` ;
  un qui rend un `type` autre que `feedback` ; un qui dérive le slug autrement
  que par `sha256` ; un stub qui rend toujours une règle.
- `pont` : un faux pont qui n'écrit pas de `.v1` ; un qui empile un `.v2` au
  rejeu ; un qui ajoute une ligne d'index par appel ; **un qui ne compare que le
  `fait` et rend donc `inchangee` quand seul le `why` change** — c'est le piège
  qui garde l'idempotence honnête.
- `entree` : un module qui lève au lieu de journaliser l'échec ; un qui écrit
  même sur `GO` ; un dont le chemin par défaut ne touche jamais le disque ;
  **une CLI qui imprime `echec…` mais sort quand même en 0** sur une racine
  impossible.

Les faux modules sont de quelques lignes chacun, écrits dans le temporaire — ils
ne sont pas commités ailleurs que dans le corps de `sonde_b.py`.

**La sortie de l'autotest nomme les cas rejetés**, un par ligne au format
`cas_ok=<nom>` du contrat de sortie ci-dessus — un arbre valide accepté et un
piège refusé comptent chacun pour une ligne. Les vingt-trois pièges énumérés
ci-dessus plus les quatre arbres valides font le seuil de 27 ; en ajouter est
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
python3 ops/checks/sonde_b.py autotest --facts '{}' | tee /dev/stderr | grep -c '^cas_ok='
sha256sum -c ops/checks/sonde_b.sha256
```

Colle les deux sorties dans ton message de fin. La première doit lister les cas
cassés refusés et finir sur un compte **≥ 27** — en dessous, le `check:` de ce
ticket échouera ; la seconde doit dire `ops/checks/sonde_b.py: OK`, ce qui exige
que le sceau soit au format standard décrit plus haut. C'est la commande exacte
que lance le `check:` : un sceau mal formé ou périmé rendrait les quatre `check:`
suivants impossibles — vérifie-le, ne le suppose pas.
