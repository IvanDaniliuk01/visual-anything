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
