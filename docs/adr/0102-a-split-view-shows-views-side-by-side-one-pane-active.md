---
status: accepted
---

<!-- From GitHub issue #12, "Split view: show two (or more) views side by side in one window". Decided by the main session under the user's standing delegation of design decisions. -->

# A split view shows views side by side, one pane active

A tab shows one view. To present a story beside the technical view of how its data is stored, or to compare two cases, the person opens two browser windows and tiles them, which loses what the app shares within a tab: one selection, one history in view, one place where Claude's guidance lands.

The app was built around one open view: the shell holds it once, with its selection, camera, emphasis, scenario and space panel; the view address and the view state hold one view; the inspector, the find bar, export, capture and Claude's guidance all act on "the open view". The canvas itself mounts twice without trouble: each makes its own renderer and keeps its keys on its own element.

## Decision

### Panes

- **The canvas area splits into panes side by side, three at most**, each showing one view with its own camera, filters, focus and emphasis. Each pane is a canvas with its own drawing context, and layouts queue in the one worker they share, so three is where a modest laptop still reads at its frame budget (CLAUDE.md's performance budget is per pane).
- **Open beside** opens a view in a new pane to the right of the active one: from a view's row in the view list, from a destination that goes to another view (ADR 0057's "see how it is stored"), and from the pane's own header. With three panes open, it replaces the rightmost one but the active pane.
- **A pane's header** names its view, lets another view be chosen for it, and closes it. The border between two panes is dragged to resize them, and moves with the arrow keys when it has the focus; each pane keeps a minimum width. Closing every pane but one leaves the single canvas as it was.
- **Which panes are open, their views, cameras and widths are the tab's**, kept in the tab's session storage, so a reload brings them back. They are not in the view address: Copy address copies the active pane's view state, as it did the open view's, and an address opened in a tab replaces the active pane's view. The view state, the exported page and the live protocol are unchanged.

### One pane is active

- **Pressing in a pane, or moving the focus into it, makes it active**, shown by its border. Everything that acted on the open view acts on the active pane's view: the inspector, the Outline, the view list's mark, the find bar, export, Copy address, the keyboard shortcuts the canvas area listens for, the space panel, scenario playback, and what Claude's guidance shows, lays out or captures. A guidance request for a view another pane shows makes that pane active instead of changing the active pane's view.
- The other panes are drawn and can be panned, zoomed, hovered and clicked; a click makes their pane active first.

### Selection is linked

- **The selection is one, by element and relation id**, as it is today for the copies of an element (ADR 0007): selecting an element in one pane selects its shapes in every pane that draws it. That is the linked highlight the issue asks for, with no new state. Free shapes belong to one view, so a free shape is selected in its pane only.
- Emphasis (the tour's marks, explore's highlight) is each pane's own, keyed by its scene.

### Tours

- **A tour plays in the active pane**, full screen within the canvas area: the other panes stay visible beside it, as they were, and keep their own views. That serves the first use of the issue, a story played beside the view of how its data is stored, with no change to tour files.
- **A step that names a view to show beside it** (`TourStep.beside`, a view state for the pane to its right) is the second part of this decision, built after the panes: it changes the tour file and so the live protocol, to 11.

