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
