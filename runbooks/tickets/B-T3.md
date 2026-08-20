RÉPERTOIRE DE TRAVAIL : `/home/nuveo/hermes-os-plan-b`. Tout chemin relatif s'y
résout, et tout fichier que tu produis doit y atterrir.

# Ticket B-T3 — Le pont vers `brain.js` : versionner, indexer, ne rien empiler

**Modèle : `claude-opus-5` · effort : `high`.** C'est le ticket où la boucle
touche le disque, et où une erreur s'industrialise à la cadence des gates.

**Lis `docs/plans/2026-08-21-b-contrat-injection.md`** (fait foi) et le module
`ops/verdict_regles.py` livré par B-T2, qui te fournit les règles à écrire.

Tu n'écris **pas** le point d'entrée qui relie les deux : c'est B-T4. Un seul
livrable ici, `ops/brain_bridge.py`.

Le `check:` appelle la sonde avec `--module ops/brain_bridge.py` et **compte**
les lignes `cas_ok=` qu'elle imprime : il en exige **neuf** — `.v1` versionné,
`.md` à jour, `.v2` absent au rejeu, une seule ligne d'index,
`etat == "inchangee"` décidé, une révision du seul `why` qui produit `.v2`,
l'index toujours à une ligne après elle, puis **deux écrivains concurrents sur
une racine partagée** qui doivent produire leurs deux règles et leurs deux
lignes d'index. Un axe non exercé ne compte pas.

## Le livrable — `ops/brain_bridge.py`

Le pont, isolé dans son propre module neuf et autonome : il n'importe rien du
moteur, dont ce bloc **ne modifie aucun** fichier de gouvernance.

Il expose exactement deux noms :

- **`BRAIN_JS`** — un `pathlib.Path` vers `brain.js`, **résolu**, pas deviné.
  Le dépôt jarvis-cortex n'est pas ce dépôt-ci ; le chemin canonique est à
  établir sur le disque, avec un secours par variable d'environnement. Consigne
  dans le module comment tu l'as résolu et ce qui se passe s'il est absent.
- **`ecrire_regle(regle: dict, *, racine=None) -> dict`** — écrit une règle via
  `node brain.js store ... --type feedback`. Il rend
  `{"etat": "ecrite" | "inchangee", "fichier": "<nom>.md"}`, et **lève** si
  l'écriture a échoué — c'est B-T4 qui décide quoi faire de l'exception.

`racine` est le point central de ce ticket, et il n'est pas un confort de test.
`racine=None` écrit dans la mémoire réelle ; `racine=<dossier>` écrit **dans ce
dossier et nulle part ailleurs**, index compris. C'est ce qui rend le pont
vérifiable sans toucher à la mémoire de l'Owner, **et** ce qui permet à deux
*contrôles* concurrents de ne pas se marcher dessus : un bac à sable partagé et
son `MEMORY.md` unique faisait perdre ou ressusciter les lignes d'une exécution
par l'autre. Un dossier neuf par exécution supprime cette course-là.

Elle ne supprime pas l'autre, et c'est le point dur de ce ticket : **la mémoire
réelle est une racine partagée**, et deux gates qui rendent leur verdict en même
temps y écrivent en même temps. Voir plus bas — c'est le verrou, pas le bac à
sable, qui répond à celle-là.

Établis **sur le disque** comment `brain.js` accepte une racine de magasin —
variable d'environnement lue à son démarrage, option de ligne de commande, ou
`--sandbox` s'il n'expose que celle-là. Consigne en tête du module ce que tu as
trouvé et comment tu le passes (via `env=` de `subprocess`, en toute logique).
Si `brain.js` n'offre **aucun** moyen de choisir sa racine, c'est ta trouvaille
et elle prime sur ce prompt : consigne-la en dette, nommément, et dis-le dans ton
message de fin — ne simule pas l'isolation en écrivant les fichiers toi-même,
tu casserais le régime versionné décrit ci-dessous.

Points de vigilance, tous mécaniques :

