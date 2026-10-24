/**
 * The colors of each theme, light and dark: the one source for the panels, which read them as CSS
 * variables from the generated `tokens.css`, and for the canvas, which PixiJS draws and which cannot
 * read CSS. Every text pair meets 4.5:1, and every control boundary, focus ring and mark 3:1, in both
 * themes (`contrast.test.ts` and `canvas.test.ts` check each pair the app uses).
 *
 * Colors are written `#RRGGBB` in capitals, as the core writes colors; the stylesheet writes them in
 * lower case, as Prettier formats CSS.
 */
import type { ThemeName } from '@visual-anything/core';
import type { Color } from '@visual-anything/schema';

/** The colors of the app's panels and controls, each a CSS variable of the same name in kebab case. */
export interface ShellColors {
  /** Behind the canvas and the canvas area. */
  canvas: Color;
  /** The page, the header and fields one types in. */
  surface: Color;
  /** The model panel, the inspector and status screens. */
  panel: Color;
  /** What floats above the rest: the canvas toolbar, menus, dialogs, notices, the keyboard help. */
  surfaceRaised: Color;
  /** A control under the pointer. */
  surfaceHover: Color;
  /** A control being pressed, or pressed in, such as the theme chosen. */
  surfacePressed: Color;
  text: Color;
  /** Secondary text: labels, details, hints. */
  textMuted: Color;
  /** Lines that only decorate: between panels, around cards. Not the boundary of a control. */
  border: Color;
  /** The boundary of every control: 3:1 on every surface it sits on. */
  controlBorder: Color;
  /** Links, the current item, marks of the product. */
  accent: Color;
  /** A soft background in the accent's hue, behind accent text. */
  accentSoft: Color;
  /** The background of a primary action. */
  accentFill: Color;
  /** Text on `accentFill`. */
  onAccent: Color;
  /** What is selected, on the canvas and in the panels. */
  selected: Color;
  /** The ring around what has the keyboard focus. */
  focusRing: Color;
  /** Text that says something went wrong. */
  problem: Color;
  problemSoft: Color;
  /** The background of an action that destroys, such as Delete. */
  problemFill: Color;
  problemFillHover: Color;
  /** Text on `problemFill`. */
  onProblem: Color;
  /** Text that warns. */
  warning: Color;
  warningSoft: Color;
  /** Reserved for Claude's live guidance (M4) and scenario playback (M5), always with a cue that is not color. */
  highlight: Color;
}

/** The tokens of a theme's shell colors with their values, in the order ShellColors lists them. */
export function shellColorEntries(colors: ShellColors): [keyof ShellColors, Color][] {
  return Object.entries(colors) as [keyof ShellColors, Color][];
}

export interface ShellTheme {
  colors: ShellColors;
  /** Behind a modal dialog. */
  backdrop: string;
  /** Elevation, smallest first: the toolbar, then menus and notices, then dialogs. */
  shadows: readonly [string, string, string];
}

/**
 * The colors the canvas draws in a theme, beyond those that components, relation types and the user
 * set, which are drawn as stored in both themes (ADR-0033). The renderer takes one of these whole
 * (`renderer.setTheme(THEMES[name].canvas)`, wave 2).
 */
export interface CanvasTheme {
  name: ThemeName;
  /** The canvas; also the halo under selection rings, the casing under lines and a label's back. */
  background: Color;
  /** Grid lines, drawn at `gridStrength` alpha over the canvas (A3). */
  gridLine: Color;
  gridStrength: number;
  /** The rulers' band, the line along its inner side, and its numbers (A3). */
  rulerBand: Color;
  rulerBorder: Color;
  rulerText: Color;
  /** Selection rings, the selection box, the connect line; hover is this color, thinner. */
  selected: Color;
  /** The glow of a selected relation or arrow. */
  selectedGlowAlpha: number;
  /** The fill of the box dragged to select and of ghosts. */
  boxFillAlpha: number;
  /** The inside of the relate handle. */
  handleFill: Color;
  /** A drop the canvas refuses, such as into a shape's own contents. */
  refused: Color;
  /** A note without colors of its own. */
  noteFill: Color;
  noteStroke: Color;
  noteText: Color;
  /** A free arrow without a color of its own. */
  freeArrow: Color;
  /** Live guidance and playback (M4, M5), always with a wider line and a halo as well. */
  highlight: Color;
  /** A relation's name, written over `relationLabelBack` where it crosses the canvas. */
  relationLabelText: Color;
  relationLabelBack: Color;
  /** The body of a container that draws its contents as rows, seen in its foot and when empty (M3). */
  rowsBody: Color;
  /** The line between two rows (M3). */
  rowSeparator: Color;
}

