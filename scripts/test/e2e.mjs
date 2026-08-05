import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3200";
const results = [];
const check = (name, cond) => {
  results.push(`${cond ? "PASS" : "FAIL"} ${name}`);
};

let browser;
try {
  browser = await chromium.launch();
} catch {
  browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
}
const page = await browser.newPage();
page.setDefaultTimeout(15000);

// 1. Empty dashboard state
await page.goto(`${BASE}/sites`);
await page.waitForLoadState("networkidle");
check("empty state visible", await page.getByText("Aucun site enregistré").isVisible());
check("nav has Mes sites link", await page.getByRole("link", { name: /Mes sites/ }).isVisible());

// 2. Inject two sites into localStorage, reload
await page.evaluate(() => {
  localStorage.setItem(
    "hydrovigie.sites.v1",
    JSON.stringify([
      { id: "2.895600,42.688700", label: "Usine Perpignan", lon: 2.8956, lat: 42.6887, profil: "entreprise", createdAt: "2026-07-19T00:00:00Z" },
      { id: "4.835700,45.764000", label: "Agence Lyon", lon: 4.8357, lat: 45.764, profil: "entreprise", createdAt: "2026-07-19T00:00:00Z" },
    ]),
  );
});
await page.reload();
await page.waitForLoadState("networkidle");
check("row Perpignan visible", await page.getByText("Usine Perpignan").isVisible());
check("row Lyon visible", await page.getByText("Agence Lyon").isVisible());
check("nav badge shows 2", (await page.getByRole("link", { name: /Mes sites/ }).innerText()).includes("2"));
// API calls fail in sandbox -> per-site graceful error message
await page.getByText("Service VigiEau indisponible").first().waitFor({ state: "visible" }).catch(() => {});
const errCount = await page.getByText(/Service VigiEau (indisponible|injoignable)/).count();
check("graceful per-site error shown", errCount >= 1);

// 2b. Portfolio blocks degrade honestly when upstream is unreachable.
// In the sandbox VigiEau and the arrêtés CSV are both blocked, so nothing can
// be computed — which is exactly the state that must NOT read as "no risk".
{
  const synthese = page.getByRole("region", { name: "Synthèse du portefeuille" });
  check("executive summary rendered", await synthese.isVisible());
  check("summary states what it does not know",
    (await synthese.innerText()).includes("jamais comme des sites sans risque"));
  check("summary invents no headline without facts",
    (await synthese.innerText()).match(/le même jour/) === null);

  const correl = page.getByText("Corrélation entre vos sites");
  check("correlation block present for a multi-site portfolio", await correl.isVisible());
  check("correlation says the calendar is missing rather than charting zero",
    (await page.getByText(/Calendrier des arrêtés indisponible/).count()) >= 1);
}

// 3. Delete a site
await page.getByRole("button", { name: "Supprimer Agence Lyon" }).click();
await page.waitForTimeout(300);
check("Lyon removed from list", (await page.getByText("Agence Lyon").count()) === 0);
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("hydrovigie.sites.v1")));
check("localStorage now has 1 site", stored.length === 1 && stored[0].label === "Usine Perpignan");

// 4. Export button enabled, import button present
check("export enabled", await page.getByRole("button", { name: "Exporter (JSON)" }).isEnabled());
check("import present", await page.getByRole("button", { name: "Importer" }).isVisible());

// 5. Deep link on search page
await page.goto(`${BASE}/?lat=42.6887&lon=2.8956&label=Usine%20Perpignan&profil=entreprise`);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(1500);
const errBanner = await page.getByText(/indisponible|injoignable/).count();
check("deep link triggers lookup (error banner in sandbox)", errBanner >= 1);

// 6. Search page renders French UI
check("home h1 visible", await page.getByRole("heading", { name: /niveau de restriction/ }).isVisible());

