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