- Le texte d'un finding vient d'un rapport Codex : il contient des guillemets,
  des retours à la ligne, des pipes. **Passe les arguments en liste à
  `subprocess`, jamais une chaîne de shell.** Ce n'est pas une contre-mesure
  anti-attaquant — c'est qu'un rapport quelconque casse une commande construite
  par concaténation, et une commande cassée écrit n'importe quoi.
- `brain.js store` sort en **code 1** avec `[brain] ...` sur stderr quand il
  refuse (cas `project` append-only). Traite l'échec, ne l'avale pas : lève avec
  le stderr dans le message.
- Borne le temps d'exécution et remonte l'erreur : `subprocess.run(..., timeout=)`
  de la bibliothèque standard suffit, et garde le module autonome. La primitive
  du moteur ferait entrer tout `ops/plan_runner.py` dans l'import — c'est le
  contraire de ce qu'on veut ici.

## Les trois points à ne pas rater

### 1. Le régime procédural — ne le casse pas

M-T1 a posé, dans `brain.js` (l. 197-206), que `--type feedback` **versionne** :
si le fichier existe, l'ancien contenu part dans `<base>.vN.md` avant d'être
remplacé. C'est exactement ce que B doit préserver. Une boucle qui écraserait au
lieu de versionner détruirait des règles à grande vitesse — c'est la raison pour
laquelle B vient après M-T1.

Ton travail est de **ne pas casser** ce régime : n'écris pas le fichier
toi-même, ne pré-supprime rien, ne passe pas `--force`. Laisse `brain.js` faire.

### 2. L'idempotence — c'est toi qui la portes, pas `brain.js`

`brain.js store` versionne **à chaque appel**, sans regarder si le fait a changé,
et il appose sa ligne d'index **en append-only**. Rejoue le même gate trois fois
et tu obtiens `.v1`, `.v2` et trois lignes d'index pour une seule règle. Le
contrat de B-T1 tranche à quelle condition on réécrit : implémente-le **avant**
d'appeler `node`.

Le cas nominal est celui-là : lis le fichier courant de la règle, et s'il porte
déjà **le même contenu**, rends `{"etat": "inchangee"}` **sans appeler
`brain.js`**. Une lecture évitée vaut mieux qu'une version fabriquée.

