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
  check("one toggle per layer plus the aquifers", (await toggles.count()) === 5);
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
}

await page.screenshot({ path: "dashboard.png", fullPage: true });
await browser.close();
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
