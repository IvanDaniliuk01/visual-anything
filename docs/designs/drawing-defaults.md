# A5 · The Clean look and drawing defaults: design

Date: 2026-11-02. ADR 0086 decides it; this design gives the values, the schema, where the code changes, and the tasks. The user asked for a look that is "limpio y sobrio" (clean and restrained, as Linear, Figma or tldraw), over typography, the app's chrome, shapes and containers, and lines, with everything configurable. Every step is judged on the user's own data model, laid out from a temporary copy outside the repository. Only what is wrong in general is written here, never the model's names.

## 1. What the user's model shows today

These are the canvas's pictures taken through `capture_view` and the app in headless Chrome, at the head of `a4`.

- **App chrome:**
  - The header carries a wide language select beside the view's name, and the name is cut at 25 characters.
  - The toolbar is two rows of outlined buttons of the same weight.
  - The 29 load warnings are written out in a notice as tall as the canvas.
  - The page scrolls both ways as a whole.
- **Lines:**
  - Lines are 2 wide, with filled arrowheads up to 10 long, so where several end on one side the arrowheads pile up.
  - Each relation type draws in its own strong color (blue, purple, green, dashed white), with no legend.
  - Aggregated relations grow wider with their count, so a view of collapsed schemas is drawn in thick bundles.
- **Containers:**
  - A database container is drawn as its kind, a cylinder stretched across the whole view in olive, with curved caps 1,300 units wide.
  - Collapsed containers are empty stacked boxes with a small name in the corner, and no count unless there is room under the header.
- **Shapes:**
  - The person is a box with a circle on top.
  - Services drawn small have names that cannot be read at 45 %.
  - A pale fill a package stored (a pink trigger, a yellow note) glares on the dark canvas.
- **Type:**
  - Names ask for weight 600, which is not loaded, so they draw in Roboto Bold and read widely tracked.
  - PixiJS 8.22's kerning measures one pair twice (`DynamicBitmapFont._applyKerning`).
  - Table rows put a column's type and badges in one run, so the types do not line up.
- **Light theme, zoomed out:** tables become pale blue blocks without a border, with rows too small to read.

## 2. The schema

`packages/schema/src/files.ts` defines the types below. `ProjectFile.drawing` and `ViewFile.drawing` are optional. Each group and value is optional, and undefined means the value of the layer under it: view, then project, then preset.

```ts
export type DrawingPreset = 'clean' | 'dense' | 'expressive' | 'high-contrast';

export interface DrawingDefaults {
  /** The preset the values below change; in a view, a preset of its own. Default "clean". */
  preset?: DrawingPreset;
  lines?: {
    /** @minimum 0.5 @maximum 8 */ width?: number;
    arrowhead?: 'filled' | 'open' | 'none';
    /** Its length as a multiple of the preset's. @minimum 0.5 @maximum 3 */ arrowSize?: number;
    /** @minimum 0 @maximum 48 */ cornerRadius?: number;
    /** @minimum 8 @maximum 64 */ parallelGap?: number;
    /** A relation type's built-in color, or one neutral color with the type's on hover and selection. */
    color?: 'by-type' | 'neutral';
    /** Lines not touching what is hovered or selected fade. */
    fadeOthers?: boolean;
  };
  shapes?: {
    /** @minimum 0.5 @maximum 6 */ borderWidth?: number;
    /** @minimum 0 @maximum 32 */ cornerRadius?: number;
    shadow?: 'none' | 'soft';
  };
  text?: {
    font?: 'roboto' | 'system';
    /** @minimum 9 @maximum 32 */ nameSize?: number;
    nameWeight?: 400 | 500 | 700;
    /** @minimum 8 @maximum 24 */ detailSize?: number;
    /** @minimum 8 @maximum 24 */ rowSize?: number;
    /** @minimum 8 @maximum 32 */ containerNameSize?: number;
    /** @minimum 8 @maximum 24 */ labelSize?: number;
    /** @minimum 8 @maximum 32 */ noteSize?: number;
    /** @minimum 1 @maximum 2 */ lineHeight?: number;
    /** @minimum 2 @maximum 32 */ padding?: number;
  };
  containers?: {
    drawn?: 'as-kind' | 'region';
    /** @minimum 8 @maximum 96 */ padding?: number;
    collapsed?: 'stack' | 'count' | 'stack-and-count';
  };
  aggregated?: { count?: 'label' | 'badge'; growsWithCount?: boolean };
  reading?: {
    /** Zoom from which each shows. @minimum 0.05 @maximum 2 */
    namesFrom?: number; detailsFrom?: number; rowsFrom?: number; labelsFrom?: number;
    /** Screen pixels. @minimum 9 @maximum 24 */ farNameSize?: number;
  };
  grid?: { look?: 'lines' | 'dots' };
}
```

