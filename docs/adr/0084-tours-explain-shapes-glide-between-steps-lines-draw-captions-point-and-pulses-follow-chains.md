---
status: accepted
---

<!-- Decided by Claude on 2026-10-30 under the user's standing delegation of design decisions. The user asked whether tours should have more animations, agreed with the four proposed, and ranks the work by their real project: a visual explanation of a medical-audit system's data model. -->

# Tours explain: shapes glide between steps, lines draw, captions point, and pulses follow chains

ADR 0077 made a tour step move in stages, glide its camera, fade where it cuts and reveal its marks one at a time. It left for later, "each under its own ADR", shapes moving by id between steps and views as Keynote's Magic Move does.

The user's real tours explain a data model. They go from an overview to one schema, then to the tables of one audit, and they point at the reference that ties two tables. Four things still cost the viewer their bearings:

- **When a step changes view, every shape cross-fades.** The viewer cannot tell that the `case` table on the overview is the one now drawn large in the schema view.
- **A revealed relation appears whole,** so its direction is read only from a small arrowhead.
- **A caption explains a table or a column,** but nothing ties the text to the shape it talks about.
- **Explaining "what follows what"** (a finding belongs to a case, which belongs to a subject) takes one step per link.

## Decision

### Shapes glide between steps

- **A step's transition glides the shapes it shares with the step before,** matched by element id, when the two steps show different views, or the same view with different containers collapsed, scope or filters.
  - **Matching.** A copy of an element drawn in several containers is matched by its container path first, then by the nearest copy.
  - **Movement.** During the camera stage of ADR 0077, each shared shape moves and resizes on screen from its place before to its place after, on the same eased timing as the camera.
  - **Shapes that are not shared.** Shapes only in the step before fade out in the out stage, and shapes only in the step after fade in in the in stage.
  - **Lines** never move: they fade out with the out stage and come back with the in stage, routed as the step after draws them.
- **While it glides, a moving shape is drawn simply:** its kind or free geometry, fill, stroke and name, with no rows, detail, images or face. The full drawing of the step after replaces it over the in stage's 200 ms. This keeps a glide within the frame budget whatever the shapes hold.
- **Bounds.**
  - **Shape count.** At most 400 shapes glide. Past that, the step cuts with ADR 0077's cross-fade, and `check_tour` says so.
  - **Shared shapes.** A step that shares fewer than 3 shapes with the step before cuts too, since there is nothing to follow.
  - **Opting out.** `TourStep.transition: "cut"` makes a step always cut.
  - **Reduced motion and the Motion preference** cut as ADR 0077 says.

### Lines draw from where they start

- **A relation a step marks, or a reveal brings in, is drawn from its `from` end to its `to` end over 400 ms** as it appears, its arrowhead showing when the line arrives.
  - An undirected relation draws from both ends toward its middle.
  - An aggregated relation draws as one line.
- **It starts with the in stage and may run past it.** A press forward during it finishes it at once, as ADR 0077 does with every transition.
- **Under reduced motion,** lines appear whole, at full strength.

### A caption can point at what it explains

- **`TourCaption.pointTo`** names one of the step's marks: an element, a relation, a note or an arrow (ADR 0077's clarification of 2026-10-29).
  - **The leader line.** A thin line in the theme's caption color, with a small dot at its end, runs from the caption card's nearest edge to the nearest point of that mark's shape, or to the middle of a relation's route.
  - **Following the canvas.** It follows the camera and the card's place.
  - **When the mark is off the canvas,** the leader line hides, and the card says that it explains something off the canvas.
- **It fades in with the caption,** and it never crosses the card itself.

### A pulse follows a chain

- **`TourStep.pulse`** holds:
  - `relations`, an ordered chain of 1 to 12 relations in which each shares an end with the next;
  - `repeat`, 1 to 3 times, once by default.
- **What plays.** A marker travels along each relation's drawn route in turn, 600 ms per relation, with ADR 0077's fading trail. It shows what follows what without a step per link.
- **When it plays.** It plays after the step's transition. A press forward during it ends it and moves on, and R plays it again.
- **Problems.** A chain whose relations do not join, or name a relation the view does not draw, is a step problem, kept and flagged as other problems are.
- **Under reduced motion,** the chain's relations are marked in order, 400 ms apart, without a moving marker.

### Files, Claude and checking

- **Every new key is optional,** and none is written with its default value: `TourStep.transition`, `TourCaption.pointTo` and `TourStep.pulse`. A tour that uses none of them is written byte for byte as now, as ADR 0077 keeps it.
- **Claude's tour tools** take the new keys, with examples.
- **`check_tour` and the Tours panel** say:
  - which steps glide and which cut, and why;
  - a `pointTo` that is not one of the step's marks;
  - a pulse that is not a chain.