// 7. Internal figures: collapsed by default, and an emptied field means "not
// declared" — never zero. Purely client-side, so it is testable in the sandbox.
{
  const summary = page.getByText("Données internes du site");
  check("internal data block present", await summary.isVisible());
  const volume = page.getByLabel("Volume prélevé (m³/an)");
  check("internal fields hidden until expanded", !(await volume.isVisible()));
  await summary.click();
  check("internal fields revealed on expand", await volume.isVisible());
  await volume.fill("36500");
  check("value accepted", (await volume.inputValue()) === "36500");
  await volume.fill("");
  check("cleared field goes back to empty, not 0", (await volume.inputValue()) === "");
}

// 8. Map page (Sprint 29). Upstream data is unreachable in the sandbox, so what
// is testable here is the shell and — more importantly — that an unreachable
// layer SAYS SO. A map that silently draws nothing looks exactly like a region
// with no stations in it.
{
  await page.goto(`${BASE}/carte`);
  await page.waitForLoadState("networkidle");
  check("map page h1 visible",
    await page.getByRole("heading", { name: /Carte des ressources en eau/ }).isVisible());
  check("nav has Carte link", await page.getByRole("link", { name: /^Carte$/ }).isVisible());

  // The basemap tiles are unreachable here, so a screenshot cannot tell "map
  // built, nothing to draw" from "map never initialised". This flag can — and
  // it caught exactly that: with map.on("load"), which waits for every source
  // including the blocked raster tiles, no layer was ever created.
  await page.locator("[data-map-ready]").first().waitFor({ state: "attached", timeout: 20000 });
  check("map installs its layers without the basemap", (await page.locator("[data-map-ready]").count()) === 1);
  const nappesStatus = await page.evaluate(async () => (await fetch("/api/nappes")).status);
  check("aquifer polygons are served from the repo", nappesStatus === 200);

  const toggles = page.locator('input[type="checkbox"]');
  check("one toggle per layer plus aquifers and rivers", (await toggles.count()) === 6);
  const riversToggle = page.getByLabel(/Cours d'eau/);
  check("rivers toggle present and on by default", await riversToggle.isChecked());
  await riversToggle.uncheck();
  check("rivers toggle can be turned off", !(await riversToggle.isChecked()));
  await riversToggle.check();
  const piezoToggle = page.getByLabel(/Piézomètres/);
  check("layer toggle starts checked", await piezoToggle.isChecked());
  await piezoToggle.uncheck();
  check("layer toggle can be turned off", !(await piezoToggle.isChecked()));

  check("prompts for an address before querying anything",
    await page.getByText(/Saisissez une adresse/).isVisible());
  check("states what the map does NOT say",
    await page.getByText(/Ce que la carte ne dit pas/).isVisible());
  check("warns that a translucent structure is a commune centroid",
    (await page.getByText(/au centre de sa commune/).count()) >= 1);

  // Ask the route for a real point: in the sandbox every upstream fetch fails,
  // and the response must say so rather than present empty layers as an answer.
  await page.goto(`${BASE}/api/carte?lat=48.4439&lon=1.4890&rayon=30`);
  const body = await page.locator("body").innerText();
  const payload = JSON.parse(body);
  check("/api/carte answers with all four layers",
    ["hydro", "piezo", "onde", "bnpe"].every((k) => Array.isArray(payload.features?.[k])));
  check("/api/carte clamps the radius server-side", payload.radiusKm === 30);
  check("/api/carte reports unreachable layers instead of empty ones",
    Object.keys(payload.messages ?? {}).length >= 1);
  check("/api/carte publishes object totals next to the markers",
    payload.totals !== undefined && ["hydro", "piezo", "onde", "bnpe"].every((k) => typeof payload.totals[k] === "number"));
}

// 9. Clicking objects names them (Sprint 30). Upstream points are unreachable
// here, but the aquifer polygons are served from the repo — so the one click
// that CAN be tested in the sandbox is the one on a groundwater body, and it is
// also the one that answered nothing at all before this sprint.
{
  await page.goto(`${BASE}/carte`);
  await page.waitForLoadState("networkidle");
  await page.locator("[data-map-ready]").first().waitFor({ state: "attached", timeout: 20000 });
  await page.waitForTimeout(3500);
  const box = await page.locator("canvas.maplibregl-canvas").boundingBox();
  // Centre of the map at the France-wide default view: over land, so over a
  // groundwater body.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(800);
  const popup = await page.locator(".maplibregl-popup-content").innerText().catch(() => "");
  check("clicking an aquifer names it", /Masse d'eau/.test(popup));
  check("the aquifer popup gives its surface", /Surface totale/.test(popup));
  check("the aquifer popup states no unmeasured characteristic",
    !/Karstique|Multicouches/i.test(popup));
}

// 10. Co-located objects (Sprint 30). Upstream is unreachable in the sandbox,
// so /api/carte is intercepted with a payload shaped like the real one: several
// structures published at a single commune centroid. What must hold is that the
// marker says how many it stands for and names them — before this sprint, nine
// of them were simply invisible under the tenth.
{
  const lat = 42.6986, lon = 2.8956;
  const membres = Array.from({ length: 12 }, (_, i) => ({ code: `OPR${i}`, label: `Rivesaltes — ouvrage ${i + 1}` }));
  await page.route("**/api/geocode**", (r) =>
    r.fulfill({ json: { results: [{ label: "Perpignan", lat, lon }] } }));
  await page.route("**/api/carte**", (r) =>
    r.fulfill({ json: {
      centre: { lat, lon }, radiusKm: 10, messages: {},
      totals: { hydro: 0, piezo: 0, onde: 0, bnpe: 12 },
      features: { hydro: [], piezo: [], onde: [], bnpe: [{
        kind: "bnpe", code: "OPR0", label: "Rivesaltes — ouvrage 1",
        lon, lat: lat + 0.03, distanceKm: 3.3, approximate: true, detail: "Souterrain",
        caracteristiques: [{ label: "Commune", valeur: "Rivesaltes" }],
        groupe: { total: 12, membres },
      }] },
    } }));

  await page.goto(`${BASE}/carte`);
  await page.waitForLoadState("networkidle");
  await page.locator("[data-map-ready]").first().waitFor({ state: "attached", timeout: 20000 });
  await page.getByLabel("Adresse autour de laquelle chercher").fill("Perpignan");
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /Perpignan/ }).first().click();
  await page.waitForTimeout(4000);

  // The label of the toggle, not the legend entry that shares its wording.
  check("the counter shows objects, not markers",
    (await page.locator("label", { hasText: /Ouvrages de prélèvement/ }).first().innerText()).includes("(12)"));

  // Walk up from the centre to find the marker. Popups are closed between
  // clicks: an aquifer popup is a DOM overlay and would swallow the next one.
  const box = await page.locator("canvas.maplibregl-canvas").boundingBox();
  let grouped = "";
  for (let dy = -10; dy >= -220 && !grouped; dy -= 4) {
    for (const b of await page.locator(".maplibregl-popup-close-button").all()) await b.click().catch(() => {});
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + dy);
    await page.waitForTimeout(90);
    const texts = await page.locator(".maplibregl-popup-content").allInnerTexts();
    grouped = texts.find((t) => /objets à cette position/.test(t)) ?? "";
  }
  check("a grouped marker says how many objects it stands for", /12 objets à cette position/.test(grouped));
  check("the grouped popup names every member", /ouvrage 12/.test(grouped));
  check("the grouped popup explains the shared position", /centre de la commune/.test(grouped));
  await page.unroute("**/api/carte**");
  await page.unroute("**/api/geocode**");
}

// 11. Rivers are filtered server-side: the embedded file holds the whole
// national network, and shipping it whole would be ~6 MB per page load.
{
  const national = await page.evaluate(async () => {
    const r = await fetch("/api/cours-eau");
    const j = await r.json();
    return j.features.length;
  });
  const local = await page.evaluate(async () => {
    const r = await fetch("/api/cours-eau?bbox=1.0,48.0,2.0,48.9");
    const j = await r.json();
    return j.features.length;
  });
  check("rivers are served at national scale", national > 100);
  check("a bounding box narrows rivers to the area", local > 0 && local < national);
}

await page.screenshot({ path: "dashboard.png", fullPage: true });
await browser.close();
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
