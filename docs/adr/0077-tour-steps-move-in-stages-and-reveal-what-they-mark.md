---
status: accepted
---

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

# Tour steps move in stages, fade where they cut, and reveal what they mark

A tour step today glides its camera for at most 700 ms and three screen widths, cuts past that, and changes everything else at once: filters, dimming, marks and caption. Under reduced motion every move is a cut. A step that plays a scenario cannot be paused while the stage hides the scenario's panel, which fails WCAG 2.2.2 (Pause, Stop, Hide, level A), and its scenario's steps off screen play unseen, since ADR 0031's W49 clarification turns following off while a tour plays. The research on tours (Heer and Robertson's staged transitions, van Wijk and Nuij's smooth zooming and panning, Segel and Heer's narrative visualization, Ilograph's and IcePanel's walkthroughs, Keynote's builds) points to the same remedies. This ADR supersedes two parts of ADR 0058, its camera rule and its keys, and the part of ADR 0031's W49 clarification that keeps playback from following during a tour. Everything else in ADR 0058 stands: tours are files of view states, played full screen, and playing changes nothing.

## Decision

### A step's transition comes in three stages

- **Out, 150 ms:** what the new step hides or dims fades out, and so does the old caption.
- **Camera, 250 to 800 ms:** the camera moves along a smooth zoom-and-pan path, or the canvas cross-fades where the step cuts.
- **In, 200 ms:** the step's marks fade in, by the opacity of their halos and never by their scale, and the new caption fades in.

The stages come from a pure function of the core, `tourTransition(from, to, travel, reduced)`, which returns them and their durations; they never sum past 1.1 s. Pressing forward or back during a transition finishes it at once and starts the next: transitions never queue. Dimming is a value the transition arrives at, per tile, rather than a jump.

### The camera's path

- **Smooth zooming and panning** (van Wijk and Nuij, as `d3.interpolateZoom` draws it), with ρ = 1, timed by a sinusoidal ease rather than a cubic one, so that the speed on screen peaks at about half.
- **Bounded, so that it never becomes a flight:** the path zooms out at most 2.5 times beyond the nearer of the two zooms, lasts 250 ms plus 150 ms for each unit of the path's length S, and at most 800 ms. A move whose path would pass either bound cuts. This replaces ADR 0058's three screen widths: moves of up to about four and a half screen widths now glide.
- **A cut cross-fades** the frame before into the frame after over 200 ms: the canvas keeps a capture of the last frame drawn, at the screen's size, over the new state until the new view has drawn its first frame, then fades it out. Waiting for a layout or another view's first frame is capped at 1.5 s, after which it fades anyway. The capture is let go when the fade ends. Its cost does not grow with the number of shapes.

### Reduced motion, and the person's own preference

- Under reduced motion nothing moves: every camera change cuts, and the cut cross-fades, since a change of opacity is not motion. Travelling markers stay still, as ADR 0031 has them.
- The program's preferences (ADR 0032) gain **Motion**: as the system says, reduced, or full; and **Fades**, on or off. With fades off, cuts are plain cuts and the stages' fades are instant.

### A scenario played in a step

