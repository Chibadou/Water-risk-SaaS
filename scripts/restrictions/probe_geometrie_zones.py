"""Is there a usable GEOMETRY for the alert zones? — the spatial blocker of §5.3.

⚠️ Why this probe exists. The 2026-08-11 calibration eliminated three hypotheses for the
N2 model's lack of anticipation and left one: the chain is unconditional. Attaching any
hydrological covariate needs to know WHERE a zone is, and the arrêtés archive carries only
`zones_alerte.code` and `departement` — no coordinates, no polygon. So covariates could
only ever attach at DEPARTMENT scale, which is coarse enough to matter: soil moisture
varies a great deal inside a département.

⚠️ THE QUESTION IS NOT "does geometry exist somewhere". It almost certainly does. The
question is whether it **JOINS** to the codes the archive uses. A polygon layer keyed on
identifiers we cannot match to `zones_alerte.code` is worth exactly nothing here, and that
is the failure mode this probe is built to catch rather than discover later.

So it answers, in order:
  A. Does the VigiEau data.gouv dataset publish a geometry resource at all?
  B. Does SANDRE's WFS expose an alert-zone layer?
  C. **Do the identifiers in whatever we find match the archive's zone codes?** — measured
     as an overlap rate against real codes read from the archive itself, not eyeballed.

⚠️ A negative answer is a result. "No joinable geometry exists" would close the zone-level
covariate path for good and leave the department fallback as the honest ceiling — which is
worth knowing before building a pipeline on the assumption it will work out.

⚠️⚠️ THE FIRST RUN OF THIS PROBE ANSWERED "NO", AND WAS WRONG — three defects in the probe,
none in the data. Kept written down because a probe that returns a false negative is worse
than one that fails: it closes a path that was open.

  1. **The resource that answers the question was never fetched.** Candidates were taken in
     dataset order and the loop stopped at four, so the per-year ZIP bundles were tried
     while « HISTORIQUE - Géométrie des zones d'alerte » — named for exactly this — was not.
     Fixed by ORDERING candidates by how likely they are to answer.
  2. **It judged on the wrong rate.** Joinability was tested as "what share of the ARCHIVE
     does this layer cover", which a snapshot of zones currently in force cannot possibly
     score well on. The right question is "what share of the LAYER's ids are archive codes"
     — measured at 756 of 1 296, i.e. 58 %, reported as "PARTIEL" by the wrong rule.
  3. **A 400 was read as an answer.** The SANDRE `GetFeature` call failed with `400 Bad
     Request`, which says the REQUEST was malformed, not that the layer is unusable. WFS 2.0
     and 1.1.0 disagree on parameter spelling; all variants are tried now, and the one that
     worked is recorded so the next call does not re-guess.

⚠️ And the finding those defects were hiding: SANDRE exposes `sa:ZAS` (Zones d'Alerte
Sécheresse) plus overseas variants, and the VigiEau dataset carries an explicitly historical
zone-geometry resource. The honest expectation for this re-run is that geometry IS joinable.
"""

from __future__ import annotations

import io
import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import requests

UA = {"user-agent": "HydroVigie/probe-geometrie (contact via repository)"}
OUT = Path("data/restrictions")
OUT.mkdir(parents=True, exist_ok=True)

VIGIEAU_DATASET = "https://www.data.gouv.fr/api/1/datasets/donnee-secheresse-vigieau/"
SANDRE_WFS = "https://services.sandre.eaufrance.fr/geo/sandre"
ARCHIVE = "https://www.data.gouv.fr/api/1/datasets/r/f425cfa6-ccd1-438e-bb03-9d90ab527851"

report: dict = {
    "generated": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    "question": (
        "Existe-t-il une géométrie des zones d'alerte JOIGNABLE aux codes de l'archive ? "
        "La géométrie seule ne suffit pas : sans jointure sur `zones_alerte.code`, elle est inutile."
    ),
    "errors": [],
}


def fetch(url: str, timeout: int = 180) -> requests.Response:
    r = requests.get(url, headers=UA, timeout=timeout)
    r.raise_for_status()
    return r