- **Screen readers** hear the caption as now, then "pointing at …" for `pointTo`, and the chain's names in order for a pulse.

## Considered options

- **Morphing lines between their routes:** rejected. Routes before and after rarely share their bends, and a morph between them passes through shapes. Fading lines out and back is clear and cheap.
- **Gliding the full drawing of every shape:** rejected. Rows, faces and images would be redrawn every frame for every moving shape, past the frame budget at the sizes the user's model reaches. Drawing them simply while they move costs a box and a name each.
- **Gliding every shared shape whatever the count:** rejected, for the same budget. Past 400 shapes the eye cannot follow them anyway.
- **A pulse as a scenario:** rejected. A scenario is a story of the system that is kept in the project and can be played on its own. A pulse only shows a chain within one step of an explanation.
- **Leader lines that avoid shapes:** left for later. A straight thin line, drawn under the card and over the canvas, reads at once. Routing it would cost the router per frame while the camera moves.

## Consequences

- **The schema** gains `TourStep.transition`, `TourCaption.pointTo` and `TourStep.pulse`, with their checks, and the JSON Schema is regenerated.
- **The core** gains the matching of shapes between two scenes by element id and container path, the chain check, and `check_tour`'s new warnings, with property tests: matching is symmetric, and a chain check accepts exactly the joined chains.
- **The app** gains:
  - the glide layer, with its simple drawing of moving shapes;
  - the drawing of lines from their start;
  - the leader line;
  - the pulse, reusing the travelling marker.

  The 10,000-element benchmark gains a phase with a gliding step of 400 shapes.
- **CONTEXT.md** gains **Glide**, a step's shared shapes moving to their places in the step after, and **Pulse**, a marker following a chain of relations in a step.
- **ADR 0077's "Later"** loses "shapes moving by id between steps and views", which this decides.

## Clarifications

<!-- Decided by Claude on 2026-10-30 under the user's standing delegation of design decisions. -->

