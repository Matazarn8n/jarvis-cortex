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
les lignes `cas_ok=` qu'elle imprime : il en exige **cinq** — `.v1` versionné,
`.md` à jour, `.v2` absent au rejeu, une seule ligne d'index, et
`etat == "inchangee"` décidé. Un axe non exercé ne compte pas.

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
contrôles concurrents de ne pas se marcher dessus : un bac à sable partagé et
son `MEMORY.md` unique, réécrit sans verrou, faisait perdre ou ressusciter les
lignes d'une exécution par l'autre. Un dossier neuf par exécution supprime la
course au lieu de la gérer.

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

## Les deux points à ne pas rater

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

Le cas nominal est celui-là : lis le fichier courant de la règle, s'il porte déjà
le même fait, rends `{"etat": "inchangee"}` **sans appeler `brain.js`**. Une
lecture évitée vaut mieux qu'une version fabriquée.

L'index compte autant que le fichier : le constat du bloc M mesure 328 fichiers
sur 434 sans ligne d'index. Une règle écrite par B vaut **exactement une** ligne
d'index — pas zéro, pas une par rejeu.

## Ce que le check fera

Le `check:` de ton ticket est un appel d'une ligne à la sonde `pont` de
`ops/checks/sonde_b.py`, livré par B-T0 — écrite **avant** ton module, elle n'a
pas été taillée pour le laisser passer. Lis-la.

Elle importe ton module, vérifie que `BRAIN_JS` **existe** sur le disque, crée un
dossier neuf `<parent de brain.js>/.cache/sonde-b-<pid>-<ns>/` et appelle
`ecrire_regle(..., racine=<ce dossier>)` **trois fois** sur le même slug :
`PREMIER`, puis `SECOND`, puis `SECOND` encore. Elle exige ensuite :

- `<slug>.v1.md` présent et contenant `PREMIER` — la réécriture a versionné ;
- `<slug>.md` contient `SECOND` — la réécriture a bien eu lieu ;
- `<slug>.v2.md` **absent** — le rejeu à l'identique n'a rien empilé ;
- le `MEMORY.md` du dossier porte **une** ligne mentionnant le slug après
  **chacun** des trois appels — pas zéro, pas une par rejeu ;
- le troisième appel rend `etat == "inchangee"` : l'idempotence doit être
  *décidée* par ton module, pas obtenue par accident.

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
import importlib.util, os, pathlib, shutil, time
s = importlib.util.spec_from_file_location("bb", pathlib.Path("ops/brain_bridge.py").resolve())
bb = importlib.util.module_from_spec(s); s.loader.exec_module(bb)
box = bb.BRAIN_JS.parent / ".cache" / f"preuve-b-t3-{os.getpid()}-{time.time_ns()}"
box.mkdir(parents=True)
slug = "feedback_preuve_b_t3"
try:
    etats = [bb.ecrire_regle({"slug": slug, "fait": f, "why": "preuve B-T3", "type": "feedback"}, racine=box)["etat"]
             for f in ("PREMIER", "SECOND", "SECOND")]
    idx = box / "MEMORY.md"
    print("brain.js =", bb.BRAIN_JS, "| etats =", etats,
          "| v1 =", (box / f"{slug}.v1.md").exists(), "| v2 =", (box / f"{slug}.v2.md").exists(),
          "| lignes d'index =", idx.read_text(encoding="utf-8").count(slug) if idx.exists() else 0)
finally:
    shutil.rmtree(box, ignore_errors=True)
PY
```

Colle sa sortie dans ton message de fin. Attendu : `v1 = True`, `v2 = False`,
`etats = ['ecrite', 'ecrite', 'inchangee']`, une seule ligne d'index. Si `v2` est
vrai, ton idempotence n'existe pas — dis-le plutôt que de relancer jusqu'à ce que
ça passe. Si le dossier reste vide, c'est que `racine` n'est pas honorée : c'est
le résultat de ta session, rapporte-le tel quel.

Commit atomique du seul module. Aucun secret, aucune donnée personnelle, et
**aucun contenu de la mémoire recopié dans le dépôt** : les fichiers de règles
portent des clients et des personnes, et git garde ce qu'on y met même après
suppression.
