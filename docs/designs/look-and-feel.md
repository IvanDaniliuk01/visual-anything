# Track A · Appearance and themes: final design spec

This spec uses **Proposal 2** as the base, because it had the best combined score, and adds ideas from Proposals 1 and 3. It fixes every must-fix item the three judges listed. It also fixes every issue from the last review that held up against the code. The Appendix says how each issue was handled.

It is checked against the branch the M2 close runs on: `m2-fixes` at `e983c0b`, checked out in the `m2-color-code` worktree. That branch is `03ed1d9` (the head of `m2-canvas`) plus two commits:
- `ea4e6fa` gives the inspector's `ColorControl` a color code box, together with `packages/app/src/color.ts`;
- `e983c0b` adds the `--control-border` token, stops pinning elements created at a point, deletes `SceneCanvas.ts` and `drawScene`, and adds a dated clarification to ADR-0019.

Since the proposals were written:
- the inspector and the keyboard/outline subagents have merged (`372f034`, `a60dcb9`);
- all M2 tasks are ticked;
- `m2` is not tagged yet;
- the ADRs still end at 0020.

Paths are relative to the repository root. Line numbers are those of `e983c0b`. A0 checks every line reference again against the `m2` tag before it commits the docs. Contrast ratios were computed with the WCAG formula in `packages/app/src/canvas/palette.ts`.

**Built in wave 1 (W8, 2026-10-24).** Where the code differs from this design, the code holds:
- ADR numbers: this design's 0021 is ADR-0032 (preferences) and its 0022 is ADR-0033, which also records the one source of theme tokens. Its 0023 and 0024 (A2) still need numbers.
- No protocol version change for preferences: the version belongs to M4's work, and the version-mismatch screen with it.
- The app's store and hooks live in `app/src/theme/store.ts` and `theme/usePreferences.ts`: `changePreferences` is this design's `applyLocally`, and `linkPreferences` (through `usePreferencesLink()` in the header) connects the store to the live session, feature-detecting its `preferences` and `setPreferences`. The first subscriber starts the store, so `main.tsx` needs no call.
- Refusals of `preferences/set` use the existing `invalid-command` and `not-saved` codes.
- The first paint is a static script of the page's origin, `public/theme.js`, not an inline one, so the page policy needs no hash.
- The generator is `src/theme/generate.ts` (`pnpm exec tsx packages/app/src/theme/generate.ts`). `tokens.css` is written in Prettier's own format, so `.prettierignore` is unchanged. `styles.css` imports it.
- `CanvasTheme` also holds `refused`, `relationLabelText`, `relationLabelBack`, `rowsBody` and `rowSeparator`. `--notice` and `--notice-soft` stay one wave longer, as aliases.
- The tab's title is set by `Header`, which has the project's name.

**Built in wave 2a (W9, 2026-10-24): the core of A2.** Where the code differs from this design, the code holds:
- ADR numbers: this design's 0023 is ADR-0034 (project appearances) and its 0024 is ADR-0035 (a relation's own appearance and the colors of free shapes).
- `core/src/colors.ts` and `core/src/builtin/dark.ts` were built here, not in A1. `ThemeName` stays in `core/src/preferences.ts`. There is no `mixColors`. `colors.ts` also gives `noteColorsOf` and `arrowColorOf`, which take the theme's `noteFill`, `noteStroke` and `freeArrow` (a `CanvasTheme` can be passed whole) and say whether each color is the shape's own or the theme's.
- The Data modeling package has dark shades too: Table #1A2A40 / #7CA6E8, Column #1E2329 / #7CA6E8, references #7CA6E8.
- `TraitSource` stays W1's: the id of the definition a trait comes from, or `own`. Where it comes from in full is a `TraitOrigin` (`{ kind: 'own' }` or `{ kind: 'definition', id, via: 'definition' | 'project', builtIn }`): `ResolvedComponent.origins` and `ResolvedRelationType.origins`, `appearanceOriginsOf`, `relationAppearanceOriginsOf`, and `traitSources(…).origins`. `ResolvedComponent.darkColors` and `ResolvedRelationType.darkStroke` hold the dark theme's colors; `darkColorsOf`, `drawnColorsOf`, `relationAppearanceOf`, `relationDarkStrokeOf` and `drawnRelationAppearanceOf` work them out for one element or relation.
- `set-component-appearance` and `set-relation-type-appearance` take a whole `appearance` or `appearanceTraits`, trait by trait, as ADR-0022 changes definitions; so does `update-relation`. The checks stay in W1's `commands/traits.ts`, with the `invalid-appearance` code; `checkedColor(value, trait, of, stored?)` writes capitals and keeps the stored spelling.
- `editableAppearanceOf(state, 'component' | 'relation-type', id)` and `colorsInUse(state)` are in `core/src/project-appearances.ts`, with `projectAppearanceOf`.
- A key of a project appearance that is not an id is reported at the map's path, naming the key, as W1 reports the keys of stacking orders; empty maps are refused on open.
- Still to do outside the core: the app's call sites of `definitionsOf(project.packages)` (4.6) and the ESLint rule, the server's `Locations` (4.5), the sample's Booking agent stroke and its test pins (3.4), and T6 and T7.
---

## 1. Summary

### What the user asked
The user asked, in Spanish:
- what comes after M2;
- in parallel with the milestones: a nicer UI and UX, themes (light and dark first), and colors for components and arrows, with fully custom RGB;
- a ruler or a grid "en el world";
- and to keep going after that.

World is the model's root element (CONTEXT.md:17-19). So the UI, the docs and new code say **grid** and **rulers** on the **canvas**, measured in **canvas units**.

### What changes

**Themes.** The app and the canvas are drawn light or dark.
- They follow the system unless the person picks a theme.
- A three-way Theme control sits in the header, so it also shows on the connecting and failure screens.
- The choice is a **preference**. The local program keeps it outside every project, so it survives the port changing every session.
- A switch changes the canvas and the panels together, in one frame.

**Colors.**
- Every color stored in a project is `#RRGGBB` and is drawn exactly as stored in both themes. Commands write new colors in capitals.
- Colors built into Visual Anything (the Systems package, Essence, "relates to") get a dark shade kept in `core`, so the default look is designed for the dark canvas. One exception: a built-in fill keeps its light value next to a stored stroke that would not read on the dark canvas. No file format change is needed for this.
- Color editing reaches:
  - an element (exists today, with a color code box since `ea4e6fa`);
  - one of the project's own components and relation types;
  - built-in components and relation types, through a new per-project **project appearance** in `.vaproject`;
  - one relation;
  - notes and free arrows;
  - several shapes at once.
- Every one of these is a command, so Claude's M4 tools can do it too.

**Grid, rulers and snapping.**
- The grid follows the zoom on 8·5^k canvas units. It is also drawn on the fill of two containers: the one under the pointer, and the one a shape is being moved in. The rulers are in canvas units.
- While the grid shows, hand moves and new shapes snap to 8 canvas units inside their container. Alt places freely.
- One step of 8 is used everywhere: snapping, Shift+arrow nudges, ruler ticks, built-in sizes (180→176, 140→144), and the sample's positions.

**Polish**, ordered by what the person sees:
1. control states and focus rings;
2. tokens instead of written-out colors;
3. icons kept in the app (`shell/icons.tsx`);
4. the canvas message and the relation menu moved into place;
5. a product mark, favicon and tab title;
6. later, the type and spacing scales and empty states that say what to do next.

**Performance.**
- A theme switch never runs the full tile pass. The tiles on screen that use built-in colors get new drawings, built within the frame budget while the old ones stay on screen. Then the canvas and the panels change together in one frame. Tiles off screen are restyled before they are shown, and keep their full drawings until then.
- Recolors and previews take the same path. Labels are retinted rather than rewritten, and line casings are tinted.
- The grid costs two numbers per pan frame. A zoom frame draws at most about 760 line segments on a 1920 × 1080 canvas.

### What comes after M2

| When | Milestone stream | Track A stream |
| --- | --- | --- |
| Now | M2 close on `m2-fixes`: spec-reviewer, fixes, tag `m2` | A0 docs drafted and approved in plan mode. T1 (core), T2 (server) and T8a (grid helpers) start in the `track-a` worktree. The A0 docs commit lands right after `m2` is merged into `track-a` |
| After `m2` | M3 starts with work outside `packages/app` and outside the files A2's T5 changes (8.4) | **A1 Themes**: T3a, T3b, T4 and integration, tagged `a1` |
| After `a1` | M3's app tasks start on the tokens and icons, with the view list and perspective switcher first. M3's commands for collapse, expand and filters wait for T5 | **A2 Colors**: T5 (schema, core, A2 interfaces) in the main session |
| After T5 | M3 continues: view commands, copies per container, collapse, aggregated relations, filters, focus mode, ELK | A2: T6 (canvas) merges before M3's collapse work changes `renderer.ts` or `scene.ts`. T7 (inspector) runs beside it. Tagged `a2` before M4's write tools are fixed |
| End of M3 | M3 tagged `m3` | **A3 Grid, rulers, snapping**, tagged `a3` |
| M4 | MCP tools, including the appearance commands | **A4 Polish pass 2**: T12 before M4's caption and guidance UI, then T13. Tagged `a4` |
| M5, M6 | Scenarios use the highlight color plus a cue that is not color. Dogfooding | Fixes from dogfooding |

### Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| How stored colors meet themes | Drawn as stored. Built-in colors have a dark shade in `core`. A built-in fill keeps its light value next to a stored stroke that is under 3:1 on the dark canvas (ADR-0022) | What you pick is what you see. The dark theme looks designed. No shape vanishes after a partial change. Files and Claude stay the same in both themes |
| Built-in definitions recolored per project | `ProjectFile.appearances`, plus two commands that route by ownership (ADR-0023) | Sits beside ADR-0018. Each trait has one home |
| One relation, notes, arrows | Optional colors. A relation's own colors are a particularity (ADR-0024) | Users asked for "flechas". Relations are first-class (ADR-0010) |
| Where the theme lives | `preferences.json` in the person's config folder, carried over the token-protected WebSocket, protocol v2 (ADR-0021) | Browser storage resets with every new port |
| How a switch shows | The tiles on screen are restyled within the frame budget behind the old drawings. Then the canvas and the panels change in one frame | No frame mixes the two themes, and no frame stalls |
| Single color source | `app/src/theme/themes.ts`. It generates a static `tokens.css` and is handed to PixiJS | PixiJS cannot read CSS variables. jsdom loads no CSS. A static file keeps a future CSP simple |
| Relation labels | White, tintable font over a white sprite back, tinted per label to the surface under it | A switch only retints. Labels read on any fill. No new bitmap font |
| Lines on fills | A casing in the canvas color under every relation and free arrow in full detail, drawn white and tinted | Lines read on any fill; a switch only retints the casing |
| Selection when zoomed far out | Rings stroked with PixiJS `pixelLine`, over a translucent fill | 3:1 at any scale, with no redraw on zoom |
| Grid | Screen-space lines with a counter-transform, as the first child of `world` | 1 CSS px lines at the current devicePixelRatio, which is followed when it changes. `world` stays the stage's first Container. Works on WebGL, WebGPU and Canvas 2D |
| Step | 8 canvas units everywhere | Matches the 8-point UI grid and the scene constants (24, 48, 40). Ruler numbers stay readable (40, 80, 200, 1000) |
| Color case and spelling | `#RRGGBB` in capitals, as `core` writes them. "color" in UI copy and docs | Matches the built-in packages, the sample, the schema's `Color` and its messages |

---

## 2. Terms: CONTEXT.md entries (paste-ready)

**Replace Particularity** (CONTEXT.md:25-27). The wording from `c36ef96` is kept:

```markdown
**Particularity**:
A trait of a single element or relation: an attribute value that differs from the default its component or relation type gives, an attribute its component or relation type does not define, or an appearance of its own. A value for an attribute whose component or relation type gives no default is the element's or relation's ordinary data, not a particularity.
_Avoid_: override, exception
```

**Add to "Components"**, after Built-in package:

```markdown
**Appearance**:
How an element's shapes or a relation's line are drawn: for an element, the kind of shape, its fill, its stroke and its default size; for a relation, its stroke, width and dash. Components and relation types define it, and whatever derives from them inherits each trait it does not redefine. An element or a relation can have an appearance of its own, which is a particularity, and a project can give one to a definition it cannot change, which is a project appearance. Colors are written #RRGGBB.
_Avoid_: look and style (for this data), skin

**Project appearance**:
The appearance a project gives to a component or relation type it uses but cannot change, such as Service from the built-in Systems package. It is kept in the project file and reaches whatever derives from that definition without setting the same trait; an element's or relation's own appearance still comes first.
_Avoid_: override, theme
```

**Add to "Canvas and views"**: Canvas unit after Canvas; Grid, Ruler and Snapping after Pinned shape; Component palette at the end.

```markdown
**Canvas unit**:
The unit of positions and sizes on the canvas; at 100% zoom one canvas unit is one CSS pixel.
_Avoid_: world unit, scene unit, pixel (for stored values)

**Grid**:
Evenly spaced lines in canvas units behind the shapes on the canvas, also drawn on the fill of the container under the pointer or being moved in; their spacing follows the zoom. It belongs to no view and is not a shape.
_Avoid_: mesh, world grid

**Ruler**:
A scale in canvas units along the top or the left side of the canvas, which also marks where the selection lies.
_Avoid_: axis

**Snapping**:
Rounding the stored position of a shape moved or created by hand to a multiple of 8 canvas units inside its container's shape, while the grid shows and snapping is on; holding Alt places it freely. When several shapes move together, the one that carries the pressed shape is rounded and the others keep their places relative to it. A shape moved by hand is pinned, snapped or not; a created shape is snapped and stays unpinned. Layout results and Claude's changes are never snapped.
_Avoid_: magnet, lock to grid

**Component palette**:
The list in the canvas toolbar that new elements are created from.
_Avoid_: palette (alone), toolbox
```

**Add a new section at the end:**

```markdown
### Preferences

**Preference**:
A choice a person makes for themselves on this computer: the theme, whether the grid, snapping and the rulers are on, and the colors they picked lately. The local program keeps preferences outside every project; they are never in project files, the undo history or Claude's tools.
_Avoid_: settings, profile

**Theme**:
The colors the app and the canvas itself are drawn in, light or dark: panels and text, the canvas background, the grid, the rulers, selection, labels, and notes and free arrows without colors of their own. Built-in packages give their components and relation types a shade for each theme; every color stored in a project is drawn as stored in both. A theme follows the system unless the person chooses one, and it never changes the project.
_Avoid_: skin, palette
```

**Renames these terms force:**
- `canvas/palette.ts` becomes `canvas/colors.ts`, and `palette.test.ts` becomes `colors.test.ts` (A1).
- `CanvasToolbar.tsx`'s `palette` variable becomes `componentPalette` (A1).
- "scene units" or "scene coordinates" becomes "canvas units" at eight sites (A1): `controller.ts:84`, `gestures.ts:20`, `hit.ts:51`, `navigation.ts:35`, `renderer.ts:31`, `renderer.ts:61`, `renderer.ts:208` and `InlineEditor.tsx:6`.
- `--notice` and `--notice-soft` become `--warning` and `--warning-soft` (A1).
- "colour" becomes "color" in these places:
  - `canvas/draw.ts:53` and `canvas/labels.ts:4` (A1, T4);
  - `color.ts`, plus `shell/inspector/controls.tsx`'s doc comments, `COLOR_FORMS` and the code box's name, which becomes "Fill color code" (A2, T7).
- The comment on `--control-border` (`styles.css:13`) moves to `themes.ts` and says "border", not "edge" (A1).
- In the spec, "look" (lines 142, 220) and "style" (line 143) become "appearance".

**What not to add:**
- Do not add "world" to Canvas's Avoid list. The renderer's existing `world` container would be flagged. New code and UI never use "world" for the canvas.
- No new `*Layer` names. The new mark Graphics is `shapeMarks`.
- No `*Field` names.
- No "looks" in history labels.
- No "edge" for control borders. The token is `--control-border`.

---

## 3. Themes

### 3.1 Choice and resolution

- `ThemeChoice = 'system' | 'light' | 'dark'` is a preference and defaults to `'system'`. `ThemeName = 'light' | 'dark'` comes from `core/src/colors.ts`.
- The resolved name is written to `<html data-theme="light|dark">` when the canvas shows it (3.5). Resolution order:
  - an explicit choice;
  - otherwise `matchMedia('(prefers-color-scheme: dark)')`, which is guarded and gives light when missing.
- A change listener on the media query re-resolves while the choice is `'system'`.
- Nothing runs at module scope. `startPreferences(window)` starts it from `main.tsx`.

### 3.2 One source of tokens

**New `packages/app/src/theme/themes.ts`** holds the types and values below. CanvasTheme values point at shell values by reference, so nothing is written twice.

```ts
import { CANVAS_BACKGROUNDS, type ThemeName } from '@visual-anything/core';
import type { Color } from '@visual-anything/schema';

export interface ShellColors {
  canvas: Color; surface: Color; panel: Color; surfaceRaised: Color; surfaceHover: Color; surfacePressed: Color;
  text: Color; textMuted: Color; border: Color; controlBorder: Color;
  accent: Color; accentSoft: Color; accentFill: Color; onAccent: Color;
  selected: Color; focusRing: Color;
  problem: Color; problemSoft: Color; problemFill: Color; problemFillHover: Color; onProblem: Color;
  warning: Color; warningSoft: Color; highlight: Color;
}
export interface ShellTheme { colors: ShellColors; backdrop: string; shadows: readonly [string, string, string] }
export interface CanvasTheme {
  name: ThemeName;
  background: Color;            // = CANVAS_BACKGROUNDS[name]; also the selection halo and the line casings
  gridLine: Color; gridStrength: number;
  rulerBand: Color; rulerBorder: Color; rulerText: Color;
  selected: Color; selectedGlowAlpha: number; boxFillAlpha: number; handleFill: Color;
  noteFill: Color; noteStroke: Color; noteText: Color;
  freeArrow: Color; highlight: Color;
}
export const THEMES: Readonly<Record<ThemeName, { shell: ShellTheme; canvas: CanvasTheme }>>;
```

**New `theme/scale.ts`** holds the scale tokens (see 3.3).

**New `theme/css.ts`** exports `themeStyleSheet(themes = THEMES, scale = SCALE): string`. It turns camelCase names into kebab-case CSS variables and emits:

```css
/* Generated from src/theme/themes.ts and scale.ts by `pnpm --filter @visual-anything/app generate`. Do not edit. */
:root { color-scheme: light; --canvas: #FFFFFF; … }
@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { color-scheme: dark; --canvas: #16191E; … } }
:root[data-theme='dark'] { color-scheme: dark; --canvas: #16191E; … }
:root { --space-1: 0.25rem; … }
```

