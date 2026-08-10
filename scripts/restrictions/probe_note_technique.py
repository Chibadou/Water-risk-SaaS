#!/usr/bin/env python3
"""Sprint 38 — answer the four factual unknowns the note technique left open.

One run, four independent questions, on a GitHub runner with full network
access (every French open-data host is blocked by the sandbox proxy). Same
shape as probe_backlog.py, which at Sprint 22 closed two leads by negative
finding — a probe that finds nothing has not failed, it has closed a question.

  A. `rotation` (note §3.1). The ρ typology prescribes a `rotation` type for
     tours d'eau / alternate-day measures, worth 1 − 1/n. Does that wording
     actually occur in the 77 k rows of the "Restrictions" resource, and does it
     concern anyone other than farmers? Agriculture is out of scope (§0.2), so
     the type may be moot HERE even though the note prescribes it. Decides
     whether Sprint 39 implements it at all.

  B. SISPEA (note §11.1, G13). Fragility of the drinking-water service — network
     efficiency, losses, interconnections — for sites on the mains. The note
     calls it the differentiator no competitor has. Never investigated here.
     Question: does it exist as open data, at what granularity (service or
     commune?), how fresh, and is a commune → service join possible at all?

  C. Hydroportail vs our own indices (note §5.3, G14). We recompute VCN10 and
     QMNA5 empirically from Hub'Eau series (lib/hubeau.ts computeLowFlow). The
     note names Hydroportail as the reference. Question: is there a
     machine-readable endpoint, and do its published values match ours? Both
     answers are useful — agreement makes our method defensible in writing,
     disagreement means we found a bug.

  D. V_ref (note §4.2a, G9). The reference volume must be the one defined by the
     ICPE arrêté of 30 June 2023, amended 3 July 2024. Question: is that text
     reachable in a usable form? Légifrance's API is widely OAuth-gated, so the
     expected answer is "gated" — which is itself a finding, and would send
     Sprint 41 towards a transcribed-and-cited definition rather than a fetch.

Output: data/restrictions/note-technique-probe.json

Exit code: 1 if EVERY question failed, which means the run told us nothing and
must not look green. Individual negative findings are successes and exit 0.
"""

from __future__ import annotations

import csv
import io
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "restrictions"
OUT.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "hydrovigie-note-probe/1.0 (github actions; water-risk-saas)"}
VIGIEAU_DATASET = "https://www.data.gouv.fr/api/1/datasets/donnee-secheresse-vigieau/"
DATAGOUV_SEARCH = "https://www.data.gouv.fr/api/1/datasets/"
HUBEAU_HYDRO = "https://hubeau.eaufrance.fr/api/v2/hydrometrie"

report: dict = {
    "generated": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    "a_rotation": {},
    "b_sispea": {},
    "c_hydroportail": {},
    "d_vref_icpe": {},
    "errors": [],
}
answered: set[str] = set()


def is_html(data: bytes) -> bool:
    return data.lstrip()[:1] == b"<"


def fetch(url: str, timeout: int = 300) -> bytes:
    r = requests.get(url, headers=UA, timeout=timeout)
    r.raise_for_status()
    return r.content


def read_csv(data: bytes) -> list[dict]:
    if is_html(data):
        raise ValueError("got HTML instead of a CSV file")
    text = ""
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            text = data.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    sample = text[:8192]
    delim = max([",", ";", "\t"], key=lambda d: sample.count(d))
    return list(csv.DictReader(io.StringIO(text), delimiter=delim))


def classify(url: str, timeout: int = 60) -> dict:
    """Status + shape of a candidate endpoint.

    Modelled on the Sprint 19 ZRE probe, which found the real source only
    because every candidate was classified rather than assumed: data.gouv URLs
    turned out to be HTML portals and INSPIRE hosts were dead.
    """
    out: dict = {"url": url}
    try:
        r = requests.get(url, headers=UA, timeout=timeout)
        out["status"] = r.status_code
        out["content_type"] = r.headers.get("content-type", "")
        body = r.content[:400]
        out["looks_like"] = (
            "html" if is_html(body)
            else "json" if body.lstrip()[:1] in (b"{", b"[")
            else "other"
        )
        out["excerpt"] = body[:200].decode("utf-8", "replace")
        if r.status_code == 401:
            out["note"] = "authenticated endpoint (same pattern as MétéEAU/BRGM)"
    except Exception as e:  # noqa: BLE001
        out["error"] = repr(e)[:200]
    return out


