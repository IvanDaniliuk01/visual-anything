---
status: accepted
---

# WebGL rendering with PixiJS, with an HTML layer for text editing

The canvas is drawn with WebGL through PixiJS, and text editing happens in an HTML layer placed over the canvas at the edited shape. We chose this because rendering 10,000 elements smoothly is a firm requirement, and switching rendering engines later would mean rewriting how every shape is drawn and how every interaction finds what is under the pointer.

## Considered options

- **SVG** (as draw.io does): rejected. The simplest and most accessible option, but it slows down with a few thousand elements.
- **Canvas 2D** (for example Konva): rejected. Goes further than SVG, but without the GPU it falls short of the target.

## Consequences

A WebGL canvas is invisible to screen readers, so the app needs a parallel accessible representation: keyboard navigation between shapes and an outline of the view that mirrors the model. Exporting a view as SVG or PNG needs its own path rather than serializing the page.

## Clarifications

- 2026-10-24: how the canvas meets the budget at 10,000 elements, which every later drawing (rows, images, themes, 3D pictures) has to keep:
  - Shapes are drawn into tiles of canvas cells. Where shapes overlap, tiles are split into bands, so that the drawing order is exactly the stacking order of ADR 0021 and hit testing picks the shape drawn on top.
  - Tiles are culled by the camera of the frame being drawn. A tile comes back as soon as it is on screen, and is culled only once it is half a screen away.
  - New drawings, labels and selection marks are spread over frames within fixed budgets per frame, so no single frame takes on all of them.
  - The camera container is one render group, and tiles are drawn by region, so that a change rebuilds only the region it touches.
- 2026-10-24: the canvas draws without antialiasing. On the reference laptop (Iris Xe, density 1) it cost about 2.5 times the GPU's time far out, which kept a 10,000-element view from the frame budget; without it nearly every benchmark phase passes. Curves and arrowheads are jagged at density 1 and hardly at density 2. The benchmark's work mode waits for the GPU with a 1-pixel `readPixels` after `gl.finish()`, which Chrome returns from before the GPU is done. Smoothing edges while the camera rests may come later, as a preference.
- 2026-10-25: an SVG or PDF written from the scene (M6b) is an output, not a second renderer: a writer in pure TypeScript turns the same scene the renderer draws into a file, and nothing draws the canvas but PixiJS. A test keeps the two from drifting by comparing the file's bounds with the scene's.
- 2026-10-25: how M6b writes the SVG and the PDF (W32).
  - **The SVG writer** (`app/src/export/svg.ts`) reads `buildScene`'s scene and the theme's colors (`canvas/theme/paint.ts`), as the renderer does, and writes what the canvas draws with every detail showing, in its drawing order: shapes by their kind, collapsed containers on their sheets, tables with their header and rows, toggles, pictures and labels; then the casings, routes, curves, dashes, arrowheads and names of relations; then notes and free arrows. It imports no PixiJS and no DOM, so the command line and Claude's tools write the same file as the app.
  - **Text** is wrapped and cut with "…" to the room its shape gives it, as the canvas does, measured in Roboto's widths (`export/fonts/widths.ts`) with a 6% margin for the system fonts a browser draws in. Each line is placed by a baseline worked out once, so that a browser and the PDF put it in the same place.
  - **Pictures** are the cleaned ones only, each written once as a symbol: an SVG picture inlined from the cleaner's canonical form, read back strictly, its ids given a prefix of its own and its `hsl()` colors written in whole numbers; a bitmap as a data address. A silhouette of an SVG picture is painted in its tint; one of a bitmap takes an SVG filter.
  - **The check.** `svg.test.ts` reads the file back and compares the bounds of its geometry with the scene's, within 0.6 units, and its view box with them and the 32-unit margin, for the sample, the sample with pictures, an arrow and a curve, a collapsed container, and tables.
  - **The PDF** is made from that SVG: PDFKit 0.20 makes the document and SVG-to-PDFKit 0.1.8 draws the SVG into it, both MIT; their dependencies are MIT, Apache-2.0 and 0BSD. Both run in Node, for the command line and Claude, and in the browser through PDFKit's browser build, and are loaded only when a PDF is made. The text is in Roboto 2.137 Regular and Bold, one of the fonts the canvas writes in and the one whose license lets it ship (Apache-2.0, ADR 0047), embedded with only the glyphs used. The PDF cannot hold WebP pictures, nor the colors of bitmap silhouettes, and a character Roboto lacks shows as a box; each is said in what the export lost. A view larger than 200 inches a side is scaled down to fit one page.
  - **Considered for the PDF:** jsPDF with svg2pdf.js, rejected, since svg2pdf.js needs the DOM, which the command line does not have; pdf-lib, rejected, since it draws no SVG and has not been maintained since 2021; a PDF writer of our own, rejected, since drawing the cleaned pictures' gradients, clip paths and masks is most of what SVG-to-PDFKit does.

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

- 2026-10-26 (M8b): **outlines and named parts are drawn by the GPU, not by an SVG renderer.**
  - Free geometry (ADR 0066) and the outlines of anchored parts (ADR 0067) reach PixiJS as numbers that the core read from path data. The tiles draw them with PixiJS's line and Bézier calls.
  - Pictures are textures decoded from cleaned SVG (ADR 0027), including the pictures of drawings with parts and of parts drawn alone.
  - Neither makes SVG the canvas's engine, which this decision rejected, and PixiJS's own SVG parsing stays out of the app.
  - The HTML layer stays for editing text only. Imported HTML reaches the canvas only as an SVG picture made by the local program (ADR 0068).
