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
- **Tours as recorded guidance, played again exactly as it was recorded:** rejected. A recording of moves is brittle; view states are what a step is.

## Consequences

- The schema gains the tour file kind, and the loader reads `tours/`. CLAUDE.md's file rule gains `.vatour`.
- The core gains tour commands, with property tests that steps naming deleted things are kept.
- The app gains the tours panel and full-screen playback.
- CONTEXT.md gains **Full-screen playback**.

## Superseded in part, 2026-10-26

ADR 0077 supersedes two parts of this decision. **The camera:** a step's move follows a bounded smooth zoom-and-pan path, at most 2.5 times zoomed out and 800 ms long, rather than gliding up to three screen widths; past those bounds, into another view, from no camera or under reduced motion it cuts, and every cut cross-fades. **The keys:** every key that goes forward or back goes one reveal at a time, and I, P, R and B open the steps' index, pause a step's scenario, play its range again and go back to the step's camera. Everything else here stands: tours are files of view states, played full screen, and playing changes nothing.

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
- **Full screen** is the window, not the screen: the panels, the canvas toolbar, the explore strip, the find bar, and the comment pins with the layer that places a thread on a point hide (the pins since W47, below), and the canvas fills the window. The browser's full screen is not asked for, so that Escape always ends the tour. When the tour ends, the tab goes back to the view state it had when the tour started.
- **Keys.** The right and down arrows, Space and Page Down go forward; the left and up arrows, Shift+Space and Page Up go back; Home and End go to the first and the last step; Escape ends the tour. Keys with Control, Alt or Meta move nothing in the tour, and stay the browser's. The tour takes them before the canvas does, and since W47 (below) it lets no key through to the app's own shortcuts.
- **Marks** highlight as guidance's highlight does, through an emphasis source of their own, `tour`, while the tour plays.
- **A step's scenario** opens at the first step it plays, plays, and pauses back on the last; once the person pauses or closes it, it is theirs.
- **Speaker notes** show in a second window that the click on Speaker notes opens: a blank page of this origin with the app's stylesheets and theme, filled by React through the DOM, never through HTML. The keys pressed in it move the tour. When the browser blocks it, the stage says how to allow it.
- **The tours panel** is the Tours tab of the model panel.
  - New tour from the canvas creates a tour whose first step is the canvas as it is; Add step adds another.
  - Take the canvas gives a step the view state as it is now; Show goes to a step without full screen.
  - Captions and notes are sent when the person leaves their field.
  - Each edit is one `update-tour`, which the history names by what it did: "Add a step to the tour", "Delete a step of the tour", "Reorder the steps of the tour", or "Edit the tour".
- **Claude's tools.** `read_tour`, `create_tour`, `add_tour_step`, `update_tour_step` (which also moves a step), `remove_tour_step`, `update_tour` and `delete_tour`, each call one undoable action of Claude's; a step's view state is given as `get_view_address` takes one. `get_project` lists the tours with their broken steps. Claude cannot play a tour in the app yet: it opens a step's view state with `open_app` (it can since W45, below).
- **The read-only page.** The page's data holds the project's tours, checked as a project's are, and never its threads of comments (ADR 0059). Its Tours tool lists them and plays one full screen with the app's stage, keys and moves (`TourStage` and `useTourPlayback`, which know nothing of the live editor), while the page's header, panels and bars hide.

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

- 2026-10-25 (W45): **Claude plays a tour in the app (`play_tour`).**
  - **The guidance.** `play_tour` sends `{ kind: "tour", tour, step? }`, where `step` is the index of the step it plays from, from 0, and its first when left out. Protocol 6 carries it beside the other guidance without a new version, as W42's `layout` did, since no version has shipped since 6 began.
  - **The tool** takes the tour, and a step by its id or its number from 1, as the other tour tools do. It refuses a tour or a step the project does not have, and a tour of no steps. It answers how many open apps it reached and the step it plays from; with none, it says that nothing plays and that `open_app` opens one.
  - **Each app plays it with the tours' own playback,** the shell's tours host and its player, which `TourPlaybackLayer` shows, as the tours panel's Play does: full screen, from where the tab is, which the tab goes back to when the tour ends. A tour the app does not have is ignored.
  - **The tour is the person's from then on.** The keys move through it and Escape ends it, as always. Claude cannot move it on or end it, and `clear_guidance` does not end it; a new `play_tour` plays it again from its step.
  - **Claude's marks, move and caption go** when a tour plays, since its stage shows its own caption card and marks (the `tour` emphasis source); the filters, focus and scenario playback Claude asked for stay as they were.
  - **Nothing is recorded:** the guidance changes no file and no history, and playing changes nothing, as this ADR says.
- **2026-10-25 (W44): a step keeps the time range.** A step's `viewState.filters` may hold `range`, as a view state does (ADR 0044's clarification of W44): `of`, `attribute`, `until` when it is on periods, `kind`, `from` and `to`, checked by the schema and by the core as an address's range is. Filters that hold only a range are written `{ "range": … }`. Take the canvas and New tour from the canvas keep the range the strip shows, a step plays it with the other filters, and it is kept when the components or relation types its filters name are gone, since it names attributes, not ids. A step written before keeps reading as it did.

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

- 2026-10-26 (W47, from M11's spec review): **what a tour holds, how it plays, and what a page takes of it.**
  - **The size of a tour.** Its text, the name, the description, and every step's caption and speaker notes, holds at most 1,000,000 characters together (`MAX_TOUR_TEXT`), so that a tour stays well within the 8 MiB its file is read within, and the 4 MiB one change from the app carries, whatever characters it is written in. `create-tour` and `update-tour` refuse a tour past it with `invalid-command`, saying to put the rest of its steps in another tour. A tour kept longer than that, as one written by hand can be, can still be changed so long as it grows no longer.
  - **Whatever the program writes, it opens again.** A change that would write a file past the cap of its kind is refused with `invalid-file` before anything is written, and says what to do: for a tour, put the rest of its steps in another tour. Every later change is made as before.
  - **From the app.** Each edit still sends the whole list of steps, since `update-tour` takes the list whole. The tours panel does not send an edit that the live connection could not carry; it says so in a notice, and that some steps can be deleted or put in another tour, instead of the connection closing on the way.
  - **Full screen** also hides the comment pins and the layer that places a thread on a point (ADR 0059): the canvas is the tour's while it plays.
  - **Keys.** While a tour plays, no key reaches the app's own shortcuts: undo and redo, the stacking keys, deleting, copying and pasting, and any other key that sends a command do nothing, so that playing changes nothing. The browser's own keys, such as Ctrl+R and Ctrl+L, stay the browser's: nothing keeps it from them. Space and Enter on a focused control of the stage press it, rather than moving the tour. A dialog shown over the tour, such as a request to approve package code, keeps its own keys; only the app's shortcuts are kept from it.
  - **A step's scenario** plays from the timeline entry of its first step to that of its last, comparing entries, not steps: under a collapsed container one aggregated entry plays several steps, and going to any of them lands on the entry's first.
  - **Free shapes.** The delete dialog lists the tour steps that select a free shape it deletes from their view, as it lists those that name a deleted element or relation (`previewDelete` takes the free shapes, with the view they are deleted from).
  - **Speaker notes stay out of the read-only page.** They are the presenter's own words, kept for a second window that the audience never sees, and a page is made to be shared. The page's data holds each tour without its steps' `notes`, and the page offers no speaker notes window. The Export dialog says that the page holds every tour, and that it leaves out the speaker notes and the threads of comments, when the project has any. Whoever presents does so from the app, where the notes are.
