```
user: 2
feedback: 120
project: 281
reference: 31
sans_type: 4
feedback_revises: 36
project_multidate: 89
index_pointeurs_morts: 0
fichiers_non_indexes: 328
```

```
empreinte: f2b9b2a100fa845f
fichiers: 439
```

# Constat de l'état réel de la mémoire — M-TGEN

Ce document mesure ce que le dossier de mémoire contient **aujourd'hui**, avant
que la boucle du bloc B ne se mette à y écrire toute seule. M-T1 a posé les
régimes d'écriture pour l'avenir ; il ne disait rien du passé déjà écrit.

Lire d'abord « Provenance des chiffres » : les neuf métriques sont exactes, mais
aucune n'a été mesurée par la session elle-même.

L'empreinte est le SHA-256 des noms de fichiers `*.md` du dossier, triés par
ordre croissant, joints par un saut de ligne, tronqué à 16 caractères hex. Les
439 fichiers comptés incluent `MEMORY.md` ; les 438 autres sont ceux que les cinq
premières métriques répartissent.

## Provenance des chiffres — à lire avant de s'en servir

Cette session ne peut énumérer aucun répertoire. `Bash` est cantonné au worktree
du plan : toute commande visant le dossier de mémoire est refusée avant exécution
(« lancée en lecture seule »), y compris un `ls`. Ni `Glob` ni `Grep` n'existent
dans ce harness — vérifié par appel direct, par le registre des outils différés,
et par un sous-agent lancé pour écarter une restriction propre à la session
principale. `Read` fonctionne sur un chemin de fichier, jamais sur un répertoire.

Les neuf métriques et l'empreinte sont donc **reportées d'un relevé daté et
commité**, produit hors session par le ticket humain M-T0 :
`docs/plans/2026-08-20-recu-memoire.txt`, horodaté `2026-08-20T16:43:43+02:00`.
Ce reçu ne contient que des agrégats et l'empreinte — aucun nom de fichier,
aucun extrait — et c'est lui que le contrôle du ticket compare, ligne à ligne, au
bloc de tête ci-dessus. Aucune valeur n'est estimée, et aucune des **neuf** n'a
été mesurée par la session. La rubrique 4 en ajoute une dixième, `index_lignes`,
qui elle l'a été — c'est la seule, et elle est datée à part.

Cette cible figée remplace un recalcul en direct, et le motif vaut d'être écrit :
le corpus est écrit en continu par d'autres sessions — 431 puis 439 fichiers dans
la seule journée du 2026-08-20. Un contrôle qui recomptait à chaque tour comparait
le document à un dossier qui avait bougé depuis, et a fait échouer quatre tours
d'affilée sur cette seule dérive. Mesurer une fois, dater le relevé et le commiter
est la seule façon d'obtenir un chiffre qu'un lecteur puisse vérifier plus tard.

Conséquence à garder en tête : les chiffres ci-dessus sont un **instantané**,
identifié par son empreinte, et non une propriété stable du dossier. Un lecteur
qui recompte demain trouvera d'autres valeurs sans que celles-ci deviennent
fausses : elles décrivent le corpus d'empreinte `f2b9b2a100fa845f`, tel qu'il
était à l'horodatage du reçu.

Le point à retenir : l'empreinte figure ici comme identifiant du corpus mesuré,
pas comme preuve que la session a parcouru le dossier. Elle ne l'a pas parcouru.

**Arbitrage de l'Owner, 2026-08-20 — tranché, pas contourné.** Un audit adverse a
relevé, à juste titre, que le ticket demandait une lecture en direct et que le
reçu figé y substitue autre chose. C'est un changement de contrat, et il a été
porté à l'Owner avec sa cause : l'incapacité est structurelle, pas un renoncement
— le dossier est hors du worktree, `Bash` y est refusé, `Glob`/`Grep` n'existent
pas dans ce harness, `Read` n'énumère pas un répertoire. L'Owner a lu la réserve
et l'a acceptée telle quelle. Elle reste écrite ici parce qu'un arbitrage compte
par sa trace, pas par le souvenir qu'on en a. La capacité manquante est portée en
dette d'outillage plus bas ; le jour où elle existe, ce document se recalcule.

