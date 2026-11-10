---
label: wayfinder:research
title: How Math is typeset on the canvas and in exports
status: open
assignee:
blocked_by: []
---

# How Math is typeset on the canvas and in exports

## Question

How can TeX notation, typeset with KaTeX, be drawn everywhere a text shows: the Pixi canvas within the 10,000-shape, 60 fps budget and a theme switch that never stalls a frame; faces and their measured sizes (ADR 0083); the inspector and tours in React; SVG, PDF and PNG exports; the read-only page under its content security policy (ADR 0041); captures for Claude (ADR 0081)? How do `$…$` and `$$…$$` fit the Markdown subset of ADR 0082 without breaking texts that hold a dollar sign today? Compare KaTeX with MathJax 4 (SVG output) on size, speed, fonts offline and what each can hand the canvas; say what the program bundles and what it costs.