Agreed by the user on 2026-11-02 (ADR 0087) and built in A5.8, a group of its own sets how the dark canvas draws the colors the project stores, `"as-stored"` in every preset:

```ts
  colors?: { storedColorsInDark?: 'as-stored' | 'adapted' };
```

## 3. The presets

The table gives the values today, then each preset's. Sizes are in canvas units, and zooms are scales.

| Value | Today | Clean | Dense | Expressive | High contrast |
|---|---|---|---|---|---|
| lines.width | 2 | 1.25 | 1 | 2 | 2.5 |
| lines.arrowhead | filled | filled | filled | filled | filled |
| arrow length / half-width | max(10, 5w) / max(4, 2.5w) | max(7, 4w) / max(3, 2w) | max(6, 4w) / max(2.5, 2w) | max(10, 5w) / max(4, 2.5w) | max(10, 4w) / max(4, 2w) |
| lines.cornerRadius | 16 | 12 | 8 | 20 | 12 |
| lines.parallelGap | 24 | 20 | 16 | 28 | 24 |
| lines.color | by-type | neutral | by-type | by-type | by-type |
| lines.fadeOthers | false | true | false | true | false |
| shapes.borderWidth | 1.5 | 1 | 1 | 1.5 | 2 |
| shapes.cornerRadius | 10 (rounded kinds) | 8 | 4 | 14 | 6 |
| shapes.shadow | none | none | none | soft | none |
| text.font | roboto | roboto | roboto | roboto | roboto |
| text.nameSize / nameWeight | 14 / 600→700 | 13 / 500 | 12 / 500 | 15 / 700 | 14 / 700 |
| text.detailSize / rowSize | 11 / 12 | 11 / 12 | 10 / 11 | 12 / 13 | 12 / 13 |
| text.containerNameSize | 14 | 12 | 11 | 15 | 14 |
| text.labelSize / noteSize | 12 / 13 | 11 / 13 | 10 / 12 | 12 / 14 | 12 / 14 |
| text.lineHeight / padding | 1.3 / 8 | 1.35 / 10 | 1.25 / 6 | 1.35 / 12 | 1.35 / 10 |
| containers.drawn | as-kind | region | region | as-kind | region |
| containers.padding | 24 | 24 | 16 | 32 | 24 |
| containers.collapsed | stack (+ count if room) | count | count | stack-and-count | count |
| aggregated.count / growsWithCount | label / true | badge / false | badge / false | badge / true | label / true |
| reading.namesFrom / detailsFrom / rowsFrom / labelsFrom | 0.45 / 0.9 / 0.7 / 0.9 | 0.35 / 0.8 / 0.6 / 0.8 | 0.3 / 0.7 / 0.5 / 0.7 | 0.4 / 0.9 / 0.7 / 0.9 | 0.45 / 0.9 / 0.7 / 0.9 |
| reading.farNameSize | 12 | 13 | 12 | 14 | 14 |
| grid.look | lines | dots | lines | dots | lines |

### Colors that go with Clean

These are canvas theme colors, kept in `theme/themes.ts` as tokens, not drawing defaults:

- **Neutral line:** light #98A2B3, dark #5B6472. On hover and selection a line takes its type's color, and lines not touching what is hovered or selected fade to 0.35 when `fadeOthers` is on.
- **Essence's shape:** fill light #FFFFFF, dark #1E232B; border light #D0D5DD, dark #384050.
- **Region container:** its stroke's color at 6 % alpha as its fill (8 % in dark), and its border at 1 wide and 40 % alpha. Its name tab at the top left is the name at `containerNameSize` and weight 500, in the text's muted color, after its kind's icon. A database, a cylinder kind, shows the database icon and is drawn as a region.
- **Count on a collapsed container:** "12 inside" in the detail's color under the name, and a 1-wide second border 3 units inside rather than a stacked sheet.
- **Count badge on an aggregated line:** a pill at the line's middle, with the count at `labelSize`, the line's color as its border, and the canvas as its fill.
- **Grid dots:** 1 device pixel at the grid's strength, every 8 units, by the same families as the lines.

