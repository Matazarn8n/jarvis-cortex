DÉPÔT VISÉ : `/home/nuveo/hermes-os` — le moteur **gouverné**, pas le worktree
`/home/nuveo/hermes-os-plan-b` où B-T0 à B-T4 ont travaillé.

# Ticket B-T5 — Installer les modules et raccorder le moteur, à la main

**`kind: human`. Il n'y a pas de modèle, pas de session, pas de budget.** Ce
ticket est pour l'Owner. C'est lui qui referme la boucle : sans lui, B a livré
quatre modules exerçables dans un worktree que le moteur ne lit pas, et aucun
verdict de gate n'écrit jamais de règle.

Il est un ticket et non une ligne de dette pour une raison mesurée : un plan dont
la dernière marche est un commentaire finit `done` sur une boucle ouverte, et
personne ne le voit. Ici, le plan ne peut pas conclure tant que ce geste n'a pas
été posé **et constaté**.

**Et il ne se constate pas lui-même.** Le runner ferme un ticket `kind: human`
sur ton approbation et **n'exécute pas** son `check:` — un clic suffirait donc à
finir le plan sur une boucle restée ouverte. Le `check:` ci-dessous reste écrit
parce qu'il est le mode d'emploi de la vérification, et tu peux le lancer ; mais
la preuve exécutée est **B-T6**, le ticket de session qui suit et dont le
contrôle relit ce même dépôt par l'AST. Ne clique pas ici sans avoir fait les
deux gestes ci-dessous : B-T6 refusera, et il aura raison.

## Geste 1 — installer les trois modules dans le dépôt gouverné

B-T0 à B-T4 ont livré dans `/home/nuveo/hermes-os-plan-b`. Le moteur qui tourne
lit `/home/nuveo/hermes-os`, et **rien n'y a bougé**. Tant que ce transfert n'est
pas fait, l'import paresseux du geste 2 échouera silencieusement à chaque gate et
le hook restera inerte pour toujours — sans qu'aucun contrôle ne rougisse. C'est
le défaut nommé par l'audit du 2026-08-20 ; c'est pourquoi ce geste vient en
premier et pourquoi B-T6 le vérifie nommément.

Porte les trois modules dans `/home/nuveo/hermes-os`, par merge du worktree ou
par copie, comme tu préfères :

- `ops/verdict_regles.py` (B-T2) ;
- `ops/brain_bridge.py` (B-T3) ;
- `ops/verdict_hook.py` (B-T4).

`ops/checks/sonde_b.py` **ne s'installe pas** : c'est l'instrument de contrôle du
bloc, il reste dans le dépôt de B.

Vérifie sur place, depuis `/home/nuveo/hermes-os`, que les trois s'importent et
que le point d'entrée répond — c'est exactement ce que B-T6 refera :

```bash
python3 -c 'import ops.verdict_regles, ops.brain_bridge, ops.verdict_hook; print("import ok")'
echo 'VERDICT: NO_GO' | python3 ops/verdict_hook.py --verdict NO_GO --rapport - --dry-run
```

Le `--dry-run` n'écrit rien dans la mémoire réelle. Il doit sortir en 0 et
imprimer un slug `feedback_…`.

## Geste 2 — le raccordement

Dans `ops/plan_runner.py`, appeler `injecter_regles(...)` **juste après**
l'affectation de `ts["verdict_motif"]`, dans le chemin qui vient de recevoir le
verdict d'un gate Codex.

L'appel exact, et pas un autre — l'audit a4 du 2026-08-21 a montré qu'un ticket
qui ne prescrit pas la forme laisse passer un appel décoratif que la sonde
accepte :

```python
injecter_regles(verdict, report, ts, racine=None)
```

Trois positionnels, `racine` nommé. **Dans la fonction qui porte l'ancre**, pas
ailleurs dans le fichier. Les trois positionnels sont les **variables vivantes**
du chemin — jamais des littéraux : `injecter_regles("GO", "", 0)` compile, passe
un contrôle naïf, et n'injecte rien du verdict réel. B-T6 vérifie ces trois
points par l'AST.

