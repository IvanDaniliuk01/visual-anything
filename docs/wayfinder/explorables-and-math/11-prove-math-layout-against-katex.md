---
label: wayfinder:task
title: Prove that our layout of KaTeX's tree matches KaTeX
status: closed
assignee: claude
blocked_by: [02-math-on-the-canvas-and-in-exports.md]
---

# Prove that our layout of KaTeX's tree matches KaTeX

## Question

Before the Math ADR picks KaTeX as parser and measurer with our own layout, build a throwaway prototype (outside the packages, on a `prototype/math-layout` branch) that lays out `katex.__renderToHTMLTree` for a corpus of formulas (fractions, roots, sums with limits, matrices, `\left…\right`, accents, `\text`, `align`), draws them as glyphs, and compares the result with KaTeX's own HTML in Chrome, glyph by glyph. Report how many match within half a pixel at 16 px, what fails and why, and how long layout takes per formula. If it cannot be made to match, the ADR falls back to MathJax 4's SVG output, which the user must agree to (Q7).

## Resolution

Done on 2026-11-10 by a subagent; checked by the main session, which reran the comparison on both corpora at 16 and 24 px and measured the second corpus again in headless Chrome, getting the recorded measurements byte for byte. The prototype, its corpora, Chrome's measurements and the report are on branch `prototype/math-layout`, under `prototypes/math-layout/` (`REPORT.md`).

- **It matches.** Our layout of `katex.__renderToHTMLTree` (KaTeX 0.19.1), with no browser, places every glyph within 0.5 px of Chrome's rendering of KaTeX's HTML at 16 px a KaTeX em: 86 of 86 formulas in two corpora (the ticket's 44, and 42 harder ones written after the first passed), 865 of 865 glyphs, 45 of 45 rules and 56 of 56 SVG pieces, each glyph in Chrome's face and size; the worst glyph is 0.078 px off. The same code passes at 13, 19.36 and 24 px. MathJax 4 is not needed, so Q7 stands.
- **What it took.** Horizontal placement uses the fonts' own advance widths, not KaTeX's metric widths (25 glyphs differ; `\iint` was 8.5 px off); Chrome rounds borders thinner than 1 px up to 1 px; smaller fixes for brace pieces, zero-width boxes, `\sout`, stacked delimiters' font and a top-level `\`.
- **Speed.** About 0.15–0.35 ms of our layout per formula on average (about 1 ms at worst), plus 0.1–0.2 ms for KaTeX's tree: done once per text and cached.
- **For `core/src/math/`.** About 400 lines of TypeScript; an advance-width table generated at build time from KaTeX's TTF fonts (about 30 KB); SVG paths from the tree; the harness kept as a golden test against recorded Chrome measurements, so tests need no browser.
- **Risks for the ADR.** It leans on the double-underscore `__renderToHTMLTree` and about 100 of KaTeX's CSS class names, which already changed between 0.16.47 and 0.19.1 (`.base` became `.katex-base`): KaTeX is pinned exactly, and an upgrade reruns the harness. Recommended: lay out in em without Chrome's pixel snapping, so the canvas does not depend on zoom, at the cost of about 1 px on array column separators.
- **Not checked:** each SVG path fitted pixel by pixel inside its box; Firefox and Safari; `\raisebox`, `\vcenter`, `\begin{CD}`, `\colorbox`, `\tag` placement, and wrapping long inline formulas.
