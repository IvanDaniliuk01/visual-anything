/**
 * The format panel's Text traits (ADR 0088, A6.2), made by pure functions so that what each change
 * sends can be tested without the panel: what one or several elements write their names with, part by
 * part, whether they share it, the one change that sets a part, and the hints for a text color that
 * reads poorly on what it is written on.
 */
import type { Color, Element, Id, TextStyle } from '@visual-anything/schema';
import {
  MINIMUM_TEXT_CONTRAST,
  THEME_NAMES,
  adaptedForDark,
  componentOrEssence,
  contrastRatio,
  definitionsIn,
  editableAppearanceOf,
  type AppearanceChanges,
  type Command,
  type ProjectSnapshot,
  type ResolvedAppearance,
  type ResolvedDrawing,
  type ShapeColors,
  type StoredColorsInDark,
  type ThemeName,
} from '@visual-anything/core';
import { readableTextColors } from '../../canvas/colors';
import { t } from '../../i18n';
import { ratioText } from './colors';

/** A part of how a shape writes its name. */
export type TextPart = keyof TextStyle;

/** How a part is edited: a choice among words, a number, or a color. */
export type TextInputKind = 'choice' | 'number' | 'color';

/** A choice a part offers, as stored and as the panel names it. */
export interface TextChoice {
  value: string;
  name: string;
}

/** A row of the Text tab: its part, what it is called and how it is edited. */
export interface TextRowSpec {
  part: TextPart;
  label: string;
  kind: TextInputKind;
  choices?: readonly TextChoice[];
  range?: { least: number; most: number };
}

/** The ranges the schema allows (ADR 0088's clarification of A6.0). */
export const TEXT_RANGES = {
  size: { least: 8, most: 48 },
  padding: { least: 0, most: 48 },
} as const;

/** The Text tab's rows, in the order the panel shows them. */
export const TEXT_ROWS: readonly TextRowSpec[] = [
  {
    part: 'font',
    label: 'Font',
    kind: 'choice',
    choices: [
      { value: 'roboto', name: 'Roboto' },
      { value: 'system', name: 'The system’s font' },
      { value: 'mono', name: 'Roboto Mono' },
    ],
  },
  { part: 'size', label: 'Text size', kind: 'number', range: TEXT_RANGES.size },
  {
    part: 'bold',
    label: 'Weight',
    kind: 'choice',
    choices: [
      { value: 'true', name: 'Bold' },
      { value: 'false', name: 'Regular' },
    ],
  },
  {
    part: 'italic',
    label: 'Italics',
    kind: 'choice',
    choices: [
      { value: 'false', name: 'Upright' },
      { value: 'true', name: 'Italic' },
    ],
  },
  {
    part: 'underline',
    label: 'Underline',
    kind: 'choice',
    choices: [
      { value: 'false', name: 'Not underlined' },
      { value: 'true', name: 'Underlined' },
    ],
  },
  {
    part: 'align',
    label: 'Alignment',
    kind: 'choice',
    choices: [
      { value: 'left', name: 'Aligned left' },
      { value: 'center', name: 'Centered' },
      { value: 'right', name: 'Aligned right' },
    ],
  },
  {
    part: 'position',
    label: 'Where its name is written',
    kind: 'choice',
    choices: [
      { value: 'inside', name: 'Inside the shape' },
      { value: 'above', name: 'In a tag above' },
      { value: 'below', name: 'In a tag below' },
      { value: 'left', name: 'In a tag at the left' },
      { value: 'right', name: 'In a tag at the right' },
    ],
  },
  { part: 'color', label: 'Text color', kind: 'color' },
  { part: 'background', label: 'Text background', kind: 'color' },
  { part: 'border', label: 'Text border', kind: 'color' },
  {
    part: 'wrap',
    label: 'Long names',
    kind: 'choice',
    choices: [
      { value: 'true', name: 'Wrapped onto more lines' },
      { value: 'false', name: 'On one line, cut with “…”' },
    ],
  },
  { part: 'padding', label: 'Text padding', kind: 'number', range: TEXT_RANGES.padding },
];

/** What a shape writes its name with, part by part: what draws where no appearance sets a part. */
export type TextValues = { [K in TextPart]-?: K extends 'color' ? Color : TextStyle[K] };

/**
 * What a resolved appearance writes its name with, read with the drawing defaults: a part no
 * appearance sets shows what is drawn, its text color the one that reads on its back or its fill,
 * and its back and border as none.
 */
export function textValues(
  appearance: ResolvedAppearance,
  drawing: ResolvedDrawing,
  fill: Color,
): TextValues {
  const text = appearance.text;
  return {
    font: text.font ?? drawing.text.font,
    size: text.size ?? drawing.text.nameSize,
    bold: text.bold ?? drawing.text.nameWeight !== 400,
    italic: text.italic ?? false,
    underline: text.underline ?? false,
    align: text.align ?? 'center',
    position: text.position ?? 'inside',
    color: text.color ?? readableTextColors(text.background ?? fill).name,
    background: text.background,
    border: text.border,
    wrap: text.wrap ?? true,
    padding: text.padding ?? drawing.text.padding,
  };
}

