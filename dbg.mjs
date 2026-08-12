import { chromium } from "playwright";
let browser;
try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); }
const OUT = "/tmp/claude-0/-home-user-Water-risk-SaaS/e5283311-1b98-5c07-803e-11d54c1fa014/scratchpad";

const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
await page.goto("http://localhost:3200/carte");
await page.waitForLoadState("networkidle");
await page.locator("[data-map-ready]").first().waitFor({ state: "attached", timeout: 20000 });
await page.waitForTimeout(4000);
const canvas = page.locator("canvas.maplibregl-canvas");
await canvas.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/carte-france.png` });

// Zoom: same mocking order as e2e block 10 — routes registered BEFORE the page
// loads, otherwise the combobox never gets a suggestion to select.
const zoom = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
await zoom.route("**/api/geocode**", (r) => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify([{ label: "Chartres (28000)", lat: 48.4439, lon: 1.489, citycode: "28085" }]) }));
await zoom.route("**/api/carte?**", (r) => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ radiusKm: 30, features: { hydro: [], piezo: [], onde: [], bnpe: [], aep: [] },
    totals: { hydro: 0, piezo: 0, onde: 0, bnpe: 0, aep: 0 }, messages: {} }) }));
await zoom.goto("http://localhost:3200/carte");
await zoom.waitForLoadState("networkidle");
await zoom.locator("[data-map-ready]").first().waitFor({ state: "attached", timeout: 20000 });
await zoom.getByLabel("Adresse autour de laquelle chercher").fill("Chartres");
await zoom.waitForTimeout(900);
await zoom.getByRole("option").first().click().catch(async () => {
  await zoom.getByLabel("Adresse autour de laquelle chercher").press("Enter");
});
await zoom.waitForTimeout(5000);
const zc = zoom.locator("canvas.maplibregl-canvas");
await zc.scrollIntoViewIfNeeded();
await zoom.waitForTimeout(600);
await zoom.screenshot({ path: `${OUT}/carte-chartres.png` });
const zbox = await zc.boundingBox();
await zoom.mouse.click(zbox.x + zbox.width/2 + 60, zbox.y + zbox.height/2 - 40);
await zoom.waitForTimeout(900);
console.log("--- popup zoomé ---\n" + (await zoom.locator(".maplibregl-popup-content").allInnerTexts()).join(" "));
await zoom.screenshot({ path: `${OUT}/carte-chartres-popup.png` });

const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
await phone.goto("http://localhost:3200/carte");
await phone.waitForLoadState("networkidle");
await phone.locator("[data-map-ready]").first().waitFor({ state: "attached", timeout: 20000 });
await phone.waitForTimeout(4000);
const pc = phone.locator("canvas.maplibregl-canvas");
await pc.scrollIntoViewIfNeeded();
await phone.waitForTimeout(400);
const pbox = await pc.boundingBox();
await phone.mouse.click(pbox.x + pbox.width/2, pbox.y + pbox.height/2);
await phone.waitForTimeout(1500);
await phone.screenshot({ path: `${OUT}/carte-mobile.png` });
console.log("captures written");
await browser.close();
