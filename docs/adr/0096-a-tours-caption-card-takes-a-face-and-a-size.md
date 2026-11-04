---
status: accepted
---

<!-- Asked by the user on 2026-11-04, right after ADR 0095: "quiero poder editarlo con HTML y css que ya tenemos y además darle la forma que yo quiero es decir agrandarlo horizontal, vertical o diagonalmente". Decided by Claude under the user's standing delegation of design decisions. -->

# A tour's caption cards take a face, the tour's or each step's own, and each step's card a size

ADR 0095 let the person drag the caption card. They also want to style it with the HTML and CSS the app already has, which are faces (ADR 0083), and to make it wider, taller, or both.

## Decision

### The card's look is a face, the tour's or the step's own

- **`TourFile.captionFace`** holds `markup` and, optionally, `style`, in the same lines and subset as a component's face. Every step without a look of its own takes it, so that a tour's cards can look alike without repeating it.
- **`caption.face`** is a step's own look, in the same shape, which it takes in place of the tour's. The user asked for it on 2026-11-04: "yo pensé que cada paso podía tener su propio rótulo y su propia configuración".
- Both have a face's caps, and the core refuses markup or style that the subset refuses, at its line and column, as it does for a component's face.
- **What it is filled from:**
  - `{{name}}` is the step's title, and `{{component}}` the tour's name;
  - `{{text}}` is the caption's text, with its emphasis;
  - `{{step}}` and `{{steps}}` are the step's number and the tour's count of steps;
  - like any face's slots, `{{text}}` and the others write text, never markup.
- **It is laid out and drawn by the faces' own engine**, never by the browser (ADR 0083's reasons hold). The stage writes its drawing into the card as SVG, as the SVG export writes a shape's face. The palette is the card's: its background and the theme's text colors.
- **What the face leaves out stays outside it.** A reveal's text, the note that a mark is off the canvas, a step's problems and the scenario's card are drawn below the face, as today. Screen readers still hear the title and the text, as before.
- **The tours panel edits both.** "Look of the tour's captions" sits under the open tour, and "Look of this caption" under each step. Each has the markup and the style in text areas, the problems at their lines, a preview on a step's caption, Apply as one `update-tour`, and Remove. A step's Remove goes back to the tour's look. A step's new look starts from the tour's, when there is one, and the tour's from a starting face.

### Each step's card can be resized

- **While a tour plays in the app, the card has handles on its four sides and four corners.** A side handle changes the width or the height, and a corner handle both. On release, the step keeps its size, and its place where the card now is (ADR 0095), as one `update-tour`.
- **`caption.size`** is `{ width, height? }`, as fractions of the screen kept to three decimals: the width from 0.1 to 1, and the height, when given, from 0.1 to 1. Without a height, the card is as tall as its content. A card is never less than 160 by 64 pixels. Where the content does not fit, the card scrolls, and a face is cut where it overflows.
- **The tours panel** shows "Size: N % by M %" when a step has one, with "Fit to its content", which removes it.

## Consequences

- `TourFile` gains `captionFace`, and `TourCaption` gains `face` and `size`. Version 9 of the live protocol takes them too, since no build of 9 has shipped (ADR 0095).
- Claude reads both as the file holds them. Its tools do not set them yet.