/** A value as a choice's select holds it. */
export function choiceOf(value: unknown): string {
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return typeof value === 'string' ? value : '';
}

/** A choice's select value as the part stores it. */
export function storedChoice(part: TextPart, value: string): TextStyle[TextPart] {
  if (part === 'bold' || part === 'italic' || part === 'underline' || part === 'wrap') {
    return value === 'true';
  }
  return value;
}

/** The change that sets one part of the text, or takes it out with `null`. */
export function textChange(part: TextPart, value: unknown): AppearanceChanges {
  const text: NonNullable<AppearanceChanges['text']> = { [part]: value };
  return { text };
}

/**
 * Where a part's value comes from when no appearance sets it: what the drawing defaults write, or
 * for a text color the one that reads on what it is written on, and for a back and its border none.
 */
export function unsetSource(part: TextPart): string {
  if (part === 'color') return t('reads on its fill');
  if (part === 'background' || part === 'border') return t('none');
  return t('from the drawing defaults');
}

/**
 * The hints for a text color that reads under 4.5:1 on what it is written on, its label back when it
 * has one or else its fill, one for each canvas: on the dark canvas both are drawn adapted where the
 * project asks for it (ADR 0087). None for a text with no color of its own, which takes one that
 * reads. Pointed out, never refused (ADR 0033).
 */
export function textContrastHints(
  colors: Readonly<Record<ThemeName, ShapeColors>>,
  text: Pick<TextStyle, 'color' | 'background'>,
  storedInDark: StoredColorsInDark,
): string[] {
  const { color, background } = text;
  if (color === undefined) return [];
  return THEME_NAMES.flatMap((theme) => {
    const adapt = (stored: Color) =>
      theme === 'dark' && storedInDark === 'adapted' ? adaptedForDark(stored) : stored;
    const under = background === undefined ? colors[theme].fill : adapt(background);
    const ratio = contrastRatio(adapt(color), under);
    if (ratio >= MINIMUM_TEXT_CONTRAST) return [];
    const hints = background === undefined ? ON_FILL : ON_BACK;
    return [t(hints[theme], { ratio: ratioText(ratio) })];
  });
}

const ON_FILL: Readonly<Record<ThemeName, string>> = {
  light: 'Its text reads poorly on its fill on the light canvas ({ratio}); text needs 4.5:1.',
  dark: 'Its text reads poorly on its fill on the dark canvas ({ratio}); text needs 4.5:1.',
};

const ON_BACK: Readonly<Record<ThemeName, string>> = {
  light: 'Its text reads poorly on its background on the light canvas ({ratio}); text needs 4.5:1.',
  dark: 'Its text reads poorly on its background on the dark canvas ({ratio}); text needs 4.5:1.',
};

/** The action's label for setting a part of the text of several shapes. */
export function textBatchLabel(count: number): string {
  return `Change the text of ${count} shapes`;
}

/**
 * The action that sets one part of the text of several elements, as one batch named for how many
 * shapes it changes; one element's alone; none for none.
 */
export function elementsTextCommand(
  elements: readonly Element[],
  part: TextPart,
  value: unknown,
): Command | undefined {
  const commands: Command[] = elements.map((element) => ({
    type: 'update-element',
    id: element.id,
    changes: { appearanceTraits: textChange(part, value) },
  }));
  if (commands.length <= 1) return commands[0];
  return { type: 'batch', label: textBatchLabel(commands.length), commands };
}

/**
 * The action that sets one part of the text for every element of a component, at the level the
 * project can change it, the element inspected losing its own value of that part alone in the same
 * action, so that it follows; its other parts stay its own.
 */
export function componentTextCommand(
  project: ProjectSnapshot,
  component: Id,
  part: TextPart,
  value: unknown,
  inspected?: Element,
): Command {
  const level: Command = {
    type: 'set-component-appearance',
    component,
    appearanceTraits: textChange(part, value),
  };
  if (inspected?.appearance?.text?.[part] === undefined) return level;
  const name = componentOrEssence(definitionsIn(project), component).name;
  return {
    type: 'batch',
    label: `Change the appearance of the component "${name}"`,
    commands: [
      level,
      {
        type: 'update-element',
        id: inspected.id,
        changes: { appearanceTraits: textChange(part, null) },
      },
    ],
  };
}

/** A part of the text as stored at the level the project can change a component's appearance. */
export function storedTextAt(project: ProjectSnapshot, component: Id, part: TextPart): unknown {
  const appearance = editableAppearanceOf(project, 'component', component)?.appearance as
    { text?: Readonly<Record<string, unknown>> } | undefined;
  return appearance?.text?.[part];
}