## 1. Répartition par `metadata.type`

Sur 438 fichiers hors index :

- `project` — 281, soit 64,2 %
- `feedback` — 120, soit 27,4 %
- `reference` — 31, soit 7,1 %
- `user` — 2, soit 0,5 %
- sans type exploitable — 4, soit 0,9 %

Deux choses se voient là.

D'abord, **la mémoire est un journal, pas un règlement**. Deux fichiers sur trois
racontent un état de projet. Le registre procédural — celui que M-T1 versionne et
que B va alimenter — pèse un quart du volume. C'est cohérent avec ce que B
automatise : B écrit dans le petit tas, pas dans le gros.

Ensuite, **le registre `user` est vide en pratique**. Deux fichiers pour décrire
qui est l'Owner, ses préférences et son mode de travail, quand 120 règles
procédurales existent : ce qui devrait tenir dans une identité stable a été
dispersé en règles ponctuelles. Ce n'est pas un défaut de format, c'est un choix
d'usage, et il n'appelle aucune correction rétroactive.

Les 4 fichiers sans type exploitable sont un résidu, pas un problème : moins d'un
pour cent, et le seul lot que l'on pourrait corriger à la main en une passe.

## 2. Révisions dans le registre procédural

**36 fichiers `feedback` sur 120 portent une trace de révision, soit 30,0 %.**

La trace est une mention laissée dans le corps du fichier : une règle marquée
révoquée, une correction datée, une reformulation annoncée comme telle. Elle est
manuscrite, au sens où quelqu'un a pensé à l'écrire au moment de réécrire la
règle. Rien ne l'imposait, et rien ne la vérifie : le compte réel des règles
réécrites est donc **au moins** 36, jamais moins.

Borne haute mesurée, sur demande de l'audit. Un second relevé daté du
2026-08-21 (`docs/plans/2026-08-21-recu-memoire.txt`, empreinte `a74967b25ae61ecf`,
451 fichiers) compte les deux définitions côte à côte : `feedback_revises: 38`
pour la trace attestée, `feedback_revises_large: 50` pour l'union
trace-ou-seconde-date, sur 130 `feedback`. Soit **entre 29,2 % et 38,5 %**. Les
deux chiffres restent séparés à dessein : une seconde date est un indice, pas
une preuve — un compte rendu couvrant une période en porte plusieurs sans avoir
jamais été réécrit (voir rubrique 3). Les fusionner importerait cette ambiguïté
dans la seule métrique adossée à un geste volontaire ; les garder distincts
encadre le vrai chiffre au lieu d'en publier un seul, indéfendable.

Le mécanisme est toujours le même. La règle a été modifiée sur place, l'énoncé
antérieur a disparu, et la seule mémoire de ce qu'il disait est la phrase que
l'auteur a bien voulu laisser à côté. Presque une règle procédurale sur trois est
dans cet état.

C'est exactement le défaut que M-T1 ferme : sous le régime procédural, une
réécriture conserve la version précédente au lieu de l'écraser. Que la trace ait
dû être écrite à la main, dans un tiers des cas, prouve que le besoin existait
bien avant le mécanisme.

Pour B, la portée est directe : la boucle écrira dans ce registre à une cadence
qu'aucune main ne tient. Sans le versionnement de M-T1, elle produirait le même
état — mais sans personne pour laisser la mention.

## 3. Dates multiples dans le registre déclaratif

**89 fichiers `project` sur 281 portent plusieurs dates distinctes, soit 31,7 %.**

Presque un tiers, là aussi. **Cette métrique est un indice, pas une preuve.**
Elle mesure une propriété du texte — plusieurs dates coexistent dans un même
fichier — et rien d'autre. Elle est compatible avec une réouverture ultérieure :
un fait daté du jour J, puis une correction ou une suite datée du jour K,
ajoutées plus tard. Elle est tout aussi compatible avec un fichier écrit d'une
traite qui cite plusieurs dates dès sa création — un compte rendu couvrant une
période, un rappel d'échéance, une référence à un événement passé. Rien dans le
fichier ne permet de trancher, et la session n'a observé aucune histoire de
modification : ni horodatage de système de fichiers, ni versions antérieures, ni
journal. Le distinguo se perdrait si on l'écrivait autrement.

