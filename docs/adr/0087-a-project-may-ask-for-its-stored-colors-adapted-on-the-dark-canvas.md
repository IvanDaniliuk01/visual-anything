---
status: accepted
---

<!-- Agreed by the user on 2026-11-02, who chose the option over "adapted by default" and over closing the proposal: ADR 0086's "Proposed, not built until the user agrees". -->

# A project may ask for its stored colors adapted on the dark canvas

ADR 0033 draws every stored color exactly as stored in both themes. On the dark canvas that makes a pale note, a pink trigger or a light fill a package stored glare as a white block among dark ones, which is what A5 found on the user's model. ADR 0033 rejected a dark variant beside each stored color, since it doubles every appearance, command and tool, and it rejected moving built-in colors to mid-tones. This ADR supersedes ADR 0033's "drawn exactly as stored in the light theme and the dark theme alike" for the projects and views that ask for it, and only on the dark canvas.

## Decision

- **A drawing default, `storedColorsInDark`, is `"as-stored"` or `"adapted"`** (ADR 0086). Every preset has `"as-stored"`, so nothing changes for a project that does not ask. A project may set it, and a view may set it again for itself, through `set-drawing-defaults`, the Drawing panel and Claude's `set_drawing`, as any other drawing default.
- **Adapted means a stored color's lightness is turned for the dark theme, its hue and chroma kept.** In CIELAB, the lightness L\* of a fill becomes `100 − L*`, with a and b kept and the result brought back into sRGB by lowering chroma until it fits. Strokes, a tint and the colors of notes and free arrows are turned the same way. Text on a shape keeps taking the color that reads on the fill it is drawn on, and a stroke that falls under 3:1 against its adapted fill is outlined as ADR 0033's W49 clarification says. Turning twice gives back the stored color, so the light theme and the dark theme never drift apart.
- **Adapting only draws.** No command, file or tool result changes a stored color. The light theme always draws them as stored. Claude's tool results and the inspector show the stored color, and say what the dark canvas draws when that differs.
- **The same module resolves it for everyone.** `core/src/drawing.ts` resolves the setting with the other drawing defaults; one pure function in `core` turns a color, so the canvas, the read-only page, the SVG and PDF exports and `capture_view` draw the same adapted colors in the dark theme. The inspector's color picker, on the dark canvas with adapted colors, shows the stored color with the color it is drawn in beside it, and picking compares with what the shape would show, as ADR 0033's A2 clarification says.
- **Tests hold it:** turning twice is the identity within one step of each channel (a property test), adapted fills keep 3:1 for marks against the dark canvas where the stored fill kept 3:1 against the light one, built-in colors, which already have a dark shade, are left as they are, and the frame budget holds, since a theme switch already draws again the tiles whose colors change.

## Considered

- **Adapted by default:** rejected by the user. A project's colors stay what its author picked unless it asks.
- **A dark variant beside each stored color:** still rejected, for ADR 0033's reasons.
- **Inverting the color whole:** rejected. It turns the hue, so a red trigger would draw cyan.