- 2026-10-30 (M11d's build): what the ADR left open.
  - **Where a glide plays.** A view state keeps no collapsed containers and no scope of its own, and filters hide shapes without moving them, so within one view every shape the two steps share stays where it was on the canvas, and the camera's path already carries it. A glide therefore plays for a step into another view; within one view the camera moves as ADR 0077 says.
  - **Which shapes glide.** Element shapes on screen in their own step, matched among themselves: not rows and not parts anchored in a drawing, which move as part of what holds them (drawn simply, without them), and not what the step's filters hide. A shape leaving the screen, or coming onto it, fades with the out or the in stage. The 3-to-400 bounds count these pairs.
  - **When it plays.** Into another view the frame before is held from the press, as for a cut, until the view after has drawn and the camera has cut there under the glide layer. Then the out stage fades the frame before over the layer, which shows the shared shapes at their places before; the shapes move for 250 ms plus 150 ms for each screen width the farthest one travels, a doubling or halving of its width counting as one, at most 800 ms, on the tour's sinusoidal ease (`planGlide`); and the layer fades out over the in stage while the marks and the caption come in. The stages keep ADR 0077's overlap rule, within 1.1 s from the view after's first frame.
  - **The simple drawing** is a 2D canvas over the WebGL canvas, of the drawing buffer's size, on the canvas's background: a rectangle, a rounded rectangle, an ellipse (a person too) or a cylinder's rounded box, or the free geometry's simplified outline, in the step after's fill and stroke for the theme shown, with the name at 12 px in a color that reads on the fill, cut with "…" to the shape. A press finishes the glide and drops the layer.
  - **Fades off.** The shapes still glide, since that is motion and not a fade; the out and in stages take no time. Lines then appear whole, as the marks they belong to do.
  - **`transition: "cut"`** also cuts the camera within one view, with a cross-fade, and `check_tour` calls that step's camera `cut` without warning of it.
  - **`pointTo`** names a mark of the step or of one of its reveals; with a reveal's, the leader line shows once that reveal is in. Pointing at an id the step's view does not hold is a step problem, refused in a new step as other problems are; pointing at something there that the step does not mark is only `check_tour`'s `point-to-not-mark`. The line is drawn in the card's accent token, 1.5 px, with a 4 px dot, and is left out when the mark lies under the card. The card says "It explains something off the canvas." when the mark is wholly off the screen.
  - **A chain joins by shared end ids.** A relation that ends on another relation shares no end with it, so the marker could not run on: that is not a chain. A relation of a type the view nests by draws containment, not a line, so a pulse cannot run along it. A chain names each relation once. `repeat` is written only as 2 or 3; the schema refuses 1, as it refuses `dimRest: false`.
  - **How the pulse runs.** The marker runs each relation from the end it reached, so a chain may go against a relation's direction. A press forward or back during it ends it, even a reveal's; it does not start again until R. Under reduced motion the relations are marked once, in order, 400 ms apart, whatever `repeat` says, and stay marked while the step shows. A pulse whose chain no longer joins does not play, and its problems are `check_tour`'s `pulse-not-chain` rather than `broken`.
  - **`check_tour`'s glide verdict** (`shapes`) compares every shape each view draws as stored, less what the step's filters hide by component. The stage counts only shapes on screen, so a step into a large view can glide on the stage where the check, which knows no screen before the step's own camera, says `too-many`; the warning errs on that side.
  - **What screen readers hear** after the caption: "Pointing at “{name}”." while the mark is shown, and "A pulse follows the chain: …", each relation as its two ends and its name, in order.
  - **Spanish.** A pulse is "pulso", which the glossary had kept from the travelling marker (it stays "marcador"); a glide is "deslizar".
  - **`escapeText`** on `create_tour`, `add_tour_step` and `update_tour_step` escapes the caption's text, the reveals' texts and the speaker notes; a caption's title is plain text and stays as given.
  - **The benchmark's phase** glides the first 400 shapes on screen at the zoom where shapes draw in full, toward a camera twice as near and half a screen over, drawing one eased frame of the layer a frame while the canvas draws its own.
- 2026-10-30 (after merging M11d): **`check_tour` counts what the stage glides.** For a step that keeps a camera, `check_tour` counts only the shapes that camera shows on its screen, as the stage glides only the shapes on screen. So a step into a large view no longer warns `glide-too-many` when the stage would glide it. A step without a camera still counts every shape the view draws, since the canvas frames the whole view.

<!-- Decided by Claude on 2026-10-30 under the user's standing delegation of design decisions, while fixing the findings of M11d's spec review. -->

- 2026-10-30 (M11d, after its spec review): **a chain is a walk, and what the review found.**
  - **What draws from its start is the highlight:** a relation a step marks, or a reveal brings in, keeps its own drawing whole, and its highlight draws over it from its `from` end, the end's dot showing as it arrives.
  - **A chain is a walk the marker runs without leaping.** Each relation starts at the end the one before left the marker at; the marker may start at either end of the first. Sharing an end with the next was too loose: a star of three relations shares its middle each time, yet the marker would leap back to it.
    - `chainBreak` follows the marker from either end of the first relation, and a chain that breaks says so at the relation where the start that runs farther stops: "relation 3, … does not start where relation 2, … leaves the marker."
    - A pulse stored as a star, accepted before, is now `pulse-not-chain`: kept, flagged, and not played.
    - The schema's comment, "each relation shares an end with the next", stays true of a walk and is left as it is.
  - **Ordering the selected relations is linear.** "Pulse along the selected relations" searched every order, 1.5 s at 11 relations and about 16 s at 12, on the page's thread.
    - `chainOrder` now refuses at once when the relations' ends are not connected, or when more than two ends meet an odd number of them, a star of three or more among them.
    - Otherwise it orders them with Hierholzer's walk, which runs each relation once, from the odd end the earliest relation given has, and keeps the order given when it joins already.
    - Its property tests hold that it orders exactly the relations some order joins, each once, and that 12 relations given in the worst orders take under 5 ms.
  - **The glide layer writes names in the canvas's own Roboto,** `Visual Anything Roboto`, with the system's fonts after it until it loads (`SANS_FAMILY`, which the canvas's labels and text emphasis share).
  - **What screen readers hear is never an id.**
    - A caption pointing at a note says its first six words, "…" after them when it says more: "Pointing at the note “Every booking goes through the API…”."
    - One pointing at an arrow says "Pointing at an arrow."
    - A relation without a name is said by its type's name, in "Pointing at …" and in the pulse's chain.
  - **The leader line's 1.5 px** stays written out in `tours.css`: no token gives a stroke's width. A4 takes it up with the other values written out.
  - **The glide's numbers** are recorded in `docs/designs/benchmark-7.md`, measured in Node: working out a glide of 400 shapes before against the step after takes about 2 to 3 ms, once, and a frame of the layer's own work under 2 ms at the median for 400 shapes. The frames on a real canvas wait for the next browser run.
