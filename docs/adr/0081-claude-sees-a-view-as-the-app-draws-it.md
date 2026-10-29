---
status: accepted
---

<!-- Decided by Claude on 2026-10-29 under the user's standing delegation of design decisions, from the notes the user's modeling session kept while building a real data model. -->

# Claude sees a view as the app draws it

While Claude built the user's data model, it could not see what it had made.

- **Playwright cannot open the app.** `get_view_address` gives an address of the app, but a tab Playwright opens shows "This tab has no session token". The app connects only to a tab it opened itself, with an address that works once and is never given to Claude (ADR 0029).
- **The workaround was clumsy.** Claude exported the view as SVG with `export_view` and rendered it with a headless Chrome. That drew the export, not what the person sees: the theme, zoom expansions, overlays, kept routes and what is collapsed in the tab were missing.

## Decision

- **A read tool, `capture_view`.** It asks an open app for a picture of a view as that app draws it, and answers with a PNG image that Claude reads.
  - **Arguments:** `view`; `region`, which is `whole` (the default), `viewport` (what the tab shows now), or a list of element ids to frame; `width`, from 256 to 2,048 pixels, 1,280 by default; `theme`, `light` or `dark`, by default the tab's.
  - **The app** renders it off screen with the same scene, renderer and marks as the canvas, so the person's tab neither moves nor flickers. It is the PNG export's path (`canvas/capture.ts`) at a size the tool gives.
  - **The answer** is at most 4 MiB. A larger picture is refused, with a sentence to ask for a smaller `width` or a region.
- **It travels as guidance with an answer.** It is the protocol's message `capture/request` from the program to one app, and `capture/answer` back, matched by request id. The app answered is the tab the person used last, as the guidance `comparison` does (ADR 0070's clarification).
  - With no app open, the tool says so and that `open_app` opens one. It never starts a browser of its own.
  - The protocol stays at version 7, since no build of 7 has shipped.
- **It stays a read.**
  - It changes nothing: no view file, no history, no camera of the tab.
  - The picture shows only the project the session has open.
  - It carries no token or address, and nothing in it runs.
  - Its name starts with a read verb, `capture`, which joins the list of read verbs.
- **No page for automated browsers.** No read-only mode for Playwright is added. The session token keeps a page that someone else opens from reaching the project, and `capture_view` gives Claude what such a page would have.

## Considered options

- **A read-only page Playwright can open:** rejected. It would need an address without the one-use code, which any local page could then use.
- **Rasterizing the SVG export in the program** (resvg or a similar WASM):
  - it was left for later, as a fallback when no app is open;
  - it adds a dependency;
  - it draws the export, not the tab.

## Consequences

- The program gains the capture messages, with a 20 s wait for the answer.
- The app gains an off-screen render at a given size.
- Claude's instructions say to check a view with `capture_view` after building or laying it out.
