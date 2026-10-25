---
status: accepted
---

<!-- Decided by Claude on 2026-10-24 under the user's standing delegation of design decisions. -->

# Themes come from one source; stored colors are drawn as stored, built-in colors have a shade for each theme

The app and the canvas are drawn in a theme, light or dark, which follows the system unless the person chooses one (ADR-0032). These choices fix what a theme colors and where its colors come from:

- **One source.** The colors of both themes live in one TypeScript module, `packages/app/src/theme/themes.ts`: the panels' colors and the canvas's own, the canvas taking the panels' value wherever the color is the same. A generator writes the panels' colors and the scales of `theme/scale.ts` as a static stylesheet, `theme/tokens.css`, which the app's stylesheet imports first; a test fails while the committed file differs from what the module generates. The renderer takes the canvas's colors from the same module, since PixiJS cannot read CSS variables. The page says which theme it shows with `data-theme="light"` or `"dark"` on its root element; without one, the stylesheet follows the system. No stylesheet writes a color out: each uses the tokens.
- **Contrast.** In both themes every text pair the app uses meets 4.5:1, and every control boundary, focus ring, selection and other mark 3:1. Tests check each pair, including those of the canvas's own colors.
- **Stored colors.** Every color stored in a project is `#RRGGBB` and is drawn exactly as stored in the light theme and the dark theme alike: the colors of the project's own components and relation types, of project appearances, of an element's or a relation's own appearance, and of notes and free arrows. Commands write new colors in capitals and keep the stored spelling of a color equal to it ignoring case; nothing rewrites a color read from a file. Colors stay `#RRGGBB`: no transparency, names or CSS values.
- **Built-in colors.** The colors built into Visual Anything, those of built-in packages, Essence and "relates to", have a shade for each theme, kept in `core` beside the definitions: the light theme draws the colors the definitions give, and the dark theme a shade of each made for the dark canvas. A color trait takes its built-in dark shade only while nothing in the project sets it, except that a built-in fill keeps its light value beside a stored stroke that is under 3:1 against the dark canvas, so that the shape keeps the pair the light theme shows instead of vanishing. Setting a color anywhere draws that exact color in both themes, and removing it brings back the built-in shades.
- **What the theme colors.** The theme also gives the colors the project does not define: the canvas, the grid and the rulers, selection and highlight marks, label backs, the casing under every line, and notes and free arrows without colors of their own. Text on a shape or a note takes the color that reads on the fill it is drawn on. A stored color that is hard to see in one of the themes is pointed out where it is picked and in Claude's tool results, and is never refused.

We chose this because the person asked to pick any color and see that color; because the built-in look, which most shapes use, then looks made for the dark canvas instead of light shapes on a dark ground; because files, git diffs and what Claude reads stay the same in both themes; and because one source of theme colors keeps the panels and the canvas from drifting apart.

## Considered options

- **Colors written in each stylesheet, or CSS variables the canvas reads at run time**: rejected. PixiJS cannot read CSS variables, jsdom loads no CSS for tests, and two copies of each color drift.
- **Tokens injected by script at run time**: rejected. The first frame would wait for the script, and a page policy without `'unsafe-inline'` styles would need more exceptions.
- **Built-in colors moved once to mid-tones that read on both canvases, everything drawn as stored**: rejected. The light theme loses contrast it has today, and the dark theme shows white and pastel blocks.
- **Every color adapted to the theme when drawn**: rejected. The dark theme would not show the colors people pick, and Claude would read other colors than the person sees.
- **Each built-in trait taking its dark shade on its own, whatever is stored beside it**: rejected. A stored stroke beside a built-in fill's dark shade can leave a shape at 1.2:1 against the dark canvas.
- **Named colors that follow the theme, stored in files beside #RRGGBB**: rejected for v0.1. Older programs would refuse files that use one, and everything that draws or compares a color would have to resolve names first. It can come later as its own additive change.
- **A dark variant beside each stored color**: rejected. It doubles every appearance, command and tool.
- **Inverting the canvas with a filter**: rejected. It changes the colors people pick.

## Consequences

After changing `themes.ts` or `scale.ts`, `tokens.css` is generated again and committed with them. A theme switch builds new drawings for the tiles drawn in built-in colors, within the renderer's frame budget and behind the old drawings, and then shows the canvas and the panels in the new theme in one frame; tiles drawn only in stored colors keep their drawings. A color picked against the light canvas can be bright on the dark one, and the picker shows how it reads in both. Changing a built-in color or its dark shade changes every project's look, as ADR-0018 intends for improvements of built-in packages. Export, after v0.1, chooses a theme.

## Clarifications

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

- 2026-10-25 (A3): the grid, the rulers and the readout beside a drag take their colors from the canvas's theme. The grid draws `gridLine` at `gridStrength` times each family's strength, and `gridSnapAlpha` is the alpha the lines 8 canvas units apart keep while snapping, once they are 8 px apart on screen (0.05 light, 0.04 dark: decorative, about 1.10:1). The rulers draw `rulerBand`, `rulerBorder` and `rulerText`, and the selection's extent on them `selected`. The readout takes the shell's `surfaceRaised` and `text` of the same theme, with a `rulerBorder` edge. Grid lines are drawn white and tinted, so a theme switch retints them; the renderer's `setGridTheme(theme)` takes the canvas's theme with the rest of it.
