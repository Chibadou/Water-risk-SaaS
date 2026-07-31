#!/usr/bin/env python3
"""Characterise the data sources behind the Sprint 21 "jours d'activité
contrainte" model, on a GitHub runner (full network, unlike the dev sandbox).

Three targets, all *read-only characterisation* — this script never writes
product data, only a probe report:

  A. "Restrictions" resource of the VigiEau drought dataset — the usage-level
     restrictions that apply when an arrêté takes effect on a zone. This is the
     source that replaces hand-calibrated exposure coefficients with measured
     ones, so we need its real columns and the value domain of the restriction
     severity field.
  B. Per-year "Arrêtés YYYY" archives + the Propluvia dataset — how far back the
     history can be widened beyond the current 5-year window.
  C. Hub'Eau BNPE referentiel/ouvrages — whether joining chroniques to ouvrages
     on code_ouvrage recovers the withdrawal *milieu* (surface / underground).
     The HANDBOOK records that chroniques alone lack it; the join is the
     candidate way around that documented dead end.

Output: data/restrictions/probe.json (provenance, real schemas, verdicts).

Known trap (HANDBOOK): data.gouv.fr /datasets/r/<id> URLs often serve an HTML
portal page rather than the file — every response is classified and HTML is
rejected rather than parsed.

Run in Actions with: pip install requests
"""

from __future__ import annotations

import csv
import io
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, urlparse

import requests

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "restrictions"
OUT.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "hydrovigie-restrictions-probe/1.0 (github actions; water-risk-saas)"}

VIGIEAU_DATASET = "https://www.data.gouv.fr/api/1/datasets/donnee-secheresse-vigieau/"
PROPLUVIA_DATASET = "https://www.data.gouv.fr/api/1/datasets/donnee-secheresse-propluvia/"

# Hub'Eau BNPE. Chartres (28085) is the commune the HANDBOOK records as
# verified real data (819 072 m³), so it is a known-good join test case.
TEST_INSEE = "28085"
BNPE = "https://hubeau.eaufrance.fr/api/v1/prelevements"

# Columns we care about, in normalised form, for the restrictions resource.
WANTED = [
    "usage", "thematique", "niveau_restriction", "niveaurestriction",
    "zone_alerte", "zones_alerte", "code", "niveau_gravite", "details",
    "concerne_entreprise", "concerne_particulier", "concerne_collectivite",
    "concerne_exploitation",
]

report: dict = {
    "generated": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    "a_restrictions": {},
    "b_history_depth": {},
    "c_bnpe_milieu": {},
    "errors": [],
}


def classify(head: bytes) -> str:
    h = head.lstrip()
    if head[:2] == b"PK":
        return "zip"
    if h[:1] == b"<":
        return "html/xml"
    if h[:1] in (b"{", b"["):
        return "json"
    return "text/csv?"


def norm(s: str) -> str:
    """Normalise a column name: lowercase, strip accents and separators."""
    out = []
    for ch in (s or "").strip().lower():
        if ch in "àâä":
            ch = "a"
        elif ch in "éèêë":
            ch = "e"
        elif ch in "îï":
            ch = "i"
        elif ch in "ôö":
            ch = "o"
        elif ch in "ùûü":
            ch = "u"
        elif ch == "ç":
            ch = "c"
        out.append(ch)
    return "".join(out).replace(" ", "_").replace("-", "_").replace(".", "_")


def get_json(url: str, timeout: int = 120):
    r = requests.get(url, headers=UA, timeout=timeout)
    r.raise_for_status()
    return r.json()


def download(url: str, max_bytes: int = 220_000_000) -> tuple[bytes, dict]:
    """Download a resource, classifying what actually came back."""
    r = requests.get(url, headers=UA, timeout=300, stream=True, allow_redirects=True)
    meta = {
        "url": url,
        "final_host": urlparse(r.url).netloc,
        "status": r.status_code,
        "content_type": (r.headers.get("content-type") or "").split(";")[0],
    }
    buf = io.BytesIO()
    for chunk in r.iter_content(1 << 16):
        buf.write(chunk)
        if buf.tell() > max_bytes:
            meta["truncated"] = True
            break
    r.close()
    data = buf.getvalue()
    meta["bytes"] = len(data)
    meta["kind"] = classify(data[:2048])
    meta["peek"] = data[:120].decode("latin-1", "replace")
    return data, meta


def sniff_csv(data: bytes) -> tuple[list[str], list[list[str]], str]:
    """Decode + sniff the delimiter, returning (header, rows, encoding)."""
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            text = data.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = data.decode("latin-1", "replace")
        enc = "latin-1/replace"
    sample = text[:8192]
    delim = max([",", ";", "\t", "|"], key=lambda d: sample.count(d))
    rows = list(csv.reader(io.StringIO(text), delimiter=delim))
    header = rows[0] if rows else []
    return header, rows[1:], f"{enc} delim={delim!r}"