# --- 0. The codes we have to join TO, read from the archive itself -----------------
# ⚠️ Read from the real file rather than hardcoded: a probe that checks joinability
# against codes I typed from memory would validate my memory, not the join.
codes_archive: set[str] = set()
try:
    txt = fetch(ARCHIVE).text
    header, *lines = txt.splitlines()
    cols = [c.strip().strip('"') for c in header.split(",")]
    idx = next((i for i, c in enumerate(cols) if c == "zones_alerte.code"), None)
    if idx is None:
        report["errors"].append({"target": "0", "error": f"no zones_alerte.code column in {cols[:12]}"})
    else:
        # Cells are parallel JSON arrays in the master file: ["76_09_0009", …].
        for ln in lines[:8000]:
            for m in re.findall(r'"?([0-9]{2}[A-Z]?_[0-9A-Z_]+)"?', ln):
                codes_archive.add(m)
    report["codes_archive"] = {
        "echantillon": sorted(codes_archive)[:8],
        "nombre_distinct_vus": len(codes_archive),
        "note": "Lus sur les 8 000 premières lignes de l'archive, assez pour tester une jointure.",
    }
except Exception as e:  # noqa: BLE001
    report["errors"].append({"target": "0", "error": repr(e)[:300]})


# --- A. VigiEau dataset: is there a geometry resource? ----------------------------
try:
    ds = fetch(VIGIEAU_DATASET).json()
    ressources = [
        {
            "titre": (r.get("title") or "").strip(),
            "format": (r.get("format") or "").strip().lower(),
            "url": r.get("url"),
        }
        for r in ds.get("resources", [])
    ]
    geo_formats = {"geojson", "shp", "gpkg", "kml", "json"}
    candidats = [
        r for r in ressources
        if r["format"] in geo_formats
        or re.search(r"g[eé]om|zone|contour|perim", r["titre"], re.I)
    ]

    # ⚠️ ORDERING, and it is not cosmetic — the first run of this probe concluded "no
    # joinable geometry" partly because of its absence. The candidate list was taken in
    # dataset order, which put per-year ZIP bundles first, and the loop below stopped after
    # four. The resource actually named « HISTORIQUE - Géométrie des zones d'alerte » —
    # exactly what the question is about — was therefore never fetched.
    #
    # So: explicitly-named geometry first, then plain GeoJSON, then everything else, and
    # ZIP/PMTILES bundles last since they hold one file per DAY rather than a zone layer.
    def priorite(r: dict) -> tuple[int, str]:
        t = r["titre"].lower()
        if "géométrie" in t or "geometrie" in t:
            return (0, t)
        if "pmtiles" in t:
            return (3, t)
        if re.search(r"\b(19|20)\d{2}\b", t):
            return (2, t)
        return (1, t)

    candidats.sort(key=priorite)
    report["a_vigieau"] = {
        "ressources_totales": len(ressources),
        "titres": [r["titre"] for r in ressources],
        "candidats_geometrie": candidats,
        "verdict": (
            f"{len(candidats)} ressource(s) potentiellement géométrique(s)"
            if candidats else "AUCUNE ressource géométrique dans le jeu VigiEau"
        ),
    }
except Exception as e:  # noqa: BLE001
    report["errors"].append({"target": "A", "error": repr(e)[:300]})


# --- B. SANDRE WFS: is there an alert-zone layer? ---------------------------------
try:
    caps = fetch(
        f"{SANDRE_WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities", timeout=180
    ).text
    names = re.findall(r"<(?:wfs:)?Name>([^<]*)</(?:wfs:)?Name>", caps)
    zones = sorted({n for n in names if re.search(r"zone.*alerte|alerte.*zone|zas", n, re.I)})
    secheresse = sorted({n for n in names if re.search(r"sech|secheresse|restrict", n, re.I)})
    report["b_sandre"] = {
        "couches_totales": len(set(names)),
        "couches_zone_alerte": zones,
        "couches_secheresse": secheresse[:20],
        "verdict": (
            f"COUCHE(S) TROUVÉE(S) : {zones}" if zones
            else "AUCUNE couche « zone d'alerte » exposée par le WFS SANDRE"
        ),
    }
except Exception as e:  # noqa: BLE001
    report["errors"].append({"target": "B", "error": repr(e)[:300]})


# --- C. THE decisive test: do the identifiers JOIN? ------------------------------
# ⚠️ Tried on every candidate found above. A layer whose ids do not match
# `zones_alerte.code` is unusable here however good its polygons are.
joins: list[dict] = []


