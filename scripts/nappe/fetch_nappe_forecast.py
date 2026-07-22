#!/usr/bin/env python3
"""BRGM MétéEAU des nappes — groundwater-level 6-month forecast, fetched on a
GitHub runner (full network, unlike the dev sandbox). Follow-up to the Sprint 20
anticipation index: upgrade the groundwater dimension from a persistence-of-now
signal (current IPS) to a genuine forward-looking model forecast.

Two modes, selected by `mode` in data/nappe-forecast-request.json:

  probe : discovery only — does MétéEAU des nappes (or any BRGM/open-data source)
          expose an OPEN, machine-readable JSON forecast API? Classifies each
          candidate endpoint (JSON vs HTML portal), summarizes JSON structure,
          and enumerates data.gouv datasets. Writes data/refdata/nappe-probe.json.
          This resolves the gating unknown before any integration is designed
          — same probe-first approach that found the Sandre ZRE WFS in Sprint 19.

  fetch : (Phase B, designed after the probe) extract the latest 6-month forecast
          per reference station into data/refdata/nappe-forecasts.json.

Reuses the content-sniffing idea from scripts/refdata/fetch_refdata.py: a JSON
API and an HTML error/landing page are told apart by their first non-space byte,
so a portal that silently serves HTML is never mistaken for data.

Run in Actions with: pip install requests
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, urlparse

import requests

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "refdata"
OUT.mkdir(parents=True, exist_ok=True)

UA = {
    "User-Agent": "hydrovigie-nappe/1.0 (github actions; water-risk-saas)",
    "Accept": "application/json, */*",
}
GENERATED = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

try:
    MODE = json.loads(
        (ROOT / "data" / "nappe-forecast-request.json").read_text(encoding="utf-8")
    ).get("mode", "probe")
except Exception:  # noqa: BLE001
    MODE = "probe"


# --------------------------------------------------------------------------
# Shared content sniffing
# --------------------------------------------------------------------------
def classify(head: bytes) -> str:
    h = head.lstrip()
    if head[:2] == b"PK":
        return "zip"
    if h[:1] == b"<":
        return "html/xml"
    if h[:1] in (b"{", b"["):
        return "json"
    return "other"


def probe_url(url: str, method: str = "GET") -> dict:
    """Fetch the first bytes of a URL and classify what it serves."""
    try:
        r = requests.request(
            method, url, headers=UA, timeout=45, stream=True, allow_redirects=True
        )
        head = next(r.iter_content(2048), b"") or b""
        final = r.url
        ct = (r.headers.get("content-type") or "").split(";")[0]
        status = r.status_code
        r.close()
        return {
            "url": url,
            "final_host": urlparse(final).netloc,
            "final_url": final if final != url else None,
            "status": status,
            "content_type": ct,
            "kind": classify(head),
            "peek": head[:200].decode("latin-1", "replace"),
        }
    except Exception as e:  # noqa: BLE001
        return {"url": url, "error": str(e)[:200]}


def summarize_json(obj, _depth: int = 0):
    """Compact structural summary of a parsed JSON value (keys / array shape)."""
    if isinstance(obj, dict):
        return {"type": "object", "keys": list(obj.keys())[:30]}
    if isinstance(obj, list):
        return {
            "type": "array",
            "len": len(obj),
            "item": summarize_json(obj[0], _depth + 1) if obj and _depth < 3 else None,
        }
    if isinstance(obj, str):
        return {"type": "string", "sample": obj[:60]}
    return {"type": type(obj).__name__, "value": obj if _depth else None}


def inspect_json(url: str) -> dict:
    """For a promising endpoint: bounded GET, parse, summarize its structure so
    we can see the forecast schema (station ids, coordinates, thresholds…)."""
    rec = probe_url(url)
    if rec.get("kind") != "json" or rec.get("status") != 200:
        return rec
    try:
        r = requests.get(url, headers=UA, timeout=60, allow_redirects=True)
        text = r.text[:1_000_000]
        rec["bytes"] = len(r.content)
        try:
            rec["structure"] = summarize_json(json.loads(text))
        except Exception:  # noqa: BLE001 — likely truncated large payload
            rec["structure"] = {"type": "unparsed", "note": "response too large / truncated"}
    except Exception as e:  # noqa: BLE001
        rec["inspect_error"] = str(e)[:160]
    return rec


# --------------------------------------------------------------------------
# Probe mode
# --------------------------------------------------------------------------
def run_probe() -> None:
    # 1. Candidate MétéEAU des nappes / BRGM API endpoints. We don't know the
    #    real shape — enumerate plausible bases × paths and let classification
    #    tell us which serve JSON (an API) vs HTML (a portal).
    bases = [
        "https://meteeaunappes.brgm.fr",
        "https://api.meteeaunappes.brgm.fr",
    ]
    paths = [
        "/", "/api", "/api/", "/api/v1/", "/v1/",
        "/api/models", "/api/model", "/models",
        "/api/indicateurs", "/indicateurs", "/api/indicators",
        "/api/stations", "/stations", "/api/points",
        "/api/situation", "/api/previsions", "/previsions",
        "/openapi.json", "/swagger.json", "/api/swagger.json",
        "/swagger", "/docs", "/api/docs", "/redoc",
    ]
    endpoints = []
    seen: set[str] = set()
    for b in bases:
        for p in paths:
            u = b + p
            if u in seen:
                continue
            seen.add(u)
            endpoints.append(inspect_json(u))

    # 2. Other plausible open sources of a groundwater forecast / indicator.
    others = [
        # Hub'Eau API catalog — confirm whether any forecast API is listed there.
        "https://hubeau.eaufrance.fr/api/",
        "https://hubeau.eaufrance.fr/page/apis",
        # ADES (groundwater portal) landing.
        "https://ades.eaufrance.fr/",
        # BRGM generic data / InfoTerre gateways.
        "https://infoterre.brgm.fr/",
    ]
    for u in others:
        endpoints.append(probe_url(u))

    # 3. data.gouv catalog search for a published forecast dataset.
    queries = [
        "météeau des nappes",
        "meteeau nappes prévision",
        "prévision niveau nappe",
        "prévision nappes sécheresse",
        "niveau nappes prévision BRGM",
    ]
    datagouv = []
    seen_res: set[str] = set()
    for q in queries:
        try:
            cat = requests.get(
                "https://www.data.gouv.fr/api/1/datasets/?q=" + quote(q) + "&page_size=15",
                headers=UA,
                timeout=60,
            ).json()
        except Exception as e:  # noqa: BLE001
            datagouv.append({"query": q, "error": str(e)[:160]})
            continue
        for ds in cat.get("data", []):
            title = ds.get("title") or ""
            tl = title.lower()
            if not any(k in tl for k in ("nappe", "météeau", "meteeau", "prévision", "prevision")):
                continue
            for res in ds.get("resources", []):
                url = res.get("url") or ""
                if not url or url in seen_res:
                    continue
                seen_res.add(url)
                fmt = (res.get("format") or "").lower()
                if fmt not in {"json", "geojson", "csv", "zip", "api", ""}:
                    continue
                rec = probe_url(url)
                rec["dataset"] = title
                rec["format"] = fmt
                datagouv.append(rec)

    out = {
        "generated": GENERATED,
        "goal": (
            "Does BRGM MétéEAU des nappes expose an open JSON forecast API? "
            "Endpoints classified json/html; JSON ones summarized (structure). "
            "data.gouv searched for a published forecast dataset."
        ),
        "endpoints": endpoints,
        "datagouv": datagouv,
    }
    (OUT / "nappe-probe.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    json_hits = sum(1 for e in endpoints if e.get("kind") == "json" and e.get("status") == 200)
    print(
        f"probe: {len(endpoints)} endpoints ({json_hits} JSON 200), "
        f"{len(datagouv)} data.gouv records → nappe-probe.json"
    )


# --------------------------------------------------------------------------
# Spec discovery — the probe found a Swagger UI at api.meteeaunappes.brgm.fr,
# so an OpenAPI-described JSON API exists. Locate its spec and enumerate the
# real endpoints (paths, methods, params) so the fetch can be designed.
# --------------------------------------------------------------------------
API_BASE = "https://api.meteeaunappes.brgm.fr"


def fetch_text(url: str, cap: int = 300_000) -> dict:
    try:
        r = requests.get(url, headers=UA, timeout=60, allow_redirects=True)
        ct = (r.headers.get("content-type") or "").split(";")[0]
        return {"url": url, "status": r.status_code, "content_type": ct, "text": r.text[:cap]}
    except Exception as e:  # noqa: BLE001
        return {"url": url, "error": str(e)[:200]}


def run_spec() -> None:
    import re  # noqa: WPS433

    findings: dict = {
        "generated": GENERATED,
        "base": API_BASE,
        "bootstrap": [],
        "spec_candidates": [],
        "spec_url": None,
        "openapi": None,
        "servers": None,
        "paths": None,
    }

    # 1. Read the Swagger-UI bootstrap files to locate the configured spec URL.
    for p in ("/index.html", "/swagger-initializer.js", "/swagger-config",
              "/swagger-ui-init.js", "/swagger-ui/swagger-initializer.js"):
        doc = fetch_text(API_BASE + p, 60_000)
        text = doc.pop("text", "") if "text" in doc else ""
        doc["peek"] = text[:600]
        findings["bootstrap"].append(doc)
        for m in re.findall(r'["\']([^"\']*(?:api-docs|openapi|swagger[^"\']*\.json|\.yaml)[^"\']*)["\']', text):
            findings["spec_candidates"].append(m)
        for m in re.findall(r'url\s*[:=]\s*["\']([^"\']+)["\']', text):
            findings["spec_candidates"].append(m)

    # 2. Build a list of spec URLs to try: discovered candidates (resolved) +
    #    the standard OpenAPI/Swagger locations.
    def resolve(u: str) -> str:
        if u.startswith("http"):
            return u
        if u.startswith("/"):
            return API_BASE + u
        return API_BASE + "/" + u

    standard = ["/v3/api-docs", "/v2/api-docs", "/api-docs", "/openapi",
                "/openapi.yaml", "/swagger-resources", "/q/openapi", "/api/v3/api-docs"]
    tried: set[str] = set()
    spec_urls = []
    for u in findings["spec_candidates"] + standard:
        r = resolve(u)
        if r not in tried and "petstore" not in r:
            tried.add(r)
            spec_urls.append(r)

    # 3. Fetch each candidate; the real spec has "openapi"/"swagger" + "paths".
    for u in spec_urls:
        doc = fetch_text(u, 2_000_000)
        if "error" in doc or doc.get("status") != 200:
            continue
        try:
            spec = json.loads(doc["text"])
        except Exception:  # noqa: BLE001
            continue
        if not isinstance(spec, dict) or "paths" not in spec:
            continue
        findings["spec_url"] = u
        findings["openapi"] = spec.get("openapi") or spec.get("swagger")
        findings["servers"] = spec.get("servers") or spec.get("host")
        # Compact per-path summary: methods, summary, tags, parameter names.
        paths_summary = {}
        for path, item in (spec.get("paths") or {}).items():
            if not isinstance(item, dict):
                continue
            ops = {}
            for method, op in item.items():
                if not isinstance(op, dict):
                    continue
                params = [pm.get("name") for pm in op.get("parameters", []) if isinstance(pm, dict)]
                ops[method] = {
                    "summary": (op.get("summary") or op.get("description") or "")[:140],
                    "tags": op.get("tags"),
                    "params": params,
                }
            paths_summary[path] = ops
        findings["paths"] = paths_summary
        break

    (OUT / "nappe-spec.json").write_text(
        json.dumps(findings, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    n = len(findings["paths"]) if findings["paths"] else 0
    print(f"spec: spec_url={findings['spec_url']}, {n} paths → nappe-spec.json")


SPEC_URL = "https://api.meteeaunappes.brgm.fr/swagger/v2.1.0/swagger.json"


def _deref(spec: dict, node, depth: int = 0):
    """Summarize an OpenAPI schema node (resolve one level of $ref)."""
    if not isinstance(node, dict):
        return None
    if "$ref" in node:
        ref = node["$ref"].split("/")[-1]
        store = spec.get("components", {}).get("schemas") or spec.get("definitions") or {}
        sch = store.get(ref, {})
        return {"schema": ref, "type": sch.get("type"),
                "props": list((sch.get("properties") or {}).keys())[:40]}
    if node.get("type") == "array":
        return {"type": "array", "items": _deref(spec, node.get("items", {}), depth + 1)}
    if "properties" in node:
        return {"type": "object", "props": list(node["properties"].keys())[:40]}
    return {"type": node.get("type")}


def _params(op: dict):
    out = []
    for pm in op.get("parameters", []):
        if not isinstance(pm, dict):
            continue
        sch = pm.get("schema", {}) or {}
        out.append({"name": pm.get("name"), "in": pm.get("in"), "required": pm.get("required"),
                    "type": sch.get("type"), "enum": sch.get("enum"), "format": sch.get("format"),
                    "desc": (pm.get("description") or "")[:140]})
    return out


def _response(spec: dict, op: dict):
    resp = (op.get("responses", {}) or {}).get("200", {})
    content = resp.get("content", {}) or {}
    for ct in ("application/json", "text/json", "*/*"):
        if ct in content:
            return _deref(spec, content[ct].get("schema", {}))
    return None


def get_and_summarize(url: str) -> dict:
    rec = {"url": url}
    try:
        r = requests.get(url, headers=UA, timeout=90, allow_redirects=True)
        rec["status"] = r.status_code
        rec["content_type"] = (r.headers.get("content-type") or "").split(";")[0]
        rec["peek"] = r.text[:1600]
        if rec["content_type"] in ("application/json", "text/json") and r.status_code == 200:
            try:
                rec["structure"] = summarize_json(json.loads(r.text[:2_000_000]))
            except Exception:  # noqa: BLE001
                pass
    except Exception as e:  # noqa: BLE001
        rec["error"] = str(e)[:200]
    return rec


def run_sample() -> None:
    from datetime import timedelta

    out: dict = {"generated": GENERATED, "spec_url": SPEC_URL, "schemas": {}, "calls": []}

    # 1. Full spec → param + response schema for the endpoints we care about.
    targets = ["/Capteur/IPS", "/Capteur/IPS/{codeBss}", "/Capteur/{type}",
               "/Capteur/Types", "/Capteur/Sources", "/Capteur/{type}/{identifier}/seuils",
               "/Capteur/{type}/{identifier}", "/Model/QRiv"]
    scenario_enum = None
    try:
        spec = requests.get(SPEC_URL, headers=UA, timeout=90).json()
        for path in targets:
            item = (spec.get("paths") or {}).get(path)
            if not isinstance(item, dict):
                continue
            get = item.get("get")
            if not isinstance(get, dict):
                continue
            out["schemas"][path] = {"params": _params(get), "response": _response(spec, get)}
            if path == "/Capteur/IPS":
                for pm in _params(get):
                    if pm["name"] == "scenario" and pm.get("enum"):
                        scenario_enum = pm["enum"]
    except Exception as e:  # noqa: BLE001
        out["spec_error"] = str(e)[:200]

    # 2. Live calls. Start with the no-param catalogs.
    base = API_BASE
    for ep in ("/Capteur/Types", "/Capteur/Sources"):
        out["calls"].append(get_and_summarize(base + ep))

    today = datetime.now(timezone.utc).date().isoformat()
    future = (datetime.now(timezone.utc).date() + timedelta(days=120)).isoformat()
    scenarios = (scenario_enum or ["", "0", "5", "moy", "median"])[:4]

    # 3. IPS over a small bbox — try WGS84 and Lambert-93 around Orléans (Beauce
    #    aquifer, densely monitored) so we learn the coordinate system + shape.
    bboxes = {
        "wgs84": dict(xmin=1.6, xmax=2.2, ymin=47.7, ymax=48.2),
        "lambert93": dict(xmin=600000, xmax=660000, ymin=6740000, ymax=6790000),
    }
    found_bss = None
    for crs, bb in bboxes.items():
        for sc in ([scenarios[0]] if scenarios else [""]):
            q = f"date={today}&xmin={bb['xmin']}&xmax={bb['xmax']}&ymin={bb['ymin']}&ymax={bb['ymax']}"
            if sc:
                q += f"&scenario={quote(str(sc))}"
            rec = get_and_summarize(f"{base}/Capteur/IPS?{q}")
            rec["crs"] = crs
            out["calls"].append(rec)
            # Try to pull a codeBss out of the response for the per-station call.
            if not found_bss and rec.get("status") == 200:
                m = None
                import re  # noqa: WPS433
                m = re.search(r'"?code[_ ]?bss"?\s*:\s*"([0-9A-Za-z/.-]+)"', rec.get("peek", ""), re.I)
                if m:
                    found_bss = m.group(1)

    # 4. Per-station forecast: today vs +120 days, across scenarios.
    bss = found_bss or "03632X0086/S1"  # a known Beauce piezometer as a fallback
    out["sampled_bss"] = bss
    for sc in scenarios:
        for d in (today, future):
            q = f"date={d}"
            if sc:
                q += f"&scenario={quote(str(sc))}"
            rec = get_and_summarize(f"{base}/Capteur/IPS/{quote(bss, safe='')}?{q}")
            rec["scenario"] = sc
            rec["date"] = d
            out["calls"].append(rec)

    (OUT / "nappe-sample.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    print(f"sample: {len(out['schemas'])} schemas, {len(out['calls'])} live calls → nappe-sample.json")


# --------------------------------------------------------------------------
# Fetch mode (Phase B — implemented after the probe informs the schema)
# --------------------------------------------------------------------------
def run_fetch() -> None:
    print(
        "fetch: not yet implemented — run mode 'probe' first and design the "
        "extraction from data/refdata/nappe-probe.json."
    )


if MODE == "probe":
    run_probe()
elif MODE == "spec":
    run_spec()
elif MODE == "sample":
    run_sample()
elif MODE == "fetch":
    run_fetch()
else:
    print(f"unknown mode {MODE!r}; nothing to do")

sys.exit(0)