# --- A. The Restrictions resource -------------------------------------------
try:
    ds = get_json(VIGIEAU_DATASET)
    resources = []
    for res in ds.get("resources", []):
        resources.append({
            "title": res.get("title"),
            "format": res.get("format"),
            "url": res.get("url"),
            "id": res.get("id"),
            "filesize": res.get("filesize"),
            "description": (res.get("description") or "")[:300],
        })
    report["a_restrictions"]["dataset_resources"] = resources

    # The restrictions resource is the one whose title mentions restriction
    # (and is not the arrêtés/zones file).
    targets = [
        r for r in resources
        if "restriction" in (r["title"] or "").lower()
        and (r["format"] or "").lower() in {"csv", "", "zip"}
    ]
    report["a_restrictions"]["matched"] = [t["title"] for t in targets]

    schemas = []
    for t in targets[:3]:
        data, meta = download(t["url"])
        entry = {"title": t["title"], **meta}
        if meta["kind"] == "html/xml":
            entry["verdict"] = "REJECTED: portal HTML, not the file"
        else:
            header, rows, enc = sniff_csv(data)
            entry["encoding"] = enc
            entry["columns"] = header
            entry["normalised_columns"] = [norm(h) for h in header]
            entry["row_count"] = len(rows)
            entry["sample_rows"] = [dict(zip(header, r)) for r in rows[:3]]
            nh = [norm(h) for h in header]
            entry["wanted_present"] = sorted(set(nh) & set(WANTED))
            # Value domain of every column that looks like a restriction level,
            # a usage or a thematique — this is what the coefficients map from.
            dist = {}
            for i, col in enumerate(nh):
                if any(k in col for k in ("restriction", "usage", "thematique", "niveau")):
                    c = Counter(r[i] for r in rows if i < len(r) and r[i] != "")
                    dist[header[i]] = c.most_common(40)
            entry["value_domains"] = dist
            entry["verdict"] = "USABLE" if entry["wanted_present"] else "schema unclear"
        schemas.append(entry)
    report["a_restrictions"]["schemas"] = schemas
except Exception as e:  # noqa: BLE001
    report["errors"].append({"target": "A", "error": repr(e)[:300]})

# --- B. How far back the history goes ---------------------------------------
try:
    ds = report["a_restrictions"].get("dataset_resources") or []
    year_files = [
        {"title": r["title"], "url": r["url"], "format": r["format"], "filesize": r["filesize"]}
        for r in ds if "arr" in (r["title"] or "").lower() and any(ch.isdigit() for ch in (r["title"] or ""))
    ]
    report["b_history_depth"]["vigieau_year_archives"] = year_files

    prop = get_json(PROPLUVIA_DATASET)
    report["b_history_depth"]["propluvia"] = [
        {"title": r.get("title"), "format": r.get("format"), "url": r.get("url"),
         "filesize": r.get("filesize")}
        for r in prop.get("resources", [])
    ]
    # Probe the oldest-looking year archive to confirm it shares the master schema.
    if year_files:
        oldest = sorted(year_files, key=lambda r: r["title"])[0]
        data, meta = download(oldest["url"], max_bytes=40_000_000)
        entry = {"title": oldest["title"], **meta}
        if meta["kind"] != "html/xml":
            header, rows, enc = sniff_csv(data)
            entry["columns"] = header
            entry["row_count"] = len(rows)
        report["b_history_depth"]["oldest_probe"] = entry
except Exception as e:  # noqa: BLE001
    report["errors"].append({"target": "B", "error": repr(e)[:300]})

# --- C. BNPE: does joining chroniques→ouvrages recover the milieu? ----------
try:
    c: dict = {}
    chron = get_json(f"{BNPE}/chroniques?code_commune_insee={TEST_INSEE}&size=200")
    cdata = chron.get("data", [])
    c["chroniques_count"] = len(cdata)
    c["chroniques_fields"] = sorted(cdata[0].keys()) if cdata else []
    c["chroniques_has_milieu"] = [
        k for k in (cdata[0].keys() if cdata else []) if "milieu" in k.lower()
    ]

    ouvrages = get_json(f"{BNPE}/referentiel/ouvrages?code_commune_insee={TEST_INSEE}&size=200")
    odata = ouvrages.get("data", [])
    c["ouvrages_count"] = len(odata)
    c["ouvrages_fields"] = sorted(odata[0].keys()) if odata else []
    c["ouvrages_milieu_fields"] = [
        k for k in (odata[0].keys() if odata else []) if "milieu" in k.lower() or "bdlisa" in k.lower()
    ]
    c["ouvrages_sample"] = odata[:2]

    # The actual join test: how many chronique rows can be given a milieu.
    by_code = {o.get("code_ouvrage"): o for o in odata if o.get("code_ouvrage")}
    joined = 0
    milieux = Counter()
    usage_milieu = Counter()
    for row in cdata:
        o = by_code.get(row.get("code_ouvrage"))
        if not o:
            continue
        m = o.get("libelle_type_milieu") or o.get("code_type_milieu")
        if m:
            joined += 1
            milieux[m] += 1
            usage_milieu[(row.get("libelle_usage") or row.get("code_usage"), m)] += 1
    c["joined_rows"] = joined
    c["join_rate"] = round(joined / len(cdata), 3) if cdata else None
    c["milieu_distribution"] = milieux.most_common()
    c["usage_x_milieu"] = [
        {"usage": k[0], "milieu": k[1], "n": v} for k, v in usage_milieu.most_common(30)
    ]
    c["verdict"] = (
        "JOIN WORKS — usage × milieu is reachable" if joined
        else "JOIN FAILED — milieu not recoverable this way"
    )
    report["c_bnpe_milieu"] = c
except Exception as e:  # noqa: BLE001
    report["errors"].append({"target": "C", "error": repr(e)[:300]})

(OUT / "probe.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=1, default=str) + "\n", encoding="utf-8"
)

print("=== PROBE SUMMARY ===")
print("A restrictions :", [s.get("verdict") for s in report["a_restrictions"].get("schemas", [])])
print("B year archives:", len(report["b_history_depth"].get("vigieau_year_archives", [])))
print("C bnpe milieu  :", report["c_bnpe_milieu"].get("verdict"))
print("errors         :", report["errors"])
