---
status: accepted
---

<!-- Asked by the user on 2026-11-04, with a screenshot of a leader line running diagonally from a caption card's corner to a relation's label: "esto se debería de poder modificar también, fijate que queda raro el tema de la referencia". Decided by Claude under the user's standing delegation of design decisions. -->

# A caption's leader line takes a shape, an end and a side

A caption that points at a mark draws a leader line (ADR 0084). It runs straight, from the card's point nearest the mark to the mark's point nearest that, and ends in a dot. When the card sits beside and above its mark, the line leaves from a corner and crosses the view diagonally, and nothing about it can be changed.

## Decision

- **`caption.leader`** holds how a step's line is drawn. Each part left out keeps today's drawing:
  - `shape`: `straight`, as today, `elbow`, which runs out of the card and turns once at a right angle, or `curved`, which leaves the card square to its side and bends to the mark;
  - `end`: `dot`, as today, `arrow`, or `none`;
  - `from`: the card's side it leaves from, `top`, `right`, `bottom` or `left`, at that side's middle. Left out, it leaves from the card's point nearest the mark, as today.
- **The line still ends on the mark's point nearest where it leaves**, follows the camera and the card, and hides when the mark is off the canvas (ADR 0084).
- **The tours panel** shows three choices under "The caption points at" once a step points at something: the line's shape, its end, and the side it leaves from.
- **Claude** reads it as the file holds it. Its tools do not set it yet.

## Consequences

- `TourCaption` gains `leader`. Version 9 of the live protocol takes it, since no build of 9 has shipped.