**« Le même contenu » se définit sur tout le contenu persistant, pas sur le seul
`fait`.** Le contrat de B-T1 énumère les champs qu'une règle persiste — `fait`,
`why`, `type` ; l'égalité porte sur cet ensemble entier, et sur rien d'autre (ni
l'horodatage, ni un champ que le magasin regénère). C'est le point où l'audit a
mordu : un pont qui ne compare que le `fait` déclare `inchangee` une règle dont
la **justification** a été corrigée. La révision est alors perdue en silence —
pas de nouveau contenu, pas de `.vN`, pas de trace, rien à retrouver. Or c'est
précisément le cas fréquent d'une boucle automatique : le même défaut est
reconstaté d'un gate à l'autre avec un motif reformulé ou précisé. Une règle
dont le `why` change **est** une révision, et une révision se versionne.

Le corollaire vaut aussi dans l'autre sens : ne fabrique pas une différence là
où il n'y en a pas. Compare des champs normalisés de la même façon des deux
côtés (le contrat de B-T1 dit lesquels et comment) — sinon un espace de fin
suffit à empiler une version par rejeu, et tu as reconstruit le défaut d'en
face.

L'index compte autant que le fichier : le constat du bloc M mesure 328 fichiers
sur 438 sans ligne d'index. Une règle écrite par B vaut **exactement une** ligne
d'index — pas zéro, pas une par rejeu, et pas une de plus quand une révision
versionne le fichier.

### 3. La concurrence — un verrou par racine, et un remplacement atomique

Le point précédent te met dans une situation que `brain.js` ne gère pas pour toi.
Il ajoute sa ligne d'index **en append-only** (l. 208-220) : tenir *une* ligne
par règle à travers les révisions t'oblige donc à **relire `MEMORY.md`, le
dédoublonner, et le réécrire**. C'est un cycle lecture-modification-écriture sur
un fichier partagé, et la mémoire réelle *est* partagée : deux gates qui
finissent en même temps lancent deux `ecrire_regle` sur la même racine. Sans
précaution, chacun relit l'index d'avant l'autre et le réécrit ensuite — la ligne
du perdant disparaît, silencieusement, et un test séquentiel reste vert.

Trois exigences, toutes trois dans la bibliothèque standard :

- **un verrou par racine** — le fichier `<racine>/.memory.lock`, **ce nom-là et
  pas un autre** : la sonde `pont` de B-T0 tente de le prendre pendant que tu
  écris, et exige d'essuyer un refus. Prends-le pour toute la durée du cycle : la
  lecture de l'index, l'appel à `node`, la réécriture. `fcntl.flock` sur un
  descripteur ouvert suffit, il est interprocessus et le noyau le libère si le
  processus meurt — c'est ce qui compte ici, une session tuée ne doit pas geler la
  boucle. Libère-le dans un `finally`, et borne l'attente (`timeout=` de ta boucle
  d'acquisition) plutôt que de bloquer sans fin ;
- **une réécriture bornée à ta propre règle** — c'est le second défaut relevé par
  l'audit, et il ne se répare pas avec un verrou. Ton verrou ne lie que les
  appelants qui passent par ce pont ; `brain.js` reste appelable directement, à la
  main ou par un autre outil, et cet écrivain-là n'en sait rien. Donc ne
  reconstruis **jamais** `MEMORY.md` depuis une idée que tu t'en fais : relis-le
  **après** le retour de `node`, au plus tard, et n'en retire que les lignes
  d'index **surnuméraires pointant sur le slug que tu viens d'écrire** (garde la
  dernière). Toute autre ligne est recopiée **telle quelle**, octet pour octet, y
  compris celles apparues depuis le début de ton cycle. Une ligne que tu ne
  reconnais pas n'est pas à toi ;
- **un remplacement atomique, sous garde** — écris l'index dans un fichier
  temporaire du même répertoire, puis `os.replace()`. Un `write()` direct laisse
  une fenêtre où `MEMORY.md` est tronqué, et un processus interrompu au mauvais
  moment le laisse ainsi pour de bon. Et parce qu'un écrivain direct peut avoir
  ajouté sa ligne entre ta relecture et ton `os.replace()`, relève
  `os.stat()` (taille et `st_mtime_ns`) au moment de la relecture, revérifie-le
  juste avant `os.replace()`, et **recommence la relecture** s'il a bougé — deux
  ou trois tours bornés, puis renonce à dédoublonner plutôt que d'écraser. Laisser
  un doublon d'index est un défaut cosmétique ; effacer la ligne d'un autre est
  une perte.

Ce n'est pas une contre-mesure anti-attaquant : c'est deux gates honnêtes qui
finissent à la même seconde, et un mainteneur qui lance `brain.js` à la main
pendant que la boucle tourne. Consigne dans le module ce que tu verrouilles, sur
quelle granularité, ce qui se passe si le verrou n'est pas obtenu à temps, et la
fenêtre résiduelle ci-dessous — ne la maquille pas en garantie.

**Reste une dette, et elle est du ressort du magasin, pas du tien.** Un écrivain
qui ignore le verrou et dont l'ajout tombe entre ta dernière vérification de
`os.stat()` et ton `os.replace()` perd quand même sa ligne. La fermer exigerait
que `brain.js` prenne le même verrou — un changement d'une dépendance hors de ce
dépôt, hors du périmètre de B. Écris-la en une ligne dans le module ; ne rallonge
pas le pont pour la contourner.

## Ce que le check fera

Le `check:` de ton ticket est un appel d'une ligne à la sonde `pont` de
`ops/checks/sonde_b.py`, livré par B-T0 — écrite **avant** ton module, elle n'a
pas été taillée pour le laisser passer. Lis-la.

Elle importe ton module, vérifie que `BRAIN_JS` **existe** sur le disque, crée un
dossier neuf `<parent de brain.js>/.cache/sonde-b-<pid>-<ns>/` et appelle
`ecrire_regle(..., racine=<ce dossier>)` **quatre fois** sur le même slug —
le quatrième ne change que le `why` :

| # | `fait`    | `why`   | attendu                                |
|---|-----------|---------|----------------------------------------|
| 1 | `PREMIER` | `WHY_A` | `etat == "ecrite"`                     |
| 2 | `SECOND`  | `WHY_A` | `etat == "ecrite"`, `.v1` apparaît     |
| 3 | `SECOND`  | `WHY_A` | `etat == "inchangee"`, rien n'apparaît |
| 4 | `SECOND`  | `WHY_B` | `etat == "ecrite"`, `.v2` apparaît     |

Elle exige ensuite :

- `<slug>.v1.md` présent et contenant `PREMIER` — la réécriture a versionné ;
- `<slug>.md` contient `SECOND` — la réécriture a bien eu lieu ;
- `<slug>.v2.md` **absent après le troisième appel** — le rejeu à l'identique
  n'a rien empilé ;
- le `MEMORY.md` du dossier porte **une** ligne mentionnant le slug après
  **chacun** des trois premiers appels — pas zéro, pas une par rejeu ;
- le troisième appel rend `etat == "inchangee"` : l'idempotence doit être
  *décidée* par ton module, pas obtenue par accident ;
- le quatrième appel rend `etat == "ecrite"`, `<slug>.v2.md` apparaît et
  contient `WHY_A`, et `<slug>.md` contient `WHY_B` — la révision d'une
  justification est versionnée, pas avalée ;
- `MEMORY.md` porte **toujours une seule** ligne après le quatrième appel.

Puis elle exerce la **concurrence**, ce que les quatre appels séquentiels ne
peuvent pas faire : dans un sous-dossier neuf du bac à sable — une racine
**partagée**, cette fois. **Quatre** axes, et deux d'entre eux ne se contentent
pas d'espérer un entrelacement.

D'abord deux écrivains simultanés (deux `threading.Thread`, ou deux
sous-processus) sur **deux slugs distincts** :

