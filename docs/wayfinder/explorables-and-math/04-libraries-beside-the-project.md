---
label: wayfinder:research
title: How libraries are fetched once and kept beside the project
status: open
assignee:
blocked_by: []
---

# How libraries are fetched once and kept beside the project

## Question

How does the local program fetch a JavaScript library once (D3, Plotly, function-plot, JSXGraph, KaTeX and the like), check it, and keep it beside the project by its SHA-256, so explorables use it offline and the read-only page carries it? Cover where it comes from (npm tarballs from the registry against jsDelivr or unpkg files, ESM against UMD builds, packages with several files or fonts), how an explorable names one (an import map, a fixed URL scheme), integrity and pinned versions, the sizes of the common ones, licenses and how they are credited (ADR 0047), what the program does today when it fetches for package code (ADR 0063), and what the person sees before approving a download.
