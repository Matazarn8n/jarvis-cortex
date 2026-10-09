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

## Le contrôle — comportemental, dans le bac à sable

Un `grep` sur `.v1` dirait seulement que le mot est écrit quelque part. Ce qui
compte est que le régime FONCTIONNE.

**`--sandbox` est obligatoire ici.** Sans lui, `brain.js` écrit dans
`MEM` — soit, via `config/workspace.json`,
`/home/nuveo/.claude/projects/-home-nuveo/memory`, la mémoire RÉELLE de l'Owner
— et appende une ligne d'index par écriture dans le vrai `MEMORY.md`. Un
contrôle de plan n'a rien à y faire, et le nettoyage des fichiers seuls y
laisserait deux pointeurs morts, là où la rubrique 4 du constat en mesure zéro.
Relevé P2 de l'audit a5 du 2026-08-21.

```bash
cd /home/nuveo/projects/jarvis-cortex
node brain.js store "controle B-TM" --type feedback --name b-tm-controle --sandbox
node brain.js store "controle B-TM, fait different" --type feedback --name b-tm-controle --sandbox
ls .cache/sandbox-memory/feedback_b_tm_controle*
```

Le nom est **normalisé** par `brain.js:167-176` : le slug `b-tm-controle` perd
ses tirets et prend son préfixe de type, d'où `feedback_b_tm_controle.md`. Un
`ls` sur le slug brut ne trouverait rien, même après un versionnement réussi.

La seconde écriture doit laisser **deux** fichiers : la règle courante et son
`.v1` portant l'énoncé antérieur. Un seul fichier = la fusion n'a pas pris le
régime, reprends, ne passe pas au suivant.

Puis jette le bac entier, index compris :

```bash
rm -rf .cache/sandbox-memory
```

## Ce que ce ticket ne prouve pas

Le runner **n'exécute pas** le `check:` d'un ticket `kind: human` : ton
approbation le ferme, quoi que tu aies fait. Approuver sans avoir fusionné ne
gagne donc rien — la sonde `pont` de B-T3 tombe juste après, sur le même
`.v1` absent. La barrière réelle est là-bas ; ici, c'est l'ordre du geste.
