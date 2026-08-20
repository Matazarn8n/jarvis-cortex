#!/usr/bin/env python3
"""Relevé du corpus de mémoire — produit le reçu que M-TGEN interprète.

Lancé HORS session, par l'Owner, au ticket humain M-T0. Motif : le corpus est
écrit en continu par d'autres sessions (431 -> 439 fichiers dans la seule
journée du 2026-08-20). Un `check:` qui recalculait en direct comparait le
constat à un corpus qui avait bougé depuis, et faisait échouer trois tours
d'affilée sur la dérive seule, à ~2,50 USD le tour, alors que le travail était
bon. Le reçu fige la photo une fois ; le commit la rend opposable.

VIE PRIVÉE — le reçu ne porte QUE des agrégats et une empreinte. Aucun nom de
fichier, aucun extrait. Un nom de fichier de mémoire recopié dans un dépôt git
n'en ressort plus : l'historique le garde même après suppression.

Usage, depuis /home/nuveo/jarvis-cortex-plan-m :
    python3 scripts/releve-memoire.py
puis :
    git add docs/plans/2026-08-20-recu-memoire.txt
    git commit -m "releve du corpus de memoire 2026-08-20"
"""
import hashlib
import pathlib
import re
import sys
from datetime import datetime

SORTIE = pathlib.Path("docs/plans/2026-08-20-recu-memoire.txt")
MEM = pathlib.Path.home() / ".claude" / "projects" / "-home-nuveo" / "memory"

# Ces deux motifs et la définition de l'empreinte DOIVENT rester identiques à
# ceux du `check:` de M-TGEN : le reçu remplace un recalcul, il ne le redéfinit
# pas. Toute divergence ici change silencieusement ce que le constat affirme.
#
# UN AUDIT A DEMANDÉ D'ÉLARGIR `REVISE` à « plusieurs dates distinctes », et
# c'est refusé ici, pour deux raisons. (1) Le reçu du 2026-08-20 est figé et
# commité ; le dossier qu'il mesure n'est plus atteignable depuis une session de
# plan. Élargir le motif rendrait ce script incapable de reproduire le reçu qu'il
# a produit, sans qu'aucun recalcul ne puisse arbitrer — on perdrait la seule
# vérifiabilité du constat pour un chiffre qu'on ne pourrait pas obtenir. (2) La
# multi-date est déjà mesurée, sur `project`, par `project_multidate` — et la
# rubrique 3 du constat explique pourquoi elle est un INDICE et non une preuve de
# révision (un compte rendu couvrant une période porte plusieurs dates sans avoir
# jamais été réécrit). La verser dans `feedback_revises` importerait cette
# ambiguïté dans la seule métrique qui repose sur une trace ATTESTÉE. La rubrique
# 2 borne donc son chiffre par le bas — « au moins 36 » — ce qui est la forme
# correcte d'un compte de traces volontaires.
REVISE = re.compile(r"mis[e]?\s+[àa]\s+jour|R[ÉE]VOQU|CORRECTION|corrig[ée]", re.I)
DATE = re.compile(r"\b20\d\d-\d\d-\d\d\b")


def releve() -> dict:
    if not MEM.is_dir():
        # Étape de données qui échoue => le relevé échoue. Jamais de reçu vide
        # qui se ferait passer pour un corpus vide.
        raise SystemExit(f"ECHEC: dossier de memoire introuvable: {MEM}")
    m = {"user": 0, "feedback": 0, "project": 0, "reference": 0, "sans_type": 0,
         "feedback_revises": 0, "project_multidate": 0}
    for f in sorted(MEM.glob("*.md")):
        if f.name == "MEMORY.md":
            continue
        txt = f.read_text(encoding="utf-8", errors="ignore")
        mt = re.search(r"^\s*type:\s*\"?(user|feedback|project|reference)\"?\s*$",
                       txt[:1500], re.M)
        t = mt.group(1) if mt else "sans_type"
        m[t] += 1
        if t == "feedback" and REVISE.search(txt):
            m["feedback_revises"] += 1
        if t == "project" and len(set(DATE.findall(txt))) > 1:
            m["project_multidate"] += 1
    idx = MEM / "MEMORY.md"
    idx_txt = idx.read_text(encoding="utf-8") if idx.is_file() else ""
    pointeurs = set(re.findall(r"\(([A-Za-z0-9_.,-]+\.md)\)", idx_txt))
    presents = {p.name for p in MEM.glob("*.md")} - {"MEMORY.md"}
    m["index_pointeurs_morts"] = len(pointeurs - presents - {"MEMORY.md"})
    m["fichiers_non_indexes"] = len(presents - pointeurs)
    noms = sorted(p.name for p in MEM.glob("*.md"))
    m["fichiers_total"] = len(noms)
    m["empreinte"] = hashlib.sha256("\n".join(noms).encode("utf-8")).hexdigest()[:16]
    return m


def main() -> int:
    m = releve()
    quand = datetime.now().astimezone().replace(microsecond=0).isoformat()
    lignes = [f"# releve du corpus de memoire — {quand}",
              "# agregats et empreinte SEULS : aucun nom de fichier, aucun extrait",
              f"horodatage: {quand}"]
    lignes += [f"{c}: {m[c]}" for c in sorted(m) if c != "empreinte"]
    lignes.append(f"empreinte: {m['empreinte']}")
    SORTIE.parent.mkdir(parents=True, exist_ok=True)
    SORTIE.write_text("\n".join(lignes) + "\n", encoding="utf-8")
    # Sortie réelle, pas un « OK » : ce que l'Owner lit doit être ce qui est écrit.
    print("\n".join(lignes))
    print(f"\n-> {SORTIE} ({SORTIE.stat().st_size} octets)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
