---
label: wayfinder:task
title: Prove that our layout of KaTeX's tree matches KaTeX
status: open
assignee:
blocked_by: [02-math-on-the-canvas-and-in-exports.md]
---

# Prove that our layout of KaTeX's tree matches KaTeX

## Question

Before the Math ADR picks KaTeX as parser and measurer with our own layout, build a throwaway prototype (outside the packages, on a `prototype/math-layout` branch) that lays out `katex.__renderToHTMLTree` for a corpus of formulas (fractions, roots, sums with limits, matrices, `\left…\right`, accents, `\text`, `align`), draws them as glyphs, and compares the result with KaTeX's own HTML in Chrome, glyph by glyph. Report how many match within half a pixel at 16 px, what fails and why, and how long layout takes per formula. If it cannot be made to match, the ADR falls back to MathJax 4's SVG output, which the user must agree to (Q7).
