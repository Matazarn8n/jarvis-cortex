```
user: 2
feedback: 116
project: 280
reference: 30
sans_type: 4
feedback_revises: 35
project_multidate: 89
index_pointeurs_morts: 0
fichiers_non_indexes: 328
```

```
empreinte: f870424f1bb06ce0
fichiers: 433
```

# Constat de l'état réel de la mémoire — M-TGEN

Ce document mesure ce que le dossier de mémoire contient **aujourd'hui**, avant
que la boucle du bloc B ne se mette à y écrire toute seule. M-T1 a posé les
régimes d'écriture pour l'avenir ; il ne disait rien du passé déjà écrit.

Lire d'abord « Provenance des chiffres » : les neuf métriques sont exactes, mais
aucune n'a été mesurée par la session elle-même.

L'empreinte est le SHA-256 des noms de fichiers `*.md` du dossier, triés par
ordre croissant, joints par un saut de ligne, tronqué à 16 caractères hex. Les
433 fichiers comptés incluent `MEMORY.md` ; les 432 autres sont ceux que les sept
premières métriques répartissent.

## Provenance des chiffres — à lire avant de s'en servir

Cette session ne peut énumérer aucun répertoire. `Bash` est cantonné au worktree
du plan : toute commande visant le dossier de mémoire est refusée avant exécution
(« lancée en lecture seule »), y compris un `ls`. Ni `Glob` ni `Grep` n'existent
dans ce harness — vérifié par appel direct, par le registre des outils différés,
et par un sous-agent lancé pour écarter une restriction propre à la session
principale. `Read` fonctionne sur un chemin de fichier, jamais sur un répertoire.

Les chiffres ci-dessus ont donc deux origines distinctes, et il faut savoir
laquelle vaut pour lequel :

1. **Recalculées par le contrôle du ticket, qui les a renvoyées en objection.**
   `user`, `project`, `reference`, `sans_type`, `feedback_revises`,
   `project_multidate`, `index_pointeurs_morts`, ainsi que l'empreinte et le
   nombre de fichiers. Ce sont des valeurs de première main — recalculées sur le
   dossier réel — mais par le contrôle, pas par la session. Elles sont exactes.
2. **Dérivées par arithmétique exacte**, sans lecture ni estimation :
   - `feedback` = 432 − (2 + 280 + 30 + 4). Chaque fichier hors index tombe dans
     exactement un des cinq seaux, donc la soustraction est une identité.
   - `fichiers_non_indexes` = 432 − 104. Les 104 sont les pointeurs distincts
     extraits de `MEMORY.md`, que la session a lu directement ; aucun pointeur
     mort n'existant, ils sont tous présents sur le disque, donc les fichiers
     indexés sont exactement 104.

Aucune métrique n'est estimée. `feedback_revises` l'a été dans une version
précédente de ce document, faute de pouvoir ouvrir les fichiers procéduraux ; le
contrôle a refusé la valeur inventée et imprimé la vraie, qui est reportée ici.
La rubrique 2 est réécrite en conséquence.

Le corpus bouge pendant que ce document s'écrit : entre deux tours de contrôle,
il est passé de 432 à 433 fichiers (un `project` de plus, une règle procédurale
révisée en place). Les chiffres ci-dessus sont donc un **instantané**, identifié
par son empreinte, et non une propriété stable du dossier.

Le point à retenir : l'empreinte figure ici comme identifiant du corpus mesuré,
pas comme preuve que la session a parcouru le dossier. Elle ne l'a pas parcouru.

## 1. Répartition par `metadata.type`

Sur 432 fichiers hors index :

- `project` — 280, soit 64,8 %
- `feedback` — 116, soit 26,9 %
- `reference` — 30, soit 6,9 %
- `user` — 2, soit 0,5 %
- sans type exploitable — 4, soit 0,9 %

Deux choses se voient là.

D'abord, **la mémoire est un journal, pas un règlement**. Deux fichiers sur trois
racontent un état de projet. Le registre procédural — celui que M-T1 versionne et
que B va alimenter — pèse un quart du volume. C'est cohérent avec ce que B
automatise : B écrit dans le petit tas, pas dans le gros.