**Generation and use:**
- `packages/app/scripts/tokens.ts` writes `src/theme/tokens.css`.
- App `package.json` scripts:
  - `"generate": "tsx scripts/tokens.ts"`;
  - `"build": "tsx scripts/tokens.ts && vite build"`;
  - `"typecheck": "tsc && tsc -p scripts"`.
- New `packages/app/scripts/tsconfig.json` extends `../../../tsconfig.base.json`, with `"types": ["node"]` and `"include": ["*.ts"]`. This lets `pnpm typecheck` check the script and lets ESLint's project service find it. Today the app's tsconfig includes only `src` and `vite.config.ts`, and its `vite/client` types must not let browser code see Node globals.
- `eslint.config.js`: `packages/app/scripts/**/*.ts` joins the Node-globals block (`eslint.config.js:43`), next to `packages/schema/scripts/**/*.ts`.
- `.prettierignore`: `packages/app/src/theme/tokens.css` joins `packages/schema/schemas/`. The comment becomes "…and the schemas and theme tokens by their generators." Without this, Prettier 3.9 splits each rule onto separate lines and lowercases `#FFFFFF`, so `pnpm lint` fails on the committed file and `pnpm format` breaks `tokens.test.ts`.
- `main.tsx` imports `./theme/tokens.css` before `./styles.css`.
- `tokens.test.ts` fails when the committed file differs from the generated output, the same pattern as the schema. It reads the file with `node:fs`, as `test/sample.ts` does.
- `index.html` gets `<meta name="color-scheme" content="light dark">`.

### 3.3 Shell tokens and measured contrast

