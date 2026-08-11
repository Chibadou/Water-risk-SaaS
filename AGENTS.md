<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project notes

**Read `docs/HANDBOOK.md` before starting any work** — it holds the core concepts, the known traps of this dev environment (blocked egress, the GitHub Actions escape hatch, pkill/build footguns), the known bugs, the agreed workflow (branch, sprints, local-first product decision), and the next steps. Keep it up to date at the end of each session. Roadmap: `docs/SPRINTS.md` · product plan: `docs/PLAN.md` · portfolio ideation and competitive benchmark: `docs/IDEATION-PORTEFEUILLE.md`.

**Design authority.** `docs/NOTE-TECHNIQUE-HYDROVIGIE.md` is the reference specification (three
outputs — JS, VNP, IA; three evidence levels N1/N2/N3; six ADRs; ten named anti-patterns). It
**overrides `PLAN.md`** wherever they disagree. Before writing engine code, read
`docs/ANALYSE-ECART-NOTE-TECHNIQUE.md` — it says, per requirement, what already exists and where, and
which four anti-patterns the code currently commits. Several chantiers turn out to be *finishing* a
fix that already exists rather than writing something new.

## Mandatory: session report

**Every sprint, and every session that writes code, ends with a report in
`docs/comptes-rendus/AAAA-MM-JJ-slug.md`, following `docs/TEMPLATE-COMPTE-RENDU.md` exactly** —
its seven sections, in order, none omitted. Write it in French, like the rest of the documentation.

This is not a formality, and three of its sections are the ones that decay first if left optional:

- **§3 Erreurs potentielles** — what may be wrong, what was never verified against real data, what
  was found wrong mid-session and fixed. An empty §3 alongside code that never ran against live
  sources is a false report. State non-verification as a fact; never let it read as "no issue".
- **§5 État Git** — whether `main` was touched. Never merge to `main` without an explicit request.
- **§7 Explication à un novice** — the reader knows how to program but knows neither this codebase
  nor water-risk regulation. Aim for: they could reopen the code and change it themselves. Use real
  excerpts from what you just wrote, explain the alternatives you rejected and why, and end with
  experiments they can run — including one that deliberately breaks a test, since seeing what a
  test protects is the fastest way to understand the code it guards.

The report never overwrites a previous one: one dated file per session. It complements rather than
replaces the HANDBOOK (durable concepts and traps) and SPRINTS (roadmap).
