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

## Clarifications

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

M11's tour build (W38) settled these.

- **The file.** A `.vatour` holds `id`, `name` (at most 200 characters), `description` (at most 4,000) and `steps` (at most 1,000), and is read within 8 MiB. A step holds:
  - `id`, unique within its tour only;
  - `viewState`, a view state as a file keeps it (`SavedViewState`): the address's parts, with what holds nothing left out, so that a list that hides nothing, a condition's empty value and focus that does not isolate are not written;
  - `caption`, a `title` (1 to 200 characters) and an optional `text` (at most 4,000);
  - `marks`, at most 500 elements and relations;
  - `play`, a `scenario` and optionally the steps it plays `from` and `to`, by id;
  - `notes`, at most 20,000 characters.
- **Plain text.** Captions and notes are plain text (the core's `plain-text.ts`, which comments use too): a blank line starts a paragraph, and lines that start with "- ", or with a number and ". ", make a list. Whatever they hold, markup included, is written as text.
- **Ids.** What a step names, as what it selects, marks or focuses from, and a tour's own id are taken: no new element or relation gets one of them, so that a step whose element was deleted never comes to mean another, as a broken scenario step never does.
- **Steps that name what is gone.**
  - A view or a scenario a step uses can still be deleted, unlike a view a scenario plays over, and so can anything a step names. The step is kept and flagged (`tourStepProblems`).
  - A command that gives a step back exactly as the tour keeps it keeps it; a new or changed step must name only what the project holds.
  - A step plays without what is gone (`playableStep`); one whose view is gone shows its caption and leaves the canvas where it is.
  - A project whose tours name what is gone still opens; two tours, or two steps of one tour, with the same id keep it from opening.
  - The delete dialog and `preview_delete` list the tour steps a deletion flags (`brokenTourSteps`).
- **The camera.**
  - A move's travel is measured in screen widths: how far the middle of the canvas moves, at the nearer of the two zooms, plus one for each doubling or halving of the zoom.
  - Up to three, the move eases in and out over 250 ms plus 150 ms per screen width, at most 700 ms. Past three, into another view, from no camera, or under reduced motion, it cuts.
  - A step without a camera shows its selection as a search result is shown, or else the whole view.
- **Full screen** is the window, not the screen: the panels, the canvas toolbar, the explore strip and the find bar hide, and the canvas fills the window. The browser's full screen is not asked for, so that Escape always ends the tour. When the tour ends, the tab goes back to the view state it had when the tour started.
- **Keys.** The right and down arrows, Space and Page Down go forward; the left and up arrows, Shift+Space and Page Up go back; Home and End go to the first and the last step; Escape ends the tour. Keys with Control, Alt or Meta stay the browser's. The tour takes them before the canvas does.
- **Marks** highlight as guidance's highlight does, through an emphasis source of their own, `tour`, while the tour plays.
- **A step's scenario** opens at the first step it plays, plays, and pauses back on the last; once the person pauses or closes it, it is theirs.
- **Speaker notes** show in a second window that the click on Speaker notes opens: a blank page of this origin with the app's stylesheets and theme, filled by React through the DOM, never through HTML. The keys pressed in it move the tour. When the browser blocks it, the stage says how to allow it.
- **The tours panel** is the Tours tab of the model panel.
  - New tour from the canvas creates a tour whose first step is the canvas as it is; Add step adds another.
  - Take the canvas gives a step the view state as it is now; Show goes to a step without full screen.
  - Captions and notes are sent when the person leaves their field.
  - Each edit is one `update-tour`, which the history names by what it did: "Add a step to the tour", "Delete a step of the tour", "Reorder the steps of the tour", or "Edit the tour".
- **Claude's tools.** `read_tour`, `create_tour`, `add_tour_step`, `update_tour_step` (which also moves a step), `remove_tour_step`, `update_tour` and `delete_tour`, each call one undoable action of Claude's; a step's view state is given as `link_to` takes one. `get_project` lists the tours with their broken steps. Claude cannot play a tour in the app yet: it opens a step's view state with `open_app`.
- **The read-only page.** The page's data holds the project's tours, checked as a project's are, and never its threads of comments (ADR 0059). Its Tours tool lists them and plays one full screen with the app's stage, keys and moves (`TourStage` and `useTourPlayback`, which know nothing of the live editor), while the page's header, panels and bars hide.

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

- **2026-10-25 (W44): a step keeps the time range.** A step's `viewState.filters` may hold `range`, as a view state does (ADR 0044's clarification of W44): `of`, `attribute`, `until` when it is on periods, `kind`, `from` and `to`, checked by the schema and by the core as an address's range is. Filters that hold only a range are written `{ "range": … }`. Take the canvas and New tour from the canvas keep the range the strip shows, a step plays it with the other filters, and it is kept when the components or relation types its filters name are gone, since it names attributes, not ids. A step written before keeps reading as it did.