- les **deux** `<slug>.md` présents — aucune écriture perdue ;
- `MEMORY.md` portant **exactement une** ligne pour chacun des deux slugs, soit
  deux lignes au total.

Ces deux axes-là sont nécessaires mais **ne prouvent rien à eux seuls**, et
l'audit l'a dit : deux fils lancés une fois peuvent être ordonnancés
séquentiellement, auquel cas un pont sans le moindre verrou les passe. D'où les
deux axes suivants, qui ne dépendent pas de l'ordonnanceur :

- **le verrou est réellement pris.** Pendant qu'un `ecrire_regle` est en vol dans
  un fil, la sonde tente elle-même, en boucle serrée,
  `fcntl.flock(<racine>/.memory.lock, LOCK_EX | LOCK_NB)` et exige **au moins un
  refus** (`BlockingIOError`). L'appel à `node` dure des dizaines de
  millisecondes : la fenêtre est large et l'observation fiable. Un pont qui
  n'ouvre jamais ce fichier ne refuse jamais rien, et échoue ici — c'est la
  vérification directe que le test comportemental ne pouvait pas rendre ;
- **un écrivain direct concurrent ne perd pas sa ligne.** La sonde joue le
  mainteneur qui lance `brain.js` à la main : ayant constaté ci-dessus que le
  verrou est tenu, donc qu'un cycle est en cours, elle **ajoute elle-même** une
  ligne d'index pour un troisième slug directement dans `MEMORY.md`, sans prendre
  le verrou. Le moment est choisi, pas espéré. Une fois le fil joint, cette ligne
  doit **toujours être là**. Un pont qui réécrit l'index depuis un instantané
  périmé l'a effacée ; celui qui ne retire que ses propres doublons et revérifie
  `os.stat()` avant `os.replace()` l'a gardée.

Puis elle efface le dossier entier, dans un `finally`. Elle ne peut emporter que
ce qu'elle a créé : le dossier n'a pas existé avant elle. C'est aussi pourquoi
elle ne touche jamais à un `MEMORY.md` partagé — un contrôle ne dégrade pas ce
qu'il mesure, et il ne se dégrade pas non plus lui-même quand deux exécutions se
croisent.

C'est une sonde comportementale : elle exerce le pont réel, elle ne lit aucun
marqueur que ta session aurait imprimé.

## Modèle de menace — borné

