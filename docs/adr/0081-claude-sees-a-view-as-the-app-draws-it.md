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

## Clarifications

<!-- Decided by Claude on 2026-10-30 under the user's standing delegation of design decisions, while building M3d's "Claude sees the view". -->

- 2026-10-30 (M3d, building it): **how `capture_view` is built.**
  - **The messages** (`core/src/capture.ts`), read strictly on both sides:
    - `capture/request` carries `requestId`, `view` (optional), `region`, `width` and `theme` (optional).
    - `capture/answer` carries exactly one of three things:
      - `picture`: `png` in base64, `width`, `height`, `view`, `theme`, `scale` (pixels per canvas unit) and `missing` (elements of a region with no shape drawn);
      - `passed: "other-tab"`;
      - `failed`, one of `other-view` (with `shows`), `too-large` (with `bytes`), `empty`, `not-drawn`, `no-canvas` and `failed` (with `why`, at most 500 characters).
    - Claude's endpoint gains `capture` and its answer `capture/taken`, which carries the report.
  - **The wait** (`server/src/capture-waits.ts`) follows `layout/done`'s pattern without its queue, since a picture changes nothing. Several pictures wait at once, each by its own id. The request goes to the apps through the session's queue, so a picture shows the work asked for before it. The wait ends:
    - at the first picture or failure;
    - as `passed`, when every tab passed it over;
    - as `gone`, when the apps closed;
    - as `timed-out`, after 20 s.
  - **Only the view a tab shows.** With `view` left out, the picture is of the view the tab used last shows. A view it does not show is answered `other-view`: the tab never opens another view for a picture, since that would move the person's tab. The answer says how to show that view: `open_app` naming it, or guidance naming it. A view that tab has never laid out would draw unplaced shapes anyway.
  - **The PNG export's path.** The ADR names `canvas/capture.ts`, but that is the tour's copy of the frame on screen, at the screen's size. The PNG export's path is `CanvasRenderer.exportImage` with `export/image.ts`: it draws into textures in pieces, every tile in full, and puts back what it changed before the next frame. Its body is now `drawImage`. `exportImage` and the new `captureImage` both use it, so the picture holds the same scene, emphasis, theme, overlays and legend band, without marks.
  - **The other theme draws off screen** (`app/src/capture/mirror.ts`). Switching the person's canvas would show in their tab. Instead, a renderer of its own starts in that theme, in a host outside the window. It is given what the canvas draws from (`CanvasRenderer.drawnFrom`: the scene, emphasis, legend, package code's drawings and comparison), and the tab's camera for `viewport`. It draws one frame, takes the picture, and goes. Pictures it has not decoded within that frame show as their placeholders, as the export shows those of tiles far off screen.
  - **Framing and size** (`app/src/capture/frame.ts`):
    - `whole` is the scene's bounds with the export's margin, 32 units.
    - `viewport` is what the canvas shows, written as the screen writes it.
    - A list of elements frames every shape of theirs that the emphasis does not hide, with the same margin.
    - The picture is `width` pixels wide. A region taller than 4,096 pixels at that width is drawn narrower.
    - Apart from `viewport`, a canvas unit takes at most 2 pixels, as the export's 2×. A smaller frame is widened around its middle, which shows what lies around it.
    - Names and details are written as the canvas writes them at the picture's zoom, so a large view seen whole shows blocks. The answer gives `scale`, and the tool's description says to frame some elements to read them.
  - **The cap is 4 MiB of base64**: the picture as it travels and as Claude reads it, a PNG of 3 MiB. It stays under the 5 MB the Claude API takes for one image. The app measures the PNG before encoding it, and answers `too-large` with the base64 size. The tool then says to ask for a smaller width or a region. The live connection's largest message from an app (`LIVE_MAX_PAYLOAD`) grows from 4 MiB to 5 MiB, so the most a picture may be fits with its message. A picture's sides are at most 16,384 pixels, the export's most, since the legend's band adds to the drawing.
  - **The answer Claude reads.** An MCP image content (PNG) comes first, then a short text: the view's name and id, what the picture shows, its size, theme and zoom, and the elements with no shape there. Every case without a picture is an error with a sentence. With no app open, that sentence says `open_app` opens one. The tool never starts a browser. `ToolOutcome` gains `image` for this.
  - **Reads gain `capture`.** The tools' rule on the names of the tools that only read becomes get, list, find, read, preview, export, check or capture.
  - **Nothing the person sees.** The tab shows nothing while it takes a picture, so `es.ts` gains nothing. The reasons a drawing failed go to Claude only, in English.

- 2026-11-01 (A4, the main session, from the user's note 15): **`region` frames notes and arrows by their ids too**, in any view that holds them, as `highlight` and tours mark them; an id that names neither an element nor a note or an arrow is refused, saying which.