# --- resource discovery ------------------------------------------------------
resources: dict[str, str] = {}
try:
    ds = requests.get(VIGIEAU_DATASET, headers=UA, timeout=120).json()
    for r in ds.get("resources", []):
        title = (r.get("title") or "").strip()
        if title and r.get("url"):
            resources.setdefault(title, r["url"])
except Exception as e:  # noqa: BLE001
    report["errors"].append({"target": "discovery", "error": repr(e)[:300]})

# --- A. does `rotation` exist in the corpus? ---------------------------------
# Patterns taken from how prefectures actually phrase alternate-day measures.
# Deliberately wide: a false positive is cheap to read, a false negative would
# silently drop a ρ type the note prescribes.
ROTATION_PATTERNS = {
    "tour_d_eau": r"tours?\s+d['’]eau",
    "jours_pairs_impairs": r"jours?\s+(?:pairs?|impairs?)",
    "un_jour_sur_deux": r"un\s+jour\s+sur\s+(?:deux|\d)",
    "alterne": r"altern",
    "rotation": r"rotation",
    "par_roulement": r"roulement",
    "n_jours_sur_sept": r"\d\s*jours?\s+sur\s+7",
}
try:
    a: dict = {}
    url = resources.get("Restrictions")
    if not url:
        a["verdict"] = "resource « Restrictions » introuvable"
    else:
        rows = read_csv(fetch(url))
        a["rows"] = len(rows)
        cols = list(rows[0].keys()) if rows else []
        a["columns"] = cols
        # The measure text column, named as in build_restrictions.py.
        desc_col = next(
            (c for c in cols if "description" in c.lower()),
            next((c for c in cols if "libelle" in c.lower()), None),
        )
        a["description_column"] = desc_col
        audience_cols = [c for c in cols if c.lower().startswith("concerne")]
        a["audience_columns"] = audience_cols

        hits: Counter = Counter()
        by_audience: dict[str, Counter] = {c: Counter() for c in audience_cols}
        samples: dict[str, list[str]] = {k: [] for k in ROTATION_PATTERNS}
        entreprise_examples: list[str] = []

        for row in rows:
            text = (row.get(desc_col) or "") if desc_col else ""
            if not text:
                continue
            low = text.lower()
            for name, pat in ROTATION_PATTERNS.items():
                if re.search(pat, low):
                    hits[name] += 1
                    if len(samples[name]) < 5:
                        samples[name].append(text[:220])
                    for c in audience_cols:
                        v = (row.get(c) or "").strip().lower()
                        if v in ("true", "1", "oui", "vrai"):
                            by_audience[c][name] += 1
                    # The decisive question: does this concern anyone other
                    # than farming? Agriculture is out of scope (§0.2).
                    ent = (row.get("concerne_entreprise") or "").strip().lower()
                    if ent in ("true", "1", "oui", "vrai") and len(entreprise_examples) < 8:
                        entreprise_examples.append(text[:220])

        a["hits"] = dict(hits)
        a["hits_by_audience"] = {k: dict(v) for k, v in by_audience.items()}
        a["samples"] = {k: v for k, v in samples.items() if v}
        a["entreprise_examples"] = entreprise_examples
        total = sum(hits.values())
        ent_total = sum(by_audience.get("concerne_entreprise", Counter()).values())
        a["total_matches"] = total
        a["entreprise_matches"] = ent_total
        if total == 0:
            a["verdict"] = "ABSENT — aucun libellé de rotation dans le corpus ; type ρ sans objet ici"
        elif ent_total == 0:
            a["verdict"] = (
                "PRESENT MAIS HORS PERIMETRE — rotation trouvée, jamais sur un usage "
                "concernant l'entreprise ; agriculture hors périmètre §0.2"
            )
        else:
            a["verdict"] = f"PRESENT ET DANS LE PERIMETRE — {ent_total} mesures entreprise : à implémenter"
    report["a_rotation"] = a
    answered.add("A")