- The stage's card says which scenario plays, the step it is on and that step's description.
- **Pause and resume** (the card's button and P), and **play the range again** (R). A pause asked for from the card keeps the step's range: resuming still stops at its `to`.
- **Its steps come into view.** A tour step without a camera frames, once, everything its range plays (the union of each step's bounds), and nothing moves after that. A step with a camera keeps it, and playback brings into view the scenario's steps that fall outside it, with the same bounded move. This supersedes the part of ADR 0031's W49 clarification that keeps playback from following while a tour plays.

### Reveals, and dimming the rest

- **A step may reveal its marks one at a time.** `TourStep.reveal` lists reveals, each a list of marks with an optional text added to the caption as a paragraph. Each press forward adds the next reveal, fading its marks in; each press back takes the last one away. The term is **Reveal**.
- **`TourStep.dimRest: true`** dims everything the step does not mark, except the ends of the relations it marks.
- **Two steps in a row with the same view state** play as one continuous scene: the camera stays and only the marks and the caption change.
- The core counts the ids a reveal names in a step's problems, as it counts marks, keeps reveals that name what was deleted and marks them, and counts their texts within `MAX_TOUR_TEXT`.

### Keys, supersedes ADR 0058's

- Every key that goes forward (the right and down arrows, Space, Page Down, Enter) goes one reveal at a time, and to the next step after the last reveal; every key that goes back goes one reveal back. Wireless presenters send Page Down and Page Up, so they step through reveals too.
- Home and End go to the first and the last step; **I** opens the steps' index, a list of the steps' titles to jump to; **P** pauses and resumes a scenario the step plays, **R** plays its range again; **B** goes back to the step's camera after the person moved it; Escape ends the tour. Keys with Control, Alt or Meta stay the browser's, as before.

### Looking around, and coming back

- The person may pan and zoom the canvas during a step, as `PlaybackFollower` tells their moves from the tour's. The stage then offers **Back to the step** (B), which restores the step's camera. Moving forward goes to the next step's state, as now. The panels stay hidden: looking around never edits.

### Captions that do not cover what they explain

- When the camera stops, the caption takes the side of the screen farthest from the step's marks. `TourCaption.place` (`auto`, the default and never written, or a corner) fixes it by hand.

### Advancing by itself

- `TourStep.advance` (optional) moves on after a number of milliseconds, never less than the time its caption takes to read at 200 words a minute, or after the scenario its step plays ends. Advancing is manual by default. The stage shows a pause control whenever a step advances by itself (WCAG 2.2.2).

### What screen readers hear

- The card says what the step marks ("Marks {names}.", the text the panel already has), each reveal as it comes, and, when paused, the scenario's step. Nothing is announced on a timer.

### Claude, and checking a tour

- `add_tour_step` and `update_tour_step` take `reveal`, `dimRest`, `caption.place` and `advance`.
- **`check_tour`**, and the same warnings in the Tours panel, read a tour against a reference screen and say, step by step: whether it glides or cuts; marks outside its camera or hidden by its filters; a caption longer than its `advance` lets one read; steps in a row with the same view state, which could be reveals of one step; long scenario ranges; and broken steps. A pure function of the core makes them.

### Travelling markers

- A travelling marker leaves a short fading trail behind it, which shows its direction. It keeps ADR 0031's time per step.

### Files stay compatible

- Every new key is optional, and none is written with its default value, so that a tour that uses none of them is written byte for byte as now. A tour that uses one does not open in a version that does not know it, as with every format change since ADR 0022.

### Later, each under its own ADR

- Recording a tour to video (MP4 or WebM, with its captions as WebVTT), shapes moving by id between steps and views as Keynote's Magic Move does, narration, a speaker's pointer, and tours that call other tours.

## Considered options

- **Keeping cuts as they are and only fading the caption**: rejected. The cut, not the caption, is what loses the person between steps.
- **Long zoom-out flights between distant places**, as Prezi draws them: rejected, as the spec already does. The bounds keep the path to a short arc.
- **Builds as extra steps only**, by duplicating a step and adding a mark: kept as what two steps with the same view state now play as, but not as the only way, since a step's caption and range would then be copied each time.
- **Moving shapes between steps by id now**: postponed. It is the most striking change and also the costliest, and the cross-fade covers its cases meanwhile.
- **A tolerant reader that keeps unknown keys**: rejected. It conflicts with validating every file on open.
- **Pausing every scenario at each step of a tour**: rejected. A tour plays on unless the person pauses it.

## Consequences

- The schema gains `TourStep.reveal`, `TourStep.dimRest`, `TourStep.advance` and `TourCaption.place`, all optional; the schemas are regenerated and the format stays at version 1.
- The core gains `tourTransition`, the bounded camera path in `core/src/tours/camera.ts`, the checks behind `check_tour`, and the counts of reveals in a step's problems.
- The canvas gains a capture for cross-fades, fades of tiles' dimming and of the emphasis marks, and the marker's trail.
- The app's stage gains the scenario card with pause, the index, Back to the step, reveals, caption placement, advancing and its announcements; the preferences gain Motion and Fades.
- Claude's tour tools take the new keys, and `check_tour` is added.
- The benchmark gains a tour phase on the 10,000-element view: a step that filters, dims, moves the camera and reveals.
- ADR 0058 and ADR 0031 each gain a "Superseded in part" section, and CONTEXT.md gains **Reveal**.
