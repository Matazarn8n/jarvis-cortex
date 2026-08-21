# Ticket B-TM — Intégrer M-T1 dans le jarvis-cortex canonique

Ticket **humain**. Rien à coder, un geste à faire hors session.

## Pourquoi il existe

B-T3 épingle `/home/nuveo/projects/jarvis-cortex/brain.js` comme oracle de sa
sonde `pont`, et exige qu'une réécriture y produise un `.v1`. Or ce fichier ne
porte pas le régime versionné : M-T1 vit sur la branche
`plan/jarvis-cortex-m-memoire-regimes`, jamais fusionnée. Vérifié le
2026-08-21 — `grep -c '\.v1' brain.js` rend **0** dans le dépôt canonique.

Aucun ticket de ce bloc n'intègre M. Sans ce ticket-ci, B-T3 échoue sur `.v1`
absent à chaque tour, et aucune correction apportée à B n'y change rien : le
défaut n'est pas dans B. Le runbook s'en remettait à une note de PRÉREQUIS —
une note n'intègre rien.

## Le geste

```bash
cd /home/nuveo/projects/jarvis-cortex
git status -sb                       # arbre propre avant toute fusion
git merge --no-ff plan/jarvis-cortex-m-memoire-regimes
```

## Le contrôle — comportemental, pas un grep

Un `grep` sur `.v1` dirait seulement que le mot est écrit quelque part. Ce qui
compte est que le régime FONCTIONNE :

```bash
cd /home/nuveo/projects/jarvis-cortex
node brain.js store "controle B-TM" --type feedback --name b-tm-controle
node brain.js store "controle B-TM, fait different" --type feedback --name b-tm-controle
ls memory/b-tm-controle*
```

La seconde écriture doit laisser **deux** fichiers : la règle courante et son
`.v1` portant l'énoncé antérieur. Un seul fichier = la fusion n'a pas pris le
régime, reprends, ne passe pas au suivant.

Retire ensuite les fichiers de contrôle — ils n'ont rien à faire dans la
mémoire réelle.

## Ce que ce ticket ne prouve pas

Le runner **n'exécute pas** le `check:` d'un ticket `kind: human` : ton
approbation le ferme, quoi que tu aies fait. Approuver sans avoir fusionné ne
gagne donc rien — la sonde `pont` de B-T3 tombe juste après, sur le même
`.v1` absent. La barrière réelle est là-bas ; ici, c'est l'ordre du geste.