La session est négligente ou opportuniste, pas un attaquant motivé. Pas de
contre-mesure contre une attaque délibérée ; pas de critère de GO du type
« aucun défaut CRITIQUE ni HAUTE », qui est inatteignable et bloque le plan.

## Fin — la commande finale et sa preuve observable

Termine en lançant, depuis `/home/nuveo/hermes-os-plan-b`, la séquence qui
exerce ton pont dans un bac à sable **à elle**, rapporte ce que le disque porte
ensuite, puis efface ce dossier et rien d'autre :

```bash
python3 - <<'PY'
import importlib.util, os, pathlib, shutil, threading, time
s = importlib.util.spec_from_file_location("bb", pathlib.Path("ops/brain_bridge.py").resolve())
bb = importlib.util.module_from_spec(s); s.loader.exec_module(bb)
box = bb.BRAIN_JS.parent / ".cache" / f"preuve-b-t3-{os.getpid()}-{time.time_ns()}"
box.mkdir(parents=True)
slug = "feedback_preuve_b_t3"
v2 = box / f"{slug}.v2.md"
try:
    etats = []
    for fait, why in (("PREMIER", "WHY_A"), ("SECOND", "WHY_A"), ("SECOND", "WHY_A"), ("SECOND", "WHY_B")):
        etats.append(bb.ecrire_regle({"slug": slug, "fait": fait, "why": why, "type": "feedback"}, racine=box)["etat"])
        if len(etats) == 3:
            print("v2 apres le rejeu identique =", v2.exists(), "(attendu False)")
    idx = box / "MEMORY.md"
    print("brain.js =", bb.BRAIN_JS, "| etats =", etats,
          "| v1 =", (box / f"{slug}.v1.md").exists(), "| v2 apres revision du why =", v2.exists(),
          "| v2 porte WHY_A =", v2.exists() and "WHY_A" in v2.read_text(encoding="utf-8"),
          "| lignes d'index =", idx.read_text(encoding="utf-8").count(slug) if idx.exists() else 0)
    part = box / "partagee"; part.mkdir()
    slugs = ["feedback_preuve_b_t3_a", "feedback_preuve_b_t3_b"]
    fils = [threading.Thread(target=bb.ecrire_regle,
                             args=({"slug": s, "fait": "CONCURRENT", "why": "WHY_C", "type": "feedback"},),
                             kwargs={"racine": part}) for s in slugs]
    for f in fils: f.start()
    for f in fils: f.join()
    ipart = (part / "MEMORY.md").read_text(encoding="utf-8") if (part / "MEMORY.md").exists() else ""
    print("concurrence: regles =", [(part / f"{s}.md").exists() for s in slugs],
          "| lignes d'index =", [ipart.count(s) for s in slugs], "(attendu [True, True] et [1, 1])")
finally:
    shutil.rmtree(box, ignore_errors=True)
PY
```

Colle sa sortie dans ton message de fin. Attendu :
`etats = ['ecrite', 'ecrite', 'inchangee', 'ecrite']`, `v2 apres le rejeu
identique = False`, `v1 = True`, `v2 apres revision du why = True` portant
`WHY_A`, et **une seule** ligne d'index d'un bout à l'autre. Puis, sur la racine
partagée, `regles = [True, True]` et `lignes d'index = [1, 1]`.

Les trois échecs à ne pas maquiller. Si la racine partagée rend `[1, 0]` ou
`[0, 1]`, ton verrou n'existe pas ou ne couvre pas tout le cycle : une des deux
règles a été indexée puis effacée par l'autre, et c'est le défaut qui perd des
lignes en production sans jamais rien afficher. Si `v2` est vrai après le rejeu identique,
ton idempotence n'existe pas. Si le quatrième état est `inchangee`, elle est trop
large : tu ne compares que le `fait` et tu viens de perdre une révision.
Dis-le plutôt que de relancer jusqu'à ce que ça passe. Si le dossier reste vide,
c'est que `racine` n'est pas honorée : c'est le résultat de ta session,
rapporte-le tel quel.

Commit atomique du seul module. Aucun secret, aucune donnée personnelle, et
**aucun contenu de la mémoire recopié dans le dépôt** : les fichiers de règles
portent des clients et des personnes, et git garde ce qu'on y met même après
suppression.