Built: a tour step's `beside` is a view state of the same shape as its own, checked as its own is: a refusal names it ("Step 2 of the tour, beside it: …"), and what it names that the project no longer holds, its view included, makes the step a broken step, said to be beside it ("Beside it: The project has no view …"), which plays without the view beside it; the core's `playableStep` gives it, without what is gone, and a delete's preview counts it. While a tour plays, a step with `beside` shows its view in the pane right of the tour's pane: that pane when there is one, a new pane there while fewer than three are open, and otherwise the rightmost pane but the tour's. The view beside goes first, and when it opens or closes a pane the step's own camera is worked out once the panes are laid out again, as for the first step, so that it fits the narrower pane. Its camera goes to the view state's camera, or shows the whole view without one, gliding as a step's does within the view that pane shows and cutting into another, under reduced motion, and for a step that always cuts. A step without `beside` shows what the nearest step before it with one shows beside it, so that it reads the same whichever way it is come to, and with none before it the panes as the tour found them; the tour check reads it so too. As the tour starts, the panes and their cameras are taken note of and held: while the tour plays, the tab keeps them as they were found, so that a reload or another project mid-tour never keeps the tour's panes, and the shell going mid-tour gives them back. When it ends, if a step showed a view beside it, they come back exactly as they were, but for the panes of views deleted meanwhile, and never when another project opened meanwhile: a pane the tour opened closes, and a pane it showed another view in shows its own again at its camera; a tour that showed nothing beside its steps leaves the panes as they are. The pane beside shows the view state's view and camera only, and Claude's tools take only those for now: its selection is the one every pane shares, its scenario and physical-space panel are the active pane's, and its filters and focus every pane's of its view, so the pane beside leaves them as they are; they are kept in the file for a later part. The Tours panel's **Show beside** chooses a view, which the pane shows whole, **Use what the pane beside shows now** takes the view and camera of the pane a step's view beside the active one shows in, and **Remove** takes it away; a step's **Show** shows its view beside it too, without the panes coming back after. The read-only page has no panes and plays a tour without what it shows beside its steps. Claude's tour tools take and give `beside` for each step (`update_tour_step` takes `null` to remove it).

## Considered options

- **Panes in the view address:** rejected for now. The view state, its checks, the exported page and `app/shown` would all change to carry several views, for a layout that belongs to one tab and one moment; session storage brings it back on reload.
- **Every pane equal, each with its own inspector and selection:** rejected. Two selections would make "the selection" ambiguous for every command, menu and Claude, and the issue asks for the opposite, a linked selection.
- **A grid of panes, rows as well as columns:** rejected for now. Side by side covers comparing and drill-down; screens are wider than tall.
- **No limit on panes:** rejected. Each pane is a drawing context and a share of the layout worker.

## Clarifications

- 2026-11-05, building the panes (part 1): what the decision left open, decided under the user's standing delegation.
  - **Open beside leaves the active pane active.** The person goes on where they were, with the view they opened beside it; pressing in the new pane makes it active.
  - **Opening a view that another pane shows makes that pane active**, from the view list, a scenario, Claude's guidance or anything else that opens a view, so that two panes do not end up showing the same view by accident. A view state, as an address, a tour's step, search or a destination's Follow gives one, still shows its view in the active pane, as decided, so a tour stays in the pane it plays in. A pane's own header may show any view, the same as another pane's included, to compare it at two places.
  - **Filters and focus stay each view's**, as the shell has kept them (ADR 0025): two panes of the same view show the same ones. Only the active pane's focus follows the selection.
  - **A comparison (ADR 0070) shows in the active pane**; the others keep drawing their views.
  - **Where Open beside is offered:** Beside on each row of the view list, Beside beside Follow for a destination that opens a view of this project in the inspector, and Beside in a pane's header, which opens that pane's view in another pane. The shape menu's Follow and Alt+Enter keep opening in place.
  - **One pane keeps nothing** in the tab's session storage; two or more keep their views, shares of the width and cameras there, read strictly when the tab reloads. The active pane's camera comes back with the view address, the others' from the storage.
  - **The least width** of a pane is 240 pixels while the canvas area is wide enough, and a tenth of it otherwise; the arrow keys move a border by 2% of the canvas area, 10% with Shift.
- 2026-11-06, after review of part 1:
  - **The tab keeps each project's panes apart**, under a key with the project's name, which is what the app knows of a project that stays (as the view list's folders, ADR 0101). Panes read back that name a view the project lacks are passed over whole and left in storage, as they may be another project's of the same name; only a malformed entry is dropped. The same views under a new name keep their panes, under the new name. A view deleted while panes show it closes those panes, down to the single canvas, and a pane left on a deleted view shows the project's first. A width read back is at least a tenth of the canvas area.
  - **Claude's guidance acts once in the tab**: a layout or a turn one pane ran, or answered it passed over, never runs again in a pane that becomes active later.
  - **While a tour plays, the active pane stays active**: pressing in another pane pans, zooms and selects there but does not move the tour.
  - **Of the panes that show one view, one places its new shapes and follows its zoom**: the active one, or else the leftmost; every pane of the view draws the same scene, which the shell keeps for each view.
