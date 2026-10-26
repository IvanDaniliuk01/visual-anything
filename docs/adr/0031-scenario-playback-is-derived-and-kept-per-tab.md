---
status: accepted
---

<!-- Decided by Claude on 2026-10-24 under the user's standing delegation of design decisions. -->

# Scenario playback is worked out from the files and kept per tab

A scenario file holds steps; how they play depends on the view as it is now. These decisions, which the spec left open, settle where playback lives and what it plays:

- **Playback lives in the tab.** Which scenario is open, the step it is on, whether it plays, and its speed are kept by the app, one per tab, outside React's state (the scenario session). They are never written to a file, never sent as a command and never enter the history, so playing never changes the model, the positions or the undo history. Playback runs only while the scenario's view is the one open; opening a scenario opens its view.
- **The timeline is worked out, never stored.** A pure core function, `scenarioTimeline(project, scenario, view?)`, turns a scenario's steps into what plays over its view. A run of consecutive steps becomes one aggregated step when every relation of each is in the model and every element they end on, directly or through a relation they end on, sits at any depth inside the same container that the view collapses (interface I1's `ViewFile.collapsed`). The container is the outermost such one, which the view draws, and the first in model order when an element's several containers leave a choice. A relation that ends on that container itself is not inside it. Expanding or collapsing a container mid-playback changes the timeline; playback keeps the index of the step it is on, so it lands on the first of the steps an expanded aggregated step stood for.
- **Broken steps play on their own.** A step that uses a relation no longer in the model is never aggregated, so that it always shows and can be fixed. It highlights what is left of it. Any change to a broken step's relations leaves out the ones that no longer exist, since the core accepts a broken step only unchanged; that is how it is fixed: replacing them with a relation selected on the canvas, taking them out, or adding a relation with Shift while recording.
- **Every step plays for the same time.** At normal speed a marker travels along the step's relations for 1.2 s, then holds at their far end for 1.2 s; the speeds are 0.5×, 1×, 2× and 4×. An aggregated step plays for the same time, with its container highlighted and no marker, since its relations are hidden. When the system asks for reduced motion the markers do not travel: they stand at the end they travel to. A frame that comes late, as after the tab was hidden, moves playback on by at most 100 ms.
- **Recording writes one action per click.** A click on a relation adds a step after the current one, holding only that relation; a click with Shift adds the relation to the current step, or takes it out when it is there already, unless it is the step's only one. Enter on a selected relation records it and follows it; Shift+Enter adds it and stays. Turning recording on goes to the last step, so steps recorded follow it. Each click is sent as `update-scenario` inside a labelled batch ("Record step 3 of “…”"), so each one undoes on its own, and the next click is worked out only once the change of the one before it is back.
- **Highlights go through the emphasis store.** Playback sets the `playback` source: the step's relations and the shapes of their ends, or, for an end hidden inside a collapsed container, that container's shape, by its scene key; and a marker on each of the step's relations that the view draws as a line.

We chose this because the scenario files stay plain data that reads the same at every level of detail, the same timeline serves the app now and Claude's play and step tools later, and nothing a viewer does while playing can reach the files or the history.

## Considered options

- **Storing aggregated steps, or a playback position, in the scenario file**: rejected. Aggregation depends on what each view collapses, which changes while reading; a stored position would make playing an edit.
- **Playback held by the local program, shared by every tab**: rejected for v0.1. Each tab plays at its own pace; wave 2's play and step tools for Claude will drive a tab's session through live guidance instead.
- **Recording locally and saving the scenario when recording stops**: rejected. A refresh would lose the steps, Claude's edits meanwhile would be overwritten, and undo could not take back one click.
- **Aggregating a broken step with the steps around it**: rejected. Its missing relations have no ends to place, and it would hide what needs fixing.

## Clarifications

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

- 2026-10-26 (W49): **playback brings the step it plays into view.** Dogfooding found a step off screen playing unseen, from the panel and from `go_to_step`. When the step's relations and the shapes they run between are not wholly on screen, with 48 pixels around them, the camera moves to them with a tour's move (ADR 0058): eased over 250 ms and 150 ms more per screen width, at most 700 ms, and a cut past three screen widths or under reduced motion. It pans at the zoom it has when they fit there, and zooms out to show them all when they do not. A step the person or Claude asks for, by playing, stepping, going to a step or opening a scenario, from the panel or by guidance, always comes into view; while playback goes on by itself, each step does too, until the person moves the camera, after which playback leaves the camera to them until they play or step again. A step an address or a tour puts playback on moves nothing, since they place the camera themselves, and nor does playback while a tour plays (`scenarios/follow.ts`; the session counts the steps asked for, `ScenarioState.asks`, and an address's guidance is quiet). The read-only page does not follow yet. Considered: following every change of step, rejected, since an address with a camera and a step would lose its camera; moving the camera only when the step is wholly off screen, rejected, since a step half shown hides the end it travels to.
