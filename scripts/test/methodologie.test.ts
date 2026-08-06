// Tests for lib/methodologie.ts and the page it drives.
// Run: npx tsx scripts/test/methodologie.test.ts
//
// The registry exists so that a section cannot be renamed in one place only,
// and so that a panel cannot link to an anchor that does not exist. TypeScript
// covers half of that — `methodologieHref` only accepts a known id — but it
// cannot see two things, and those are what this suite checks:
//
//   1. that the PAGE renders every section in the registry, and no other;
//   2. that no component still links to the bare "/methodologie", which is the
//      defect the whole sprint exists to remove.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { METHODO_SECTIONS, methodoTitre, methodologieHref } from "../../lib/methodologie";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
};

const ROOT = join(import.meta.dirname, "..", "..");
const page = readFileSync(join(ROOT, "app/methodologie/page.tsx"), "utf8");
const componentsDir = join(ROOT, "components");
const components = readdirSync(componentsDir)
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => ({ file: f, src: readFileSync(join(componentsDir, f), "utf8") }));

// --- 1. The registry is internally sound --------------------------------
{
  const ids = METHODO_SECTIONS.map((s) => s.id);
  check("every id is unique", new Set(ids).size === ids.length);
  check("every titre is unique", new Set(METHODO_SECTIONS.map((s) => s.titre)).size === ids.length);
  check(
    "every id is a usable URL fragment",
    ids.every((id) => /^[a-z0-9-]+$/.test(id)),
  );
  check("methodologieHref builds a fragment link", methodologieHref("score") === "/methodologie#score");
  check("methodoTitre resolves", methodoTitre("score") === "Score de risque courant");
}

// --- 2. The page renders exactly the registry ---------------------------
{
  const rendered = [...page.matchAll(/<Section id="([^"]+)">/g)].map((m) => m[1]);
  const known = new Set(METHODO_SECTIONS.map((s) => s.id));

  check("the page renders one Section per registry entry",
    rendered.length === METHODO_SECTIONS.length);
  check("the page renders no section unknown to the registry",
    rendered.every((id) => known.has(id)));
  check("the registry declares no section the page never renders",
    METHODO_SECTIONS.every((s) => rendered.includes(s.id)));
  check("sections appear in registry order",
    rendered.join(",") === METHODO_SECTIONS.map((s) => s.id).join(","));
  // If a heading were still written at the call site, renaming a section in the
  // registry would leave the page showing the old wording.
  check("no Section still carries its own title",
    !/<Section title=/.test(page));
}

// --- 3. No component links to the bare page -----------------------------
// This is the defect the sprint removes: every panel used to send the reader to
// the top of a 26-section page instead of to the section that explains it.
{
  const offenders = components
    .filter(({ src }) => src.includes('"/methodologie"'))
    .map(({ file }) => file);

  // Shell's footer link is the general entry point and legitimately targets the
  // whole page. Anything else is a link that lost its anchor.
  const allowed = new Set(["Shell.tsx"]);
  const unexpected = offenders.filter((f) => !allowed.has(f));
  check(
    `no panel links to the bare page (found: ${unexpected.join(", ") || "none"})`,
    unexpected.length === 0,
  );
  check("the footer entry point is still there", offenders.includes("Shell.tsx"));
}

// --- 4. Every anchor a component references actually exists -------------
// TypeScript already guarantees this for `methodologieHref("...")`, but a
// hand-written string would slip past it.
{
  const known = new Set(METHODO_SECTIONS.map((s) => s.id));
  const bad: string[] = [];
  for (const { file, src } of components) {
    for (const m of src.matchAll(/\/methodologie#([a-z0-9-]+)/g)) {
      if (!known.has(m[1])) bad.push(`${file}#${m[1]}`);
    }
  }
  check(`no dead anchor in any component (found: ${bad.join(", ") || "none"})`, bad.length === 0);
}

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("methodologie: all checks pass");
