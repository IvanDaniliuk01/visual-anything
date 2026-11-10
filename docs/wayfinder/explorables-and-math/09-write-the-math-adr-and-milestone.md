---
label: wayfinder:task
title: Write the Math ADR and milestone
status: closed
assignee: claude
blocked_by: [02-math-on-the-canvas-and-in-exports.md, 11-prove-math-layout-against-katex.md]
---

# Write the Math ADR and milestone

## Question

Write the ADR for Math (a clarification of ADR 0082 or a new one), settle its terms in `CONTEXT.md`, and write its milestone in the spec with tasks whose interfaces are fixed, from the research on typesetting Math.

## Resolution

Written on 2026-11-10 in the main session.

- **[ADR 0106](../../adr/0106-math-is-tex-parsed-by-katex-and-laid-out-by-the-core.md):** Math is TeX notation read inside ADR 0082's reader by Pandoc's dollar rule (and GitHub's `` $`…`$ `` and `math` fences), wherever emphasis goes; KaTeX, pinned exactly, parses and measures, and `core/src/math/` lays out one math drawing in ems that the canvas draws as tinted glyphs, panels as KaTeX's DOM with MathML, SVG and PDF as outlines, and the read-only page as the canvas does; a golden test against Chrome's recorded measurements holds the layout; texts keep the TeX as typed, so no file, protocol or schema changes.
- **Decided by Claude under the user's delegation,** the research's open questions: a failing formula draws as its TeX with `math-error`; panels use KaTeX's DOM for MathML and copying; GitHub's forms are accepted; `escapeText` escapes `$` everywhere; Mermaid and Structurizr write the TeX; `read_view` and `get_item` answer the TeX as written (the map's fog "Math as Claude reads it"); a face's own markup holds no formula; the page embeds only the families its project uses; caps of 2,000 characters a formula and 200 formulas a text; `\color`, `\textcolor`, `\colorbox` and `\href` refused; both generated tables committed and tested as `tokens.css` is.
- **The milestone:** A9 · Math in `docs/spec-v0.1.md`, after A8, with its seam A9.0 and tasks A9.1 to A9.5. `CONTEXT.md`'s Math names ADR 0106.
