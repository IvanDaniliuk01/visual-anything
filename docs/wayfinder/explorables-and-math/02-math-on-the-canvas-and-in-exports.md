---
label: wayfinder:research
title: How Math is typeset on the canvas and in exports
status: closed
assignee: claude
blocked_by: []
---

# How Math is typeset on the canvas and in exports

## Question

How can TeX notation, typeset with KaTeX, be drawn everywhere a text shows: the Pixi canvas within the 10,000-shape, 60 fps budget and a theme switch that never stalls a frame; faces and their measured sizes (ADR 0083); the inspector and tours in React; SVG, PDF and PNG exports; the read-only page under its content security policy (ADR 0041); captures for Claude (ADR 0081)? How do `$…$` and `$$…$$` fit the Markdown subset of ADR 0082 without breaking texts that hold a dollar sign today? Compare KaTeX with MathJax 4 (SVG output) on size, speed, fonts offline and what each can hand the canvas; say what the program bundles and what it costs.

## Resolution

Findings: `docs/wayfinder/explorables-and-math/research/math-typesetting.md` on branch `research/math-typesetting`.

- **KaTeX parses and measures; Visual Anything lays out and draws.** KaTeX cannot place a formula without a browser (horizontal placement is left to HTML, its maintainers say, discussion #3629), but `katex.__renderToHTMLTree` gives each glyph its width, height and depth and explicit em spacing. A new `core/src/math/` turns that into one **math drawing** per formula (glyphs, rules, a few paths, a box), the same in Node and the browser, as faces are laid out (ADR 0083). KaTeX becomes the core's first runtime dependency, which the ADR must allow.
- **Where it lands.** The canvas draws tinted glyph quads from KaTeX's fonts loaded from bytes, as Roboto is, so a theme switch only re-tints; `emphasis.ts` gains a math run and a math block; `faces/layout.ts`, `text/layout.ts` (taller lines) and `emphasisLabels.ts` take them. SVG writes glyph outlines with `<defs>` and `<use>`, and the PDF follows through SVG-to-PDFKit; PNG and `capture_view` need nothing new. React panels use `katex.render` with MathML output, safe under Trusted Types. The read-only page bundles KaTeX and its font bytes; its CSP does not change. Nothing is typeset inside a frame.
- **Dollar signs, by Pandoc's rule.** An opening `$` needs a non-space after it, a closing `$` a non-space before it and no digit after it, so `$20 and $30` stays text; `\$` escapes. Imports and `escapeText` escape `$`, and a project check lists the texts that now read as Math.
- **Against MathJax 4.** KaTeX is 273 KB of JavaScript (77 KB gzipped) and 260 KB of woff2 fonts; MathJax 4's SVG output is 874 KB and 1.42 MB of fonts that load in pieces on demand, which breaks synchronous calls. MathJax lays out without a browser, so it is the fallback if the prototype fails; choosing it departs from Q7 and needs the user.
- **Must be proven first:** that our placement of KaTeX's tree matches KaTeX's own HTML in Chrome. Graduated as [Prove that our layout of KaTeX's tree matches KaTeX](11-prove-math-layout-against-katex.md).