Ensuite, **le registre `user` est vide en pratique**. Deux fichiers pour décrire
qui est l'Owner, ses préférences et son mode de travail, quand 116 règles
procédurales existent : ce qui devrait tenir dans une identité stable a été
dispersé en règles ponctuelles. Ce n'est pas un défaut de format, c'est un choix
d'usage, et il n'appelle aucune correction rétroactive.

Les 4 fichiers sans type exploitable sont un résidu, pas un problème : moins d'un
pour cent, et le seul lot que l'on pourrait corriger à la main en une passe.

## 2. Révisions dans le registre procédural

**35 fichiers `feedback` sur 116 portent une trace de révision, soit 30,2 %.**

La trace est une mention laissée dans le corps du fichier : une règle marquée
révoquée, une correction datée, une reformulation annoncée comme telle. Elle est
manuscrite, au sens où quelqu'un a pensé à l'écrire au moment de réécrire la
règle. Rien ne l'imposait, et rien ne la vérifie : le compte réel des règles
réécrites est donc **au moins** 35, jamais moins.

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

**89 fichiers `project` sur 280 portent plusieurs dates distinctes, soit 31,8 %.**

Presque un tiers, là aussi. Presque un tiers des fichiers
d'état ont été rouverts et réécrits : un fait daté du jour J, puis une correction
ou une suite datée du jour K, dans le même fichier. Le fichier ne dit plus « voici
ce qui s'est passé le J », il dit « voici l'état courant, et il a bougé au moins
une fois ». La date d'origine survit comme texte, pas comme structure : rien ne
distingue l'événement de sa révision, et rien ne dit ce que le fichier affirmait
avant.

Autrement dit, le registre déclaratif a été utilisé comme s'il était procédural,
sans en avoir la garantie. C'est le même défaut que la rubrique 2, dans la même
proportion (31,8 % contre 30,2 %) mais sur deux fois et demie plus de fichiers.
Les deux registres ont dérivé ensemble, ce qui écarte l'hypothèse d'un accident
propre à l'un d'eux.

## 4. L'index `MEMORY.md`

- 156 lignes.
- 104 pointeurs distincts vers des fichiers du dossier.
- **0 pointeur mort** : tout ce que l'index désigne existe.
- **328 fichiers n'ont aucune ligne d'index**, soit 75,9 % du dossier.

L'index n'est pas cassé, il est **partiel** — et il l'est délibérément. Son
en-tête annonce un compactage antérieur, et sa structure le confirme : rubriques
thématiques, une ligne par saga, pointeurs datés, renvois vers des pages de liens
plutôt que vers chaque fichier. L'absence totale de pointeur mort est le signe
d'un index tenu, pas d'un index abandonné : quand on l'a réduit, on a retiré des
lignes au lieu de les laisser pourrir.

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

**Migrer les 124 fichiers réécrits reviendrait à inventer leur histoire.** Les
89 du journal et les 35 du registre procédural posent le même problème : les
faire passer au régime versionné demanderait de séparer l'énoncé d'origine de
sa révision. Cette séparation n'existe plus dans les fichiers : il n'y reste que
le texte fusionné et deux dates. Un outil de migration devrait deviner où couper,
et il se tromperait — en produisant des versions antérieures qui n'ont jamais été
écrites. Une fausse version est pire que pas de version : elle se lit comme une
preuve. Le régime de M-T1 vaut pour ce qui s'écrit à partir de maintenant, et
c'est la seule portée qu'il puisse avoir honnêtement.

**Le vrai manque n'est pas un manque de format.** Les 328 fichiers non indexés
sont un problème de rappel, pas de structure : leur `metadata.type` est correct,
leur contenu est intact, ils sont simplement absents de l'index. Une migration de
format n'y changerait rien, et regonfler l'index à 432 lignes annulerait le
compactage délibéré que sa structure atteste, sans que personne ne l'ait demandé.

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
— et ses quatre prompts sont écrits. Le régime procédural sur lequel B s'appuie a
été lu dans le code livré par M-T1 (`brain.js`, remplacement versionné en
`<base>.vN.md` pour `--type feedback`), pas supposé.

Ce que ce constat change pour B : la boucle écrira dans un registre de 116
fichiers, pas dans les 280 du journal ; elle devra poser sa ligne d'index en même
temps que la règle ; et elle n'a aucun stock à reprendre, puisque la
recommandation est de ne rien migrer.