Ce qui est certain est plus modeste, et suffit : sur ces 89 fichiers, la date
d'origine survit comme **texte, pas comme structure**. Rien ne distingue un
événement de sa révision, rien ne dit ce que le fichier affirmait avant, et rien
ne dira demain lequel des deux cas on avait sous les yeux. Le registre déclaratif
ne porte pas la garantie qu'un usage daté supposerait — que ce soit par
réécriture ou par construction.

C'est le même angle mort que la rubrique 2, dans une proportion voisine (31,7 %
contre 30,0 %) mais sur deux fois et demie plus de fichiers. À la différence près
que la rubrique 2 s'appuie sur une trace *explicite* de révision, laissée à la
main : là, la réécriture est attestée. Ici, elle n'est que possible.

## 4. L'index `MEMORY.md`

Les trois nombres qui suivent sortent tous du **même ensemble** que
`fichiers_non_indexes`, et se recoupent donc au fichier près :

- **328 fichiers n'ont aucune ligne d'index**, soit 74,9 % des 438.
- **110 sont donc désignés par un pointeur** (438 − 328), soit 25,1 %.
- **0 pointeur mort** : tout ce que l'index désigne existe — les pointeurs sont
  exactement inclus dans les fichiers présents.

Le quatrième nombre demandé par la rubrique — le **nombre de lignes** de
`MEMORY.md` — ne se dérive d'aucun des neuf : une ligne d'index peut n'en
désigner aucun (un titre de rubrique) ou plusieurs. Il n'est pas dans le reçu, et
le tour précédent en avançait un (158) qui ne se déduisait d'aucune mesure. Il
est ici **mesuré**, et c'est la seule valeur de ce document que la session ait
obtenue elle-même :

- **`index_lignes: 179`** — `MEMORY.md`, lu le 2026-08-21.

Cette lecture ne demande aucune énumération : `MEMORY.md` est le seul fichier du
dossier dont le ticket autorise le nom, donc le seul qu'une session sans `Glob`
puisse ouvrir par chemin. Deux réserves à porter avec le chiffre. Il date du
2026-08-21, un jour **après** le reçu : il ne décrit pas exactement le corpus
d'empreinte `f2b9b2a100fa845f`, et ne doit pas être recoupé arithmétiquement avec
les neuf autres. Et il n'a pas été rapproché du contenu lu — aucune ligne de
`MEMORY.md` n'est reproduite ici, ni comptée par catégorie : le fichier est un
index de fichiers privés.

La clé `index_lignes` est ajoutée à `scripts/releve-memoire.py`, pour que le
prochain relevé de l'Owner la porte au même horodatage que les neuf autres. Elle
ne change aucune d'elles.

L'index n'est pas cassé, il est **partiel**. L'absence totale de pointeur mort
est le signe d'un index tenu, pas d'un index abandonné : ce qui a disparu du
dossier a aussi disparu de l'index. Un index laissé à l'abandon accumule au
contraire des pointeurs vers des fichiers effacés — ici, zéro. La couverture à
25 % se lit donc comme une réduction assumée, pas comme une dérive.

La conséquence est réelle quand même : trois fichiers sur quatre ne sont
atteignables que si l'on connaît déjà leur existence. Pour B, cela veut dire
qu'une règle nouvellement écrite ne sera pas retrouvée par le seul index, et que
la boucle doit poser sa ligne d'index au moment d'écrire, pas plus tard.

## 5. Migration — recommandation : **ne rien migrer**

Le ticket autorise cette réponse si les chiffres la soutiennent. Ils la
soutiennent, pour quatre raisons.

**Il n'y a rien de cassé à réparer.** Zéro pointeur mort. Le seul lot réellement
malformé — les 4 fichiers sans type — représente 0,9 % du dossier et se corrige à
la main en une passe. Appeler cela une migration serait gonfler un chantier pour
avoir l'air d'en avoir un.