Repère l'ancre par son **nom**, `verdict_motif`, jamais par un numéro de ligne :
les numéros dérivent à chaque commit du moteur, et une mémoire antérieure en
portait un qui était déjà faux. Le contrôle de ce ticket cherche le nom, lui
aussi, et imprime les lignes qu'il trouve.

Trois exigences sur cet appel :

1. **Non bloquant.** `injecter_regles()` ne lève jamais — c'est son contrat, posé
   par B-T4 et exercé par la sonde. N'ajoute pas de `try` décoratif, mais ne
   compte pas non plus sur une exception pour t'avertir : l'échec se lit dans
   l'`etat` rendu, qui commence par `echec`. Journalise-le.
2. **Import paresseux, tolérant — mais pas une excuse.** Importe dans le corps de
   la fonction, avec un `except ImportError` qui laisse passer : un moteur qui
   refuse de démarrer parce qu'un module optionnel manque est pire que la boucle
   qu'il porte. **Journalise cet `ImportError`**, ne l'avale pas en silence.
   Cette tolérance ne remplace **pas** le geste 1 : sans les modules installés,
   elle transforme un raccordement absent en boucle définitivement muette, ce
   qu'aucun contrôle du moteur ne peut voir. C'est B-T6 qui ferme ce trou en
   exigeant les trois modules importables **depuis `/home/nuveo/hermes-os`**.
3. **`racine=None`.** C'est la mémoire réelle. Ne passe pas de racine : la seule
   raison d'en passer une est un test, et un test ne s'écrit pas dans le moteur.

## Les deux contrôles — celui d'ici, et celui qui compte

Le `check:` de **ce** ticket ouvre `/home/nuveo/hermes-os/ops/plan_runner.py`,
imprime le nombre de lignes, les lignes portant `verdict_motif` et celles portant
`injecter_regles`, et exige qu'un appel tombe après une ancre. Il travaille par
**sous-chaîne** : un import ou un commentaire portant ce nom le satisferait. Et
le runner **ne le lance pas** — ton approbation ferme le ticket. Lis-le comme une
aide-mémoire, pas comme une barrière.

La barrière est le `check:` de **B-T6**, qui tourne pour de bon dans une session
que personne n'approuve à la main. Il exige davantage, et par l'AST :
`ops/plan_runner.py` s'analyse ; les **trois modules du geste 1** existent sous
`/home/nuveo/hermes-os` et s'y importent ; l'affectation de `ts["verdict_motif"]`
est un nœud réel ; un nœud **`ast.Call`** sur `injecter_regles` porte une ligne
strictement postérieure ; et le point d'entrée **installé là-bas** répond en
dry-run. Il tombe sur le dépôt gouverné, où `governed_files()` interdit
l'écriture à toute session : aucune session du bloc ne peut fabriquer cette
observation, ce qui est exactement pourquoi elle est prise là et pas dans le
worktree.

Ni l'un ni l'autre ne constate qu'un verdict a réellement écrit une règle en
production : le moteur n'expose à aucun `check:` le moyen de l'observer, et la
dette est consignée en tête du runbook. Un appel posé dans une branche morte du
fichier passerait donc les deux. La preuve de bout en bout est l'exécution
suivante d'un vrai gate — regarde le fichier `feedback_*` apparaître, et sa ligne
dans `MEMORY.md`.

## Avant de commiter

Vérifie que le fichier parse (`python -m py_compile ops/plan_runner.py`) et
qu'un `plan_runner` déjà lancé n'est pas en train de tourner : le raccordement
change un fichier de gouvernance, et un runner en vol l'a déjà chargé.

Commite les **deux** gestes ensemble — les trois modules et l'appel. Un commit
qui poserait l'appel sans les modules laisserait le moteur journaliser un
`ImportError` à chaque gate.

## Puis approuve, et laisse B-T6 parler

Une fois commité, approuve ce ticket. B-T6 s'ouvre derrière, relit ce dépôt et
imprime ce qu'il y trouve. S'il rougit, c'est qu'un des deux gestes manque ou que
`injecter_regles` n'y figure pas comme un appel : reprends, ne contourne pas.
