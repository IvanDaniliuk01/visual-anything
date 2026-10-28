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

## Clarifications

- 2026-10-27 (M11c's seam 1, in the main session):
  - **The path's zoom-out is measured against the wider of its two views.** A path that zooms out more than 2.5 times beyond the end that shows more cuts, so that zooming in to a detail or out to an overview glides when its length allows, and a pan of about four and a half screen widths at one zoom is the longest that glides. The path's length S is `tourCameraPath`'s, d3's `interpolateZoom` with ρ = 1, and a move lasts 250 ms plus 150 ms for each unit of it.
  - **The stages never pass 1.1 s by overlapping.** Out (150 ms), camera (up to 800 ms) and in (200 ms) would reach 1.15 s; when they would pass 1.1 s, the marks start to fade in that much before the camera stops. With Fades off, the fades take no time and a cut is plain; the camera still moves.
  - **A step marks at most 500 elements and relations, its reveals' included**, and brings in at most 50 reveals, each marking one at least, each id once. A reveal's text is plain text of at most 4,000 characters, counted in the tour's text.
  - **`advance`** is a whole number of milliseconds from 500 to 600,000, or `after-scenario` on a step that plays one. The stage waits at least the time its text takes to read at 200 words a minute (`advanceAfter`): a shorter advance is kept and `check_tour` says it.
  - **What is never written:** a caption's place `auto` and `dimRest: false` are left out, as defaults are.
  - **`checkTour` reads filters by the components and relation types they hide**; a relation is hidden with the component of either end. Their conditions and time ranges are the canvas's to judge, so it says nothing of them. It reads marks outside a camera only where the caller says where shapes are drawn, against a reference screen of 1,366 by 768 pixels unless another is given, and calls a scenario range of more than ten steps long.
- 2026-10-27 (M11c's task "Tours on the canvas"):
  - **The out stage fades under a capture of the frame before.** At the press, the canvas copies the frame it shows, the new step's filters, focus, `dimRest` and scenario apply under it, and the copy fades out over 150 ms while the camera waits: what the step hides or dims, and the marks it drops, fade out together. Each tile's dimming so arrives at its value through the fade, at the cost of one opacity a frame whatever the number of tiles; animating each tile's own opacity would have made PixiJS write again the colors of every shape it dims, each frame.
  - **The capture** is a 2D canvas of the drawing buffer's size, copied from the WebGL canvas just after a frame drawn for it, laid over the canvas without taking the pointer, faded by its opacity and removed when the fade ends. A capture taken while another still fades goes under it.
  - **Where the camera cuts**, a second capture of the frame as the out stage leaves it is held over the cut, until the canvas has drawn its next frame after the cut and the camera's stage has come, and then cross-fades over 200 ms; it waits for that frame at most 1.5 s. Into another view, and under reduced motion, every move cuts, so the frame before is held from the press instead and no out stage shows. A step whose move never comes, as without a canvas, comes in 1.5 s after its out stage. Playback bringing a step into view (`follow.ts`) and the Tours panel's Show cross-fade their cuts the same way; with fades off, cuts are plain.
  - **The camera** moves along `path.at(tourEase(t))`, worked out from the canvas's cameras as they are rather than rounded as an address keeps them, after the out stage. A step whose camera is already where the canvas looks, within half a pixel and a thousandth of its zoom, stays, as two steps with the same view state do.
  - **The marks both steps mark stay through the transition**; the others wait for the in stage and fade in, by the opacity of a layer of their own, over 200 ms (`Emphasis.arriving`, drawn apart from what is already marked). What another source already highlights does not fade in again, and what arrives keeps fading while other sources change, as a travelling marker does every frame.
  - **A press during a transition finishes it**: the camera jumps to where it goes when it has not arrived, the captures go, and the marks and caption show; the next transition then starts from there.
  - **Reveals.** A press forward brings the next reveal's marks in over 200 ms; with `dimRest`, the dimming changes under a capture that fades over the same 200 ms. A press back fades out, over 150 ms, a capture of the frame that showed the reveal. Back from a step's start goes to the step before with all its reveals shown; Home, End and going to a step land at the step's start. The stage's Next control stays on while the last step has reveals left, and Previous while the first step shows one.
  - **`dimRest`** dims every shape, line and free shape the view draws but what the step marks with the reveals shown so far, and the ends of the relations among them; the collapsed container or aggregated relation that shows one of those stays at full strength with it. Unlike focus, the relations on a marked element stay dimmed, and reveals not yet shown are dimmed with the rest.
  - **The caption** fades out over 150 ms with the step left's text, is away until the in stage, and fades in over 200 ms with the new text, by its opacity, under reduced motion too. The first step's caption shows at once.
  - **The travelling marker's trail** runs from where the marker was 150 ms before to where it is, at most 56 pixels on screen, in six pieces that fade and narrow away from it, so that it shortens to nothing as the marker slows to its end. A paused marker, and one under reduced motion, has none. The time per step stays ADR 0031's.
  - **The preferences' inputs.** `useTourPlayback` takes `reducedMotion`, the system's unless given, and `fades`, on unless given; `PlaybackFollow` takes `fades` the same way. The Motion and Fades preferences that give them are the stage's task.
- 2026-10-27 (the canvas task's questions, answered by the main session): a tile's dimming arrives through the out stage's cross-fade of the frame before, not by animating each tile's opacity, which would recolor every dimmed shape each frame; the camera stays when it already looks where the step goes, so a step after the person looked around takes the camera back; pressing back from the start of a step lands on the step before with all its reveals shown, as a slide's builds do, while Home, End and the steps' index land at a step's start.
- 2026-10-27 (M11c's task "The stage"):
  - **The keys.** Enter goes forward with the other forward keys, and Shift+Enter back, as Shift+Space does. I, P, R and B are read whatever their case. Escape closes the steps' index while it is open, wherever the focus is, and ends the tour otherwise; the controls' End the tour ends it either way. The speaker notes window takes the same keys.
  - **The scenario's card** sits in the caption card, under the caption: "Plays “{name}”", the step playback is on by the scenario's own numbering ("Step {n} of {total}") and that step's description, then Pause or Resume, and Play again. Once the range is done, played to its last step or let go, the card offers only Play again, and P plays the range again as R does. The range ends when playback passes its last step, which it then goes back to, or stops on it at the scenario's end. A pause or a close from anywhere else, as Claude's guidance, still lets the range go. The card shows only with the step's own caption, not over the caption of the step left while it fades out.
  - **A step without a camera that plays a scenario** frames the rectangle around every step of its range, each step its relations' lines and the shapes they run between as playback highlights them (`scenario-frame.ts`), worked out from the scenario's timeline over its view as stored, with 48 pixels around it, as playback follows, and at most the canvas's fit zoom of 2. The frame takes the place of the step's selection and of the whole view (`Travel.frame`); with nothing of the range drawn, the selection or the whole view shows as before.
  - **A step with a camera that plays a scenario**, once its transition is over, brings each step of the scenario that falls outside the step's camera, with 48 pixels around it, into view with the tour's bounded move: panning at the zoom it has when the step fits there, zooming out otherwise. A step that falls inside the step's camera takes the camera back to it. The tour does this itself (`step-camera.ts`), so the scenario panel's follower stays held during a tour, and the read-only page's tours follow too.
  - **Looking around.** The camera moved by the person is one that changes while no move of the tour's is under way, or that is not where the tour's last move left it, within half a pixel and a thousandth of its zoom, 50 ms after that move should have ended; the moves bringing the scenario's steps into view are the tour's. From then on the controls offer Back to the step (B), playback leaves the camera to the person, and advancing goes on. Back to the step takes the step's camera back with the bounded move, cutting with a cross-fade past its bounds or under reduced motion. A step whose view is gone, or which moves no camera, offers none.
  - **The steps' index** is a dialog over the controls, opened from the controls' Steps button and with I: each step's number and caption title, the step shown marked as current and given the focus. The up and down arrows, Home and End move among them; a click, Enter or Space goes to that step's start and closes the index; Escape or I closes it, and the focus goes back to the stage.
  - **Reveals' texts** follow the caption's text, each its own paragraphs of plain text, fading in over 200 ms as their marks do (at once with fades off). While the step left's caption fades out, it keeps the reveals it showed.
  - **Where the caption sits.** Its sides are the bottom, as before, the top, the right and the left, at a side 25rem wide. The farthest side is the one with the most room beyond the rectangle around the marks on screen, those revealed so far included (each shape's rectangle and each line's route, clipped to the screen), measured in the card's height along the top and the bottom and in its 25rem at the left and the right; ties go to the bottom, then the top, the right and the left, and with no mark on screen the card stays at the bottom. The card takes its side afresh when a step's camera stops and after Back to the step; after a reveal, or a move bringing a scenario's step into view, it moves only when it would come within 8 pixels of a mark. A corner the caption fixes is 25rem wide too.
  - **Advancing by itself.** A step with a number of milliseconds spreads its reveals evenly over that time: one press forward every `advanceAfter` ÷ (reveals + 1) ms, the last one going to the next step. A step that advances after its scenario goes to the next step once its range ends, passing over the reveals it has left. Advancing waits until the step's transition, or a reveal's, is over; while the person paused it; while the step's scenario is paused from the card; and while the steps' index is open. The time already waited counts again when it resumes. The person's pause holds from step to step until they resume it. The pause control is in the controls whenever there is a step or a reveal to advance to, and pauses advancing alone, a scenario the step plays playing on; P pauses advancing on a step that plays no scenario, and on one that does pauses the scenario, which holds advancing with it.
  - **What screen readers hear** comes from a status region of the stage's own; the card is no longer a live region, so that a caption changing on a timer is not read out. The person's press to a step, by a key, a control, the steps' index, the tours panel's Play or `play_tour`, says "Step {n} of {total}: {title}", its text, the texts of the reveals it lands with, and "Marks {names}." for what it marks with them; a reveal brought in says its text and what it marks; pausing the step's scenario says "Paused on step {n} of {total} of “{name}”: {description}". Advancing by itself, the scenario playing on and a reveal taken away say nothing.
  - **Motion and Fades** are set in the tours panel, under the list of tours ("How tours and scenarios move"): Motion as three choices, As the system says (saying which it is now), Reduced and Full, and Fades as a checkbox. They feed the shell's tour playback, the view state's glides, and, through `MotionContext`, the scenario panel's follower and its travelling markers. The read-only page has no program to keep them, so its tours follow the system's setting with fades on, as before (ADR 0032's clarification of the same day).
- 2026-10-27 (the stage's questions, answered by the main session): a timed step shares its time evenly among its reveals, and a step that moves on after its scenario brings in its reveals only by presses; pausing advancing holds from step to step until resumed, and a scenario's pause holds for its step; **advancing also waits while the person looks around**, until Back to the step or a press, keeping the time it waited; the read-only page follows the system's motion with fades on; **the Motion preference also governs layout's animation and the stylesheets' motion**, which read it from `data-motion` on the page when the person chose Reduced or Full; and the Motion and Fades preferences show in the scenario panel too, since they govern its markers and its camera.
- 2026-10-27 (the user, on "The heart": the scenario panel's options looked out of place): the Motion and Fades preferences show in the tours panel only, as the stage's task placed them; the scenario panel keeps to its scenario.
- 2026-10-28 (M11c's task "Claude"):
  - **The tour tools' new keys.** `create_tour`'s steps, `add_tour_step` and `update_tour_step` take `reveal` (a list of `{ marks, text? }`), `dimRest` (a boolean), `place` (the caption's corner, or `auto`) and `advance` (milliseconds, or `after-scenario`), each described with an example. The caption's place sits beside its title and text, as the tools already flatten the caption. Nothing is written with its default: an empty list of reveals, `dimRest: false` and `place: "auto"` are left out, and `update_tour_step` takes a step's reveals or advancing away with `null`, its dimming with `false` and a fixed corner with `auto`. What the core refuses comes in its words, as "Reveal 1 of the step marks elements and relations, and "nothing" is neither."
  - **Their answers say how the step plays.** `add_tour_step` and `update_tour_step` answer `check`, the step's camera (`glide`, `cut`, `stay` or `fit`) and the words of its warnings from `checkTour`, without marks outside its camera, which needs the scene; `check_tour` reads those.
  - **`check_tour`** reads a tour on a screen of 1,366 by 768 pixels unless given another (320 to 16,384 by 240 to 16,384), and changes nothing. It answers each step's number, id, caption title, camera and warnings (`kind`, `message` and `subjects`, as the core gives them), how many warnings the tour has, and `cuts`, the steps after the first that cut, whatever the reason, into another view included. Since its name starts with neither get, list, find, read, preview nor export, the tools' rule on the names of the tools that only read gains `check`.
  - **Marks outside a camera are read from the app's own scene.** The entry point imports `buildSceneAfresh` from the app's pure scene code, as `align_shapes` and the exports do, and builds the scene of each view a step names, once per call: an element is where its shapes are, all of them, or where the outermost collapsed container that holds it is drawn; a relation where its line is, or the aggregated line that stands for it, or else the shapes of its ends; what the view does not draw has no bounds, and nothing is said of it. Containers the canvas expands as it zooms in (ADR 0055) are read collapsed, as the view stores them. On the 10,000-element benchmark view the scene takes about half a second to build and the check about 70 ms, so `boundsOf` stays.
- 2026-10-28 (M11c's task "View states, addresses and tours' `play` with choices", which took the Tours panel's warnings):
  - **The Tours panel says what `check_tour` says.** Under each step of the open tour, a list ("What to look at in step {n}") gives `checkTour`'s warnings in the language read in: where it cuts within its view, marks outside its camera or hidden by its filters, a caption longer than its advance lets one read, a step that could be a reveal of the one before, and a long scenario range. A broken step's warning is left out there, since the step's own list of what it names that is gone says it in full. A step that cuts into another view, as every such step does with a cross-fade, says so in the same list without counting as a warning. Above the steps one line counts the warnings: "Read on a screen of 1366 by 768 pixels: 3 things to look at, under their steps.", or "nothing to look at".
  - **The same check, from the same scene.** The panel reads the tour on the reference screen, as `check_tour` does unless given another, and reads marks outside a camera from `app/src/tours/drawn-bounds.ts`, which `check_tour` now imports in place of its own copy: each view's scene built afresh with its containers collapsed as stored, and kept for that view while the model, the packages, the project's appearances and the language stay as they were, so that an edit to a tour builds no scene again.
  - **Never per frame.** The check is worked out once for each tour and project, and only while the Tours tab shows; a scene is built only for a view that a step with a camera and marks names.
  - **Long ranges** count only the steps that play with the step's choices (ADR 0078).
- 2026-10-28 (M11c's review): **`tourTransition(move, { fades })`** is the core's signature, the camera's move given as `tourMove` makes it or `stay`, rather than the `(from, to, travel, reduced)` this ADR first named. **`checkTour` reads a step's camera as the stage plays it:** it stays when it is where the step before left it, within half a pixel and a thousandth of the zoom; after a step that keeps no camera it `follows`, starting wherever the canvas framed that step, and says no cut. **Each id is marked once in a step**, by its marks or by one of its reveals, so that a reveal always brings in something new.