### Shapes

- **The person:** a head circle and shoulders drawn as one rounded arc, as in common diagram sets, rather than a box under a circle. The label area is under the shoulders.
- **The cylinder:** its caps at most 10 high, at any width.
- **Shadow `soft`** (Expressive only): one blurred copy at 0,2 offset and 12 % alpha. It is drawn only while fewer than 2,000 shapes show, to keep the frame budget.

## 4. Type

- **Load what the canvas asks for.** Roboto Medium (500) joins the bundled faces (`robotoFonts.ts`, `pdf.ts`), under the same license entry. A weight that is not loaded never draws.
- **Fix PixiJS's kerning pair:** patch `DynamicBitmapFont._applyKerning` through `pnpm patch`, with a test that measures "AV" and "VA", or set kerning off and use the core's Roboto advance tables, as emphasis does. Upstream gets an issue.
- **Rows line up:**
  - A column's type is drawn in Roboto Mono at `rowSize − 1`, right-aligned in a column of its own.
  - The badges go in a column after it, so every type starts at one x.
  - This changes only the built-in rows drawing; faces keep their own layout (ADR 0083).
- **The export uses the bundled font first:** the SVG writes "Visual Anything Roboto", then the system list, and measures with Roboto's widths.

## 5. Where the code changes

- `core/src/drawing.ts` (new) holds `DRAWING_PRESETS`, `drawingOf(project, viewId)` (resolved, with every value set), `drawingProblems(defaults)`, and the command `set-drawing-defaults { scope: 'project' | view id, drawing: DrawingDefaults | null }`.
- **The app's canvas:**
  - `canvas/drawing.ts` (new) reads the resolved values for a scene. It is cached by the project's and the view's `drawing`, and a change redraws as a theme switch does.
  - The constants listed in the inventory read from it: `draw.ts`, `rowsDraw.ts`, `geometry.ts` (arrowheads), `textBlock.ts`, `fit.ts`, `scene.ts` (paddings, gap, aggregated width), `renderer.ts` (levels), `farNames.ts`, `nameTags.ts`, `grid.ts`, `labels.ts`.
- `export/svg.ts` and `export/legendLayout.ts` take the same values and lose their copies.
- The panel `shell/drawing/DrawingPanel.tsx` (new) offers the preset, each group and a reset to the preset, writing `set-drawing-defaults`.
- The server's Claude tools gain `get_drawing` and `set_drawing`, in the tools' style (READ and WRITE hints, examples).
- The chrome lives in `shell/Header.tsx`, `canvas/CanvasToolbar.tsx`, `shell/notices`, `styles.css` and `theme/scale.ts`.

## 6. Tasks

Track A5 runs beside P5 and P6, before R1. The seam lands first, from the main session: the schema, `core/src/drawing.ts` with the presets and the command, and CONTEXT.md. Then:

1. **A5.1 · The canvas and exports read drawing defaults.** Every constant in section 5 reads from the resolved values, with today's values as a preset for the tests, so that pictures stay the same until A5.2 changes the default. This also covers the SVG copies, the font loading and kerning, and the rows' columns.
2. **A5.2 · Clean, and the other presets.** The values and colors of section 3, the region container, the count and badge, the person, neutral lines with hover and fade, the dot grid, and Dense, Expressive and High contrast. Contrast tests run in both themes, and the frame budget at 10,000 elements.
3. **A5.3 · The app's chrome.** One toolbar row with a More menu, language and theme in one menu, warnings summed up into a panel, a page that never scrolls as a whole, and the keyboard help's button in the toolbar. It is independent of the canvas, and can run beside A5.1.
4. **A5.4 · Editing them.** The Drawing panel with a preview, `get_drawing` and `set_drawing`, the Spanish, and the tests.
5. **A5.5 · Judged on the user's model.** Before-and-after pictures of the same views, from the temporary copy, at whole-view and close zooms, in both themes, then the benchmark measured again. This is the main session's.

Done when the canvas, the page and every export draw from drawing defaults with no copied constants, Clean is the default and reads on the user's model as section 1 asks, the four presets pass the contrast tests in both themes and the frame budget at 10,000 elements, a project and a view can change every value through the app and Claude, and the app's chrome is one toolbar row with warnings summed up and a page that never scrolls as a whole.