def tester_jointure(nom: str, ids: set[str]) -> dict:
    """Two different rates, and the first run of this probe judged on the wrong one.

    ⚠️ `recall` (what share of the ARCHIVE's codes the layer covers) is the figure that
    looks like the answer and is not. A layer of zones CURRENTLY IN FORCE cannot cover
    fifteen years of historical codes — zones are created, merged and retired — so a low
    recall is expected and says nothing about joinability.

    ⚠️ `precision` (what share of the LAYER's own ids exist in the archive) is the one that
    answers the question: it asks whether the layer speaks the same identifier language.
    Measured on the first run: 756 of 1 296 ids, i.e. 58 % — which the >50 %-recall rule
    reported as "PARTIEL" while the codes plainly do join.
    """
    inter = ids & codes_archive
    precision = len(inter) / len(ids) if ids else 0.0
    recall = len(inter) / len(codes_archive) if codes_archive else None
    return {
        "source": nom,
        "identifiants_vus": len(ids),
        "echantillon": sorted(ids)[:8],
        "recouvrement": len(inter),
        # The layer's ids that ARE archive codes — does it speak our language?
        "precision_ids_du_calque_connus": round(precision, 4),
        # The archive codes the layer covers — expected to be low for a snapshot.
        "rappel_codes_archive_couverts": round(recall, 4) if recall is not None else None,
        "verdict": (
            "JOIGNABLE" if precision > 0.5
            else "PARTIELLEMENT JOIGNABLE" if precision > 0.05
            else "NON JOIGNABLE — les identifiants ne sont pas ceux de l'archive"
        ),
    }


# C1. Any geometry resource from the VigiEau dataset.
for cand in report.get("a_vigieau", {}).get("candidats_geometrie", [])[:6]:
    try:
        raw = fetch(cand["url"], timeout=300)
        ids: set[str] = set()
        body = raw.content
        if body[:2] == b"PK":
            # ⚠️ The first run stopped at listing the archive's contents, which told us
            # nothing. These bundles hold one file per DAY, so a single member is enough to
            # test the identifier language — and testing it is the whole point.
            with zipfile.ZipFile(io.BytesIO(body)) as z:
                noms = z.namelist()
                # ⚠️ A JULY member, not the alphabetically first one. The re-run tested the
                # first member of each yearly bundle — which is 1 January, when almost no
                # arrêté is in force — and 2014 and 2015 therefore came back with ZERO
                # identifiers. That reads as "not joinable" and is actually an empty sample.
                # Restrictions are summer events, so July is where the file has content.
                candidats_membres = [n for n in noms if n.lower().endswith((".geojson", ".json"))]
                membre = next(
                    (n for n in candidats_membres if re.search(r"-0[78]-", n)),
                    next(iter(candidats_membres), None),
                )
                if membre is None:
                    joins.append({"source": cand["titre"], "zip_contenu": noms[:8],
                                  "verdict": "ZIP sans GeoJSON — non testé (shapefile/pmtiles)"})
                    continue
                data = json.loads(z.read(membre).decode("utf-8", "replace"))
                ids = set()
                for f in data.get("features", [])[:20000]:
                    for v in (f.get("properties") or {}).values():
                        if isinstance(v, str) and re.fullmatch(r"[0-9]{2}[A-Z]?_[0-9A-Z_]+", v):
                            ids.add(v)
                r = tester_jointure(f"{cand['titre']} / {membre}", ids)
                r["membre_teste"] = membre
                r["membres_dans_le_zip"] = len(noms)
                joins.append(r)
                continue
        data = json.loads(body.decode("utf-8", "replace"))
        feats = data.get("features", data if isinstance(data, list) else [])
        for f in feats[:20000]:
            props = f.get("properties", f) if isinstance(f, dict) else {}
            for k, v in (props or {}).items():
                if isinstance(v, str) and re.fullmatch(r"[0-9]{2}[A-Z]?_[0-9A-Z_]+", v):
                    ids.add(v)
        joins.append(tester_jointure(f"VigiEau / {cand['titre']}", ids))
    except Exception as e:  # noqa: BLE001
        report["errors"].append({"target": "C1", "ressource": cand["titre"], "error": repr(e)[:300]})

