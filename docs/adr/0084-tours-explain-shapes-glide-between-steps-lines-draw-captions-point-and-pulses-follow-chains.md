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
