---
label: wayfinder:research
title: How an explorable becomes a still picture, for the canvas, exports and Claude
status: closed
assignee: claude
blocked_by: []
---

# How an explorable becomes a still picture, for the canvas, exports and Claude

## Question

A walled-off frame cannot be read by the app, yet an explorable needs a still picture: on the canvas until explored, in SVG, PDF and PNG exports, and for Claude, who captures it and reads its console errors (ADR 0081). What can make that picture: the frame drawing itself (SVG `foreignObject`, html-to-image libraries, a canvas's `toDataURL`) and posting it out, the browser's own capture APIs, or the local program rendering it headless? When is it taken (after approval, on each change, kept by hash)? What does the canvas show for an explorable not yet approved, which cannot run?

## Resolution

Findings: `docs/wayfinder/explorables-and-math/research/explorable-stills.md` on branch `research/explorable-stills`.

- **The explorable's own frame draws its still.** A small built-in copy of html-to-image (MIT, about 5 KB gzipped) turns the page into an SVG `data:` URL and then a PNG; every browser leaves a canvas readable when the SVG is a `data:` URL. Fonts and images are handed in as `data:` URLs, since the frame cannot fetch. WebGL pages get a `va.onStill` hook to draw again just before the picture.
- **How it leaves.** The frame posts the PNG's bytes; the app takes them only from that frame's window and rebuilds the image through `core/src/images/bitmap.ts`, the cleaner imported pictures pass through.
- **When and how it is kept.** Only after approval and only when asked: one hidden frame at a time, at size buckets from 256 to 1,024 px, while the canvas is at rest, waiting at most 5 s. Keyed by a hash of the file, its libraries, the element's data, the theme, the tour state and the size; kept for the session in the canvas's `ImageStore`, as `canvas/solids/pictures.ts` keeps solids' pictures. Nothing is written into the project.
- **Before approval, or with no app open,** the canvas draws a card from data alone: name, description, the libraries it asks for, and "Not approved yet: Approve to run". The same card shows when a still fails, and from the command line and `export_view`.
- **Claude and exports.** `capture_explorable` (or a region of `capture_view`) answers the PNG and up to 50 console errors within ADR 0081's deadlines; an unapproved explorable answers `not-approved` and nothing runs. PNG, SVG and PDF exports take an `ExplorablePainter` built like `export/solid-pictures.ts`'s `SolidPainter`. The read-only page shows stills until the reader runs one.
- **Ruled out.** The browser's capture APIs ask the person every time and work only in Chrome; Chrome's HTML-in-Canvas cannot draw another origin's frame; a headless browser in the local program falls under ADR 0068's rejection and adds 2–14 MB of driver plus about 280 MB of browser.
- **For the ADR.** ADR 0068 rejected running HTML in a frame and capturing it; the Explorables ADR must say why an approved explorable differs. Open: a still per element or per component when 300 elements share one, Safari's blank first draws, and which theme exports take.
