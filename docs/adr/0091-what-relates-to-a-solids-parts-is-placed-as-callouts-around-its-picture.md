---
status: accepted
---

<!-- Agreed by the user on 2026-11-02, from a screenshot of the robot-arm sample's "Structure" view: "capaz hay que tener otra estrategia de cómo determinar la estructura". Of callouts around the picture, a kinematic chain as a tree, or both, the user chose callouts. -->

# What relates to a solid's parts is placed as callouts around its picture

A shape that shows a solid draws its anchored parts inside its picture (ADR 0075, 0067). Elements that are not parts but relate to them, such as the motors that drive the arm's joints and the encoders that sense them, are laid out like any other contents of the container: ELK puts them in rows under the picture, the robot-arm sample's twelve stack on one another, and each relation to a part runs from the bottom up across the picture, its label over the arm. The chain cannot be read.

## Decision

- **A callout is an element in a container that shows a solid with its parts, which is not a part itself and whose relations end on parts.** It is placed around the picture, beside the part it relates to most (the first such relation in the model's order), rather than in the container's layout.
- **Where it goes.** Each callout's part has a point in the picture, the part's point drawn as the picture is drawn (its camera, in the shape's box). The callout goes outward from the picture's middle through that point, just outside the picture's bounds, to the nearest side; callouts on one side keep their parts' order along it and are spaced so that none overlaps another, the side growing the container's room if needed. A callout pinned by hand stays where it is.
- **Its lines are short and stay outside the picture.** A relation between a callout and its part is drawn from the callout to the part's point, entering the picture only at its last segment, and its label is shown on hover and selection rather than always, so that labels never cover the picture.
- **It follows the picture.** Turning the solid (M9) or moving joints (ADR 0090) moves the parts' points, and the callouts' lines follow them; the callouts themselves move only when the view is laid out again, so the canvas stays still while a joint turns.
- **Elsewhere nothing changes:** containers without a solid, solids without parts, and elements that relate to no part are laid out as before (ADR 0080).

## Considered

- **A kinematic chain as a tree, in a view of its own:** not chosen now; the chain can be read in the physical-space panel and through the attachments, and a generated view stays possible later.
- **Badges on the parts instead of shapes:** rejected; motors and encoders are elements with attributes, relations and scenarios of their own, and must stay selectable shapes.

## Clarifications

- 2026-11-02 (M15.4, by a builder):
  - **Which lines count.** A content is a callout when a relation drawn as a line in the view, either way, leads from it to an anchored part of the same drawing: neither a relation the view nests by nor one of a type it leaves out. Its part is the first such relation's, in the model's order. Only drawings of solids have callouts; an SVG image's drawing with parts (ADR 0067) is laid out as before.
  - **Where it stands.** The side is the one the ray from the picture's middle through the part's point leaves by; on that side the callout stands `CALLOUT_GAP` (40) outside the picture, level with the part's point rather than with where the ray leaves, so that its line runs straight in when nothing is in the way. Callouts of one side keep their points' order along it, 16 apart, within the picture's span while they fit and past both its ends alike otherwise. A side whose callouts would run past its span gives those nearest a corner to the side beside it, one at a time, while that side then runs past its own span by less: the robot arm's twelve stand four left, four right, two above and two below, rather than in one long row above. The picture is inset by the room its callouts take left of and above it, positions are on layout's step, and the drawing's other contents go below the picture and the callouts. A drawing whose size the view stores fits its picture to what its callouts leave of its body. `canvas/callouts.ts` places them; the scene places a callout the view stores no position for, and gives each its place (`ElementShape.callout`).
  - **Layout** keeps a callout it may move where the scene puts it, as it keeps a pinned shape, and stores that place (`LayoutShape.callout`), so that layout, the scene and the stored view agree; a pinned callout, or one stored by hand, stays. Callouts move only when the view or the drawing is laid out again.
  - **Lines.** A line between a callout and an anchored part of its drawing, unless routed by hand, leaves the callout's side that faces the picture, turns in the gap before it, nearer the picture the farther it runs along the gap, and enters the picture only in its last segment, at the part's point (`calloutRoute`); the side is the one the callout lies beyond as it stands now, so a callout pinned elsewhere keeps a short line, and one pinned over the picture takes the usual route. Such lines are not routed around shapes (`avoided.ts`). They carry their name as `quietLabel` rather than `label`: the canvas and the read-only page write it while the pointer is on the line or one of its shapes, or the selection holds or touches it, and the SVG and PDF write none.
  - **Following.** While the drawing turns, its callouts' lines are routed again each frame to where the frame shows their parts' points, the same way; the callouts stay. The canvas draws a solid's picture at rest, so joints moved in the physical-space panel (ADR 0090) move no point on the canvas; when they do, the lines follow through the same route.
  - **The sample.** The robot-arm sample's "Structure" view is laid out again with its arm's contents: every motor and encoder beside its joint, none on another, none over the arm (`layout/callouts.test.ts`).
