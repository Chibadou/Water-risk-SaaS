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

await page.screenshot({ path: "dashboard.png", fullPage: true });
await browser.close();
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