except Exception as e:  # noqa: BLE001
    report["errors"].append({"target": "A", "error": repr(e)[:300]})

# --- B. SISPEA -----------------------------------------------------------------
try:
    b: dict = {"datasets": []}
    search = requests.get(
        DATAGOUV_SEARCH, headers=UA, timeout=120,
        params={"q": "SISPEA services eau assainissement", "page_size": 12},
    ).json()
    for d in search.get("data", []):
        title = d.get("title") or ""
        blob = (title + " " + (d.get("description") or "")).lower()
        if "sispea" not in blob and "services d'eau" not in blob:
            continue
        entry = {
            "title": title,
            "last_update": d.get("last_update"),
            "page": d.get("page"),
            "resources": [
                {
                    "title": r.get("title"),
                    "format": r.get("format"),
                    "filesize": r.get("filesize"),
                    "url": r.get("url"),
                }
                for r in d.get("resources", [])[:25]
            ],
        }
        b["datasets"].append(entry)

    # What we need is a per-commune (or joinable) network-efficiency indicator.
    # P104.3 = rendement du réseau de distribution; P106.3 = indice linéaire de
    # pertes. Look for those codes in resource titles, then sniff the columns of
    # the most promising CSV.
    blob = json.dumps(b, ensure_ascii=False).lower()
    b["mentions"] = {
        k: (k.lower() in blob)
        for k in ["rendement", "P104", "P106", "pertes", "commune", "interconnexion", "indicateur"]
    }

    candidate = None
    for d in b["datasets"]:
        for r in d["resources"]:
            fmt = (r.get("format") or "").lower()
            t = (r.get("title") or "").lower()
            if fmt in ("csv", "xlsx") and any(k in t for k in ("indicateur", "service", "commune", "donnee")):
                candidate = r
                break
        if candidate:
            break
    if candidate:
        b["sniffed_resource"] = candidate
        try:
            rows = read_csv(fetch(candidate["url"], timeout=240))
            b["sniffed_rows"] = len(rows)
            b["sniffed_columns"] = list(rows[0].keys()) if rows else []
            joined = " ".join(b["sniffed_columns"]).lower()
            b["has_commune_key"] = any(k in joined for k in ("insee", "commune", "code_commune"))
            b["has_rendement"] = any(k in joined for k in ("rendement", "p104"))
            b["sample_row"] = rows[0] if rows else None
        except Exception as e:  # noqa: BLE001
            b["sniff_error"] = repr(e)[:200]

    b["verdict"] = (
        "EXPLOITABLE — clé commune et rendement présents"
        if b.get("has_commune_key") and b.get("has_rendement")
        else "PARTIEL — jeu trouvé, mais clé commune et/ou rendement non confirmés dans les colonnes"
        if b["datasets"]
        else "INTROUVABLE en open data via data.gouv"
    )
    report["b_sispea"] = b
    answered.add("B")
except Exception as e:  # noqa: BLE001
    report["errors"].append({"target": "B", "error": repr(e)[:300]})