| Token | Light | Dark |
| --- | --- | --- |
| `--canvas`, `--surface` | #FFFFFF | #16191E |
| `--panel` | #F7F8FA | #1C2027 |
| `--surface-raised` (toolbar, menus, dialogs, notices, keyboard help, inline editor) | #FFFFFF | #242A33 |
| `--surface-hover` / `--surface-pressed` | #EEF1F4 / #E5E9ED | #2B323C / #333B46 |
| `--text` / `--text-muted` | #1F2933 / #52606D | #E4E7EB / #A3ADB8 |
| `--border` (decorative only) | #D9DEE5 | #2F3640 |
| `--control-border` (the boundary of every control; one token, kept from `e983c0b`, whose light #7B8794 reaches only 3.00 on `--surface-pressed`) | #76828F | #7C8896 |
| `--accent` / `--accent-soft` | #1D4F91 / #E6EEFA | #8AB4F8 / #1E3A5F |
| `--accent-fill` / `--on-accent` (primary actions) | #1D4F91 / #FFFFFF | #8AB4F8 / #0F1B2D |
| `--selected` = `--focus-ring` (shared with the canvas) | #2563EB | #4C8DF6 |
| `--problem` (text) / `--problem-soft` | #A61B1B / #FDECEC | #FF8A80 / #3A1D1F |
| `--problem-fill` / `--problem-fill-hover` / `--on-problem` | #A61B1B / #8C1616 / #FFFFFF | #C62828 / #B02020 / #FFFFFF |
| `--warning` / `--warning-soft` (renamed from `--notice*`) | #6B4E00 / #FFF4D6 | #F2C14E / #3A2E10 |
| `--highlight` (reserved for M4 guidance and M5 playback) | #C2410C | #FB923C |
| `--backdrop` | rgb(16 24 40 / 35%) | rgb(0 0 0 / 55%) |
| `--shadow-1/2/3` | 0 1px 2px / 0 8px 24px / 0 16px 40px in rgb(16 24 40 / 6%, 16%, 25%) | same offsets in rgb(0 0 0 / 40%, 50%, 60%) |

**Lowest ratio of each pair**, over surface, panel, raised, hover, pressed, accent-soft, problem-soft and warning-soft:

| Pair | Light | Dark |
| --- | --- | --- |
| text | 12.09 | 9.13 |
| text-muted | 5.29 | 4.97 |
| accent | 6.67 | 5.37 |
| problem | 6.16 | 4.96 |
| warning | 6.34 | 6.75 |
| on-accent on accent-fill | 8.14 | 8.20 |
| on-problem on problem-fill / its hover | 7.52 / 9.37 | 5.62 / 6.83 |
| control-border | 3.21 | 3.14 |
| Delete button's border on the dialog (`--surface-raised`) | 3.92 | 4.00 |
| focus ring | 4.24 | 3.48 |

Every text pair is at least 4.5:1, and every boundary, focus ring and mark at least 3:1. In dark, `--problem-fill` alone would be 2.57:1 on the dialog, so the Delete button keeps the `--control-border` border like every control. The comment at `styles.css:1-4` becomes: "Every text pair meets 4.5:1, and every control boundary, focus ring and mark 3:1, in both themes."

**Elevation in dark.** Surfaces get lighter as they rise: canvas, then panel, then raised. Each has a 1 px `--border`. Shadows are only an addition.

**Literals that become tokens:**
- `styles.css:348` (toolbar) → `--shadow-1`
- `styles.css:391` (menu) and `styles.css:598` (notice; the inline editor has no shadow) → `--shadow-2`
- `styles.css:437` → `--backdrop`
- `styles.css:447` (dialog) → `--shadow-3`
- `styles.css:486-490` (Delete button) → `--problem-fill` background, `--on-problem` text, and a 1 px `--control-border` border
- `styles.css:647` (dismiss hover) and `panel.css:119` (row hover) → `--surface-hover`
- `keyboard.css:19` → `--shadow-1`
- `keyboard.css:55` → `--shadow-2`
- `styles.css:8-20` (the `:root` colors) move to `themes.ts`. `--control-border` keeps its name, so `inspector.css:74` and `:324` stay as they are.

Floating surfaces (toolbar, menu, dialog, notices, keyboard help, inline editor) move from `--surface` to `--surface-raised`.

**Scale tokens.** These are theme-independent. They live in `scale.ts` and are emitted into the same file.

| Group | Tokens |
| --- | --- |
| Space | `--space-1…6` = 0.25, 0.5, 0.75, 1, 1.5, 2 rem |
| Radius | `--radius-sm/md/lg` = 0.25, 0.4, 0.6 rem; `--radius-full` 999px |
| Type | `--text-xs/sm/md/lg/xl` = 0.857, 0.929, 1, 1.143, 1.286 rem (12, 13, 14, 16, 18 px). 12 px is the floor |
| Weight | `--weight-medium` 500, `--weight-strong` 600, `--weight-heading` 700 |
| Line height | `--line-tight` 1.25, `--line-normal` 1.45 |
| z-index | `--z-toolbar` 2, `--z-editor` 3, `--z-menu` 4, `--z-dialog` 10, `--z-notices` 20 (notices stay visible over a modal backdrop and never take its focus) |
| Controls | `--control-sm` 1.75rem (at least a 24 px hit target), `--control-md` 2.25rem |
| Motion | `--duration-fast` 120ms, `--duration-base` 180ms, `--ease-out` cubic-bezier(0.2, 0, 0, 1) |
| Rulers | `--ruler-size` 20px |

The `:root` font size `14px` (`styles.css:23`) becomes `87.5%`. rem stays 14 px at the default browser size, so the merged inspector, panel and keyboard CSS does not rescale, and the browser's text-size setting now applies.

### 3.4 Canvas theme and built-in dark shades

| CanvasTheme | Light | Dark |
| --- | --- | --- |
| background (also the selection halo and the line casings) | #FFFFFF | #16191E |
| gridLine × gridStrength | #1F2933 × 0.16 | #E4E7EB × 0.14 |
| rulerBand / rulerBorder / rulerText | #F7F8FA / #D9DEE5 / #52606D | #1C2027 / #2F3640 / #A3ADB8 |
| selected / selectedGlowAlpha / boxFillAlpha | #2563EB / 0.35 / 0.08 | #4C8DF6 / 0.45 / 0.16 |
| handleFill | #FFFFFF | #242A33 |
| noteFill / noteStroke / noteText | #FFF7D1 / #B08D1A / #3D3000 | #3D3518 / #C9A227 / #FFF3C4 |
| freeArrow | #3E4C59 | #AEB8C4 |
| highlight | #C2410C | #FB923C |

**Built-in dark shades.** New `packages/core/src/builtin/dark.ts`. The light values stay exactly as in `systems.ts` and `essence-and-relates-to.ts`.

| Definition | Light fill / stroke | Dark fill / stroke |
| --- | --- | --- |
| Essence, Box | #FFFFFF / #52606D | #1E2329 / #9AA5B1 |
| System | #F3F5F8 / #5B6675 | #1C2027 / #8F9AA6 |
| Service | #DCEBFF / #1D4F91 | #172B45 / #78A8EE |
| Chat channel | #D8F3E3 / #1E6B43 | #16332A / #68C495 |
| AI agent | #EDE4FF / #5B3A9E | #2A2247 / #B39CF0 |
| MCP server | #DFF3F1 / #0E6B61 | #123331 / #59C2B5 |
| Semantic layer | #FBE3EC / #8A1F4C | #381E2B / #EC8FB3 |
| Database | #FFF3C9 / #7A5C00 | #352C12 / #DDB955 |
| Object storage | #E7EAF6 / #2E3A87 | #1F2547 / #9DA8EE |
| Person | #FDE8CC / #8A5A12 | #3A2817 / #E9A35C |
| communicates with, reads from, writes to (stroke) | #3D4651 | #AEB8C4 |
| relates to (stroke) | #52606D | #8F9AA6 |

`queries`, `loads into`, `is part of`, `clinic.reminds` and `clinic.calendar` inherit these shades through their chains. 4.4 gives the dark rule, including the case where a built-in fill keeps its light value.

**Measured contrast on the canvas:**
- Fills against the canvas: 1.00–1.23 in light, 1.08–1.30 in dark. Shapes are identified by their strokes, as today.
- Dark strokes: at least 6.16 against the dark canvas and at least 5.71 against their own fill. Light strokes: at least 4.95 against their own fill.
- Mixed pairs:
  - A stored #1D4F91 stroke on Service with the dark fill #172B45 would be 2.16:1 against the dark canvas and 1.76:1 against the fill. With the dark rule (4.4), the fill keeps #DCEBFF, which is 14.57:1 on the dark canvas, and the stroke is 6.73:1 on it.
  - A stored fill never needs that rule: every built-in dark stroke reaches 6.16:1 on the dark canvas.
- Selection:
  - light: 5.17 on the canvas, at least 4.22 on every built-in fill, 4.06 on a black exact fill;
  - dark: 5.41 on the canvas, at least 4.18 on every dark built-in fill, 3.26 on a white exact fill.
- Relation strokes:
  - light: #3D4651 is 9.57 on the canvas and at least 7.82 on every built-in fill; #52606D is 6.46 and at least 5.27;
  - dark: #AEB8C4 is 8.77 and at least 6.77; #8F9AA6 is 6.16 and at least 4.76.
  - On stored light fills in dark, #AEB8C4 would be 1.70 on #FFE8D6 and 1.84 on #F3F5F8. So every line in full detail has a casing in the canvas color (3.6), and reads at its line-on-canvas ratio wherever it crosses a fill.
- Free arrow: 8.81 / 8.77 on the canvas and at least 7.19 / 6.77 on built-in fills. On a white exact fill in dark it is 2.01, and its casing solves that the same way.
- Notes:
  - Text on the theme's note fill: 12.01 / 10.97. Stroke on the canvas: 3.15 / 7.28.
  - A note with a fill of its own writes its text in `readableTextColors(fill).name`, which is at least 4.5:1 on any fill. The theme's note text would be 1.09:1 on the example note's #DCEBFF in dark, and 1.59:1 on #1D4F91 in light.
- Ruler text on its band: 6.08 / 7.18.
- Highlight: 5.18 / 7.78 on the canvas, at least 4.23 / 6.01 on fills.
- Text on dark built-in fills (`readableTextColors`): names #FFFFFF at least 13.60, details #E4E7EB at least 10.97.
- Grid lines at 100% zoom:
  - 8-unit lines 1.05 (1.10 with snapping on, 5.2);
  - 40-unit lines 1.19 (light) / 1.22 (dark);
  - 200-unit lines 1.36 / 1.45.
  - They are decorative.

**The sample.** `examples/my-systems/model.vamodel` changes Booking agent's own appearance from `{ "fill": "#F8E1EC" }` to `{ "stroke": "#D6336C" }`:
- light: 4.62 on the canvas, 3.77 on AI agent's fill;
- dark: 3.82 on the canvas, 3.21 on the dark AI agent fill. The stroke reaches 3:1, so the fill keeps its dark shade.

The particularity stays visible in both themes, and the fill follows the theme.

Test pins that change with it, in T5:
- `scene.test.ts:178-183`, which becomes `{ fill: '#EDE4FF', stroke: '#D6336C' }`;
- the appearance tests in `Inspector.test.tsx` (lines 612–725), which pin #F8E1EC at 618, 645, 665, 674, 702, 713 and 714.

`git grep -n -i f8e1ec -- packages examples` lists them. `color.test.ts:41` and `server/src/test-support.ts:55` use the color in fixtures of their own, and stay.

### 3.5 Following the system, switching, first paint

**Theme control.** In `shell/Header.tsx`, at the right end:
- `role="radiogroup"`, `aria-label="Theme"`, `className="theme-control"`. It has three native radios: Match the system, Light and Dark. Each radio sits in a `label.theme-option`.
- Each option shows a Lucide icon (monitor, sun, moon) with visually hidden text and a title. The system option's title is "Match the system (dark now)".
- The radios are visually hidden (`.visually-hidden`, `styles.css:52-62`), so a ring drawn on them would be clipped. The focus ring is drawn on the option instead, with `.theme-option:has(:focus-visible)`. The checked option has a pressed look.
- Arrow keys move the choice natively.
  - Each choice applies in the tab at once.
  - It is sent to the local program 500 ms after the last change, or at once when the tab is hidden (`visibilitychange`). So holding an arrow key writes `preferences.json` once.
- Header renders on `StatusScreen` too, so the control works before the project arrives.
- Radios are not buttons, so `Header.test.tsx:49` and `:58` still hold. Narrow them to the Undo and Redo names anyway.

**First paint.**
1. A classic inline script in the `index.html` `<head>`, before the stylesheet:
   - it reads `theme=light|dark` from the fragment, otherwise `sessionStorage['visual-anything.theme']` (`system|light|dark`);
   - it resolves `system` with matchMedia and sets `data-theme`;
   - it accepts only those values and is wrapped in try/catch.
   - Today's CSP is `frame-ancestors` only (`responses.ts:12`). ADR-0021 records that any future `script-src` must allow this script by its hash.
2. When the stored choice is explicit, the local program adds `&theme=dark` (or `light`) to the address it prints and opens. `THEME_PARAM = 'theme'` sits next to `TOKEN_PARAM` in `core/src/protocol.ts`.
3. `startPreferences(window)` in `main.tsx`, after `takeSessionToken`:
   - it removes the hint from the address bar, as the token is removed;
   - it caches the choice per tab;
   - it applies `data-theme` at once, because no canvas holds the theme yet.
4. The program's `preferences/changed` message wins, except over a change made in the tab that the program has not answered yet (6.4).

**Switching.**
- While a canvas is mounted, `data-theme` changes in the frame the canvas shows the new theme (3.6), so panels and canvas change together. That frame comes at most 30 frames after the choice. If the canvas cannot draw, `data-theme` changes after 500 ms.
- With no canvas (status screens), `data-theme` changes at once.
- There is no cross-fade, no timed animation, and no new transition outside `@media (prefers-reduced-motion: no-preference)`.

### 3.6 How the canvas follows

**Plumbing.**
- `new CanvasController(host, callbacks, { theme })` passes the theme to `new CanvasRenderer(host, callbacks, { theme })`. `app.init({ background: theme.background })` replaces `CANVAS_BACKGROUND` (`renderer.ts:275`), so a dark session never flashes white.
- While the renderer is not ready, `setTheme(theme)` only records the theme.
  - Why: PixiJS sets `Application.renderer` inside `init`, so `app.renderer.background` does not exist before then. And `CanvasArea`'s effect runs while `init` is still pending (`CanvasArea.tsx:94-132`, `renderer.ts:271-293`).
  - `start()` sets the background from the recorded theme before its first `show`, so nothing is restyled.
  - A `setTheme` with the theme already shown or pending does nothing.
- `RendererCallbacks` and `ControllerCallbacks` gain `onThemeShown?(theme: ThemeName)`. It is called in the frame the canvas shows a new theme.
- `CanvasArea` gets:
  - `theme?: ThemeName`, default `'light'`, so existing tests keep passing;
  - `onThemeShown?`;
  - an effect that calls `controller.renderer.setTheme(THEMES[theme].canvas)`.
- `Shell` passes `theme` from `usePreferences()`, and `onThemeShown` from `useThemeHold(view !== undefined)` (6.4).
- `.canvas-area` paints `var(--canvas)`.
- `test/FakeApplication.ts`:
  - `renderer` is set in `finishInit`, as PixiJS sets it in `init`;
  - it gains `background: { color }`;
  - it gains `graphicsContext: { updateGpuContext, getContextRenderData }` stubs that count their calls.
- A renderer test calls `setTheme` before `finishInit`.

**Scene.** `scene.ts` gains these fields. The light values stay in `fill` and `stroke`, so tests that pin built-in colors keep passing.

```ts
interface ElementShape { …; fill: Color; stroke: Color;
  /** The colors drawn on the dark canvas, when they differ from `fill` and `stroke`. */
  dark?: { fill: Color; stroke: Color } }
interface RelationLine { …; stroke: Color;
  /** The stroke drawn on the dark canvas, when it differs from `stroke`. */
  darkStroke?: Color }
```

They are filled from `core`'s `darkColorsOf` (which applies the dark rule of 4.4) and `relationDarkStrokeOf`. Every drawing call goes through one resolver: tiles, `startDrag`'s drag container and the marks. The resolver is:

```ts
paintOf(shape) = { ...(theme === 'dark' && shape.dark ? shape.dark : shape), ...previewOf(shape.element)?.[theme] }
```

Today `startDrag` (`renderer.ts:180-206`) reads `shape.fill` directly, which would drag built-in shapes in their light colors in the dark theme.

**What a switch touches.** It never calls `rebuild()`, and a test spies on that.

| What | How | Cost at 10,000 elements |
| --- | --- | --- |
| Shell | `data-theme` flips in the swap frame; the CSS variables switch | one style recalculation |
| Canvas background | `app.renderer.background.color` (PixiJS 8.22 setter), in the swap frame | none |
| Casings of relations and free arrows | white geometry; its `tint` becomes the canvas color | one tint per tile |
| Selection and gesture marks, the drag container during a drag | drawn again in the swap frame | at most the visible selection and the dragged shapes |
| Grid and rulers (A3) | tint | none |
| Labels | retinted in place, in the frame their tile or surface changes | nothing is rewritten |
| Tiles whose drawings depend on no theme: stored colors only | keep their drawings | none |
| Theme-dependent tiles: a shape or line in a built-in color, or the free tile when a note or arrow takes the theme's colors | **restyled** behind their old drawings (below) | the screen within 30 frames |

A tile in stored colors depends on no theme, for three reasons:
- names are tinted from its fills, which are the same in both themes;
- its coarse guard checks both themes (below);
- its casings are tinted.

**Restyles** (`renderer.ts`).
- **Tile** gains:
  - `theme: ThemeName`;
  - `themed: { drawings: boolean; labels: boolean }`, computed in `makeTile`;
  - `stale: boolean`;
  - `prepared?: { coarse?: Graphics; full?: Graphics }`;
  - `labelPaint: LabelPaint[]`. Each label is recorded with what its tint follows: a shape and its role, a relation label's surface key, or a note.
- **Dependents.** The renderer keeps `dependents: Map<string, Set<string>>`, from a shape key to tile keys, filled in `makeTile`:
  - a shape tile registers under the `containerShape` of each of its blocks, for the coarse guard;
  - a relation tile registers under the surface of each written label.
  - When a shape's colors change (paint-only change, preview, or theme), the tiles registered under its key are restyled with it.
- **What a restyle builds.**
  - It builds the tile's new plain drawing, and a new full drawing when the tile has one. Both stay hidden until shown.
  - It builds their geometry inside the frame's clock with `app.renderer.graphicsContext.updateGpuContext(graphics.context)`, plus `getContextRenderData(context)` when the context is not batchable. So the tessellation is timed instead of landing in the render. PixiJS 8.22's prepare system cannot do this: its upload of a GraphicsContext only calls `getGpuContext`, which builds no geometry.
  - A tile keeps its old drawings until it is shown with the new ones. A full drawing is never dropped for being stale.
- **A switch**: `setTheme` marks every theme-dependent tile stale and opens a pending batch for the theme. Nothing visible changes yet.
- **A paint-only change** (4.6) or **a preview** opens a pending batch for the changed tiles and their dependents. A new batch merges into a pending one.
- **Preparing.** While a batch is pending, `updateDetail()` restyles the batch's stale tiles on screen first.
  - They go nearest the middle first, on the clock (`DETAIL_BUDGET`, 6 ms, renamed from `LABEL_BUDGET`), and at least one per frame.
  - New full drawings follow, with `FULL_DRAWINGS_PER_FRAME = 1` kept for drawings that are not built ahead. During a switch they are drawn in the pending theme.
  - Labels and label retints come last. Retints count against the same clock, at most 2,000 per frame (`LABEL_RETINTS_PER_FRAME`).
- **The swap.** It happens in the first frame where no tile of the batch on screen is stale, or 30 frames after the batch opened, whichever comes first. In that one frame:
  - the prepared drawings are shown and the old ones destroyed;
  - every label of the tiles on screen that follows a changed surface is retinted;
  - for a switch, also:
    - the background and the casing tints change;
    - the marks and the drag container are drawn again;
    - the grid and the rulers are tinted;
    - `theme` is set;
    - `callbacks.onThemeShown(theme)` is called.
  - The app sets `data-theme` from that call in the same frame, so the panels change with the canvas.
- **Catching up.** After the swap, stale tiles off screen are restyled while the camera rests, nearest the screen first.
  - A stale tile that comes on screen is restyled before any other work of that frame.
  - If the clock runs out first, the tile is shown stale and `stats.staleShown` counts it.
- **`renderer.stats`**:
  - `fallbacks` counts tiles shown in their plain drawing at scale ≥ `COARSE_BELOW` that had a full drawing before a restyle;
  - `staleShown` counts tiles shown with drawings of a theme or colors that are no longer current;
  - `swapAfter` lists, per batch, the frames from the batch opening to the swap.
  - The bench requires `fallbacks = 0` and `staleShown = 0`.

**Casings.**
- What gets a casing: every relation route and arrowhead in a full drawing, and every free arrow.
- What a casing is: the same path stroked 2 units wider, or filled 1 unit wider for arrowheads. It is solid also under dashed lines.
- How it is drawn: in white, in a `Graphics` of its own under the lines, tinted with the canvas color.
- Coarse drawings have no casings.

**Labels and fonts** (`labels.ts`, `draw.ts`). There is no new bitmap font.
- The relation font becomes white with no stroke. `_canUseTintForStyle` is then true (`BitmapFontManager.mjs:181-183`), so the font is tinted.
- `bitmapText(options, 'relation', back)` returns a Container holding:
  - a `Sprite(Texture.WHITE)` back sized to the text's bounds plus 3 × 1 units, tinted `back`;
  - the BitmapText, tinted with the text color.
- The back's color is the **surface** under the label: the drawn fill of the shape that the hit test finds at `line.middle` (`hitAt` without relations and free shapes), or the canvas.
  - Today that shape is the innermost (`hit.ts:75-78`). Once the stacking order lands, it is the topmost as drawn.
  - The text color is `readableTextColors(surface).name`. This works on any fill, the user's exact colors included.
- The surface's key is kept in `labelPaint` and in `dependents`. After a scene change, each visible written relation label finds its surface again, with one point query.
- `TextFactory` becomes `(options, kind, back?: Color) => Container`. `canvasText` keeps a 4-unit stroke halo in `back`.
- Name and detail fonts are unchanged: white, tinted per fill.
- Note text is canvas `Text` drawn white and tinted:
  - with the theme's note fill, in `noteText`;
  - with a fill of its own, in `readableTextColors(fill).name`.
  - Today `writeNoteTexts` (`draw.ts:158-168`) bakes `NOTE_TEXT` into every note.
  - The free tile's `labelCount` becomes `notes.length`, written `LABEL_BATCH` at a time.
- A note's theme fill also yields to the dark rule. Next to a stored note stroke under 3:1 on the dark canvas, it is drawn in the light theme's note fill.
- `readableTextColors` moves to `canvas/colors.ts`, uses `core`'s `contrastRatio`, and is memoized per fill. Contrast for the coarse guard is memoized per color pair.

**Marks.**
- **Where they are drawn.** Shape marks (rings, halos and hover) are drawn in a `Graphics` named `shapeMarks`, placed between `shapeLayer` and `relationLayer` (`renderer.ts:131-132`).
  - Relations and their arrowheads are then drawn over the marks. An arrowhead is 10 units long with its tip on the border (`geometry.ts:141-145`), so a halo above it would erase it at zoom 0.25–0.5 and cut it in half at 1.
  - Relation glows, free-shape marks and gesture marks stay in `selectionMarks` and `gestureMarks`, above everything.
- **At or above `COARSE_BELOW` (0.25):**
  - a selected shape gets a 2/scale ring in `selected`, 3/scale outside, drawn over a 4/scale halo in `background`;
  - hover is the same blue at 1/scale with no halo. It replaces #60A5FA, which is 2.54:1 on white;
  - rings are drawn for the selected shapes in the visible area when the scale changes. Once the camera rests, they are drawn for the visible area grown by one viewport each way. They are drawn again on zoom, and when the camera leaves the area they were drawn for.
- **Below 0.25:**
  - A selected shape gets a ring stroked with `pixelLine: true` in `selected` around its block. It is one device pixel wide at any scale, so zooming within the coarse range draws no marks again. It reaches 5.17 / 5.41 on the canvas and at least 4.22 / 4.18 on built-in fills.
  - Under the ring, a fill in `selected` at alpha 0.35 adds weight.
  - A selected relation is its route stroked with `pixelLine: true` in `selected`, over the route at three times its width at alpha 0.6. So it never thins below a device pixel. Today it is `line.width + 6/scale` (`renderer.ts:601`).
  - Ctrl+A at 10,000 draws these once.
- Relations selected at close zoom keep the 0.35/0.45 glow.
- The relate handle is filled `handleFill`.

**Coarse guard** (`drawShapeBlocks`, `draw.ts:56-64`).
- A block that is not a container is drawn in `mixColors(fill, stroke, 0.4)` when its fill is under 1.5:1 against the color under it. The color under it is its container's drawn fill (found through `byKey`), or the canvas.
- A shape in stored colors is checked against what is under it in both themes. It is mixed in both when either check is under 1.5:1, so its plain drawing is the same in both themes. Example: a stored #FFFFFF block in World is mixed in dark too, because the light canvas would hide it (1.00:1).
- A shape in built-in colors is checked in each theme with that theme's shades.
- Containers keep their fill and their 6-unit outline.
- Light results: 1.69–2.47 against what is under them. Dark results: 2.04–3.07.
- This fixes the white Box and Essence blocks that vanish below 0.25 today.

### 3.7 Tests

**core**
- `colors.test.ts`:
  - `COLOR_PATTERN` equals the generated schema's Color pattern;
  - known `contrastRatio` values;
  - `storedColor`: writes capitals, keeps the stored spelling;
  - `sameColor`, `mixColors`.
- `builtin/dark.test.ts`:
  - every color a built-in definition sets has a dark shade;
  - light values are unchanged;
  - every dark stroke is at least 3:1 against the dark canvas and every dark built-in fill;
  - text on dark fills is at least 4.5:1;
  - the coarse-guard mix of every built-in is at least 1.5:1 against canvas, System and Box in both themes;
  - for every built-in component:
    - a stored stroke under 3:1 on the dark canvas leaves the fill its light value;
    - a stored stroke at 3:1 or above keeps the dark fill;
    - a stored fill keeps every built-in stroke's dark shade.
- `definitions.test.ts`:
  - `clinic.calendar` gets Database's dark fill;
  - Booking agent's own stroke stays exact in both themes, and AI agent's dark fill stays (3.82:1);
  - a project appearance with only a #1D4F91 stroke for Service draws #DCEBFF in dark;
  - `clinic.reminds` gets #AEB8C4 in dark.

**app**
- `tokens.test.ts`: the generated output equals the committed `tokens.css`; both themes define every token.
- `contrast.test.ts`:
  - a table of every text and background pair the CSS uses, each commented with its selector;
  - it checks 4.5:1 for text and 3:1 for boundaries, focus and selection, in both themes;
  - it includes the Delete button's border on the dialog.
- `canvas/theme.test.ts`:
  - every number in 3.4 holds;
  - the strongest grid line is between 1.2 and 1.6;
  - with snapping on, 8-unit lines at least 8 px apart reach 1.10.
- `styles-colors.test.ts`: no `#hex`, `rgb(`, `hsl(` or bare `white`/`black` value in any `src/**/*.css` except `theme/tokens.css`.
- `test/setup.ts`:
  - stubs `matchMedia`: `matches: false`, add and remove listener, and a helper to fire a change;
  - resets the preferences store and its theme holds after each test;
  - removes `data-theme` after each test.
- Renderer tests with `FakeApplication`:
  - `setTheme` before `finishInit` throws nothing and sets the init background;
  - `setTheme` never calls `rebuild()`;
  - nothing visible changes until the swap. In the swap frame, the background, every on-screen drawing and every on-screen label change together, and no label's tint comes from a theme other than its surface's drawn color;
  - restyles build geometry through `graphicsContext.updateGpuContext`;
  - tiles in stored colors keep their drawing objects;
  - a stale off-screen tile keeps its full drawing, and is restyled before it is shown;
  - the drag container is drawn again at a swap during a drag;
  - an arrowhead ending on a selected shape is drawn above its halo;
  - coarse rings use `pixelLine` and are not redrawn when zooming below 0.25;
  - `onThemeShown` fires once per switch.
- `draw.test.ts`:
  - the coarse guard in both themes for stored colors, and per theme for built-in ones;
  - relation and free-arrow casings;
  - note text in `noteText` on the theme fill, and readable on a fill of its own: the 4.2 example note in both themes.
- `labels.test.ts`: the relation font installs white with no stroke; the back's tint follows the surface.
- `fast-check`:
  - `readableTextColors` reaches 4.5:1 for any fill;
  - note text reaches 4.5:1 on any note fill in both themes.

**bench** (`bench/main.ts`, `synthetic.ts`)
- Every third relation gets a name. `?labels=dense` names all of them. `?theme=dark` starts the bench dark. `bench.html` reads the generated `tokens.css` instead of copied light colors.
- New phases, six switches each:
  - "Switch theme, whole view";
  - "Switch theme, shapes in full", at scale 0.26, just above `COARSE_BELOW`, the worst case: 40–78 theme-dependent tiles on a 1388 × 900 canvas;
  - "Switch theme, names shown".
  - Each reports the worst frame, p95, frames until the swap, `fallbacks` and `staleShown`.
- New phases "Pan after a switch", at names shown, and "Zoom in after a switch", from the whole view one second after a switch, through 0.25 to names shown.
- New phase "Select all, then zoom". The selecting frame is reported on its own.

---

## 4. Colors

### 4.1 Where each color lives

| Color of | Stored in | Changed by |
| --- | --- | --- |
| One element (particularity) | `.vamodel` `element.appearance` | `update-element` (exists), `create-element` |
| One relation (particularity, ADR-0024) | `.vamodel` `relation.appearance` | `update-relation`, `create-relation` (they gain `appearance`) |
| A component or relation type of the project's own | its definition in its `.vapackage` | new `set-component-appearance` / `set-relation-type-appearance`, or `define-*` |
| A built-in component or relation type, Essence, "relates to" | new `.vaproject` `appearances` (project appearance, ADR-0023) | the same two new commands |
| A note or free arrow | `.vaview` free shape `fill` / `stroke` | `create-free-shape`, `update-free-shape` |
| Theme colors and built-in dark shades | app `theme/themes.ts`; `core/builtin/dark.ts` | not project data |

### 4.2 Schema: `packages/schema/src/files.ts`

Every change is additive: optional keys, appended last. `schemaVersion` stays 1.

```ts
/**
 * The contents of a project's `.vaproject` file: its name, schema version, the packages in use and
 * the project appearances it gives to definitions it cannot change.
 *
 * @title Visual Anything project file
 */
export interface ProjectFile {
  /** The version of the project file format. */
  schemaVersion: 1;
  /** @minLength 1 */
  name: string;
  description?: string;
  /**
   * The ids of the packages the project uses. Their files live in the project's `packages/` folder.
   *
   * @uniqueItems true
   */
  packages: Id[];
  /**
   * How the project draws the components and relation types it uses but cannot change: those of
   * built-in packages, Essence and "relates to". Absent when it gives none an appearance.
   */
  appearances?: ProjectAppearances;
}

/**
 * Project appearances, by the id of the definition they belong to. Each sets only the traits it lists,
 * for that definition and for whatever derives from it without setting them itself; an element's or a
 * relation's own appearance still comes first. An entry for one of the project's own definitions, or
 * for one no package in use defines, has no effect.
 */
export interface ProjectAppearances {
  /** By component id, `essence` included. */
  components?: Record<Id, Appearance>;
  /** By relation type id, `relates-to` included. */
  relationTypes?: Record<Id, RelationAppearance>;
}

// Relation, after `attributes`:
  /** An appearance of its own, which is a particularity. Whatever it leaves out comes from the relation type. */
  appearance?: RelationAppearance;

// Note, after `text`:
  /** Its fill; without one, the theme's note color. */
  fill?: Color;
  /** Its stroke; without one, the theme's. */
  stroke?: Color;

// Arrow, after `to`:
  /** Its color; without one, the theme's arrow color. */
  stroke?: Color;
```

**Generation.**
- Run `pnpm build` and commit `packages/schema/schemas/*.json`. After any merge that touches `files.ts`, run it again and commit what it generates. Never merge the generated JSON by hand.
- Confirm that `project.schema.json` now lists `Appearance`, `RelationAppearance` and `Color`, and that both maps carry `propertyNames` with the Id pattern. `ts-json-schema-generator` 2.9 adds it from `Id`'s annotations, and Ajv's strict mode accepts it.
- Record keys are written sorted (`format.ts:118-128`).
- The `Color` pattern is unchanged.

**Messages for bad keys** (`validate.ts:78-89`).
- Ajv reports a key that breaks `propertyNames` at the map's own path, with the key only in `error.propertyName`, followed by a generic "property name must be valid". So today two bad keys in `appearances.components` would show as one line, "/appearances/components: must be an id: …", which names neither key.
- The fix in `validationErrors`:
  - an error that carries `propertyName` is reported at `${instancePath}/${key}`, with the key escaped as a JSON pointer token (`~` as `~0`, `/` as `~1`), and with the message its pattern gives ("must be an id: …");
  - the generic `propertyNames` error is dropped.

**Examples:**

```json
{
  "schemaVersion": 1,
  "name": "My systems",
  "description": "A sample project: how a clinic books appointments over WhatsApp.",
  "packages": ["systems", "clinic"],
  "appearances": {
    "components": { "systems.service": { "fill": "#FFE8D6", "stroke": "#B4531A" } },
    "relationTypes": { "systems.writes-to": { "stroke": "#B42318", "width": 3 } }
  }
}
```

```json
{ "id": "booking-request-x81k2a", "relationType": "systems.communicates-with", "from": "whatsapp", "to": "booking-agent",
  "appearance": { "stroke": "#D6336C", "dash": "dashed" } }
```

```json
{ "kind": "note", "id": "calendar-note", "x": 240, "y": 560, "width": 464, "height": 72,
  "text": "Scheduling owns the calendar.", "fill": "#DCEBFF", "stroke": "#1D4F91" }
```

### 4.3 Color format

- A color is `#rrggbb` in either case. There is no alpha, no `#rgb`, no names, no `rgb()` and no CSS values (ADR-0012). Transparency, if it ever comes, will be a trait of its own.
- New `packages/core/src/colors.ts` (A1) exports:
  - `COLOR_PATTERN`, `isColor`, `sameColor` (the only `sameColor`);
  - `storedColor(color, stored?)`: writes capitals, and keeps `stored`'s spelling when the two are equal ignoring case;
  - `relativeLuminance` (any other form counts as white), `contrastRatio`, `mixColors`;
  - `legibility(color) → { light, dark }`;
  - `CANVAS_BACKGROUNDS`, `ThemeName`, `THEME_NAMES`, `MINIMUM_TEXT_CONTRAST = 4.5`, `MINIMUM_MARK_CONTRAST = 3`.
- Commands normalize the colors they write. Nothing rewrites colors read from disk, so folders still round-trip. Picking the same color again gives a deep-equal state, which the local program does not record (`session.ts:325`).
- The app's `color.ts` (from `ea4e6fa`) keeps `readColor` and `COLOR_FORMS` for what people type. In A2:
  - `readColor` returns capitals instead of lower case;
  - its own `sameColor` goes, replaced by `core`'s;
  - `COLOR_FORMS` reads "Write a color as #RRGGBB, #RGB or rgb(r, g, b), such as #F3F5F8."

### 4.4 Resolution (core)

**Order, one trait at a time:**
1. the element's or relation's own appearance;
2. the nearest member of the derivation chain that sets the trait. A built-in member counts as `{ ...itsTraits, ...projectEntry }`, read by own key only, with `Object.hasOwn`, because ids such as `constructor` match the Id pattern;
3. Essence or "relates to", merged with their `essence` / `relates-to` entries.

Entries for the project's own definitions are ignored (4.5, check).

**Definitions** (`definitions.ts`):
- `definitionsOf(packages, appearances?)` caches on two levels: a WeakMap by the packages array, holding `{ plain?: Definitions; byAppearances: WeakMap<ProjectAppearances, Definitions> }`.
- Without `appearances` it still means "as the packages define it". The inspector uses that for reset values, through `packageAppearanceOf`.
- `RESOLVED_ESSENCE` and `RESOLVED_RELATES_TO` (`definitions.ts:195-214`) are built once per `Definitions`. So `component('essence')`, `componentOrEssence`, `relationTypeOrRelatesTo` and `appearanceOf`'s fallback (`:106`) all see project entries.
- `state.ts:6-8`: `definitionsIn(state) = definitionsOf(state.packages, state.project.appearances)` becomes the single entry point. That covers `draft.definitions`, the checks, and `commands/definitions.ts:121`.

**New exports.** The A1 parts have no project entries yet. A2 adds the entries and the relation functions.

```ts
export type AppearanceTrait = keyof Appearance;
export type RelationAppearanceTrait = keyof RelationAppearance;
/** Where a trait comes from: the element's or relation's own appearance, or a definition, through the
 * definition itself or the project appearance given to it. */
export type TraitSource =
  | { kind: 'own' }
  | { kind: 'definition'; id: Id; via: 'definition' | 'project'; builtIn: boolean };
// ResolvedComponent gains:  sources: Readonly<Record<AppearanceTrait, TraitSource>>;  darkColors: { fill: Color; stroke: Color };
// ResolvedRelationType gains: sources: Readonly<Record<RelationAppearanceTrait, TraitSource>>; darkStroke: Color;
export function appearanceSourcesOf(element: { component: Id; appearance?: Appearance }, definitions: Definitions): Readonly<Record<AppearanceTrait, TraitSource>>;
export function darkColorsOf(element: { component: Id; appearance?: Appearance }, definitions: Definitions): { fill: Color; stroke: Color };
export function drawnColorsOf(element: { component: Id; appearance?: Appearance }, definitions: Definitions, theme: ThemeName): { fill: Color; stroke: Color };
export function relationAppearanceOf(relation: { relationType: Id; appearance?: RelationAppearance }, definitions: Definitions): ResolvedRelationAppearance; // A2
export function relationAppearanceSourcesOf(relation: …, definitions: Definitions): Readonly<Record<RelationAppearanceTrait, TraitSource>>; // A2
export function relationDarkStrokeOf(relation: …, definitions: Definitions): Color;
export function editableAppearanceOf(state: ProjectSnapshot, kind: 'component' | 'relation-type', id: Id):
  | { level: 'project'; appearance: Appearance | RelationAppearance | undefined }
  | { level: 'package'; package: Id; appearance: Appearance | RelationAppearance | undefined }
  | undefined;
export function colorsInUse(state: ProjectSnapshot): { color: Color; uses: number }[]; // most used first
```

**Dark rule.**
- A color trait is drawn in its dark shade only when two things hold:
  - its source is `{ kind: 'definition', via: 'definition', builtIn: true }`;
  - `DARK_SHADES` holds that trait.
- The one case where it does not apply: a built-in fill keeps its light value when the stroke drawn with it in the dark theme is stored and is under 3:1 against the dark canvas. The shape then keeps the pair the light theme shows instead of vanishing (3.4).
- Built-in dark strokes always reach 3:1 on the dark canvas, so a stored fill never triggers this case.
- `darkColorsOf` applies the rule. Everything else draws stored colors in both themes.

### 4.5 Commands (core, A2)

**Types** (`commands/types.ts`). Both commands join the `Command` union and the dispatch in `commands/index.ts:98-175`.

```ts
/** Changes the appearance of every element of a component, at the level the project can change. */
export interface SetComponentAppearanceCommand {
  type: 'set-component-appearance';
  component: Id;
  /**
   * The appearance at that level, replaced whole; `null` removes it. For a component the project cannot
   * change (one of a built-in package, or Essence) it is the project appearance, kept in the project
   * file; for one of the project's own, its appearance in its package.
   */
  appearance: Appearance | null;
}
/** The same for a relation type: built-in ones and "relates to" in the project file, own ones in their package. */
export interface SetRelationTypeAppearanceCommand {
  type: 'set-relation-type-appearance';
  relationType: Id;
  appearance: RelationAppearance | null;
}
// NewRelation gains:            appearance?: RelationAppearance;
// UpdateRelationCommand.changes: /** The relation's own appearance, replaced whole; `null` makes it look like its relation type. */
//                                appearance?: RelationAppearance | null;
```

**Handler** (new `commands/appearance.ts`). Relation types mirror components.
1. Look the id up in `draft.definitions`. Essence and "relates to" count as known.
2. If the definition is Essence or "relates to", or comes from a built-in package (`builtinPackage(defined.package)`):
   - `next = appearance === null ? undefined : checkedAppearance(appearance, entry, …)`;
   - apply one `set-project` with `appearances.components[id]` set or removed;
   - rebuild the maps with `Object.fromEntries`, and drop empty maps and an empty `appearances`.
3. If the definition is one of the project's own:
   - call `draft.ownPackage(pkg)` and apply one `replace` of `compact({ ...definition, appearance: next })`, as `defineComponent` does at `commands/definitions.ts:55-64`;
   - if the project file also holds an entry for the id, remove it with a `set-project` in the same action.
4. If the id is unknown:
   - when the project file holds an entry for it and `appearance === null`, remove the entry;
   - otherwise reject with `unknown-component` or `unknown-relation-type`.

**Undo.** Only `set-project` and `replace` are used, and both have exact inverses (ADR-0017). `operations.ts`, `file-plan.ts` and the server's saving are unchanged.

**Validation** (in `commands/appearance.ts`, used everywhere colors enter the model):

```ts
export function checkedColor(value: unknown, stored: Color | undefined, what: string): Color;
export function checkedAppearance(value: unknown, stored: Appearance | undefined, what: string): Appearance | undefined;
export function checkedRelationAppearance(value: unknown, stored: RelationAppearance | undefined, what: string): RelationAppearance | undefined;
```

- An appearance must be a plain object with known traits only. Anything else is rejected with `invalid-command`, for example `The appearance of "Booking agent" has no trait "opacity".`
- `shape` must be in its enum.
- `fill` and `stroke` go through `checkedColor`. A bad one gives `"red" is not a color written as #RRGGBB.`
- `width` and `height` must be finite and above 0 (`requireNumber`).
- `dash` must be in its enum.
- `null` inside an appearance is refused. `{}` counts as none.

Used in:
- `create-element` (`model.ts:38`) and `update-element` (`model.ts:75-76`);
- `create-relation` and `update-relation`;
- `checkedDefinition` (`commands/definitions.ts:164-214`), so `define-component` and `define-relation-type`;
- the two new commands;
- `checkedFreeShape` (`views.ts:275-297`). It must now copy and check `fill`/`stroke` for notes and `stroke` for arrows; without that it silently drops them.

**Problem codes** (`problems.ts`):
- `invalid-preferences` (A1): a refusal.
- `appearance-not-used` (A2): a warning.

**Labels:**

| Command | Label |
| --- | --- |
| set-component-appearance | `Change the appearance of the component "Service"`; with `null`, `Reset the appearance of the component "Service"` |
| set-relation-type-appearance | `Change the appearance of the relation type "communicates with"` |
| Removing a stale entry | `Forget the appearance given to "<id>"` |
| update-element, only `appearance` changed | `Change the appearance of "Booking agent"`; with `null`, `Reset the appearance of "Booking agent"` |
| update-relation, only `appearance` changed | `Change the appearance of the relation "WhatsApp → Booking agent"` |
| update-free-shape, only colors changed | `Change the colors of a note in "System overview"` / `Change the color of an arrow in "System overview"` |
| A batch from the inspector | `Change the appearance of 5 shapes` |

**`update-project`** (`project.ts:14-47`). When the project stops using a package, the same `set-project` (`:47`) removes the entries for that package's definitions, and undo brings them back. `packageUsers` does not count entries.

**`checkProject`** (`check.ts`, after the view checks). It gives warnings that never block opening, one per entry, with code `appearance-not-used` and the id as subject:
- `The project gives "<id>" an appearance, but no package in use defines it; it is ignored.`
- `The project gives "<name>" an appearance, but it belongs to the project's package "<pkg>"; set it there. This entry is ignored.`

**Server** (`server/src/project.ts`).
- In `Locations.of` (`project.ts:494-509`), an `appearance-not-used` problem is located before `#find` runs.
- It is reported in `files.project`, at `/appearances/components/<id>` or `/appearances/relationTypes/<id>`, for the map that holds the subject as an own key. When both maps hold it, it is reported against the whole file, as `of` does for several pointers in one file.
- Without this, `#find` would report an entry for one of the project's own definitions against that definition in its package file (`#definitions`, `project.ts:467-481`), and an entry for a built-in or unknown id against the folder.

### 4.6 Canvas side of colors (A2)

**Call sites.** Every appearance read goes through project-aware definitions: `definitionsIn(project)` replaces `definitionsOf(project.packages)` at
- `scene.ts:138`;
- `gestures.ts:120` and `:154`;
- `CanvasArea.tsx:153`, where a new element's size comes from `appearanceOf`;
- `Shell.tsx:47`, with memo dependencies `[project.packages, project.project.appearances]`;
- `CanvasToolbar.tsx:22`, `announce.ts:97` and `:108`, and `outlineItems.ts:97`;
- the tests:
  - `Inspector.test.tsx:122`. Its harness mirrors `Shell.tsx:47`, and it takes the same memo dependencies; without them, T7's tests would run against definitions that ignore project appearances;
  - `Outline.test.tsx:26`;
  - `inspector/describe.test.ts:33` and `:100`.

An ESLint `no-restricted-syntax` rule for `CallExpression[callee.name='definitionsOf']` in `packages/app`, tests included, says "Use definitionsIn(project), which applies the project appearances."

**Scene.**
- `relationAppearanceOf` and `relationDarkStrokeOf` feed `RelationLine` (`scene.ts:411-426`).
- `NoteShape` gains `fill?`/`stroke?` and `ArrowShape` gains `stroke?`. The free tile then sees them.

**Structural sharing.**
- **Reuse.** `buildScene(project, viewId, previous?: Scene)` reuses the previous `ElementShape`, `RelationLine`, `NoteShape` or `ArrowShape` for a key when it is equal. Equality compares every own key, and compares points, rects and routes deeply, so a field added later (a stacking order, a drop target) is compared too. This costs about 1–2 ms at 10,000.
- **No ref.** `sceneOf(project, viewId)` in `scene.ts` keeps the last scene of each view id in a module-level Map, as `definitions.ts:86` keeps its cache, and passes it as `previous`. `Shell`'s `useMemo` calls `sceneOf`. A ref read or written during render would fail `react-hooks/refs`, which is an error in the repository's lint (`eslint.config.js:48`).
- **Tile keys.** The renderer keeps each scene item's tile key in a WeakMap, so `rebuild()` works out keys only for new items. Regrouping becomes a map lookup per item, about 2 ms at 10,000. Today it takes 11–18 ms, because it splits every key and builds every cell string again (`renderer.ts:328-351`), and it runs on every `show`, `startDrag` and `endDrag`.
- **Unchanged tiles.** `rebuild()` skips a tile whose members are the same items in the same order (pointer compares).
- **Paint-only path.** A changed tile whose members differ only in paint fields goes down the paint-only path (3.6). The paint fields are listed:
  - `ElementShape`: `fill`, `stroke`, `dark`;
  - `RelationLine`: `stroke`, `darkStroke`;
  - `NoteShape`: `fill`, `stroke`;
  - `ArrowShape`: `stroke`.
  - Every other field counts as geometry, so a field this list does not name makes the tile rebuild.
- **Geometry changes.** Only tiles with changed geometry are destroyed and made again, as today.

**Preview.**
- `renderer.previewElement(element: Id, paint: { light: { fill: Color; stroke: Color }; dark: { fill: Color; stroke: Color } } | undefined)`.
  - It colors the element's shapes as they would be drawn. `CanvasArea` works that out with `core`'s `drawnColorsOf` on the element with the previewed appearance, so the dark rule holds.
  - It restyles their tiles and dependents as in 3.6, at most once per animation frame.
- It never rebuilds the scene.
- It is exposed as `editor.previewAppearance(element, colors | undefined)` in `EditorContext`. `CanvasArea` hands the renderer's preview to `Shell` through `registerPreview` (fixed in T5).
- There is no live preview for component, relation-type or multi-selection scopes.

### 4.7 Picker and inspector UI (A2)

**`ColorControl`** extends the one in `shell/inspector/controls.tsx` (`ea4e6fa`). No new picker file.

```ts
interface ColorControlProps extends ControlProps {
  /** What the color is for, such as "Fill"; the code box is named after it ("Fill color code"). */
  label: string;
  /** The color shown: the one drawn in the current theme. Absent for a selection whose colors differ. */
  value: Color | undefined;
  /** When the trait follows the theme: both shades, shown under the control. */
  shades?: { light: Color; dark: Color };
  /** Offered as swatch buttons: recent colors first, then the project's, 12 at most. */
  suggestions?: readonly Color[];
  /** Each color the open picker points at, at most once per animation frame; `undefined` ends the preview. */
  onPreview?: (color: Color | undefined) => void;
  /** Commits a color that differs from `value`; resolves once the project shows it, or once it is refused. */
  onCommit: (color: Color) => Promise<unknown>;
}
```

- **Swatch.** The native `<input type="color">`. `input` events only preview. It commits on `change`, as today.
  - The preview ends when `onCommit` resolves or is refused, not on `change`. The local program saves before it announces (`session.ts:328-332`), so ending on `change` would show the old color again for the length of a save, up to about 0.6 s more on Windows while a blocked rename is retried.
  - On blur, the preview ends only when no commit is waiting. On a selection change or unmount, it ends at once.
  - This is the rule the control's draft already follows.
- **Color code.** The box from `ea4e6fa` stays: `#RRGGBB`, `#RGB`, `RRGGBB` and `rgb(r, g, b)` are accepted; Enter or leaving commits; Escape cancels; the same color sends nothing.
  - It now shows the stored spelling, in capitals.
  - Its name becomes "Fill color code" or "Stroke color code".
  - No second hex input is built.
- **Mixed.** A native color input cannot be empty: its value sanitizes to `#000000`. So for a selection whose colors differ:
  - the control draws a swatch of its own labelled "Mixed" over the input;
  - it keeps the input's value at the first selected color;
  - it leaves the code box empty, with the placeholder "Mixed".
- **Suggestions.** A row of swatch buttons beside the control: one Tab stop, arrow keys move between them, and each is named like "Use #DCEBFF". Firefox shows no `<datalist>` for color inputs, so no datalist is used.
- **Follows the theme.** When the color shown comes from a built-in definition, the source line shows both shades: "From Service · follows the theme: light ■ #DCEBFF, dark ■ #172B45".
- **After a commit.** When what a theme draws changed, a polite status line under the control says so: "Now #182C46 in both themes; the light theme showed #DCEBFF."

**Element inspector, "Appearance" (its own).** This is `AppearanceSection.tsx`.
- Shape, Fill and Stroke rows. Each row has a source line, tied to the control with `aria-describedby`:
  - "Its own", with a per-trait reset button such as "Use AI agent's fill";
  - "From AI agent";
  - "From AI agent, set in this project";
  - "From AI agent · follows the theme", with both shades, for built-in sources.
- **Picking the color the element would show without its own trait removes that trait instead of storing a copy.** The comparison is against the value drawn in the current theme, worked out with `drawnColorsOf`. When nothing is left, it sends `appearance: null`.
- The existing "Use the component's appearance" stays.
- New: "Use these colors for every AI agent". It is a batch: a `set-component-appearance` merged into the editable level, and `update-element` commands removing those traits.

**"Every <component>" section** (new `shell/inspector/DefinitionAppearanceSection.tsx`).
- Shape, Fill and Stroke at the editable level (`editableAppearanceOf`). They are sent as `set-component-appearance` with the stored value merged, never resolved values.
- Where it is saved:
  - "Saved in this project; the built-in Systems package stays as it is.", or
  - "Saved in the package Clinic."
- Who follows: "Applies to 12 elements; 2 keep a fill of their own · Make them follow". "Make them follow" is a batch of `update-element` commands removing that trait.
- Subtypes: "Chat channel, AI agent, MCP server and Semantic layer set their own fill and keep it."
- Per-trait reset: "Use Systems' fill", which removes the trait at that level.

**Relation inspector** (`RelationInspector.tsx`):
- "Appearance" (this relation's own): Stroke, Width (1–6) and Dash (solid, dashed, dotted), with source lines, resets, and "Use for every communicates with".
- "Every communicates with" section, through `set-relation-type-appearance`.
- Relation attribute values that differ from their relation type's defaults are marked as particularities, as element ones are.

**Notes and arrows** (`Inspector.tsx`). Fill and Stroke for notes, Stroke for arrows, through `update-free-shape`. Reset: "Use the theme's colors".

**Multi-selection.** "Appearance of 5 shapes":
- Fill applies to the selected elements and notes.
- Stroke applies to elements, relations, notes and arrows.
- It sends one batch command. The value shown is the common one, or "Mixed".

**Contrast hints.** Inline, with an icon and words; never a refusal and never a notice. Each theme's drawn colors, after the dark rule, are checked against that theme's canvas:
- A line color (relation, relation type, arrow) under 3:1 on a canvas: "Hard to see on the dark canvas (2.1:1); lines need 3:1."
- An element or note whose fill and stroke are both under 3:1 on a canvas: "Blends into the light canvas."
- A stroke under 3:1 against its own fill in the other theme: "In the light theme its stroke is hard to see on its fill (1.7:1)."

**Recent colors.** A committed exact color goes to the front of `preferences.recentColors` (at most 8). Suggestions are `recentColors` followed by `colorsInUse(project)`, 12 at most.

**Where colors are reachable.** The planned right-click menu gets "Color…". It selects the target and focuses the inspector's Fill control (Stroke for relations and arrows) through `editor.focusInspector('fill' | 'stroke')`.

### 4.8 Claude (M4)

- Write tools wrap the commands: `set_component_appearance`, `set_relation_type_appearance`, and `update_element` / `update_relation` / `update_free_shape` with colors. Each call is one undoable action labelled Claude.
- Read tools return `appearance`, `sources`, `darkColors` / `darkStroke`, and `legibility`.
- Tool descriptions say:
  - colors are `#RRGGBB`;
  - built-in colors follow the theme until set, and a built-in fill keeps its light value next to a stored stroke under 3:1 on the dark canvas;
  - lines need 3:1 on both canvases;
  - snapping uses 8 canvas units, and Claude's positions are never snapped.
- Claude neither reads nor sets preferences.

### 4.9 Tests

**core** (test-first)
- Validation, table-driven:
  - each trait is accepted;
  - these are refused: an unknown key, `#fff`, `#12345678`, `red`, `rgb(…)`, a `null` trait, 0, NaN and Infinity;
  - writing gives capitals, and the stored spelling is kept;
  - `{}` means none.
- Resolution:
  - an entry for `systems.database` reaches `clinic.calendar`, but not an element with its own fill, and not Service subtypes;
  - an entry for `relates-to` reaches `is part of`;
  - an entry for an own definition is ignored;
  - `sources` and `darkColors` match the precedence and the dark rule;
  - cache identity holds.
- Commands:
  - a built-in definition gives one `set-project`; an own one gives one `replace` and drops its entry;
  - `null` drops empty maps;
  - a stale entry is removed by `null`;
  - an unknown id is refused;
  - labels as in 4.5;
  - a re-pick in another case leaves the state deep-equal;
  - `update-project` removes and restores entries;
  - relation appearance works through create and update;
  - `checkedFreeShape` keeps colors;
  - the old commands refuse bad colors.
- `invariants.test.ts`: the random-sequence property gains both new commands, appearance changes and free-shape colors. Undo still reverses exactly.
- A fast-check property: each resolved trait is the first one set in the order of 4.4.
- `check.test.ts`: `appearance-not-used` warnings, and the project still opens.

**schema**
- The generated schemas are current.
- Project files with `appearances` validate.
- A bad key pattern, an unknown trait and an alpha color are refused. Two bad keys give two errors, each at its key's own pointer, and no "property name must be valid".
- `Relation.appearance`, `Note.fill/stroke` and `Arrow.stroke` validate.

**server**
- `locateProblems` points each appearance warning at `.vaproject` and its entry. This includes an entry for a definition of the project's own package, which must not land in the package file.

**app**
- `buildScene(project, view, previous)` deep-equals `buildScene(project, view)` for random project edits (fast-check), and reuses unchanged items.
- A scene item with an extra field the paint list does not name makes its tile rebuild.
- `rebuild()` computes tile keys only for new items.
- Paint-only changes restyle in place, show in one frame, and keep `fallbacks = 0` and `staleShown = 0`.
- Recoloring a container restyles its contents' blocks and the label backs on it. Previewing does the same and touches nothing else.
- `ColorControl`:
  - commits on `change`, not `input`;
  - the preview ends when the commit resolves or is refused;
  - the code box keeps its tests, now in capitals and named "… color code";
  - the swatch row works with Tab and the arrow keys;
  - Mixed;
  - both shades;
  - the line after a commit.
- `AppearanceSection`: picking the inherited color removes the trait; per-trait reset; "Use for every".
- Definition sections send stored values only, show the counts, and send "Make them follow" as one batch.
- Multi-selection sends one batch.
- Inspector tests compare colors without regard to case.

**bench**
- "Recolor every Service": a project appearance for `systems.service` applied through `executeCommand`, then `sceneOf`, `indexScene` and `controller.update`. It reports:
  - the applying frame's drawing work (`controller.update` and its first `renderNow`);
  - `sceneOf` and `indexScene` on their own;
  - the frames until the change shows;
  - later frames;
  - `fallbacks` and `staleShown`.

---

## 5. Grid, rulers and snapping (A3)

### 5.1 One step: 8 canvas units

- `GRID_STEP = 8`, in a new pure module `canvas/grid.ts`.
- Built-in default widths change: Service, Database and Object storage 180 → 176; Person 140 → 144. Heights 72 and 80 already fit. This is in `systems.ts:41, 90, 97, 107`.
- `NOTE_SIZE` becomes 224 × 88 (`CanvasArea.tsx:51`). `ARROW_LENGTH` stays 160.
- `NUDGE` becomes `GRID_STEP` (`controller.ts:85`).
- Ruler ticks fall on the grid's own lines.
- The synthetic bench's `CELL.height` 110 → 112.
- `examples/my-systems/views/system-overview.vaview`:

| Shape | Was | Becomes |
| --- | --- | --- |
| clinic-booking width | 980 | 984 |
| whatsapp | (40, 164) | (40, 168) |
| booking-agent | (260, 164) | (264, 168) |
| scheduling | (500, 60), height 380 | (504, 64), height 384 |
| note width | 460 | 464 |

- Test pins to update in the same commit:
  - `scene.test.ts:135-159`, every rect of the position test:
    - Patient 144 wide;
    - Clinic booking 984 wide;
    - Scheduling `{x: 744, y: 104, width: 440, height: 384}`;
    - Appointments API `{x: 784, y: 208, width: 176, height: 72}`;
    - Appointments DB `{x: 784, y: 368, width: 176, height: 80}`;
  - `scene.test.ts:170`, WhatsApp `{x: 280, y: 208, width: 176, height: 72}`;
  - `scene.test.ts:270`, the note, 464 wide;
  - `scene.test.ts:277`, bounds `{x: 40, y: 40, width: 1184, height: 592}`;
  - `hit.test.ts:11`, the comment: Appointments API at (784, 208), 176 × 72. Its points still hit, and the `enclosedBy` box still holds Scheduling;
  - `gestures.test.ts:92`, the new element at `x: 56, y: 396` inside Scheduling.
- These use 180 in fixtures of their own and stay: `core/definitions.test.ts:17`, `schema/format.test.ts:85` and `:136`, `schema/validate.test.ts:158`, and `geometry.test.ts:5`.
- The scene constants (24, 48, 40, 24) are already multiples of 8.

### 5.2 Grid drawing and spacing per zoom

**Families.** Line families are spaced s_j = 8·5^j canvas units (8, 40, 200, 1,000, 5,000, 25,000). On screen, a family's spacing is p_j = s_j × scale CSS px.
- Strength: F(p) = clamp(ln(p/4) / ln 50, 0, 1).
- Families are drawn from the finest with F ≥ 0.1 (p ≥ 5.9 px) up to the first with F = 1.
- Each line is drawn once, in the coarsest drawn family it belongs to: white at alpha F × `gridStrength`, tinted `gridLine`.
- While snapping is on, the 8-unit family keeps an alpha of at least 0.05 in light and 0.04 in dark (1.10:1) whenever its lines are at least 8 px apart. Then the lines shapes snap to can be seen at 100%, where F alone gives them 1.05.
- Strength follows the scale continuously, so nothing pops when zooming.

| Scale | Families drawn (on-screen spacing, F) |
| --- | --- |
| 8 | 8 (64 px, 0.71), 40 (320 px, 1) |
| 2 | 8 (16, 0.35), 40 (80, 0.77), 200 (400, 1) |
| 1 | 8 (8, 0.18), 40 (40, 0.59), 200 (200, 1) |
| 0.5 | 40 (20, 0.41), 200 (100, 0.82), 1000 (500, 1) |
| 0.25 | 40 (10, 0.23), 200 (50, 0.65), 1000 (250, 1) |
| 0.1 | 200 (20, 0.41), 1000 (100, 0.82), 5000 (500, 1) |
| 0.02 | 1000 (20, 0.41), 5000 (100, 0.82), 25000 (500, 1) |

**Placement.**
- One `Graphics` named `grid` is **the first child of `world`**: `world.addChildAt(grid, 0)`, before the shape tiles. It is not cullable.
- Its counter-transform is `grid.scale = 1/scale` and `grid.position = (offset − camera)/scale`, so it draws in screen space.
- Lines are 1 CSS px. Positions come from `crispLine(x, resolution)`, using the renderer's resolution: the device width is max(1, round(resolution)), centered on device-pixel centers when that width is odd and on boundaries when it is even.
- **Following devicePixelRatio.** A `matchMedia('(resolution: <dpr>dppx)')` listener, renewed after each change, does four things:
  - calls `renderer.resize(width, height, dpr)`;
  - sets `this.resolution`;
  - sharpens text again;
  - redraws the grid.
  - Today `renderer.ts:278` and `:294` fix the resolution at init, so a browser zoom or a move to another screen resamples the canvas.
- `world` stays the first stage Container (`CanvasArea.test.tsx:140`), and the Culler and `FakeApplication` are unaffected.
- It works on WebGL, WebGPU and Canvas 2D (plain strokes in screen space).

**Cost.**
- The geometry covers the viewport plus one period P of the coarsest drawn family, plus one pixel, to the right and below. Every drawn family's spacing divides P.
- A pan only sets `offset = round((mod(camera, P) − P) × dpr) / dpr`, with `mod(x, P) = ((x % P) + P) % P` computed in float64. That is no geometry. JavaScript's `%` alone gives a negative remainder whenever the canvas origin is left of or above the screen, which would leave a strip up to P wide uncovered.
- A zoom or resize redraws the lines. This draws at most about 760 lines on a 1920 × 1080 canvas, and about 1,150 on 3,308 × 2,000 (a 4K window less the panels). It is capped at 1,200; above that, the finest family is left out.
- When the grid is off, `grid.visible = false` and no work is done.
- The grid sits under every fill, so on its own it shows only on the bare canvas. Inside containers, 5.3 applies.

### 5.3 Inside containers

- **Where it is drawn.** A container's grid is a `Graphics` of its own, added as the last child of `depthLayers[d]`, where d is the container's depth.
  - It sits above the container's fill and below its contents at depth d + 1, outside the drag container's alpha.
  - It is not drawn inside the drag container: `renderer.ts:131` adds `dragLayer` after every tile, so a grid there would cover the container's other contents, their names and the relations.
  - It is moved back to the end of `depthLayers[d]` if a rebuild adds tiles meanwhile.
- **What it draws.** Lines at the container's origin + k·8, or the coarser family with p ≥ 6 px. They are computed only within the container's rect, drawn again on zoom, and capped at 400 lines.
- **When it shows.**
  - While a drag snaps inside a container: the container of the moving shape that carries the pressed one (5.5).
  - While the grid shows and the camera rests: in the innermost shape under the pointer that holds contents. The controller passes that container to `renderer.showContainerGrid(key | undefined)`.
- **Position readout.** Near the pointer during a drag, it shows the stored offset of the moving shape that carries the pressed one: "264, 168 in Clinic booking" (plain "264, 168" in World).
  - It is a pooled BitmapText in the existing white `detail` font over a white sprite back, tinted `surfaceRaised` / `text`, in the screen-space container `screenMarks` (5.4).
- `DragFrame = { origin: Point; container?: Rect; containerName?: string }`.
- When the separate drop-into-container design lands, it passes the frame of the container the shape lands in, and snapping uses that frame.

### 5.4 Rulers

- T10 adds the screen-space `Container` named `screenMarks` to the stage, **after** `world`, with the readout. T11 adds the rulers to it.
- **Bands.** 20 px along the top and left, plus a corner square. A band `Graphics` in `rulerBand` with a 1 px `rulerBorder`, drawn again on resize and theme change.
- **Ticks.** One `Graphics`, drawn again on camera change and resize:
  - 4 px ticks on the finest drawn family with p ≥ 8 px;
  - 8 px ticks at the label step.
- **Labels:**
  - at the smallest of {1, 2} × 8·5^j canvas units that is at least 64 px apart (at scale 1: 0, 80, 160…; at 0.5: 0, 200, 400…; at 2: 0, 40, 80…);
  - integers, with "−" for negatives;
  - from a pool of `ceil(W/64) + ceil(H/64) + 4` BitmapText in the existing `detail` font, sized from the viewport on resize (a 4K window needs about 90), tinted `rulerText`;
  - rotated −90° on the left;
  - hidden within 24 px of the selection marks.
- **Selection extent.** A band in `selected` at 20% alpha over the selection's absolute bounds on each ruler, with 2 px end marks in `selected`. `dragTo` draws it again, moved by the drag's delta.
- **Pointer markers** are DOM elements (`.canvas-ruler-pointer`, `pointer-events: none`), moved with `transform` on pointermove. They never trigger a PixiJS render.
- Rulers show absolute canvas units. The inspector never shows a container offset as a ruler coordinate; it labels offsets "in <container>".
- **`renderer.rulersContain(screen)`.** The controller uses it to ignore pointerdown, idle pointermove (hover, handle and cursor, `controller.ts:353-374`), dblclick (`controller.ts:468`) and contextmenu inside the bands. The wheel still zooms. The right-click design is told about contextmenu (8.5).
- **Reveal and fit.** `revealCamera` (`camera.ts:61`) and `fit()` take the viewport inset by the bands, so a revealed shape is never left under a band.
- **CSS offsets.** `.canvas-frame[data-rulers]` moves `.canvas-toolbar`, `.canvas-message` and `.canvas-keys` in by `--ruler-size`. Today `keyboard.css:3-9` puts the Keyboard disclosure at the bottom left, over the left ruler.

### 5.5 Snapping rules

1. **When.** Snapping is active while `preferences.grid && preferences.snapToGrid`. The defaults are grid off and snapToGrid on, so M2's behavior holds until the person turns the grid on.
2. **Frame and anchor.** What snaps is what is stored.
   - The anchor is the moving shape that carries the pressed item: the pressed shape itself when it is in `movingShapes` (`gestures.ts:66-70`), otherwise its nearest container there, found by key prefix.
   - This matters because a box selection or Ctrl+A moves a container with its contents, and only the container's position is stored.
   - A pressed note or arrow is its own anchor.
   - For nudges, the anchor is the moving shape that carries the reference shape (the current one, or the first selected).
3. **One delta.** `snappedDelta(anchor, raw, frame, step) = { x: frame.x + snap(anchor.x + raw.x − frame.x, step) − anchor.x, … }`.
   - `anchor` is the anchor's absolute position, and `frame` its container's absolute origin ((0, 0) in World).
   - The delta moves every moving shape. The selection keeps its arrangement, and the other moving shapes keep their offsets from the anchor, on the grid or not.
   - The drop-into-container design passes the landing container's origin as `frame`.
4. **Preview equals drop.** The controller passes the same snapped delta to `renderer.dragTo` and to `moveCommand`. `moveCommand` itself is unchanged.
5. **Alt.** Holding Alt places freely.
   - The controller reads `event.altKey` on every move, and on Alt keydown and keyup during a drag, recomputing from the last raw delta.
   - It calls `preventDefault` on the Alt keyup that ends such a drag, so Windows browsers keep focus.
6. **Creating.**
   - `createAtCommand(…, step?)` snaps the offset after subtracting the container's origin. The created position stays unpinned (`e983c0b`).
   - `addNote` snaps `x, y`; `addArrow` snaps `from` and `to`.
7. **Nudges.**
   - Shift+arrow moves by 8.
   - While snapping is active, the anchor goes to the next grid line in that direction (`nudgedOffset(v, ±1, 8)`: 164 → 168 → 176), and the selection follows.
   - `waitingNudges` holds directions, and each delta is worked out when it is sent.
8. **Never snapped.** Layout results, Claude's commands, positions read from files, and undo or redo. A click below the drag threshold never moves anything.
9. **Pinned.** A snapped move is pinned like any hand move (ADR-0009). A created shape is not. Commands carry final coordinates, so the history, the files and Claude need nothing new.

### 5.6 Controls and keys

- `CanvasToolbar` gets three icon toggles with `aria-pressed`:
  - "Grid", titled "Show the grid (Shift+G)";
  - "Snap to grid", titled "Snap shapes to the grid; hold Alt to place freely", disabled while the grid is hidden;
  - "Rulers", titled "Show the rulers (Shift+R)".
- `CanvasArea` reads `usePreferences()` and passes `grid`, `snapToGrid`, `rulers` and `onToggle`.
- Shift+G and Shift+R are handled in `controller.ts` keydown. They avoid every key in use (`keys.ts`, including AltGr, `.` and `,`) and Ctrl+R.
- `keys.ts` adds:
  - `{ keys: 'Shift+G', does: 'Show or hide the grid' }`;
  - `{ keys: 'Shift+R', does: 'Show or hide the rulers' }`;
  - `{ keys: 'Alt while dragging', does: 'Place freely, without snapping to the grid' }`;
  - and Shift+arrow keys now read "Move the selection one grid step".

### 5.7 Cost per frame

| Situation | Cost |
| --- | --- |
| Pan | grid: two numbers; ruler ticks: at most about 250 segments, and label moves within the pool |
| Zoom | grid: at most about 760 lines on 1920 × 1080; a container grid: at most 400 lines; rulers as for a pan |
| Drag | the container grid on zoom only; one readout and one extent update per frame |
| At rest | the container grid when the container under the pointer changes; otherwise nothing |

The bench targets: the grid adds at most 0.5 ms at the median, and every phase stays at 60 fps with both the grid and the rulers shown.

### 5.8 Tests

- `grid.test.ts` (fast-check):
  - spacings are 8·5^j;
  - drawn families have F ≥ 0.1 and stop at the first F = 1;
  - each line's strength is continuous in scale, and the snapping floor holds;
  - the lines cover [0, W] × [0, H] for any camera, negative positions included;
  - `crispLine` gives integer device widths at resolutions 1, 1.25, 1.5, 2 and 3;
  - `snap` is idempotent and within half a step;
  - `snappedDelta` keeps relative offsets and lands the anchor on a multiple of 8 in its frame;
  - `nudgedOffset` reaches the next line;
  - ruler label steps are at least 64 px, and the pool covers the viewport.
- Renderer:
  - the grid is `world`'s first child;
  - the stage's first Container is still `world`;
  - a pan changes `position` and does not redraw;
  - a zoom redraws within the cap;
  - the grid is hidden when off;
  - a resolution change redraws it;
  - the container grid is the last child of `depthLayers[d]`, under the contents;
  - rulers are drawn again on camera change, resize, selection change and drag;
  - `rulersContain`.
- Controller:
  - the preview delta equals the drop delta;
  - after Ctrl+A, dragging an off-grid container by a nested shape stores the container at a multiple of 8;
  - Alt bypasses snapping and is picked up mid-drag;
  - Alt keyup is prevented after an Alt drag;
  - nudge by 8 and to the next line;
  - Shift+G and Shift+R;
  - hover, double-click and contextmenu are ignored inside the bands;
  - reveal keeps a shape out from under them.
- `CanvasToolbar`: `aria-pressed` follows the preferences; Snap is disabled while the grid is off.
- Bench phases: "Pan with the grid", "Zoom with the grid", "Pan with the grid and rulers", "Zoom with the grid and rulers". Each is compared with the same phase without them.

---

## 6. Preferences

### 6.1 Shape: `packages/core/src/preferences.ts` (pure)

```ts
export type ThemeChoice = 'system' | 'light' | 'dark';
export interface Preferences {
  theme: ThemeChoice;
  /** Whether the grid shows. */
  grid: boolean;
  /** Whether shapes moved or created by hand snap to the grid while it shows. */
  snapToGrid: boolean;
  /** Whether the rulers show. */
  rulers: boolean;
  /** Exact colors picked lately, newest first, in capitals, at most 8. */
  recentColors: Color[];
}
export type PreferenceChanges = Partial<Preferences>;
export const PREFERENCES_VERSION = 1;
export const DEFAULT_PREFERENCES: Readonly<Preferences> =
  { theme: 'system', grid: false, snapToGrid: true, rulers: false, recentColors: [] };
export const MAX_RECENT_COLORS = 8;
/** What the preferences file holds, read leniently. */
export interface PreferencesRead {
  /** Every name this build can read; the default for the rest. */
  preferences: Preferences;
  /**
   * What is kept as found and written back unchanged unless that name is set: names this build does
   * not know, and known names whose value it cannot read, such as a theme added later.
   */
  kept: Record<string, unknown>;
  /** The known names kept because their value could not be read, for the one warning. */
  unread: string[];
  /** Whether a later format wrote the file (`schemaVersion` above 1); this build then never writes it. */
  newer: boolean;
}
/** Lenient, for the file. `schemaVersion` is read here and never lands in `kept`. */
export function readPreferences(value: unknown): PreferencesRead;
/** Strict, for messages: refuses unknown names, wrong types, invalid or too many colors. */
export function checkPreferenceChanges(value: unknown): { ok: true; changes: PreferenceChanges } | { ok: false; problems: Problem[] };
/**
 * {"schemaVersion":1,"theme",…,"recentColors"}: each known name from `kept` when it holds it and from
 * `preferences` otherwise, then the other kept names sorted; two spaces, LF, final newline.
 */
export function formatPreferences(preferences: Preferences, kept: Record<string, unknown>): string;
```

### 6.2 Storage: `packages/server/src/preferences.ts`

**Folder.** `preferencesFolder(platform, env, home)` works it out once at startup, with `path.win32` or `path.posix`:

| Platform | Folder |
| --- | --- |
| Windows | `%APPDATA%\Visual Anything` when APPDATA is absolute, otherwise `<home>\AppData\Roaming\Visual Anything` |
| macOS | `~/Library/Application Support/Visual Anything` |
| Elsewhere | `$XDG_CONFIG_HOME/visual-anything` when absolute, otherwise `~/.config/visual-anything` |
| Any | `VISUAL_ANYTHING_PREFERENCES`, when absolute, names the folder instead; a relative value is ignored with a warning |

The file is `preferences.json`.

**Store interface:**

```ts
export interface PreferencesStore {
  current(): Preferences;
  set(changes: PreferenceChanges): Promise<{ preferences: Preferences; saved: true } | { preferences: Preferences; saved: false; reason: string }>;
  close(): Promise<void>;
}
export function openPreferences(folder: string | null, options?: { writer?: WriteOptions }): Promise<{ store: PreferencesStore; warning?: string }>;
```

- **Reading:** a 64 KiB cap, then `JSON.parse` in a try, then `readPreferences`.
  - A missing file gives the defaults and creates nothing.
  - An unreadable file gives the defaults plus one terminal warning. It is not written over until a preference changes.
  - Known names with unreadable values give one warning that names them. Their values are kept.
  - A file from a newer format is used for what reads, with one warning. It is never written: preferences then live in memory only.
  - A broken file never stops the program, unlike an invalid project (`command.ts:129-133`).
- **`set`:**
  - it runs in the store's own queue, never the session's;
  - it reads the file again. When the file comes from a newer format, it changes memory only and answers `saved: false` ("a newer Visual Anything wrote it");
  - otherwise, each name the change sets takes its new value and leaves `kept`. Every other name keeps what the file holds, readable or not, so an older build never writes its own value over a theme it cannot read;
  - it writes with `writeFileAtomic` (`writer.ts:53-78`), then updates memory;
  - if the write fails, memory still updates and `saved: false` is returned.
- `folder === null` keeps preferences in memory only (tests).
- **Wiring:**
  - `CommandEnvironment.preferencesFolder: string | null`. `cli.ts` passes `preferencesFolder(process.platform, process.env, homedir()) ?? null`.
  - The store opens before `openSession` and closes after `session.close()`.
  - `startServer({ …, themeHint })` appends `&theme=` to `url` (`server.ts:153`).
- Nothing secret goes in this file. A future M4 discovery file holding the port and token stays separate, and readable only by its owner.

### 6.3 Protocol: `packages/core/src/protocol.ts`

```ts
export const PROTOCOL_VERSION = 2;
export const THEME_PARAM = 'theme';
/** Thrown for a message from a program or app that speaks another version of the protocol. */
export class ProtocolVersionError extends ProtocolError { override name = 'ProtocolVersionError'; }
export interface PreferencesChangedMessage { type: 'preferences/changed'; preferences: Preferences; requestId?: string }
// ServerMessage += PreferencesChangedMessage; SERVER_TYPES += 'preferences/changed' (envelope: `preferences` is a record)
// AppMessage   += { type: 'preferences/set'; requestId: string; changes: PreferenceChanges } (envelope: `changes` is a record)
```

**Version mismatch.**
- `decodeServerMessage` throws `ProtocolVersionError` for a `project/opened` whose `protocolVersion` differs. Today `protocol.ts:122-126` throws a plain `ProtocolError`.
- `connection.ts` turns it into a new failure reason, `'version-mismatch'`. Today every `ProtocolError` becomes `'unreadable'` (`connection.ts:286-295`).
- `App.tsx`'s `Failure` shows the title "This tab and Visual Anything come from different builds", the detail, and: "Reload the tab to get the app that goes with it; if this screen comes back, restart Visual Anything and open the address it prints in the terminal."
- Reloading works because the tab keeps its token in session storage (`live/session.ts`).
- So two builds stop on `project/opened`, before either reads a message the other does not know, and they say why.

**Session** (`session.ts`). `SessionOptions.preferences?: PreferencesStore`.
- `connect()` sends `project/opened`, then the warnings notice if there is one, then `preferences/changed`, but only when a store is given. Existing greeting tests stay as they are.
- `receive()` decodes once with `decodeAppMessage` and gains a `preferences/set` case:
  - it calls `checkPreferenceChanges`; on failure it sends `command/rejected` with `invalid-preferences`;
  - it awaits `store.set(...)`, then broadcasts `preferences/changed` to every app. The requester's copy carries its `requestId`;
  - when not saved, it sends a warning notice to the requester: "Your preference applies until Visual Anything stops: it could not be saved (<reason>)."
  - Without a store, it sends `command/rejected` with `not-saved`: "This program keeps no preferences."
  - It **never** calls `execute`, `#enqueue` or `record`: no history entry, no author, no project save, and no waiting behind a model save.
- `server.ts` is unchanged apart from `themeHint`.

### 6.4 App

- `live/connection.ts`:
  - `LiveState.preferences: Preferences | undefined`;
  - `preferences/changed` is accepted in any status, `connecting` included;
  - a new `'preferences'` request kind, with `setPreferences(changes): Promise<{ ok: true } | { ok: false; problems: Problem[] }>`;
  - `rejected()` says "Could not change your preferences: …" instead of "Could not preferences";
  - the `'version-mismatch'` reason (6.3).
- `live/context.ts` and `LiveProvider.tsx` expose `setPreferences` and pass the program's preferences to the store.
- `app/src/preferences/store.ts` exports:
  - `startPreferences(window)`, `appliedPreferences()`, `subscribePreferences(listener)`, `applyLocally(changes)`, `receivePreferences(preferences)`, `resetPreferencesForTests()`;
  - `holdTheme(): { shown(theme: ThemeName): void; release(): void }`. While a hold is active, a new theme reaches `data-theme` when `shown(theme)` is called, or 500 ms after it was asked for. Without a hold, it reaches `data-theme` at once.
- `app/src/preferences/usePreferences.ts` exports two hooks:
  - `usePreferences(): { preferences; theme: ThemeName; change(changes): void }`. It uses `useSyncExternalStore` and reads `LiveContext` through `useContext`, so it works without a provider;
  - `useThemeHold(active: boolean): (theme: ThemeName) => void`. It takes a hold while `active`. `Shell` passes the returned function to `CanvasArea` as `onThemeShown`.
- **Behavior:**
  - a change applies in the tab at once;
  - while the connection is open, the latest change is sent 500 ms after the last one, or at once when the tab is hidden. Otherwise it waits and is sent when the connection opens;
  - until the program answers, the tab keeps the person's latest choice over what the program sends;
  - a refusal puts back the program's value and shows a notice;
  - while the session is closed: "Your theme applies to this tab only: Visual Anything is not connected."

### 6.5 Security

- Preferences travel only over the live connection, which checks Host, the app's Origin and the token at the upgrade (`security.ts:79-90`).
- No HTTP route is added, because a request without an Origin passes `checkRequest` without the token (`security.ts:58-73`). Nothing personal is written into `index.html`, which is served without a token.
- Values come from a closed set: an enum, booleans, and at most 8 validated colors. There are never paths or free text. A value kept from a newer build is written back as it was read, never sent to an app.
- The fragment hint and the sessionStorage value accept only listed names. A forged hint only changes that tab's first paint, since the tab has no token.
- This is the program's first write outside the project folder. The path is fixed at startup, and tests always pass a folder of their own.

### 6.6 Tests

- **core:**
  - lenient reading: missing keys, wrong types, unknown names, not an object;
  - `schemaVersion` never lands in `kept`;
  - a higher version reads as `newer`;
  - an unreadable value for a known name is kept and written back;
  - strict changes;
  - exact formatted text, `schemaVersion` written once;
  - protocol round-trips;
  - `preferences/set` without changes is refused;
  - unknown types still throw;
  - a version mismatch throws `ProtocolVersionError`.
- **server, `preferences.test.ts`:**
  - folder rules for win32, darwin and linux, with and without environment variables; relative values ignored;
  - a missing file gives the defaults with no file created;
  - a broken file gives the defaults plus a warning, and is untouched until a set;
  - a newer file is never written;
  - a set keeps a theme it cannot read unless it sets the theme;
  - a set writes atomically, with no `.va-tmp` left, in exact key order;
  - a change on disk between load and set survives;
  - sets are serialized;
  - a failed write gives `saved: false`;
  - `close` waits.
- **server, `session.test.ts`** with a fake store:
  - greeting order;
  - broadcast, with the requestId to the requester only;
  - `invalid-preferences`;
  - the history summary unchanged;
  - no project file written;
  - the answer arrives while a slow model save is pending.
- **server, `command.test.ts`:** a temporary folder; `&theme=dark` only for an explicit choice; a broken file prints one warning and the program runs.
- **server, `server.test.ts`:** greeting counts updated where a store is given.
- **app:**
  - store tests:
    - the hint is read and removed;
    - the cache is read and written;
    - a matchMedia change;
    - no matchMedia gives light;
    - a hold delays `data-theme` until `shown` or 500 ms;
    - without a hold, `data-theme` changes at once;
  - `Header.test.tsx`:
    - the radio group named "Theme";
    - arrow keys;
    - the focus ring on the option;
    - one `preferences/set` after several quick choices;
    - works without a provider;
  - `connection.test.ts`:
    - `preferences/changed` while connecting;
    - `setPreferences` resolves;
    - refusal wording;
    - a pending change is sent on open;
    - `'version-mismatch'`;
  - `App.test.tsx`: the version-mismatch screen.

---

## 7. Visual polish: first steps, in order

1. **Control states and focus (A1).**
   - Shared rules with `:where(button, select, input, [role='menuitem'], summary)`:
     - hover → `--surface-hover`;
     - `:active` → `--surface-pressed`;
     - disabled or `aria-disabled` → muted, with no hover.
   - `:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px }`. The Theme control draws it on `.theme-option:has(:focus-visible)`.
   - Menu items use `outline-offset: -2px` instead of today's background-only focus (1.17:1, `styles.css:412-416`).
   - The Delete button gets `--problem-fill`, its hover, and the `--control-border` border.
   - Under `@media (forced-colors: active)`: focus uses `Highlight`, and pressed uses an outline.
2. **Tokens (A1).** Every literal from 3.3, raised surfaces with borders for elevation in dark, the token renames, and `--control-border` with values in both themes.
3. **Icons (A1).**
   - About 15 Lucide paths (ISC license) are copied into `packages/app/src/shell/icons.tsx` as `currentColor`, `aria-hidden` components, with `packages/app/src/shell/LICENSE-lucide.txt`: ZoomIn, ZoomOut, Fit (maximize), Note (sticky-note), Arrow (move-up-right), Grid, Ruler, Snap (Lucide's `magnet`), Sun, Moon, Monitor, Dismiss, Undo and Redo.
   - Zoom buttons are icon-only. Note, Arrow and Fit keep visible text.
   - Every accessible name stays, and the `.notice` and `.notice-dismiss` selectors stay (`Notices.tsx:71-73`).
   - No dependency is added.
4. **Canvas message and menus (A1).**
   - `.canvas-message` becomes a centered card on `--surface-raised`, so it moves out of the toolbar row. Failures keep `role="alert"`.
   - New `canvas/placeMenu.ts` exports `placeMenu(frame: Size, anchor: Point, menu: Size): Point`. It gives an 8 px margin, and opens the menu upwards near the bottom. `RelationMenu` uses it in `useLayoutEffect` to stay inside `.canvas-frame`.
   - `.canvas-menu` becomes the shared menu style. The right-click menu reuses it, together with `placeMenu`.
5. **Header and tab (A1).**
   - A product mark: two overlapping rounded squares in `--accent`, inline SVG.
   - `packages/app/public/favicon.svg` uses its own `prefers-color-scheme`, and is named in `index.html`'s head.
   - `document.title = "<project> · Visual Anything"`, set from `Shell`.
6. **Small fixes (A1).**
   - `.status-progress` is an indeterminate bar that stays still under reduced motion.
   - The zoom readout gets `font-variant-numeric: tabular-nums` and `min-width: 4ch`.
   - The z-index tokens are used.
   - The `:root` font size goes to 87.5%.
   - Badges and `.inspector-mark` (`inspector.css:225`, 0.72rem) go to `--text-xs` (12 px).
   - Hit targets are at least 24 px.
7. **Scales (A4).** Every spacing, radius, font size, weight and z-index in `styles.css`, `panel.css`, `keyboard.css` and `inspector.css` moves onto the scale tokens.
8. **Empty states (A4).**
   - One `EmptyState` component: sentence, hint, action.
   - Canvas: "This view has no shapes yet." / "Add an element from the toolbar, or a note." / [Add an element], which focuses the toolbar's select. M4 adds "or ask Claude to build it".
   - Inspector: "Nothing is selected." (`Inspector.tsx:54`) gains the hint "Select a shape on the canvas or in the outline to see and change it here." The view's details stay under it.
   - Model panel lists: what they hold and where it comes from.
9. **Later, after M6:** a component palette with color chips, alignment guides, guides dragged from rulers, and a high-contrast theme.

---

## 8. Build order

### 8.1 Branching, commits, review

**Branch.**
- Track A lives in its own worktree, on branch `track-a`, branched from `m2-fixes` at `e983c0b`: `git worktree add -b track-a .claude/worktrees/track-a e983c0b`. A Claude Code session is opened in it.
- When `m2` is tagged, it is **merged** into `track-a`, never rebased onto. A rebase would drop the `Merge A<n> task` commits the reviewer looks for.

**Commits and tags.**
- Commits start with `A<n>:`.
- Task merges are titled `Merge A<n> task (x): …`.
- Milestone tags are merged into `track-a` with a commit titled `A<n>: merge m<N>`.
- A stage merges into the milestone line as `Merge A<n> into M<N>`, only when its Done-when holds. It is then tagged `a<n>`.
- `a0` tags `e983c0b`, the commit `track-a` branches from, so A1's review range takes in T1, T2 and T8a.
- The A0 docs commit is `A0: …`. It is made right after `m2` is merged in, so it never conflicts with the M2 close's own doc changes (`e983c0b` changed CLAUDE.md, the spec and ADR-0019).

**Process.**
- Each stage starts in plan mode with the user's OK (CLAUDE.md).
- Each stage ends with spec-reviewer, filtered as in 8.6.
- After any merge that touches `packages/schema/src/files.ts`, the schemas are generated again rather than merged.

### 8.2 Interfaces fixed before parallel tasks start

The main session commits these first, in T1:
- `core/src/colors.ts`;
- `core/src/preferences.ts`, with `PreferencesRead`;
- the protocol v2 types and decoding, `ProtocolVersionError`, `THEME_PARAM` and `invalid-preferences`;
- `core/src/builtin/dark.ts`, with `sources`, `darkColors` / `darkStroke`, `appearanceSourcesOf`, `darkColorsOf` (the dark rule of 4.4), `drawnColorsOf` and `relationDarkStrokeOf`;
- `app/src/theme/themes.ts` and `scale.ts` (types and values);
- `app/src/shell/icons.tsx`, with its license file;
- this spec's signatures for:
  - `CanvasRenderer` and `CanvasController` (`{ theme }`, `setTheme`, `onThemeShown`);
  - `CanvasArea`'s `theme?` and `onThemeShown?`;
  - `usePreferences()`, `useThemeHold()` and `holdTheme()`;
  - `PreferencesStore`;
  - the Theme control's selectors `.theme-control` and `.theme-option`.

### 8.3 (a) Can start now

These touch only new files, core and the server. The M2 close has changed none of them: `git diff --stat 03ed1d9 e983c0b` lists only app, schema and doc files. If the close changes a file T1 or T2 owns before `m2`, that task merges `m2` first.

| Task | Owner | Files | Uses |
| --- | --- | --- | --- |
| A0 · Docs (8.6) | main session | CONTEXT.md, docs/adr/0021–0024, spec, playbook, spec-reviewer, CLAUDE.md, the ADR-0019 edits. Approved now, committed after `m2` (8.1) | — |
| T1 · Core foundations, test-first | main session | as in 8.2 | — |
| T2 · Server preferences | task-builder | `server/src/preferences.ts` (new), `session.ts`, `command.ts`, `cli.ts`, `server.ts` (`themeHint`) | T1 core types |
| T8a · Grid helpers | task-builder | `canvas/grid.ts` and `grid.test.ts` (new, pure) | — |

### 8.4 (b) Waits for M2's close: `m2` tagged and merged into `track-a`

These edit app files that M2's review may still touch, and M2's benchmark must be measured on M2's renderer.

**A1 · Themes:**

| Task | Owner | Files |
| --- | --- | --- |
| T3a · App preferences and theme plumbing | task-builder | `app/src/preferences/*`, `theme/css.ts`, `scripts/tokens.ts`, `scripts/tsconfig.json`, `theme/tokens.css`, `main.tsx`, `index.html` (meta, inline script, favicon), `live/connection.ts`, `live/context.ts`, `live/LiveProvider.tsx`, `App.tsx` (version-mismatch screen), `test/setup.ts`, `shell/Header.tsx` (Theme control, product mark), app `package.json` scripts, `.prettierignore`, `eslint.config.js` (Node globals for `packages/app/scripts`) |
| T3b · Shell polish | task-builder | `styles.css`, `shell/panel.css`, `canvas/keyboard.css`, `inspector.css` (font floor only), `CanvasToolbar.tsx` (icons, `componentPalette`), `Notices.tsx` (icon), `StatusScreen.tsx`, `RelationMenu.tsx` and `canvas/placeMenu.ts` (new), `public/favicon.svg`, `styles-colors.test.ts`, `contrast.test.ts` |
| T4 · Canvas theme | task-builder | `renderer.ts`, `draw.ts`, `labels.ts`, `canvas/colors.ts` and `colors.test.ts` (renamed from `palette.ts` and `palette.test.ts`), `scene.ts` (dark fields), `controller.ts` (options pass-through, `themeShown`, comment renames), `gestures.ts`, `hit.ts`, `navigation.ts` and `InlineEditor.tsx` (comment renames), `CanvasArea.tsx` (`theme`, `onThemeShown`, effect), `test/FakeApplication.ts`, `bench/*`, `bench.html` |
| A1 integration | main session | merge T2, T3a, T3b and T4. `Shell` passes `theme` and `onThemeShown` (`useThemeHold`) and sets `document.title`. Run the bench; review; tag `a1` |

**A2 · Colors** (after `a1`):

| Task | Owner | Files |
| --- | --- | --- |
| T5 · Schema, core and the A2 interfaces, test-first | main session | Before M3's commands for collapse, expand and filters start: `files.ts` and the schemas; `validate.ts` (key errors); definitions resolution with entries; validation everywhere; the two commands; relation and free-shape colors; `update-project`; check; the problem code; server `Locations`; property tests; the sample's Booking agent stroke with its test pins (3.4). It ends with one interface commit: `definitionsIn` at every call site of 4.6 (tests included) and the ESLint rule; `EditorContext`'s `previewAppearance` and `focusInspector`, implemented in `Shell`; `CanvasArea`'s `registerPreview`; a `renderer.previewElement` stub |
| T6 · Canvas | task-builder | `scene.ts` (relation and free-shape colors, structural sharing, `sceneOf`), `renderer.ts` (paint-only restyles, `dependents`, the tile-key cache, `previewElement`), `Shell.tsx` (`sceneOf`), the bench recolor phase. **Merged before M3's collapse work changes `renderer.ts` or `scene.ts`** |
| T7 · Inspector | task-builder | `color.ts` and `color.test.ts`, `controls.tsx`, `AppearanceSection.tsx`, `DefinitionAppearanceSection.tsx` (new), `RelationInspector.tsx`, `Inspector.tsx` (note, arrow and multi-selection sections, the `focusInspector` request), `inspector.css` (tokens only), `Inspector.test.tsx` |
| A2 integration | main session | merge; tag `a2` before M4's write tools are fixed |

**A3 · Grid, rulers and snapping** (after M3's canvas tasks merge). The tasks run one after another, because T9, T10 and T11 all edit `renderer.ts`, and T10 and T11 both edit `CanvasArea.tsx` and `controller.ts`.

| Task | Owner | Files |
| --- | --- | --- |
| T8 · Sizes and alignment | main session | built-in sizes in `systems.ts`, the sample view, synthetic `CELL`, `NOTE_SIZE`, the test pins in 5.1 |
| T9 · Grid | task-builder | the grid in `renderer.ts` (`setGrid`, following devicePixelRatio, the container grid and `showContainerGrid`, a `rulersContain` stub that returns false), `CanvasToolbar.tsx` toggles, `CanvasArea.tsx` preferences wiring, bench grid phases |
| T10 · Snapping | task-builder, after T9 | `controller.ts` (anchor and frame, Alt, nudges, Shift+G/R, the container under the pointer, guards calling `rulersContain` on pointerdown, idle pointermove, dblclick and contextmenu), `gestures.ts` (`createAtCommand` step), `CanvasArea.tsx` (`add*`), `keys.ts`, `renderer.dragTo(delta, frame)` (container grid while dragging, `screenMarks` with the readout) |
| T11 · Rulers | task-builder, after T10 | `renderer.ts` (rulers in `screenMarks`, real `rulersContain`, the extent following `dragTo`, the label pool sized from the viewport), `camera.ts` and `controller.ts` (reveal and fit inside the bands), DOM pointer markers, CSS offsets for `.canvas-toolbar`, `.canvas-message` and `.canvas-keys`, bench ruler phases |
| A3 integration | main session | merge; tag `a3` |

**A4 · Polish pass 2** (beside M4):
- T12, before M4's caption and guidance UI tasks: scales across every CSS file, extending the literal test to sizes, radii, shadows and z-index.
- T13: empty states.
- Tag `a4`.

### 8.5 Beside M3 to M6

- **M3:**
  - Its work outside `packages/app` and outside T5's files may run beside A1. Its app tasks wait for `a1`. Its commands for collapse, expand and filters wait for T5.
  - Its view list and perspective switcher are built on the tokens and icons.
  - Focus mode dims by alpha toward the current theme's canvas.
  - Aggregated relations use their relation type's appearance and dark stroke.
  - ELK uses spacing in multiples of 8, and rounds its results to multiples of 8 inside their container. That is part of layout, not snapping; the results are not pinned.
  - Its renderer work merges `a1` and T6 first.
- **M4:** the tools in 4.8. Live guidance uses `--highlight` with a wider line and a halo.
- **M5:** playback highlights and the travelling marker use `--highlight` plus a cue that is not color (double width, the marker), never a relation's own color.
- **M6:** dogfooding fixes feed A4 and later polish.
- **Designs in progress.** The A0 plan confirms these splits with the user before T3b, T4 and T6 start:
  - **Right-click menu.** Track A owns `.canvas-menu`'s styles and `placeMenu` (T3b), and the menu reuses both. Its contextmenu events inside the ruler bands are ignored (5.4). It offers "Color…" (4.7).
  - **Stacking order (bring to front and back).** It owns the drawing order of shapes within a depth, and the order hit testing follows.
    - T4 and T6 change Tile's drawings, not the order of tiles.
    - T6's equality treats every field it does not list as paint as geometry, so a stacking field rebuilds its tile.
    - Label surfaces are found with hit testing's own order.
    - Whichever of T4 or the stacking change lands second merges the first before it starts.
  - **Dropping shapes into containers.** It passes the landing container's frame to snapping (5.3, 5.5).

### 8.6 Docs edits (A0, exact)

**`docs/spec-v0.1.md`:**
- Update the "Last updated" line.
- Scope table, line 27 becomes: "Components and relation types | Built-in "Systems" package; new ones written in JSON, by hand or by Claude; the appearance of any of them changed from the inspector | Created from the canvas; programmable ones (case 4)".
- Add three Scope rows:
  - "Themes | Light and dark for the app and the canvas, following the system unless you choose; kept by the local program for each person | More themes, such as high contrast; themes people make"
  - "Appearance editing | Any #RRGGBB fill and stroke for elements, components and relation types (built-in ones through project appearances), one relation, notes and free arrows; from the inspector or by Claude | Transparency, gradients, icons; named colors that follow the theme"
  - "Grid and rulers | A grid that follows the zoom, rulers in canvas units, and snapping of hand moves to 8 canvas units | Custom spacing, guides dragged from rulers, alignment guides"
- Canvas section:
  - Shapes: "takes its appearance from its component".
  - Relations: "drawn with their relation type's appearance … a relation can have an appearance of its own".
  - New bullet **Themes**: "the app and the canvas are drawn light or dark, following the system unless you choose, and change together; built-in colors have a shade for each theme, and every color you set is drawn as set in both."
  - New bullet **Appearance**: "the inspector changes the fill and stroke of an element, of every element of a component, of a relation or every relation of a type, and of notes and free arrows; each change is one command."
  - New bullet **Grid and rulers**: "a grid that follows the zoom and rulers in canvas units; while the grid shows, shapes moved or created by hand snap to 8 canvas units inside their container, and Alt places them freely."
- Architecture, Local program bullet: "…reads and writes the project folder, keeps each person's preferences outside every project (ADR 0021), and exposes the MCP server."
- Project files: "project.vaproject  name, schema version, packages in use, project appearances".
- Claude through MCP:
  - Model row: "…particularities, appearances included; define components and relation types in JSON; give built-in ones project appearances".
  - New bullet: "Preferences, such as the theme, are each person's own: Claude's tools neither read nor change them; "everything you can do" means everything you can do to the project."
- Quality bar:
  - Performance: "…with a 60 frames per second target, also with the grid and rulers shown; a theme switch never stalls a frame; layout never blocks interaction."
  - Accessibility: "…an outline panel that mirrors the view, contrast in both themes of 4.5:1 for text and 3:1 for lines, marks, control boundaries and focus rings, and reduced motion for every animation when the system asks for it."
  - Add: "Benchmarks are measured in work mode in Chrome on the development laptop (Intel i5-1135G7, Iris Xe) at devicePixelRatio 2."
- Milestones:
  - Line 200: "Seven milestones in build order, each ending in something you can use, and Track A beside them; tasks are in order within each one."
  - Line 220: "look" becomes "appearance".
- Add the Track A section after M6:

```markdown
**Track A · Appearance and themes**, beside the milestones; commits start with `A<n>:`, stages are tagged `a<n>`.

**A1 · Themes.** Done when the app and the canvas follow the system's light or dark setting and the Theme control in the header, also shown while connecting and on failure screens, switches between Match the system, Light and Dark; an explicit choice survives restarting Visual Anything and is in place on the first frame; the contrast tests pass for every pair in both themes; and on the benchmark, theme switches at the whole view, with shapes in full at scale 0.26 and with names shown keep every frame within 33 ms and 95% within 16.7 ms, each switch shows on the canvas and the panels in one frame at most 30 frames after the choice, no tile shows a drawing of the other theme or falls back to its plain drawing during the switches or when panning and zooming in after them, selecting everything and then zooming keeps 95% of frames within 16.7 ms, and every M2 phase meets the 60 frames per second target in both themes.
- [ ] Preferences: core types and rules, protocol version 2, the preferences file kept by the local program
- [ ] Theme tokens generated from one TypeScript source, light and dark, with contrast tests
- [ ] The header's Theme control and the first paint in the chosen theme
- [ ] Control states, focus rings, icons, the canvas message and the relation menu in place
- [ ] The canvas follows the theme: background, marks, labels, casings and notes, built-in colors in their dark shades, tiles restyled within the frame budget and shown with the panels in one frame
- [ ] Benchmark phases for theme switches, for panning and zooming after them, and for selecting everything

**A2 · Colors.** Done when, from the inspector, any #RRGGBB can be given to an element's fill and stroke, to every element of a built-in component and of one of the project's own, to a built-in relation type, to one relation, to a note, to a free arrow and to several selected shapes at once; each change is one undoable action whose git diff shows only the keys it changed; picking the color already shown records nothing; each has a command for Claude; and on the benchmark, recoloring every Service shows on screen in one frame, makes no tile fall back to its plain drawing or show its old colors once shown, keeps every later frame within 33 ms, and keeps the drawing work of the frame that applies it (the canvas update and its first render, with the scene's building reported on its own) within 8 ms. Done before M4's write tools are fixed.
- [ ] Project appearances, a relation's own appearance and free-shape colors in the file format and the core, with their commands
- [ ] Colors checked and normalized by every command that stores one
- [ ] Recolors restyle tiles in place; the scene keeps what did not change
- [ ] The inspector edits colors for one shape, every shape of a definition and a selection

**A3 · Grid, rulers and snapping.** Done when the grid and rulers can be shown from the canvas toolbar and with Shift+G and Shift+R; with both shown, every benchmark phase meets the 60 frames per second target and the grid adds at most 0.5 ms per frame at the median; while the grid shows and snapping is on, a hand move stores the moving shape that carries the pressed one at a multiple of 8 canvas units inside its container, pins it, keeps the rest of the selection's arrangement and lands where its preview showed, a shape created by hand is stored at a multiple of 8 and stays unpinned, and Alt places freely; and Shift with an arrow key moves the selection by 8.
- [ ] One step of 8: built-in sizes, nudges and the sample
- [ ] The grid, following the zoom, also on the container under the pointer
- [ ] Snapping of drags, nudges and new shapes, with the container's grid and position while dragging
- [ ] Rulers with the selection's extent

**A4 · Polish.** Done when no color, size, spacing, radius, shadow or z-index is written out in any stylesheet outside the generated tokens, every control has hover, pressed, disabled and focus-visible states, every icon comes from `shell/icons.tsx`, and every empty state says what to do next.
```

**`docs/playbook.md`.** Add a table row:

"Track A · Appearance and themes | M2 for A1; `a1` for A2; M3's canvas tasks for A3; M4 for A4 | Core foundations: colors, preferences, protocol, dark shades; project appearances and their commands; sizes on the 8-unit step | Server preferences; app preferences and the header; shell polish; canvas theme; canvas colors; inspector color editing; grid; snapping; rulers"

Add after line 34: "Track A runs in its own worktree on branch `track-a`, branched from the M2 close; its commits start with `A<n>:` and each stage is tagged `a<n>` when its Done when holds. Milestone tags are merged into `track-a`, never rebased onto. A1 comes right after M2 and before M3's app tasks; A2's core (T5) comes before M3's commands for collapse, expand and filters, and A2 is tagged before M4's write tools are fixed; A3 follows M3's canvas tasks; A4's stylesheet pass comes before M4's UI tasks. As with M4's tools, run it only when you can review two streams of work at once."

**`.claude/agents/spec-reviewer.md`, step 1 becomes:**

"Collect the change set. For milestone M<N>: the commits since `m<N-1>` (since the first commit for M0) except Track A's: `git log --extended-regexp --invert-grep --grep='^(A[0-9]+:|Merge A[0-9]+ )' m<N-1>..HEAD`. For Track A stage A<n>: its own commits since `a<n-1>`: `git log --extended-regexp --grep='^(A<n>:|Merge A<n> )' a<n-1>..HEAD`."

Step 2 reads "the milestone's or stage's tasks".

**`CLAUDE.md`:**
- What this is: "Everything in this repository is written in English, with American spelling (color, behavior)."
- Architecture, server bullet: add "…and keeps each person's preferences outside every project (ADR-0021)."
- Rules, performance: "…at a 60 fps target, also with the grid shown; a theme switch never stalls a frame; layout never blocks the main thread."
- Workflow: add "Track A (appearance and themes) runs beside the milestones: commits start with `A<n>:`, and each stage is tagged `a<n>` when its Done when holds."
- Commands:
  - Build: "`pnpm build` regenerates the JSON Schema in `packages/schema/schemas/` and the theme tokens in `packages/app/src/theme/tokens.css`, and builds the app. After changing `packages/schema/src/files.ts` or `packages/app/src/theme/themes.ts`, run it and commit what it generates."
  - Benchmark (the line from `e983c0b`): add "`?theme=dark` runs it in the dark theme."

**ADR-0019:**
- Line 12 becomes: "**Particularities** have no key of their own: they are an element's or a relation's attribute values that differ from the default its component or relation type gives or that it does not define, and its own `appearance` (a relation's since ADR-0024). A value for an attribute without a default is ordinary data, not a particularity."
- Its Clarifications (from `e983c0b`) gain: "<date of A0>: a relation's own appearance is a particularity too (ADR-0024); the Particularities bullet above says so, and no longer says "field", which CONTEXT.md avoids."

---

## 9. ADRs (new files in `docs/adr/`)

Renumber at commit if the stacking-order or right-click-menu designs claim these numbers first.

### `0021-preferences-live-with-the-local-program.md`

```markdown
---
status: accepted
---

# Each person's preferences live with the local program, outside every project

The theme (match the system, light or dark), whether the grid, snapping and the rulers are on, and the colors a person picked lately are that person's preferences. The local program keeps them in `preferences.json` in the person's configuration folder: `%APPDATA%\Visual Anything` on Windows, `~/Library/Application Support/Visual Anything` on macOS, and `$XDG_CONFIG_HOME/visual-anything`, or `~/.config/visual-anything`, elsewhere; an absolute `VISUAL_ANYTHING_PREFERENCES` names another folder, for tests and portable use. The program works the path out once when it starts and never takes one from a message. It reads the file leniently: a missing file gives the defaults (match the system, no grid, snapping on, no rulers, no recent colors), and a file it cannot read gives the defaults with one warning in the terminal and is left as it is until the person changes a preference. The file names its format version; a file from a later version is used for what this program can read but never written, and a value this program cannot read, such as a theme added later, is kept as found and written back unchanged unless the person sets that preference. The program writes the file atomically, as it writes project files, after reading it again and merging by name, so that two running programs keep each other's changes and names one of them does not know survive. Preferences travel only over the live connection, which requires the session token: the program sends `preferences/changed` when an app connects and after every change, and an app sends `preferences/set`, half a second after the person's last change. Preferences are not commands: they are never undone, carry no author, never enter the history and are never written to a project, and Claude's tools neither read nor change them. When the person chose a theme, the address the program opens carries it in its fragment, and each tab remembers the last one it applied, so the first frame is already drawn in it. We chose this because the app's address changes every session (any free port, and two host names), so the browser keeps nothing from one session to the next, and because a person's theme is theirs, not their collaborators'.

## Considered options

- **Browser localStorage**: rejected. It is keyed by origin, which changes every session; 127.0.0.1 and localhost are two origins; and neither the program nor Claude can see it.
- **A fixed port, then localStorage**: rejected. A taken port silently loses everything, two projects need two ports, and any later program on that port can read the storage.
- **The project or view files**: rejected. One person's look would be imposed on collaborators through git, and every toggle would become an undoable action and a file write.
- **Cookies**: rejected. They are shared with every web app on 127.0.0.1, whatever its port, and sent with every request.
- **An HTTP route**: rejected. A request without an Origin passes the checks without the token.

## Consequences

This is the first file the program writes outside the project folder; tests always pass a folder of their own. The live protocol moves to version 2, and an app and a program of different versions say so on connecting and ask for a reload. Two programs open at once share the file, and the last change to a name wins. The read-only demo, which runs without the local program, follows the system and may keep a choice in its own origin's localStorage. If a script-src Content Security Policy is ever added, it must allow by its hash the small script in `index.html` that applies the theme before the first paint.
```

### `0022-stored-colors-are-drawn-as-stored.md`

```markdown
---
status: accepted
---

# Stored colors are drawn as stored; built-in colors have a shade for each theme

Every color stored in a project is `#RRGGBB` and is drawn exactly as stored in the light theme and the dark theme alike: the colors of the project's own components and relation types, of project appearances, of an element's or a relation's own appearance, and of notes and free arrows. The colors built into Visual Anything, those of built-in packages, Essence and "relates to", have a shade for each theme, kept in `core` beside the definitions: the light theme draws the colors the definitions give, and the dark theme a shade of each made for the dark canvas. A color trait takes its built-in dark shade only while nothing in the project sets it, except that a built-in fill keeps its light value beside a stored stroke that is under 3:1 against the dark canvas, so that the shape keeps the pair the light theme shows instead of vanishing; setting a color anywhere draws that exact color in both themes, and removing it brings back the built-in shades. The theme also gives the colors the project does not define: the canvas, the grid and the rulers, selection and highlight marks, label backs, the casing under every line, and notes and free arrows without colors of their own. Text on a shape or a note takes the color that reads on the fill it is drawn on. A stored color that is hard to see in one of the themes is pointed out where it is picked and in Claude's tool results, and is never refused. Commands write new colors in capitals and keep the stored spelling of a color equal to it ignoring case; nothing rewrites a color read from a file. Colors stay `#RRGGBB`: no transparency, names or CSS values. We chose this because the person asked to pick any color and see that color; because the built-in look, which most shapes use, then looks made for the dark canvas instead of light shapes on a dark ground; and because files, git diffs and what Claude reads stay the same in both themes.

## Considered options

- **Built-in colors moved once to mid-tones that read on both canvases, everything drawn as stored**: rejected. The light theme loses contrast it has today, and the dark theme shows white and pastel blocks.
- **Every color adapted to the theme when drawn**: rejected. The dark theme would not show the colors people pick, and Claude would read other colors than the person sees.
- **Each built-in trait taking its dark shade on its own, whatever is stored beside it**: rejected. A stored stroke beside a built-in fill's dark shade can leave a shape at 1.2:1 against the dark canvas.
- **Named colors that follow the theme, stored in files beside #RRGGBB**: rejected for v0.1. Every color in every file could become a name, older programs would refuse files that use one, and everything that draws or compares a color would have to resolve names first. It can come later as its own additive change.
- **A dark variant beside each stored color**: rejected. It doubles every appearance, command and tool.
- **Inverting the canvas with a filter**: rejected. It changes the colors people pick.

## Consequences

A theme switch builds new drawings for the tiles drawn in built-in colors, within the renderer's frame budget and behind the old drawings, and then shows the canvas and the panels in the new theme in one frame; tiles off screen follow before they are shown, and tiles drawn only in stored colors keep their drawings. A color picked against the light canvas can be bright on the dark one, and the picker shows how it reads in both. Changing a built-in color or its dark shade changes every project's look, as ADR-0018 intends for improvements of built-in packages. Export, after v0.1, chooses a theme.
```

### `0023-project-appearances.md`

```markdown
---
status: accepted
---

# A project gives the definitions it cannot change an appearance of its own

A project can change how it draws a component or relation type that it uses but cannot change: one of a built-in package, Essence or "relates to". It keeps such a project appearance in its `.vaproject` file, under `appearances.components` or `appearances.relationTypes`, keyed by the definition's id; an entry sets only the traits it lists, in the same form as a definition's appearance. When an appearance is worked out, each trait comes from the element's or relation's own appearance first; then from the nearest definition in the derivation chain that sets it, a built-in definition counting with its project appearance over its own traits; then from Essence or "relates to", with theirs. A project appearance therefore reaches everything that derives from the definition without setting the trait itself, and nothing that sets it. The commands `set-component-appearance` and `set-relation-type-appearance` change one definition's appearance at the level the project can change: the project appearance for a definition the project cannot change, and the definition itself, in its package file, for one of the project's own, so that each trait is set in one place. An entry for one of the project's own definitions, or for a definition no package in use defines, has no effect and is reported as a warning in the project file when the project opens; the same commands with `null` remove it. When the project stops using a package, the entries for its definitions go in the same action. This sits beside ADR-0018: no package is copied, replaced or redefined, and no id is reused. We chose this because most of a project's elements come from built-in components, because recoloring elements one by one does not reach the ones created later, and because deriving a component of one's own changes the model only to change a color.

## Considered options

- **Particularities only**: rejected. New elements do not follow, and the model file fills with the same colors.
- **Deriving a project component, such as `clinic.service` from `systems.service`, and moving every element to it**: rejected as the way to recolor. It changes elements' components, shows both in the component palette, and cannot re-derive the built-in components that derive from the original.
- **Colors per view**: rejected for this. They would be repeated in every view; coloring by attribute belongs to a later perspective.
- **Colors per person**: rejected. Collaborators and Claude would see other colors than the person.
- **Editing a built-in package in place, or a project package with a built-in id**: rejected by ADR-0018.

## Consequences

Older Visual Anything programs refuse a project file with `appearances`, because the schema accepts no unknown keys; format version 1 stays additive in one direction only. "Improving a built-in package improves every project" (ADR-0018) now holds for every trait a project does not set. Elements and relations with their own trait, and built-in definitions that set the trait themselves, such as AI agent's fill under Service, do not follow; the inspector says so.
```

### `0024-relation-and-free-shape-colors.md`

```markdown
---
status: accepted
---

# Relations, notes and free arrows can have colors of their own

A relation can have an appearance of its own (stroke, width and dash), which is a particularity of that relation, as an element's is of the element; whatever it leaves out comes from its relation type. `create-relation` takes it, and `update-relation` replaces it whole or removes it with `null`. A note can have a fill and a stroke, and a free arrow a stroke; without them they take the theme's colors. ADR-0019's particularities now include a relation's, and its line about them says so. We chose this because relations are first-class (ADR-0010), and marking one relation, such as the path a request takes, is as common as marking one element.

## Considered options

- **Relation-type colors only**: rejected. One relation in a path could not be marked without a relation type of its own, which changes the model to change a color.
- **Free shapes in theme colors only**: rejected. A note that warns or an arrow that points something out often needs its own color.

## Consequences

Older programs refuse files whose relations, notes or arrows have colors. An aggregated relation (M3) is drawn with its relation type's appearance. Playback and guidance highlights (M4, M5) never rely on a relation's color: they use the highlight color with a wider line and the travelling marker.
```

---

## 10. Risks and how the tests cover them

| Risk | Mitigation | Covered by |
| --- | --- | --- |
| A switch at mid zoom runs long or shows mixed themes (40–78 theme-dependent tiles on screen at 0.25–0.45) | Restyles on the 6 ms clock, with geometry built inside it by `updateGpuContext`; the tiles on screen are prepared behind the old drawings and shown with the panels in one frame, capped at 30 frames; stale full drawings are kept, not dropped; `setTheme` never runs the full tile pass | Bench switch phases at the whole view, 0.26 and names shown (worst ≤ 33 ms, p95 ≤ 16.7 ms, swap ≤ 30 frames, `fallbacks = 0`, `staleShown = 0`); "Pan after a switch" and "Zoom in after a switch"; renderer swap-atomicity test; spy that `rebuild()` is not called |
| `updateGpuContext` and `getContextRenderData` belong to PixiJS's graphics-context system, which could change in a later 8.x | Used only in the renderer's restyle step; a renderer test checks the calls through `FakeApplication`; a pixi.js upgrade re-runs the bench | Renderer tests; bench |
| Recolors and previews flash coarse blocks, drop labels, or show the old color during the save | Paint-only restyle with dependents; labels retinted in place; the preview ends only when the commit resolves or is refused | Bench recolor phase (≤ 8 ms drawing work, later frames ≤ 33 ms, `fallbacks = 0`); renderer tests that label items are kept; `ColorControl` preview test |
| Regrouping every item on each `show` breaks the 8 ms budget | Tile keys cached per scene item; only new items are regrouped | Renderer test that keys are computed for new items only; bench recolor phase |
| Structural sharing reuses a stale item, or treats a new field as paint | Equality over every own key, deep for points, rects and routes; paint fields listed, everything else geometry | fast-check: `buildScene(p, v, previous)` deep-equals `buildScene(p, v)`; the extra-field test |
| A shape vanishes in dark after a partial change (a stored stroke on a built-in dark fill) | The fill keeps its light value next to a stored stroke under 3:1 on the dark canvas | `builtin/dark.test.ts` mixed cases for every built-in component; `definitions.test.ts` |
| Lines vanish on stored fills in the other theme | A casing in the canvas color under every line in full detail, white and tinted | `draw.test.ts` casings; `canvas/theme.test.ts` |
| Casings double the stroke geometry of full relation drawings | Full drawings only; one tinted `Graphics` per tile | Every M2 bench phase in both themes |
| Relation labels change look (rectangle back instead of glyph halo) | The back matches the surface under each label, so it blends in | `labels.test.ts`; a visual check of the sample in both themes |
| Selection marks under Ctrl+A at 10,000 | `pixelLine` rings below 0.25, drawn once; above 0.25, rings for the visible area on zoom | Bench "Select all, then zoom" (p95 ≤ 16.7 ms) |
| Exact user colors are bright or blend on one canvas | Inline hints per theme on the drawn pair; both shades shown while a trait follows the theme; the line after a commit; the sample uses a stroke that reads in both | `ColorControl` and `AppearanceSection` tests; `canvas/theme.test.ts`; sample numbers in `builtin/dark.test.ts` |
| One-way file format: older builds refuse `appearances`, relation appearances and free-shape colors | Stated in ADR-0023 and ADR-0024; old files stay valid | Schema tests: old files validate, new keys validate, bad ones are refused with one error per key |
| Built-in size change (180→176, 140→144) and sample realignment shift shapes without stored sizes | One commit with every test pin listed in 5.1; ADR-0018 allows improving built-ins | Updated scene, hit and gestures tests; the sample still round-trips |
| Protocol v2 breaks a stale tab | `ProtocolVersionError` and its own screen, which asks for a reload | `protocol.test.ts`; `connection.test.ts`; `App.test.tsx` |
| First write outside the project folder (permissions, roaming APPDATA, two programs racing, older and newer builds sharing the file) | Path fixed at startup; atomic write; re-read and merge; unreadable values kept; newer files never written; in-memory fallback with a notice; never stops the program | `preferences.test.ts`; `command.test.ts` |
| jsdom has no `matchMedia`; tests never load CSS | Theme code starts explicitly; values live in TypeScript | `test/setup.ts` stub; store tests; `tokens.test.ts` and `contrast.test.ts` read TypeScript and the generated file |
| Tokens drift between TS and CSS, literals creep back, or Prettier rewrites the generated file | `tokens.css` is generated and ignored by Prettier; literal test on every CSS file | `tokens.test.ts`; `styles-colors.test.ts` (extended in A4); `pnpm lint` in CI |
| `setTheme` reaches PixiJS before `init` | Recorded until ready; `FakeApplication` sets `renderer` only in `finishInit` | Renderer test calling `setTheme` before `finishInit` |
| Inline pre-paint script conflicts with a future CSP | Recorded in ADR-0021: a `script-src` must allow it by hash | Spec-reviewer reads the ADR when a CSP is added |
| Alt+drag is taken by some Linux window managers, or Alt focuses the Windows menu | `preventDefault` on the Alt keyup; the Snap toggle in the toolbar is the other way to place freely | Controller tests for Alt keyup; toolbar toggle tests |
| Snapping does not land what is stored, or measures from a container that does not move | Anchor on the moving shape that carries the pressed one, in its own frame; the container's grid and the readout show while dragging | Controller test: Ctrl+A, drag by a nested shape; `grid.test.ts` |
| Grid lines blur at fractional or changing devicePixelRatio | `crispLine` picks integer device widths from the renderer's resolution, which follows `matchMedia` | `grid.test.ts` at 1, 1.25, 1.5, 2, 3; renderer resolution-change test; manual check on a DPR-2 screen |
| Inspector tests assume lowercase hex | `core` writes capitals; `readColor` returns capitals; tests compare without case | Updated `Inspector.test.tsx` and `color.test.ts` |
| Merge conflicts with M3's renderer, scene, files and stylesheets, M4's UI, or the other designs | A1 before M3's app tasks; T5 before M3's view commands; T6 before M3's collapse work; T12 before M4's UI; the splits in 8.5 confirmed in A0 | Sequencing in 1, 8.4 and 8.5 |
| Generated schemas merged by hand go stale | Regenerate after every merge that touches `files.ts` | The schema generation test |
| Commits land in the wrong stream's review, or a rebase loses them | Commit prefixes, merges never rebases, `a0` at the branch point, and the filtered reviewer step | Spec-reviewer step 1 (8.6) |
| ADR numbers 0021–0024 collide with the stacking-order or right-click-menu designs | Renumber at commit and update the CONTEXT.md and spec references | A0 review |

---

## Appendix: how the review's issues were handled

Issues are numbered in the order the review listed them.

**Rejected outright:** none. Every issue matched the code, either on `03ed1d9` or on `m2-fixes`.

**Only partly right:**
- Issue 7 (version mismatch). The current "cannot read" screen already says the app and the program "may come from different versions" and tells the person to restart. What was wrong was the spec's claim that version 2 avoids that screen. A dedicated `version-mismatch` reason was added anyway, because it costs little (6.3).
- Issue 24 (dark rule per trait). The proposed fix was to flip both traits whenever neither reads. Since every built-in dark stroke reaches 6.16:1 on the dark canvas, only a built-in fill next to a stored stroke can fail. So the rule is stated for that case alone (4.4). Relation lines on stored fills are fixed with casings, as proposed (3.6).

**Fixed differently from the fix that was proposed:**
- 1 (tokens.css and Prettier): an entry in `.prettierignore`, not formatting the generator's output with Prettier.
- 3 (scripts outside any tsconfig): a separate `scripts/tsconfig.json`. Adding Node types to the app's own tsconfig would let browser code see Node globals.
- 5 (bad keys in the maps): "must be an id: …" at the key's own pointer, matching `validate.ts`'s other messages.
- 9 (30 frames at mid zoom): time-based restyles, with geometry built inside the clock, shown in one frame. Building both themes' drawings ahead was rejected because it doubles memory for a rare action. PixiJS 8.22's prepare system was rejected because its GraphicsContext upload only calls `getGpuContext`, which builds no geometry.
- 14 (coarse selection marks): `pixelLine` rings. A redraw at every √2 step of zoom would rebuild 10,000 rings several times per zoom with everything selected.
- 16 and 30 (snapping anchor): one delta from the anchor, keeping the selection's arrangement, with the Done-when narrowed to the anchor. Snapping every moving shape in its own frame was rejected.
- 26 (the M2 fixes):
  - capitals end to end, not lower case, because the built-in packages, the sample and the tests use capitals;
  - the folded token keeps the name `--control-border`, but takes the light value #76828F, because `e983c0b`'s #7B8794 reaches only 3.00 on `--surface-pressed`.
- 36 (grid hidden inside containers): the grid at rest is drawn only in the container under the pointer, not also in a selected one.
- 39 (Delete button in dark): a 1 px `--control-border` border instead of a new fill. A lighter fill would bring white text under 4.5:1, and a darker hover would fail 3:1 against the dialog.

**Fixed as proposed:**
- 2, 13 and 25 (note text on a fill of its own): 3.4, 3.6, 3.7.
- 4 (where `appearance-not-used` is reported): 4.5.
- 6 (the ESLint rule also catches tests): 4.6, done in T5.
- 8 (`schemaVersion` of the preferences file): 6.1, 6.2.
- 10 (the 8 ms Done-when against the regrouping pass): 4.6.
- 11 and 28 (labels and surfaces, the patchwork during a switch): 3.6.
- 12 and 27 (drawings that depend on other tiles; which tiles depend on the theme): 3.6, through the theme-independent guard for stored colors and the `dependents` index.
- 15 (the halo hides arrowheads): 3.6, `shapeMarks`.
- 17 (stale full drawings dropped): 3.6.
- 18 (`setTheme` before init, the drag container): 3.6.
- 19 (conflicts with the stacking-order design): 4.6, 8.5.
- 20 and 31 (the container grid drawn above other shapes): 5.3.
- 21 (rulers): 5.4.
- 22 (T10 and T11 in parallel): 8.4.
- 23 (grid counts, modulo, devicePixelRatio): 5.2.
- 29 (the picker starting from the dark shade): 4.7.
- 32 (the preview ending at commit): 4.7.
- 33 (scheduling against M3, M4 and the other designs): 1, 8.
- 34 (Track A's own parallel tasks): 8.
- 35 (Mixed state and datalist): 4.7.
- 37 (the Theme control's focus ring and writes): 3.5.
- 38 (the ref read during render): 4.6.
- 40 (the keyboard help over the ruler): 5.4.
- 41 (values an older build cannot read): 6.1, 6.2.
- The rest of 26 (the M2 fixes): the opening section, 2, 3.3, 3.4, 4.3, 4.7, 5.1 and 5.5.

**Other corrections found while checking:**
- The scope row in `spec-v0.1.md` is line 27, not line 28.
- `SceneCanvas.ts` is already deleted, so it left T4's file list.
- Pins that are really fixtures, and do not change with the built-in sizes: `core/definitions.test.ts:17`, `schema/format.test.ts:85` and `:136`, `schema/validate.test.ts:158`.
- Pins that were missing and were added: `scene.test.ts:138-159` and `:270`, `gestures.test.ts:92`.
- "Also check the inspector's bug" named no bug. It became a concrete change (7.8).
- Wording that broke CONTEXT.md's Avoid lists: "overrides" in the preferences folder table, "field" in the ADR-0019 bullet, "custom properties" (now "CSS variables"), and "bundled icons" (now "icons kept in the app").
- Above 0.25, rings drawn for the visible area grown by one viewport made every zoom frame redraw up to nine screens of rings under Ctrl+A. They are now drawn for the visible area on zoom.
- The playbook row put the canvas theme in the main session, while 8.4 gives it to a task-builder.
- `a0` now tags the branch point, so A1's review takes in T1, T2 and T8a.