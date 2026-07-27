// Print-ready HTML rendering of the ESG report (client-safe, no I/O).
//
// PDF export strategy: browser print-to-PDF, not a rendering library. No new
// dependency, no server round-trip (consistent with local-only), and it is
// exactly what a browser's native "Enregistrer au format PDF" already does
// well. The Markdown from lib/report.ts stays the single source of truth for
// content — this module only converts that markdown (a small, fully
// controlled subset: headings, tables, bullet lists, **bold**/*italic*) into
// styled HTML, so the two export formats never drift apart.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Bold/italic inline markdown → HTML, with the text escaped first (labels are user input). */
function inline(text: string): string {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

const SEPARATOR_ROW = /^:?-+:?$/;

function renderTable(lines: string[]): string {
  const rows = lines.map(splitRow);
  const header = rows[0] ?? [];
  const body = rows.slice(1).filter((r) => !r.every((c) => SEPARATOR_ROW.test(c)));
  const thead = `<thead><tr>${header.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${body
    .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

/**
 * Converts the controlled Markdown subset produced by lib/report.ts into
 * semantic HTML. Not a general-purpose Markdown parser — only handles what
 * buildMarkdownReport / buildPortfolioMarkdownReport actually emit.
 */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      out.push(`<h3>${inline(line.slice(4))}</h3>`);
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      out.push(`<h2>${inline(line.slice(3))}</h2>`);
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      out.push(`<h1>${inline(line.slice(2))}</h1>`);
      i++;
      continue;
    }
    if (line.trimStart().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      out.push(renderTable(tableLines));
      continue;
    }
    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(lines[i].slice(2));
        i++;
      }
      out.push(`<ul>${items.map((it) => `<li>${inline(it)}</li>`).join("")}</ul>`);
      continue;
    }
    out.push(`<p>${inline(line)}</p>`);
    i++;
  }
  return out.join("\n");
}

/** Full standalone printable HTML document for a report. */
export function reportPrintHtml(markdown: string, title: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #1e293b;
    max-width: 820px;
    margin: 0 auto;
    padding: 2.5rem 1.75rem 4rem;
    line-height: 1.55;
  }
  h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
  h2 { font-size: 1.15rem; margin: 2rem 0 .5rem; padding-top: .5rem; border-top: 1px solid #e2e8f0; }
  h3 { font-size: 1rem; margin: 1.25rem 0 .4rem; }
  p { margin: .4rem 0; font-size: .92rem; }
  table { border-collapse: collapse; width: 100%; margin: .5rem 0 1rem; font-size: .85rem; }
  th, td { border: 1px solid #cbd5e1; padding: .35rem .5rem; text-align: left; }
  th { background: #f1f5f9; }
  ul { margin: .3rem 0; padding-left: 1.3rem; font-size: .92rem; }
  strong { color: #0f172a; }
  .print-bar { display: flex; justify-content: flex-end; gap: .5rem; margin-bottom: 1.5rem; }
  .print-bar button {
    border: 1px solid #94a3b8;
    background: #fff;
    border-radius: .5rem;
    padding: .5rem .9rem;
    font-size: .85rem;
    cursor: pointer;
  }
  .print-bar button:hover { background: #f8fafc; }
  @media print {
    .print-bar { display: none; }
    body { padding: 0; max-width: none; }
    h2 { break-inside: avoid; }
    table, ul { break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="print-bar">
  <button type="button" onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button>
</div>
${markdownToHtml(markdown)}
</body>
</html>
`;
}