# C2. The SANDRE layer, if any, sampled rather than downloaded whole.
for couche in report.get("b_sandre", {}).get("couches_zone_alerte", [])[:2]:
    # ⚠️ Both spellings AND both versions are tried, because the first run got a bare
    # `400 Bad Request` and a 400 says nothing about whether the layer is usable — it says
    # the request was malformed. WFS 2.0 wants `typeNames`/`count`, 1.1.0 wants
    # `typeName`/`maxFeatures`, and servers differ on which they forgive.
    variantes = [
        f"{SANDRE_WFS}?service=WFS&version=2.0.0&request=GetFeature"
        f"&typeNames={couche}&count=500&outputFormat=application/json",
        f"{SANDRE_WFS}?service=WFS&version=2.0.0&request=GetFeature"
        f"&typeNames={couche}&count=500&outputFormat=geojson",
        f"{SANDRE_WFS}?service=WFS&version=1.1.0&request=GetFeature"
        f"&typeName={couche}&maxFeatures=500&outputFormat=application/json",
    ]
    tentatives: list[str] = []
    for url in variantes:
        try:
            data = fetch(url, timeout=300).json()
            ids = set()
            for f in data.get("features", []):
                for v in (f.get("properties") or {}).values():
                    if isinstance(v, str) and re.fullmatch(r"[0-9]{2}[A-Z]?_[0-9A-Z_]+", v):
                        ids.add(v)
            r = tester_jointure(f"SANDRE / {couche}", ids)
            r["requete_retenue"] = url.split("?")[1][:120]
            # ⚠️ Recorded even on success: knowing WHICH spelling worked is what makes the
            # next call reproducible instead of another round of guessing.
            r["variantes_essayees"] = len(tentatives) + 1
            joins.append(r)
            break
        except Exception as e:  # noqa: BLE001
            tentatives.append(f"{url.split('?')[1][:80]} -> {repr(e)[:120]}")
    else:
        report["errors"].append({
            "target": "C2", "couche": couche,
            "error": "les trois variantes WFS ont échoué",
            "tentatives": tentatives,
        })

# --- D. The shapefile the re-run could not open ------------------------------------
#
# ⚠️ « HISTORIQUE - Géométrie des zones d'alerte » is the one resource that would give the
# WHOLE history in a single file, and both previous runs skipped it: a ZIP with no GeoJSON
# inside, i.e. a shapefile. It stayed "untested", which in a probe means "unknown", which is
# the state this file exists to remove.
#
# ⚠️ NO NEW DEPENDENCY, and that is a deliberate choice rather than a constraint. The runner
# installs `requests` and `openpyxl`; pulling in geopandas/GDAL to answer one question would
# be a large dependency for a probe. And it is unnecessary, because THE GEOMETRY IS NOT WHAT
# IS BEING ASKED — only the identifiers are, and in a shapefile those live in the companion
# `.dbf`, which is dBase III: a 32-byte header, 32-byte field descriptors, then fixed-width
# records. Parsing that is thirty lines and no install.
#
# ⚠️ What this deliberately does NOT do: read the `.shp` polygons. Establishing that the
# identifiers join is the question; whether we can later read the geometry is a different one
# and would be answered by whatever loads it for real.


def lire_dbf(octets: bytes, max_records: int = 50000) -> tuple[list[str], list[dict]]:
    """Minimal dBase III reader — field names and records, no geometry.

    ⚠️ Returns ALL fields rather than guessing which one holds the zone code: guessing is
    how a probe reports "no identifiers found" when it simply looked in the wrong column.
    """
    if len(octets) < 32:
        return [], []
    n_records = int.from_bytes(octets[4:8], "little")
    header_len = int.from_bytes(octets[8:10], "little")
    record_len = int.from_bytes(octets[10:12], "little")
    champs: list[tuple[str, int]] = []
    pos = 32
    # ⚠️ Bounded by the ACTUAL length as well as the declared one. A truncated or lying
    # header made the first version throw `index out of range` from inside the descriptor
    # loop — caught by feeding it a 40-byte file. A probe that raises on a malformed
    # download reports nothing at all about the resources that WERE readable, which is the
    # opposite of what a probe is for.
    limite = min(header_len, len(octets))
    while pos + 32 <= limite and octets[pos] != 0x0D:
        nom = octets[pos:pos + 11].split(b"\x00")[0].decode("latin-1").strip()
        taille = octets[pos + 16]
        champs.append((nom, taille))
        pos += 32
    lignes: list[dict] = []
    debut = header_len
    for i in range(min(n_records, max_records)):
        base = debut + i * record_len
        if base + record_len > len(octets):
            break
        # Byte 0 of each record is the deletion flag: 0x2A means deleted.
        if octets[base:base + 1] == b"*":
            continue
        curseur = base + 1
        ligne: dict = {}
        for nom, taille in champs:
            brut = octets[curseur:curseur + taille]
            ligne[nom] = brut.decode("latin-1").strip()
            curseur += taille
        lignes.append(ligne)
    return [c[0] for c in champs], lignes


