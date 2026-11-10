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

## Not yet specified

- **Versions and merging.** How an explorable's file, and a library's, show in comparisons (ADR 0070) and pass through the merge driver (ADR 0072); whether two branches editing one explorable conflict as text.
- **How Claude learns to write explorables well.** The guidance Claude reads before writing one: the `va` API, the libraries at hand, sizes, the theme, Math inside it.
- **Accessibility.** What a screen reader and the keyboard reach inside an explorable, and what the canvas says about one that is still.
- **Limits.** An explorable's size, a library's size, how many libraries a project keeps, and what happens when one is over.
- **Licenses of downloaded libraries.** Whether a project's libraries must name their license, and how the read-only page credits them (ADR 0047).
- **Math as Claude reads it.** Whether `read_view` and `get_item` answer the TeX as written, and how a capture draws it.

## Out of scope

- **Whole LaTeX documents compiled to PDF.** Only the notation is typeset (decided in [What explorables and Math are](01-charting-decisions.md), Q7).
- **An explorable writing to the model,** even as a proposal (Q4). It may come back as a new effort.
- **A code editor inside the app** (Q16): the person edits in their own editor, or asks Claude.
- **Loading libraries from the internet while a page runs** (Q10).
