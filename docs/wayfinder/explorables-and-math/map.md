---
label: wayfinder:map
title: Explorables and Math
status: open
---

# Explorables and Math

## Destination

Two milestones ready for builders: **Math** (TeX notation typeset in every text) and then **Explorables** (HTML, CSS and JavaScript pages that explain interactively, beside the physical-space panel). Each has an accepted ADR, its terms in `CONTEXT.md` and a milestone in `docs/spec-v0.1.md` with tasks whose interfaces are fixed. The Explorables ADR supersedes the spec's "Not planned" line on storing HTML with scripts in a project.

## Notes

- Asked by the user on 2026-11-10: "un visor HTML … para interpretar módulos matemáticos … y un compilador de LaTeX … para las fórmulas", "otro además del 3D". Replies to the user are in Spanish; everything here is in English.
- Every session consults `CONTEXT.md`, the ADRs this touches (0012, 0041, 0042, 0054, 0060, 0068, 0075, 0076, 0081, 0082, 0083, 0089, 0098, 0102) and the spec's "Not planned" line.
- Build order, once the map is done: Math, then Explorables, then A8.2 (videos).
- **The tracker is local markdown**, since this session cannot write GitHub issues. Each ticket is a file in this folder; its front matter holds `label` (`wayfinder:<type>`), `status` (`open` or `closed`), `assignee` (the claim) and `blocked_by` (ticket files). The frontier is every open ticket with no assignee whose `blocked_by` are all closed. A ticket's answer goes in a `## Resolution` section at its end when it closes.
- Research findings live on throwaway `research/<name>` branches, pointed to from their ticket.

## Decisions so far

- [What explorables and Math are](01-charting-decisions.md): Math is TeX notation typeset with KaTeX in every text; an explorable is HTML/CSS/JS kept in the project, shown by an element, a component or loose, fed the model's data, run walled off after approval, still on the canvas until explored, live in its own panel, in tours and in the read-only page; any library, downloaded once and kept beside the project.
- [How libraries are fetched once and kept beside the project](04-libraries-beside-the-project.md): from the npm registry only, checked by its integrity hash, kept as `script-libraries/<sha256>` with a record and its license, named by a bare id through an import map, approved before any byte is fetched.
- [How Math is typeset on the canvas and in exports](02-math-on-the-canvas-and-in-exports.md): KaTeX parses and measures, a new `core/src/math/` lays out a math drawing per formula that the canvas draws as glyphs and SVG/PDF as outlines; Pandoc's dollar rule; MathJax 4 is the fallback if the layout cannot match KaTeX.
- [How an explorable becomes a still picture, for the canvas, exports and Claude](05-capturing-an-explorable.md): the frame draws its own still with a built-in html-to-image and posts a PNG the app cleans; taken only after approval, kept for the session by a hash of what it shows; a card from data before approval; `capture_explorable` with console errors.
- [How an explorable runs walled off, in the app and in the read-only page](03-sandboxing-an-explorable.md): one frame document built in the core, scripts only by hash, sandboxed `allow-scripts` only; in the app a second loopback listener under the other loopback name; in the page `srcdoc`; one `MessageChannel`, a watchdog; WebRTC cannot be blocked, so approval is the real line.
- [How explorables are kept and named by what shows them](06-explorable-files-and-what-shows-them.md): one editable `explorables/<name>.html`, defined in a package with the hash last read; named by `explorable` in an appearance, by a new `explorable` free shape and by tour steps; Claude writes through `write_explorable`, undoable; the term Script library.
- [What the va API hands an explorable](07-the-va-api.md): the element with its attribute definitions, what it holds one level down and its relations, up to 500 elements; a loose one may be bound to an element; declared parameters that tour steps set; everything again on a change; `va.select`; theme as CSS variables; `api: 1`.
- [How the person approves an explorable and its libraries](08-approving-an-explorable.md): a dialog naming who wrote it, its libraries, its code and the WebRTC caveat; kept by hash in preferences as package code's, up to 1,024; Claude's writes through the program continue an approval; only approved explorables go live into the read-only page; revocable; Claude never approves.
- [Prove that our layout of KaTeX's tree matches KaTeX](11-prove-math-layout-against-katex.md): it does: 86 of 86 formulas, every glyph within 0.5 px of Chrome, about 0.3 ms per formula; KaTeX pinned exactly, its double-underscore tree API kept under a golden test; MathJax not needed.
- [Write the Math ADR and milestone](09-write-the-math-adr-and-milestone.md): ADR 0106 and milestone A9 · Math, its seam first; Claude reads and writes Math as the TeX typed.
- [Prove the explorable frame in Chrome, Firefox and Safari](12-prove-the-explorable-frame-in-browsers.md): it holds in Chrome and Firefox with four changes (a fresh `*.localhost` per frame, libraries inlined as globals, line endings normalized before hashing, `font-src data:` in the page); Firefox freezes on a looping `srcdoc`, so outside Chromium the page runs explorables only on Run; string-compiling libraries need functions; Safari untested.

## Not yet specified

- **Versions and merging.** How an explorable's file, and a library's, show in comparisons (ADR 0070) and pass through the merge driver (ADR 0072); whether two branches editing one explorable conflict as text.
- **How Claude learns to write explorables well.** The guidance Claude reads before writing one: the `va` API, the libraries at hand, sizes, the theme, Math inside it, and no `eval` (functions rather than formula strings, `d3.csvParseRows` rather than `d3.csvParse`).
- **Accessibility.** What a screen reader and the keyboard reach inside an explorable, and what the canvas says about one that is still.
- **Limits.** An explorable's size, a library's size, how many libraries a project keeps, and what happens when one is over.

## Out of scope

- **Whole LaTeX documents compiled to PDF.** Only the notation is typeset (decided in [What explorables and Math are](01-charting-decisions.md), Q7).
- **An explorable writing to the model,** even as a proposal (Q4). It may come back as a new effort.
- **A code editor inside the app** (Q16): the person edits in their own editor, or asks Claude.
- **Loading libraries from the internet while a page runs** (Q10).
