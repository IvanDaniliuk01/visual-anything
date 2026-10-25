---
status: accepted
---

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

# Tours are files of steps, each a view state with a caption, played full screen

A tour walks someone through a concept (CONTEXT.md, *Tour*). Benchmark R45 builds it from what exists:
- view states (ADR-0030's addendum);
- guidance's highlights and captions (ADR-0029);
- scenario playback (ADR-0031).

## The file

- **A new file kind, `.vatour`,** in a `tours/` folder, one tour per file. It holds an id, a name, a description and its steps.
- **What a step holds:**
  - an id;
  - a **view state**: view, camera, selection, filters, focus, scenario and step, each optional but the view;
  - a **caption**: a title and a text, plain text with paragraphs and lists, never HTML;
  - **marks**: the elements and relations to highlight, as guidance highlights them;
  - optionally, a **scenario** to play there, from a step to a step;
  - optional **speaker notes**.
- **Ids are kept,** so renames do not break a tour. A step that names something deleted is kept, flagged and played without it, as broken steps are.

## Making a tour

- **In the app.** In the tours panel, *Add step* takes the open view state, and the caption and marks are edited in place. Steps can be reordered, duplicated and deleted, each one action.
- **By Claude.** `create_tour`, `add_tour_step` and `update_tour_step`, so that "walk me through checkout" can be saved as a tour, not only shown once as guidance.
- **Commands.** Tours change only through commands (`create-tour`, `update-tour`, `delete-tour`), so they undo like everything else.

## Playing a tour

- **Full screen.** The panels hide and the canvas fills the window.
  - The caption shows in a card.
  - A progress line shows where the tour is.
  - Keys move forward and back (arrows, Space, Page Up and Page Down), and Escape ends the tour.
  - The speaker notes show on a second window if one is opened.
- **The camera.** Each step's camera move is short and eased, and its travel is capped at three screen widths: past that, it cuts. Under reduced motion, every move is a cut.
- **Playing changes nothing.** As in ADR-0031, the tour's position is kept per tab.
- **In the read-only page.** Tours play there too (ADR-0041).

## Considered options

- **Tours inside view files:** rejected. A tour crosses views, and a file of its own diffs and merges on its own.
- **Tours as recorded guidance replayed as-is:** rejected. A recording of moves is brittle; view states are what a step is.

## Consequences

- The schema gains the tour file kind, and the loader reads `tours/`. CLAUDE.md's file rule gains `.vatour`.
- The core gains tour commands, with property tests that steps naming deleted things are kept.
- The app gains the tours panel and full-screen playback.
- CONTEXT.md gains **Full-screen playback**.
