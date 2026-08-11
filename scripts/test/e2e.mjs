import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3200";
const results = [];
const check = (name, cond) => {
  results.push(`${cond ? "PASS" : "FAIL"} ${name}`);
};

// The suite is a flat sequence of top-level awaits, so a locator that times out
// throws and the process dies — taking every result collected before it with it.
// Measured while deliberately removing an aria-label to see what the landmark
// check protects: the run printed a TimeoutError stack and NOT ONE of the 69
// checks that had already passed. A suite that loses its findings when it trips
// cannot be used to locate what broke, which is the only thing it is for.
let reported = false;
const report = () => {
  if (reported) return;
  reported = true;
  console.log(results.join("\n"));
};
const abort = (err) => {
  const first = String(err?.stack ?? err).split("\n")[0];
  results.push(`FAIL suite interrompue avant la fin — ${first}`);
  report();
  process.exit(1);
};
process.on("uncaughtException", abort);
process.on("unhandledRejection", abort);

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
// Since Sprint 36 the dashboard renders each site TWICE in the DOM: a table
// from `md` up, a card list below it. Only one of the two is ever displayed
// (the other is `display:none`, so it is out of the accessibility tree and out
// of the browser's find-in-page), but both match a text query — hence `.first()`
// here and the visibility assertions that follow.
check("row Perpignan visible", await page.getByText("Usine Perpignan").first().isVisible());
check("row Lyon visible", await page.getByText("Agence Lyon").first().isVisible());
check("only one of the two renderings is displayed",
  (await page.getByText("Usine Perpignan").count()) === 2 &&
    !(await page.getByText("Usine Perpignan").nth(1).isVisible()));
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

  // ⚠️ Sprint 43 changed the METHOD behind every score. A user reopening their
  // portfolio would otherwise read a drop as an improvement in their own risk.
  const methode = page.getByRole("region", { name: "Changement de méthode de calcul" });
  check("43: the portfolio warns that the figures changed method, not risk",
    await methode.isVisible());
  const mtxt = (await methode.innerText()).replace(/\s+/g, " ");
  check("43: … says in which direction the scores move", /baisser|monter|deux sens/.test(mtxt));
  check("43: … and denies it is a change of exposure",
    /pas une évolution de votre exposition/.test(mtxt));
  check("43: the notice can be dismissed, so it does not become furniture",
    await page.getByRole("button", { name: /J'ai compris/ }).isVisible());
  await page.getByRole("button", { name: /J'ai compris/ }).click();
  await page.waitForTimeout(150);
  check("43: dismissing it hides it", (await methode.count()) === 0);

  const correl = page.getByText("Corrélation entre vos sites");
  check("correlation block present for a multi-site portfolio", await correl.isVisible());
  check("correlation says the calendar is missing rather than charting zero",
    (await page.getByText(/Calendrier des arrêtés indisponible/).count()) >= 1);
}

// 3. Delete a site
await page.getByRole("button", { name: "Supprimer Agence Lyon" }).first().click();
await page.waitForTimeout(300);
// Scoped to the LINK: the site name is still on screen after deletion, inside
// the undo banner. Asserting on raw text would now pass only if the undo
// offer disappeared — the opposite of what this sprint added.
check("Lyon removed from list",
  (await page.getByRole("link", { name: "Agence Lyon" }).count()) === 0);
check("deletion offers an undo rather than being final",
  await page.getByRole("button", { name: "Annuler la suppression" }).isVisible());
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
  check("one toggle per registry layer", (await toggles.count()) === 8);
  for (const titre of ["Où est l'eau", "Qui la mesure", "Qui la prélève"]) {
    check(`toggles grouped under « ${titre} »`, (await page.getByText(titre, { exact: false }).count()) >= 1);
  }
  const riversToggle = page.getByLabel(/Cours d'eau/).first();
  check("rivers toggle present and on by default", await riversToggle.isChecked());
  await riversToggle.uncheck();
  check("rivers toggle can be turned off", !(await riversToggle.isChecked()));
  await riversToggle.check();
  const lakesToggle = page.getByLabel(/Plans d'eau/).first();
  check("surface water bodies have their own toggle", await lakesToggle.isChecked());
  const aepToggle = page.getByLabel(/Captages d'eau potable/).first();
  check("drinking-water catchments have their own toggle", await aepToggle.isChecked());

  // ⚠️ The defect this sprint was reported for: on a phone the legend overlay
  // covered a third of the map and collided with every popup. It is gone, and
  // nothing may take its place — only the search-here button may float.
  const overlays = await page.evaluate(() => {
    const map = document.querySelector(".maplibregl-map");
    if (!map) return ["no map"];
    return [...map.parentElement.querySelectorAll(":scope > .absolute")]
      .map((el) => el.textContent.trim().slice(0, 30))
      .filter((t) => t.length > 0);
  });
  check("no legend box floats over the map any more",
    overlays.every((t) => /Rechercher dans cette zone|indisponibles/.test(t)));

  check("prompts for an address before querying anything",
    await page.getByText(/Saisissez une adresse/).isVisible());
  check("states what the map does NOT say",
    await page.getByText(/Ce que la carte ne dit pas/).isVisible());
  check("explains each layer below the map",
    await page.getByText(/Comprendre la carte/).isVisible());
  check("says what a piezometer is, in words",
    (await page.getByText(/Tubes forés jusqu'à une nappe/).count()) >= 1);
  check("says an unknown use is not another use",
    (await page.getByText(/jamais « autre usage »/).count()) >= 1);
  check("warns that a translucent structure is a commune centroid",
    (await page.getByText(/au centre de sa commune/).count()) >= 1);

  // Ask the route for a real point: in the sandbox every upstream fetch fails,
  // and the response must say so rather than present empty layers as an answer.
  await page.goto(`${BASE}/api/carte?lat=48.4439&lon=1.4890&rayon=30`);
  const body = await page.locator("body").innerText();
  const payload = JSON.parse(body);
  check("/api/carte answers with every point layer",
    ["hydro", "piezo", "onde", "bnpe", "aep"].every((k) => Array.isArray(payload.features?.[k])));
  check("/api/carte clamps the radius server-side", payload.radiusKm === 30);
  check("/api/carte reports unreachable layers instead of empty ones",
    Object.keys(payload.messages ?? {}).length >= 1);
  check("/api/carte publishes object totals next to the markers",
    payload.totals !== undefined && ["hydro", "piezo", "onde", "bnpe", "aep"].every((k) => typeof payload.totals[k] === "number"));
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
  // Walk a few points over land rather than trusting one pixel: rivers and
  // lakes are drawn above the aquifers and own the click where they lie, so a
  // fixed centre point is a coin toss, not a test.
  let popup = "";
  for (const [dx, dy] of [[0, 0], [-40, 20], [40, -20], [-80, -40], [80, 40], [0, 60]]) {
    await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
    await page.waitForTimeout(250);
    const t = (await page.locator(".maplibregl-popup-content").allInnerTexts()).join(" ");
    if (/Masse d'eau [A-Z]/.test(t) && /Surface totale/.test(t)) {
      popup = t;
      break;
    }
  }
  check("clicking an aquifer names it", /Masse d'eau/.test(popup));
  check("the aquifer popup gives its surface", /Surface totale/.test(popup));
  check("the aquifer popup states no unmeasured characteristic",
    !/Karstique|Multicouches/i.test(popup));

  // Sprint 32: the popup carries a state slot, and — this is the point — it
  // must RESOLVE. Upstream is unreachable in the sandbox, so it must end on an
  // explicit unavailability. A slot left on "Chargement…" forever would be the
  // worst of both worlds: a promise of information that never arrives.
  check("the popup opens a state slot", /\[data-etat\]/.test("[data-etat]") &&
    (await page.locator(".maplibregl-popup-content [data-etat]").count()) === 1);
  await page.waitForFunction(
    () => {
      const el = document.querySelector(".maplibregl-popup-content [data-etat]");
      return el !== null && !/Chargement de l'état/.test(el.textContent ?? "");
    },
    undefined,
    { timeout: 20000 },
  ).catch(() => {});
  const etat = await page.locator(".maplibregl-popup-content [data-etat]").innerText().catch(() => "");
  check("the state slot resolves rather than spinning forever",
    etat.length > 0 && !/Chargement de l'état/.test(etat));
  check("an unreachable state says so explicitly", /indisponible|injoignable/i.test(etat));
  // ⚠️ An outage must never be worded as a silent station: a healthy station
  // would be blamed for a service failure.
  check("an outage is not blamed on the station",
    !/ne publie pas de mesure/.test(etat) || !/injoignable|indisponible \(/.test(etat));
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
      totals: { hydro: 0, piezo: 0, onde: 0, aep: 0, bnpe: 12 },
      features: { hydro: [], piezo: [], onde: [], aep: [], bnpe: [{
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
  // Since Sprint 36 the suggestions are a real ARIA listbox, so they are
  // `option`s and no longer `button`s. Selecting one by keyboard here also
  // exercises the path that did not exist before: ArrowDown then Enter.
  await page.getByRole("option", { name: /Perpignan/ }).first().waitFor();
  await page.getByLabel("Adresse autour de laquelle chercher").press("ArrowDown");
  await page.getByLabel("Adresse autour de laquelle chercher").press("Enter");
  await page.waitForTimeout(4000);

  // The toggle label — the layer was renamed "Autres prélèvements" when the
  // drinking-water catchments got their own layer.
  check("the counter shows objects, not markers",
    (await page.locator("label", { hasText: /Autres prélèvements/ }).first().innerText()).includes("(12)"));

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

  const lakesNational = await page.evaluate(async () => (await (await fetch("/api/plans-eau")).json()).features.length);
  const lakesLocal = await page.evaluate(async () =>
    (await (await fetch("/api/plans-eau?bbox=1.0,48.0,2.0,48.9")).json()).features.length);
  check("surface water bodies are served", lakesNational > 0);
  check("a bounding box narrows them to the area", lakesLocal > 0 && lakesLocal <= lakesNational);
}

// ---------------------------------------------------------------------------
// The usage vector editor (Sprint 40). No egress needed: the form is entirely
// client-side, so this exercises the real thing rather than a stub.
//
// ⚠️ The usage field is exposed as a COMBOBOX, not a textbox: it carries
// list="usage-suggestions", and an <input list> maps to role combobox. Correct
// ARIA, and the reason the first version of this check timed out.
{
  // ⚠️ The overflow check below claims 390 px, so the viewport must actually BE
  // 390 px. The suite runs at the default size otherwise, and the check would
  // have carried a label it did not verify.
  const previousViewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const bloc = page.locator("details", { hasText: "Données internes du site" }).first();
  await bloc.locator("summary").click();
  check("vector: the usage split is offered", await page.getByText("Répartition par usage").isVisible());

  const add = page.getByRole("button", { name: "+ Ajouter un usage" });
  await add.click();
  await add.click();
  const rows = page.getByRole("combobox", { name: /^Usage \d/ });
  check("vector: two usage rows can be added", (await rows.count()) === 2);

  await rows.nth(0).fill("Refroidissement");
  await page.getByRole("spinbutton", { name: /Part de l'usage 1/ }).fill("80");
  await rows.nth(1).fill("Sanitaires");
  await page.getByRole("spinbutton", { name: /Part de l'usage 2/ }).fill("15");

  const partial = (await page.getByText(/^Total : /).textContent()) ?? "";
  // Reported, never enforced: 95 % is a partial description, not an error.
  check("vector: an incomplete split names what is missing", /il manque\s*5\s*%/.test(partial));

  await page.getByRole("spinbutton", { name: /Part de l'usage 2/ }).fill("20");
  const full = (await page.getByText(/^Total : /).textContent()) ?? "";
  check("vector: a complete split reads as settled", /réparti/.test(full));

  // A share becomes cubic metres only against a declared site total, and the
  // derivation is labelled — ADR-006, all the way to the export.
  check("vector: no m³ shown before a site total is declared",
    (await page.getByText(/déduit de la part/).count()) === 0);
  await page.getByRole("spinbutton", { name: /Volume prélevé/i }).first().fill("100000");
  await page.waitForTimeout(150);
  const derived = (await page.locator("span", { hasText: /déduit de la part/ }).first().textContent()) ?? "";
  check("vector: 80 % of 100 000 m³ is shown as 80 000, labelled derived",
    /80\s*000/.test(derived.replace(/\u00a0|\u202f/g, " ")));

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("vector: no horizontal overflow at 390 px", overflow <= 0);

  if (previousViewport) await page.setViewportSize(previousViewport);
}

// ---------------------------------------------------------------------------
// The note's THREE outputs on the site sheet: JS in days, VNP in m³, IA in JEA
// (Sprints 42a and 42b). At 42b the old `joursContraints` panel was removed, so
// what this section now checks is the end state of G16 rather than its middle:
// three outputs, three units, and no fourth number combining them.
//
// Every upstream call is stubbed: the sandbox has no egress, and the point here
// is the WIRING, not the data. The stubs are shaped from the real payload types
// — a stub of the wrong shape is the classic own-goal the handbook warns about,
// and this section already caught a real defect that way (see below).
{
  const previousViewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });

  const parAn = { joursParNiveau: { alerte: 30, crise: 10 }, joursAlertePlus: 40 };
  await page.route("**/api/zones**", (r) => r.fulfill({ json: { notCovered: false, zones: [
    { code: "24_028_0003", nom: "Eure Moyen haut", type: "SUP", niveauGravite: "crise",
      departement: "28", arrete: { id: 1, dateDebutValidite: "2026-07-01", dateFinValidite: "2026-09-30" },
      usages: [] },
  ] } }));
  await page.route("**/api/history**", (r) => r.fulfill({ json: {
    available: true, coverage: {}, windowYears: 10, zones: { "24_028_0003": {
      joursAlertePlus: 40, joursAlertePlusMoyen: 40, anneesCompletes: 2,
      joursParNiveau: { alerte: 30, crise: 10 },
      parAnnee: { "2024": parAn, "2025": parAn },
      parMois: { "2024": { 7: 40 }, "2025": { 7: 40 } },
      parMoisNiveau: { "2024": { 7: { alerte: 30, crise: 10 } }, "2025": { 7: { alerte: 30, crise: 10 } } },
      // Two 20-day crisis episodes — the convexity case of §4.3, and the reason
      // the calendar is fetched with ?periodes=1 at all.
      periodes: [19570, 20, 4, 19700, 20, 4],
    } } } }));
  // crise widened to [0.7, 1] by an unreadable measure: the interval must reach
  // the cubic metres on screen, not be collapsed to its lower bound.
  await page.route("**/api/restrictions**", (r) => r.fulfill({ json: {
    available: true, origin: "restrictions",
    exposure: { alerte: 0.5, crise: 0.7 },
    exposureInterval: { alerte: { min: 0.5, max: 0.5 }, crise: { min: 0.7, max: 1 } },
    detail: {} } }));
  const quiet = ["**/api/hydro**", "**/api/piezo**", "**/api/onde**", "**/api/swi**",
    "**/api/projection**", "**/api/transition**", "**/api/bnpe**", "**/api/bdlisa**"];
  for (const u of quiet) await page.route(u, (r) => r.fulfill({ json: {} }));

  await page.goto(`${BASE}/?lat=48.44&lon=1.49&label=Chartres`, { waitUntil: "domcontentloaded" });
  const panneau = page.getByRole("region", { name: /Jours sous statut, volume non prélevable/ });
  await panneau.waitFor({ timeout: 20000 });
  // ⚠️ A <section> is only a landmark once it is named. Asking for it by role is
  // what makes the accessible name load-bearing rather than decorative.
  check("indicateurs: the panel is a named landmark", await panneau.isVisible());

  const avant = (await panneau.textContent()) ?? "";
  check("indicateurs: with no declared V_ref, the refusal is motivated rather than a 0 m³",
    /ne peut pas être calculé|non déclaré/.test(avant));
  check("indicateurs: the incomplete profile is named", /Profil du site incomplet/.test(avant));
  check("indicateurs: the assumption journal travels with the figures (ADR-006)",
    /Ce que ces chiffres supposent/.test(avant));

  const bloc = page.locator("details", { hasText: "Données internes du site" }).first();
  await bloc.locator("summary").click();
  await page.getByRole("spinbutton", { name: /Volume prélevé/i }).first().fill("365000");
  await page.waitForTimeout(400);
  const apres = (await panneau.textContent()) ?? "";

  // ⚠️ This pair is what caught the defect of Sprint 42a: only the STRUCTURAL
  // component rendered. `exposureInterval` was being set from inside the report
  // export callback, so it stayed undefined until the user exported a report —
  // and the crisis VNP had no ρ to apply, silently. The unit tests could not see
  // it: the bug was in who fetched what, not in the formula.
  check("indicateurs: the crisis VNP appears once a volume is declared", /VNP de crise/.test(apres));
  check("indicateurs: the structural VNP appears alongside it", /VNP structurel/.test(apres));
  check("indicateurs: and the page states they must not be added (anti-pattern n°3)",
    /ne s'additionnent pas/.test(apres));
  check("indicateurs: the interruption is published in JEA", /JEA/.test(apres));
  check("indicateurs: the ρ interval reaches the cubic metres as a range", / à /.test(apres));

  // --- What Sprint 42b changed ------------------------------------------------
  // JS is now published as a per-horizon table of DAYS UNDER ARRÊTÉ, with its
  // evidence level, instead of being folded into a weighted scalar.
  check("indicateurs: JS is published as days under arrêté", /Jours sous statut/.test(apres));
  check("indicateurs: each horizon carries its evidence level (§0.1)",
    /N1/.test(apres) && /Année type/.test(apres));
  // ⚠️ §4.1's own warning has to be ON THE PAGE, not only in the docs: JS is the
  // indicator that a nomenclature reform makes incomparable.
  check("indicateurs: the page says JS is the least durable of the three",
    /moins durable des trois/.test(apres));

  // The removed panel, and the removed word. `joursContraints` was days ×
  // exposure × an invented factor; nothing on the page may still present it.
  const pageText = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  check("42b: the old constrained-days panel is gone",
    !/Jours d'activité contrainte/.test(pageText));
  check("42b: and the four-value dependence selector with it",
    (await page.getByLabel(/Dépendance de l'activité/).count()) === 0);
  // What replaced it: the §4.3 production response, defaulting to UNDECLARED.
  const rep = page.getByLabel(/Comment la production réagit/);
  check("42b: the production response is offered instead", (await rep.count()) === 1);
  check("42b: and it defaults to undeclared rather than to a shape",
    (await rep.inputValue()) === "");

  // The evidence chapter survives the removal: the ρ read per usage is what makes
  // the three outputs contestable, and it is now shown BEFORE them.
  check("42b: the prescribed measures are still shown, as the evidence",
    /Ce que les arrêtés prescrivent/.test(pageText));
  check("42b: with the ρ interval rendered as a range, not a midpoint",
    /70–100 %|70–100/.test(pageText));

  // --- Sprint 43: the JS vector by resource, and the end of the maximum -------
  // The stub covers ONE SUP zone in crisis and nothing else, so the effective
  // level can only come from the `maximum` rung — and the page must say so rather
  // than present it as a reading of this site's water mix.
  check("43: the level is published per resource, not as one number",
    /Niveau par ressource/.test(pageText));
  check("43: an uncovered resource says so instead of showing a calm level",
    /Aucune zone à ce point/.test(pageText));
  check("43: and the page states the level is a fallback on the most severe zone",
    /plus sévère/i.test(pageText));
  check("43: … and says what would replace the fallback",
    /répartition par usage/i.test(pageText));

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("indicateurs: no horizontal overflow at 390 px", overflow <= 0);

  for (const u of ["**/api/zones**", "**/api/history**", "**/api/restrictions**", ...quiet])
    await page.unroute(u);
  if (previousViewport) await page.setViewportSize(previousViewport);
}

await page.screenshot({ path: "dashboard.png", fullPage: true });
await browser.close();
report();
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
