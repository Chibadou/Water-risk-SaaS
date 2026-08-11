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
    inter = ids & codes_archive
    return {
        "source": nom,
        "identifiants_vus": len(ids),
        "echantillon": sorted(ids)[:8],
        "recouvrement_avec_archive": len(inter),
        "part_des_codes_archive_couverts": (
            round(len(inter) / len(codes_archive), 4) if codes_archive else None
        ),
        "verdict": (
            "JOIGNABLE" if codes_archive and len(inter) / len(codes_archive) > 0.5
            else "PARTIEL" if inter else "NON JOIGNABLE — aucun identifiant commun"
        ),
    }


# C1. Any geometry resource from the VigiEau dataset.
for cand in report.get("a_vigieau", {}).get("candidats_geometrie", [])[:4]:
    try:
        raw = fetch(cand["url"], timeout=300)
        ids: set[str] = set()
        body = raw.content
        if cand["format"] == "shp" or body[:2] == b"PK":
            with zipfile.ZipFile(io.BytesIO(body)) as z:
                noms = z.namelist()
                joins.append({"source": cand["titre"], "zip_contenu": noms[:12],
                              "verdict": "ARCHIVE ZIP — lecture shapefile non tentée ici"})
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
    try:
        url = (
            f"{SANDRE_WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature"
            f"&TYPENAMES={couche}&COUNT=500&OUTPUTFORMAT=application/json"
        )
        data = fetch(url, timeout=300).json()
        ids = set()
        for f in data.get("features", []):
            for k, v in (f.get("properties") or {}).items():
                if isinstance(v, str) and re.fullmatch(r"[0-9]{2}[A-Z]?_[0-9A-Z_]+", v):
                    ids.add(v)
        joins.append(tester_jointure(f"SANDRE / {couche}", ids))
    except Exception as e:  # noqa: BLE001
        report["errors"].append({"target": "C2", "couche": couche, "error": repr(e)[:300]})

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
