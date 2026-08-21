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

# Le nom porte la date du jour : un reçu déjà commité est une photo opposable,
# le réécrire effacerait la mesure qu'un constat cite. Chaque relevé date le sien
# — et REFUSE d'écraser celui du jour, cas le plus probable puisqu'un tour
# correctif relance ce script le même jour (relevé P2, audit a5 du 2026-08-21).
# Écraser en silence perdrait exactement ce que ce nommage prétend préserver.
SORTIE = pathlib.Path(f"docs/plans/{datetime.now().date().isoformat()}-recu-memoire.txt")
MEM = pathlib.Path.home() / ".claude" / "projects" / "-home-nuveo" / "memory"

# Ces deux motifs et la définition de l'empreinte DOIVENT rester identiques à
# ceux du `check:` de M-TGEN : le reçu remplace un recalcul, il ne le redéfinit
# pas. Toute divergence ici change silencieusement ce que le constat affirme.
#
# UN AUDIT A DEMANDÉ TROIS FOIS D'ÉLARGIR `REVISE` à « plusieurs dates
# distinctes ». Tranché le 2026-08-21 en MESURANT les deux hors session, au lieu
# de re-refuser en prose — un refus en prose ne compte pas comme arbitrage, et
# c'est ce qui faisait revenir l'objection à chaque tour.
#
# `feedback_revises` garde le motif étroit : il compte une trace ATTESTÉE de
# révision, le fichier DIT qu'il a été corrigé. `feedback_revises_large` compte
# l'union motif-ou-deuxième-date, telle que l'audit la demande. Les deux partent
# dans le reçu ; la rubrique 2 du constat cite les deux et dit lequel borne quoi.
#
# Pourquoi ne pas fusionner : une seconde date est un INDICE, pas une preuve —
# un compte rendu couvrant une période porte plusieurs dates sans avoir jamais
# été réécrit (même raison que `project_multidate`, rubrique 3). Fusionner
# importerait cette ambiguïté dans la seule métrique adossée à une trace
# volontaire.
#
# NI L'UN NI L'AUTRE N'EST UNE BORNE HAUTE, et le constat ne doit pas le
# prétendre : une réécriture non annoncée et sans seconde date échappe aux deux
# critères. `feedback_revises` borne par le BAS, `feedback_revises_large` est un
# indicateur large — pas un plafond.
REVISE = re.compile(r"mis[e]?\s+[àa]\s+jour|R[ÉE]VOQU|CORRECTION|corrig[ée]", re.I)
DATE = re.compile(r"\b20\d\d-\d\d-\d\d\b")


def releve() -> dict:
    if not MEM.is_dir():
        # Étape de données qui échoue => le relevé échoue. Jamais de reçu vide
        # qui se ferait passer pour un corpus vide.
        raise SystemExit(f"ECHEC: dossier de memoire introuvable: {MEM}")
    m = {"user": 0, "feedback": 0, "project": 0, "reference": 0, "sans_type": 0,
         "feedback_revises": 0, "feedback_revises_large": 0, "project_multidate": 0}
    for f in sorted(MEM.glob("*.md")):
        if f.name == "MEMORY.md":
            continue
        # Décodage STRICT. `errors="ignore"` avalait un octet invalide et
        # rendait un texte amputé : les motifs ci-dessous cherchaient alors dans
        # un contenu qui n'était pas celui du fichier, et le reçu publiait des
        # agrégats plausibles mais faux. Une étape de données qui ne sait pas
        # lire doit échouer, pas deviner.
        try:
            txt = f.read_text(encoding="utf-8")
        except UnicodeDecodeError as e:
            # Le nom du fichier ne part PAS dans le message : ce script imprime
            # sur un terminal dont la sortie est collée dans des rapports. Le
            # rang dans l'ordre trié suffit à le retrouver à la main.
            rang = sorted(MEM.glob("*.md")).index(f)
            raise SystemExit(f"ECHEC: fichier de memoire illisible en utf-8 "
                             f"(rang {rang} dans l'ordre trie): {e}")
        mt = re.search(r"^\s*type:\s*\"?(user|feedback|project|reference)\"?\s*$",
                       txt[:1500], re.M)
        t = mt.group(1) if mt else "sans_type"
        m[t] += 1
        if t == "feedback" and REVISE.search(txt):
            m["feedback_revises"] += 1
        if t == "feedback" and (REVISE.search(txt) or len(set(DATE.findall(txt))) > 1):
            m["feedback_revises_large"] += 1
        if t == "project" and len(set(DATE.findall(txt))) > 1:
            m["project_multidate"] += 1
    idx = MEM / "MEMORY.md"
    # Un index ABSENT n'est pas un index vide. La rubrique 4 du constat compte
    # des lignes, des pointeurs morts et des fichiers non indexés : sans
    # `MEMORY.md`, ces trois chiffres seraient 0, `fichiers_total` et rien de
    # plus — un corpus « parfaitement non indexé » et un corpus dont l'index a
    # disparu deviendraient indiscernables. Échouer ici est la seule lecture
    # honnête.
    if not idx.is_file():
        raise SystemExit(f"ECHEC: index introuvable, la rubrique 4 n'est pas "
                         f"mesurable: {idx}")
    idx_txt = idx.read_text(encoding="utf-8")
    pointeurs = set(re.findall(r"\(([A-Za-z0-9_.,-]+\.md)\)", idx_txt))
    presents = {p.name for p in MEM.glob("*.md")} - {"MEMORY.md"}
    m["index_pointeurs_morts"] = len(pointeurs - presents - {"MEMORY.md"})
    m["fichiers_non_indexes"] = len(presents - pointeurs)
    # Demandé par la rubrique 4 du constat, qui exige le nombre de LIGNES de
    # l'index. Il ne se dérive d'aucune autre métrique : une ligne peut ne
    # désigner aucun fichier (titre de rubrique) ou plusieurs. Un agrégat de
    # plus, aucun nom ni extrait — le reçu reste opposable sans rien divulguer.
    m["index_lignes"] = len(idx_txt.splitlines())
    noms = sorted(p.name for p in MEM.glob("*.md"))
    m["fichiers_total"] = len(noms)
    m["empreinte"] = hashlib.sha256("\n".join(noms).encode("utf-8")).hexdigest()[:16]
    return m


def main() -> int:
    if SORTIE.exists():
        raise SystemExit(
            f"ECHEC: un recu de ce jour existe deja: {SORTIE}\n"
            f"       Il est peut-etre cite par un constat. Renomme-le ou "
            f"supprime-le a la main, puis relance.")
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
