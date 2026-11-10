---
label: wayfinder:grilling
title: What explorables and Math are
status: closed
assignee: claude
blocked_by: []
---

# What explorables and Math are

## Question

What is this effort finding its way to, and what must hold for explorables and Math before the technical questions can be asked?

## Resolution

Grilled with the user on 2026-11-10, in three rounds. Each answer is the user's.

- **Q1, destination.** Decisions, not a build: accepted ADRs, terms in `CONTEXT.md` and spec milestones with tasks ready for builders.
- **Q2 and Q9, running code.** An explorable's JavaScript runs, walled off in a sandboxed frame with no access to the app, the session, the person's files or the network. **Every explorable asks for the person's approval, including the ones Claude writes (Q9: c).** The user's words: "la idea es que lo genere el propio Claude".
- **Q18, how approval holds.** The person approves an explorable once. Claude's later changes to it in that person's session run without asking again; a change that comes from outside (another project, an import, git) asks again. A library is downloaded only after the person sees its address and approves it. This departs from ADR 0060's approval, which any change to the code asks for again and which Claude cannot give; the ADR must say how.
- **Q3 and Q11, where it shows.** Everywhere:
  - in the explorable panel beside the canvas, live;
  - in its shape on the canvas, as a still picture until the person explores it (double-click or Explore), one live on the canvas at a time;
  - loose on the canvas, as a free shape, the same way;
  - in tour steps, live.
- **Q20, the panel.** Its own panel, which can be open together with the physical-space panel, one above the other. Opening an explorable beside, in a pane of the split view (ADR 0102), is welcome as an extra.
- **Q19, what it belongs to.** All three: an element, a component (every element of it shows the same explorable with its own data, as a face does), or nothing (loose). An element's own wins over its component's.
- **Q4 and Q12, data in.** It reads, never writes: the attributes of what shows it, computed and live values, its relations and neighbors, the scenario or tour step under way, and the theme, through a small API (`va.data` and a notice when something changes).
- **Q13, tours.** A tour step can set what an explorable shows: a small state it receives, such as a slope of 2 and a point at x = 1.
- **Q14, controls.** What the person moves inside an explorable is kept only in that tab, like the camera; nothing of it is saved.
- **Q15, Claude sees it.** Claude can capture an explorable as a picture and read its console errors, as `capture_view` does for views (ADR 0081).
- **Q5 and Q16, who writes it.** Claude writes it through MCP, and the person imports or pastes it, or edits its file in their own editor; the app reloads it when the file changes. No editor inside the app.
- **Q6 and Q10, libraries.** Any library, downloaded once by the local program, kept beside the project by its hash, so pages work offline, travel with the project and go into the read-only page. Claude can ask for one. Nothing is loaded from the internet while a page runs.
- **Q17, exports.** The read-only page holds explorables live, walled off, without network, with their libraries; SVG, PDF and PNG hold their still picture.
- **Q7, Math.** Only the notation, typeset with KaTeX: `$…$` within a line, `$$…$$` as a block, in descriptions, notes, faces, tour texts and attributes, on the canvas, in exports and inside explorables. No TeX engine, no compiled documents.
- **Q8, words.** **Explorable**, **Explorable panel** and **Math**, now in `CONTEXT.md`.
- **Q21, order.** Math first, then Explorables, then A8.2 (videos).

**Amended on 2026-11-10, after [Prove the explorable frame in Chrome, Firefox and Safari](12-prove-the-explorable-frame-in-browsers.md):** the user dropped live explorables from exports ("no quiero tanto tema para la exportación"). Q17 and Q40 now read: the read-only page, like SVG, PDF and PNG, holds only an explorable's still picture or its card.