const LIGHT: ShellTheme = {
  colors: {
    canvas: '#FFFFFF',
    surface: '#FFFFFF',
    panel: '#F7F8FA',
    surfaceRaised: '#FFFFFF',
    surfaceHover: '#EEF1F4',
    surfacePressed: '#E5E9ED',
    text: '#1F2933',
    textMuted: '#52606D',
    border: '#D9DEE5',
    controlBorder: '#76828F',
    accent: '#1D4F91',
    accentSoft: '#E6EEFA',
    accentFill: '#1D4F91',
    onAccent: '#FFFFFF',
    selected: '#2563EB',
    focusRing: '#2563EB',
    problem: '#A61B1B',
    problemSoft: '#FDECEC',
    problemFill: '#A61B1B',
    problemFillHover: '#8C1616',
    onProblem: '#FFFFFF',
    warning: '#6B4E00',
    warningSoft: '#FFF4D6',
    highlight: '#C2410C',
  },
  backdrop: 'rgb(16 24 40 / 35%)',
  shadows: [
    '0 1px 2px rgb(16 24 40 / 6%)',
    '0 8px 24px rgb(16 24 40 / 16%)',
    '0 16px 40px rgb(16 24 40 / 25%)',
  ],
};

const DARK: ShellTheme = {
  colors: {
    canvas: '#16191E',
    surface: '#16191E',
    panel: '#1C2027',
    surfaceRaised: '#242A33',
    surfaceHover: '#2B323C',
    surfacePressed: '#333B46',
    text: '#E4E7EB',
    textMuted: '#A3ADB8',
    border: '#2F3640',
    controlBorder: '#7C8896',
    accent: '#8AB4F8',
    accentSoft: '#1E3A5F',
    accentFill: '#8AB4F8',
    onAccent: '#0F1B2D',
    selected: '#4C8DF6',
    focusRing: '#4C8DF6',
    problem: '#FF8A80',
    problemSoft: '#3A1D1F',
    problemFill: '#C62828',
    problemFillHover: '#B02020',
    onProblem: '#FFFFFF',
    warning: '#F2C14E',
    warningSoft: '#3A2E10',
    highlight: '#FB923C',
  },
  backdrop: 'rgb(0 0 0 / 55%)',
  shadows: [
    '0 1px 2px rgb(0 0 0 / 40%)',
    '0 8px 24px rgb(0 0 0 / 50%)',
    '0 16px 40px rgb(0 0 0 / 60%)',
  ],
};

/** The canvas's colors, taken from the shell's where they are the same color, so none is written twice. */
function canvasTheme(
  name: ThemeName,
  { colors }: ShellTheme,
  own: Pick<
    CanvasTheme,
    | 'gridLine'
    | 'gridStrength'
    | 'selectedGlowAlpha'
    | 'boxFillAlpha'
    | 'refused'
    | 'noteFill'
    | 'noteStroke'
    | 'noteText'
    | 'freeArrow'
    | 'rowSeparator'
  >,
): CanvasTheme {
  return {
    name,
    background: colors.canvas,
    rulerBand: colors.panel,
    rulerBorder: colors.border,
    rulerText: colors.textMuted,
    selected: colors.selected,
    handleFill: colors.surfaceRaised,
    highlight: colors.highlight,
    relationLabelText: colors.text,
    relationLabelBack: colors.canvas,
    rowsBody: colors.canvas,
    ...own,
  };
}

export const THEMES: Readonly<Record<ThemeName, { shell: ShellTheme; canvas: CanvasTheme }>> = {
  light: {
    shell: LIGHT,
    canvas: canvasTheme('light', LIGHT, {
      gridLine: LIGHT.colors.text,
      gridStrength: 0.16,
      selectedGlowAlpha: 0.35,
      boxFillAlpha: 0.08,
      refused: '#DC2626',
      noteFill: '#FFF7D1',
      noteStroke: '#B08D1A',
      noteText: '#3D3000',
      freeArrow: '#3E4C59',
      rowSeparator: '#D9E2EC',
    }),
  },
  dark: {
    shell: DARK,
    canvas: canvasTheme('dark', DARK, {
      gridLine: DARK.colors.text,
      gridStrength: 0.14,
      selectedGlowAlpha: 0.45,
      boxFillAlpha: 0.16,
      refused: '#F87171',
      noteFill: '#3D3518',
      noteStroke: '#C9A227',
      noteText: '#FFF3C4',
      freeArrow: '#AEB8C4',
      rowSeparator: DARK.colors.border,
    }),
  },
};