# --- C. Hydroportail vs our own low-flow references ---------------------------
try:
    c: dict = {}
    # Find the station we have already verified in production: the Loire at
    # Orléans. Resolve it through Hub'Eau rather than hardcoding a code, so the
    # probe stays valid if the station changes.
    ref = requests.get(
        f"{HUBEAU_HYDRO}/referentiel/stations", headers=UA, timeout=120,
        params={
            "longitude": 1.9039, "latitude": 47.9029, "distance": 10,
            "format": "json", "size": 20, "en_service": "true",
        },
    ).json()
    stations = [
        {"code": s.get("code_station"), "libelle": s.get("libelle_station")}
        for s in ref.get("data", [])
    ]
    c["stations_near_orleans"] = stations[:10]
    code = next((s["code"] for s in stations if s.get("code")), None)
    c["station_used"] = code

    # Candidate machine-readable endpoints. None is documented as public, hence
    # the classification rather than an assumption either way.
    candidates = []
    if code:
        candidates = [
            f"https://hydro.eaufrance.fr/stationhydro/{code}/series",
            f"https://hydro.eaufrance.fr/api/v1/stations/{code}/statistiques",
            f"https://hydro.eaufrance.fr/sitehydro/{code}/fiche",
            f"https://www.hydro.eaufrance.fr/sitehydro/{code}/synthese",
        ]
    candidates.append(
        "https://hydro.eaufrance.fr/rechercher/entites-hydrometriques?_format=json"
    )
    c["candidates"] = [classify(u) for u in candidates]

    # Is anything published on data.gouv instead?
    search = requests.get(
        DATAGOUV_SEARCH, headers=UA, timeout=120,
        params={"q": "hydroportail statistiques hydrologiques QMNA5", "page_size": 8},
    ).json()
    c["datagouv"] = [
        {"title": d.get("title"), "page": d.get("page"),
         "resources": len(d.get("resources", []))}
        for d in search.get("data", [])
    ]

    reachable = [x for x in c["candidates"] if x.get("status") == 200 and x.get("looks_like") == "json"]
    c["verdict"] = (
        f"ENDPOINT JSON TROUVE ({len(reachable)}) — comparaison chiffrée possible"
        if reachable
        else "AUCUN ENDPOINT JSON PUBLIC — comparaison impossible sans scraping ; "
             "garder le calcul maison et l'écrire (cf. précédent MétéEAU)"
    )
    report["c_hydroportail"] = c
    answered.add("C")
except Exception as e:  # noqa: BLE001
    report["errors"].append({"target": "C", "error": repr(e)[:300]})

# --- D. V_ref: the ICPE arrêté of 30 June 2023 --------------------------------
try:
    d: dict = {}
    # Légifrance's own API is OAuth2 (PISTE). Classify the public routes and any
    # data.gouv mirror before concluding.
    d["candidates"] = [
        classify("https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000047762160"),
        classify("https://api.legifrance.gouv.fr/dila/legifrance/lf-engine-app/consult/jorf"),
        classify("https://www.legifrance.gouv.fr/download/pdf?id=JORFTEXT000047762160"),
    ]
    search = requests.get(
        DATAGOUV_SEARCH, headers=UA, timeout=120,
        params={"q": "arrêté 30 juin 2023 sécheresse ICPE prélèvement", "page_size": 8},
    ).json()
    d["datagouv"] = [
        {"title": x.get("title"), "page": x.get("page")} for x in search.get("data", [])
    ]
    ok = [x for x in d["candidates"] if x.get("status") == 200]
    d["verdict"] = (
        "TEXTE ATTEIGNABLE — au moins une route publique répond 200 ; "
        "reste à vérifier que la définition de V_ref y est extractible"
        if ok
        else "NON ATTEIGNABLE automatiquement — transcrire la définition à la main, "
             "avec citation de l'article (même traitement que le décret 2021-795)"
    )
    report["d_vref_icpe"] = d
    answered.add("D")
except Exception as e:  # noqa: BLE001
    report["errors"].append({"target": "D", "error": repr(e)[:300]})

# --- write & report -----------------------------------------------------------
(OUT / "note-technique-probe.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=1, default=str) + "\n", encoding="utf-8"
)

print("=== PROBE NOTE TECHNIQUE (sprint 38) ===")
print("A rotation      :", report["a_rotation"].get("verdict"))
print("   hits         :", report["a_rotation"].get("hits"))
print("B sispea        :", report["b_sispea"].get("verdict"))
print("   mentions     :", report["b_sispea"].get("mentions"))
print("C hydroportail  :", report["c_hydroportail"].get("verdict"))
print("   station      :", report["c_hydroportail"].get("station_used"))
print("D vref icpe     :", report["d_vref_icpe"].get("verdict"))
print("errors          :", report["errors"])

# A probe that answered nothing must not look green. Individual negative
# findings are results; four failures are an outage. Same reflex as the three
# sys.exit(1) floors added to the build scripts on 2026-08-07.
if not answered:
    raise SystemExit("probe answered none of the four questions — see errors above")