historique = next(
    (
        r for r in report.get("a_vigieau", {}).get("candidats_geometrie", [])
        if re.search(r"g[eé]om", r["titre"], re.I) and re.search(r"histor", r["titre"], re.I)
    ),
    None,
)
if historique is None:
    report["d_shapefile"] = {"verdict": "Ressource « HISTORIQUE - Géométrie » absente du jeu"}
else:
    try:
        body = fetch(historique["url"], timeout=600).content
        with zipfile.ZipFile(io.BytesIO(body)) as z:
            noms = z.namelist()
            dbfs = [n for n in noms if n.lower().endswith(".dbf")]
            d: dict = {"ressource": historique["titre"], "contenu": noms[:20], "dbf": dbfs[:5]}
            if not dbfs:
                d["verdict"] = "ZIP sans .dbf — ce n'est pas un shapefile"
            else:
                champs, lignes = lire_dbf(z.read(dbfs[0]))
                d["champs"] = champs
                d["enregistrements_lus"] = len(lignes)
                d["premier_enregistrement"] = lignes[0] if lignes else None
                # Every field is tried; the one that joins is the answer.
                par_champ: dict = {}
                for nom in champs:
                    ids = {
                        str(l.get(nom, "")) for l in lignes
                        if re.fullmatch(r"[0-9]{2}[A-Z]?_[0-9A-Z_]+", str(l.get(nom, "")))
                    }
                    if ids:
                        par_champ[nom] = tester_jointure(
                            f"{historique['titre']} / {dbfs[0]} / champ {nom}", ids
                        )
                d["par_champ"] = par_champ
                meilleur = max(
                    par_champ.values(),
                    key=lambda j: j["precision_ids_du_calque_connus"],
                    default=None,
                )
                if meilleur:
                    joins.append(meilleur)
                d["verdict"] = (
                    f"CHAMP JOIGNABLE : {meilleur['source'].split('champ ')[-1]} "
                    f"(précision {meilleur['precision_ids_du_calque_connus']}, "
                    f"rappel {meilleur['rappel_codes_archive_couverts']})"
                    if meilleur and meilleur["verdict"] == "JOIGNABLE"
                    else "Aucun champ du .dbf ne porte les codes de l'archive"
                )
            report["d_shapefile"] = d
    except Exception as e:  # noqa: BLE001
        report["errors"].append({"target": "D", "error": repr(e)[:300]})
        report["d_shapefile"] = {"verdict": "échec de lecture — voir errors"}

report["c_jointure"] = joins
joignable = [j for j in joins if j.get("verdict") == "JOIGNABLE"]
report["verdict_global"] = (
    f"GÉOMÉTRIE JOIGNABLE TROUVÉE : {[j['source'] for j in joignable]}. "
    "Le rattachement des covariables à la ZONE devient possible ; le repli départemental "
    "n'est plus le plafond."
    if joignable else
    "⚠️ AUCUNE géométrie joignable trouvée. Le rattachement des covariables reste au "
    "DÉPARTEMENT, et c'est le plafond honnête à annoncer — pas une étape à contourner. "
    "⚠️ Ce n'est pas « la géométrie n'existe pas » : c'est « rien de ce qui a été sondé ici "
    "ne se joint aux codes de l'archive »."
)

(OUT / "geometrie-zones-probe.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=1, default=str) + "\n", encoding="utf-8"
)

print("=== PROBE GÉOMÉTRIE DES ZONES D'ALERTE ===")
print("codes archive vus :", report.get("codes_archive", {}).get("nombre_distinct_vus"))
print("A VigiEau         :", report.get("a_vigieau", {}).get("verdict"))
print("B SANDRE          :", report.get("b_sandre", {}).get("verdict"))
for j in joins:
    print(f"C {j.get('source')} -> {j.get('verdict')}")
print()
print(report["verdict_global"])
if report["errors"]:
    print(f"\n{len(report['errors'])} erreur(s) :")
    for e in report["errors"][:6]:
        print("  ", e)