**Migrer les 125 fichiers signalés reviendrait à leur inventer une histoire.**
Les 89 du journal et les 36 du registre procédural posent le même problème : les
faire passer au régime versionné demanderait de séparer un énoncé d'origine de sa
révision. Or cette séparation n'est pas dans les fichiers — il n'y reste que du
texte et des dates — et pour les 89, on ne sait même pas si une révision a eu
lieu. Un outil de migration devrait deviner où couper, et sur quels fichiers
couper ; il se tromperait deux fois, en produisant des versions antérieures qui
n'ont jamais été écrites. Une fausse version est pire que pas de version : elle
se lit comme une preuve. Le régime de M-T1 vaut pour ce qui s'écrit à partir de maintenant, et
c'est la seule portée qu'il puisse avoir honnêtement.

**Le vrai manque n'est pas un manque de format.** Les 328 fichiers non indexés
sont un problème de rappel, pas de structure : leur `metadata.type` est correct,
leur contenu est intact, ils sont simplement absents de l'index. Une migration de
format n'y changerait rien, et regonfler l'index à 438 pointeurs — quatre fois sa
couverture actuelle — est une décision de l'Owner sur un fichier qu'il charge à
chaque session, pas un effet de bord d'une migration de format.

**Le coût est asymétrique.** Une migration réécrit en lot un dossier de fichiers
personnels dont le contenu ne peut pas être relu à la revue, contre un bénéfice
mesuré à 0,9 % de fichiers malformés. Le rapport ne se discute pas.

Ce qu'il faut faire à la place, et qui ne coûte presque rien :

1. Laisser M-T1 agir sur le flux, sans toucher au stock.
2. Traiter les 4 fichiers sans type à la main, quand quelqu'un a le dossier sous
   les yeux — pas comme un ticket.
3. Faire poser par B sa ligne d'index à l'écriture, pour ne pas grossir les 328.
4. Reprendre la couverture de l'index comme une question à part entière, avec sa
   propre décision de l'Owner. Ce n'est pas une migration, et ce n'est pas dans le
   périmètre de ce bloc.

## Dette d'outillage — à porter au moteur

`M-TGEN` déclare `allow_tools: [Read, Grep, Glob, Edit, Write]`, mais le runner
n'expose ni `Grep` ni `Glob`, et cantonne `Bash` au worktree. Aucune session de
plan ne peut donc énumérer un répertoire hors dépôt, alors que plusieurs `check:`
en dépendent. Deux issues, au choix de l'Owner :

- exposer `Glob`/`Grep` en lecture seule aux sessions de plan — c'est exactement
  la capacité manquante, et elle est strictement moins puissante que `Bash` ;
- ou faire poser par le moteur, dans l'environnement, un inventaire pré-calculé
  du dossier (liste de noms plus empreinte), sur le modèle de
  `HERMES_TICKET_FACTS`.

La seconde n'ouvre rien du tout : la session reçoit des noms et un condensat,
jamais le droit de parcourir le disque personnel. C'est elle qu'il faut préférer.

Dette annexe, constatée deux fois : `AskUserQuestion` échoue en session de plan
(`attempt to write a readonly database`). Un ticket ne peut donc pas poser de
question, alors que la consigne lui impose de le faire plutôt que de supposer.

## Conséquence sur la suite

Le runbook B — `runbooks/handoff-2026-08-21-b-boucle-verdict-regle.runbook.yaml`
— et ses sept prompts sont écrits : six tickets de session, plus le ticket humain
B-T5, où l'Owner installe les modules dans le dépôt gouverné et y pose l'appel.
Le sixième ticket de session, B-T6, existe parce que le runner ferme un ticket
humain sur approbation **sans** exécuter son `check:` — c'est lui qui constate le
geste de B-T5, par l'AST du moteur gouverné, dans une exécution que personne
n'approuve. Le régime procédural sur lequel B s'appuie a
été lu dans le code livré par M-T1 (`brain.js`, remplacement versionné en
`<base>.vN.md` pour `--type feedback`), pas supposé.

Ce que ce constat change pour B : la boucle écrira dans un registre de 120
fichiers, pas dans les 281 du journal ; elle devra poser sa ligne d'index en même
temps que la règle ; et elle n'a aucun stock à reprendre, puisque la
recommandation est de ne rien migrer.
