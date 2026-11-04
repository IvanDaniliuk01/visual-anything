---
status: accepted
---

<!-- Asked by the user on 2026-11-04, while editing "La charla" in "El mapa de la consulta": "quiero poder [poner] el rótulo donde yo quiera porque a veces me molesta en la visualización". Decided by Claude under the user's standing delegation of design decisions. -->

# A caption card sits where the person drags it

A tour's caption card takes the side of the screen farthest from the step's marks (ADR 0077), or a corner that the step's caption fixes. Only Claude could fix a corner: the tours panel offered none. When the side the stage chose covered something the person wanted to show, they could not move the card.

## Decision

- **While a tour plays in the app, the caption card can be dragged.** On release, the place is kept in that step's caption as one `update-tour`, which the person can undo. A press on the card's controls, such as a scenario's, or on a link in its text, still presses them. A move under 4 pixels is a click, not a drag. The read-only page (ADR 0041) plays tours without dragging.
- **The place is stored as fractions of the room the card leaves.** `caption.place` may be `{ x, y }`, each from 0 to 1, kept to three decimals: 0 puts the card's left or top edge at the screen's, and 1 its right or bottom edge at the screen's. So a card placed on a wide screen stays whole and in the same relative place on a smaller one. The stage draws it with `left: x × 100%` and `translate(−x × 100%)`, so it needs no measuring. At such a place, the card is as wide as at a corner.
- **The tours panel says where each step's card sits.** Under the step, "Where the caption sits" offers Where it reads best (left out), the four corners, and "Where it was dragged" when the step has a dragged place. Choosing one of the others replaces the dragged place.
- **Playing still changes nothing else** (ADR 0058). Dragging the card is the one edit made from the stage, because the person can only judge the place while the tour plays.
- **Claude** reads the place as the file holds it. Its tools still fix only corners, or `auto`.

## Consequences

- `TourCaption.place` gains the `CaptionAt` shape in the schema and in the core's checks. An older build refuses a tour that holds one, so the live protocol goes to version 9.
- The leader line (ADR 0084) starts from the card wherever it was dragged.
