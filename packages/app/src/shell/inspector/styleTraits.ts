/**
 * The format panel's Style traits (ADR 0088), made by pure functions so that what each change sends
 * can be tested without the panel: what one or several items show for each trait, whether they share
 * it, and the one command that sets it on all of them, on their component or relation type, or as the
 * project's default.
 */
import {
  ESSENCE_ID,
  RELATES_TO_ID,
  type Color,
  type Element,
  type Gradient,
  type Id,
  type Relation,
} from '@visual-anything/schema';
import {
  MINIMUM_MARK_CONTRAST,
  THEME_NAMES,
  componentOrEssence,
  contrastRatio,
  definitionsIn,
  editableAppearanceOf,
  legibility,
  relationAppearanceOf,
  relationAppearanceOriginsOf,
  relationTypeOrRelatesTo,
  type AppearanceChanges,
  type Command,
  type Definitions,
  type ProjectSnapshot,
  type RelationAppearanceChanges,
  type ResolvedAppearance,
  type ResolvedDrawing,
  type ShapeColors,
  type ThemeName,
} from '@visual-anything/core';
import { t } from '../../i18n';
import { ratioText } from './colors';

/** The Style traits of a shape that ADR 0088 adds, in the order the panel shows them. */
export const SHAPE_STYLE_TRAITS = [
  'gradient',
  'borderWidth',
  'dash',
  'cornerRadius',
  'opacity',
  'shadow',
] as const;
export type ShapeStyleTrait = (typeof SHAPE_STYLE_TRAITS)[number];

/** The Style traits of a line the panel edits beside its stroke and route. */
export const LINE_STYLE_TRAITS = ['width', 'dash', 'opacity'] as const;
export type LineStyleTrait = (typeof LINE_STYLE_TRAITS)[number];

export type Dash = 'solid' | 'dashed' | 'dotted';
export const DASHES: readonly Dash[] = ['solid', 'dashed', 'dotted'];
export const DASH_NAMES: Readonly<Record<Dash, string>> = {
  solid: 'Solid',
  dashed: 'Dashed',
  dotted: 'Dotted',
};

/** What a shape's Style traits draw, the drawing defaults' where no appearance sets one. */
export interface ShapeStyleValues {
  borderWidth: number;
  dash: Dash;
  cornerRadius: number;
  /** From 0.2 to 1. */
  opacity: number;
  shadow: 'none' | 'soft';
  gradient: Gradient | 'none';
}

/** What a line's Style traits draw. */
export interface LineStyleValues {
  width: number;
  dash: Dash;
  opacity: number;
}

/** How a Style trait is edited: a number, a percent, a dash, a shadow, or a gradient. */
export type StyleInputKind = 'number' | 'percent' | 'dash' | 'shadow' | 'gradient';

/** A row of the Style tab: its trait, what it is called and how it is edited. */
export interface StyleRowSpec<T extends string> {
  trait: T;
  label: string;
  kind: StyleInputKind;
  range?: { least: number; most: number };
}

/** The ranges the schema allows (ADR 0088's clarification of A6.0). */
export const RANGES = {
  borderWidth: { least: 0, most: 16 },
  cornerRadius: { least: 0, most: 64 },
  /** In percent, as the panel writes it. */
  opacity: { least: 20, most: 100 },
  width: { least: 0.5, most: 16 },
} as const;

/** The Style rows of a shape that ADR 0088 adds, after its fill and stroke. */
export const SHAPE_STYLE_ROWS: readonly StyleRowSpec<ShapeStyleTrait>[] = [
  { trait: 'gradient', label: 'Gradient', kind: 'gradient' },
  { trait: 'borderWidth', label: 'Border width', kind: 'number', range: RANGES.borderWidth },
  { trait: 'dash', label: 'Border dash', kind: 'dash' },
  { trait: 'cornerRadius', label: 'Corner radius', kind: 'number', range: RANGES.cornerRadius },
  { trait: 'opacity', label: 'Opacity (%)', kind: 'percent', range: RANGES.opacity },
  { trait: 'shadow', label: 'Shadow', kind: 'shadow' },
];

/** The Style rows of a line, after its stroke. */
export const LINE_STYLE_ROWS: readonly StyleRowSpec<LineStyleTrait>[] = [
  { trait: 'width', label: 'Width', kind: 'number', range: RANGES.width },
  { trait: 'dash', label: 'Dash', kind: 'dash' },
  { trait: 'opacity', label: 'Opacity (%)', kind: 'percent', range: RANGES.opacity },
];

/** What a resolved appearance draws for each Style trait, read with the drawing defaults. */
export function shapeStyleValues(
  appearance: ResolvedAppearance,
  drawing: ResolvedDrawing,
): ShapeStyleValues {
  return {
    borderWidth: appearance.borderWidth ?? drawing.shapes.borderWidth,
    dash: appearance.dash,
    cornerRadius: appearance.cornerRadius ?? drawing.shapes.cornerRadius,
    opacity: appearance.opacity,
    shadow: appearance.shadow ?? drawing.shapes.shadow,
    gradient: appearance.gradient ?? 'none',
  };
}

/**
 * What a relation's line draws: its width the drawing defaults' where only a built-in definition
 * gives it, as the canvas draws it (ADR 0086).
 */
export function lineStyleValues(
  relation: Relation,
  definitions: Definitions,
  drawing: ResolvedDrawing,
): LineStyleValues {
  const appearance = relationAppearanceOf(relation, definitions);
  const origin = relationAppearanceOriginsOf(relation, definitions).width;
  const builtIn = origin.kind === 'definition' && origin.via === 'definition' && origin.builtIn;
  return {
    width: builtIn ? drawing.lines.width : appearance.width,
    dash: appearance.dash,
    opacity: appearance.opacity,
  };
}

/** Whether two values of a trait are the same: a gradient by its color and direction. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    const x = a as Gradient;
    const y = b as Gradient;
    return x.to.toUpperCase() === y.to.toUpperCase() && x.direction === y.direction;
  }
  return false;
}

/** The value items share, the first one's when they differ, and whether they differ; none for none. */
export function sharedValue<T>(values: readonly T[]): { value: T; mixed: boolean } | undefined {
  if (values.length === 0) return undefined;
  const value = values[0] as T;
  return { value, mixed: values.some((each) => !sameValue(each, value)) };
}

/** The opacity as the panel writes it, in whole percent. */
export function percentOf(opacity: number): number {
  return Math.round(opacity * 100);
}

/**
 * Why a number typed for a trait cannot be set, or nothing: it must be a number in the trait's range.
 */
export function numberProblem(
  text: string,
  range: { least: number; most: number },
): string | undefined {
  const value = Number(text);
  if (text.trim() === '' || !Number.isFinite(value) || value < range.least || value > range.most) {
    return t('Write a number from {least} to {most}.', range);
  }
  return undefined;
}

/**
 * The action that sets traits of their own on several elements, as one batch named for how many
 * shapes it changes; one element's alone; none for none.
 */
export function elementsStyleCommand(
  elements: readonly Element[],
  changes: AppearanceChanges,
): Command | undefined {
  const commands: Command[] = elements.map((element) => ({
    type: 'update-element',
    id: element.id,
    changes: { appearanceTraits: changes },
  }));
  if (commands.length <= 1) return commands[0];
  return { type: 'batch', label: `Change the style of ${commands.length} shapes`, commands };
}

/** The action that sets traits of their own on several relations, as `elementsStyleCommand` does. */
export function relationsStyleCommand(
  relations: readonly Relation[],
  changes: RelationAppearanceChanges,
): Command | undefined {
  const commands: Command[] = relations.map((relation) => ({
    type: 'update-relation',
    id: relation.id,
    changes: { appearanceTraits: changes },
  }));
  if (commands.length <= 1) return commands[0];
  return { type: 'batch', label: `Change the style of ${commands.length} lines`, commands };
}

/** The action that sets traits on elements and relations together, as one batch. */
export function selectionStyleCommand(
  elements: readonly Element[],
  shapeChanges: AppearanceChanges | undefined,
  relations: readonly Relation[],
  lineChanges: RelationAppearanceChanges | undefined,
): Command | undefined {
  const parts = [
    shapeChanges && elementsStyleCommand(elements, shapeChanges),
    lineChanges && relationsStyleCommand(relations, lineChanges),
  ].flatMap((command) =>
    command === undefined ? [] : command.type === 'batch' ? command.commands : [command],
  );
  if (parts.length <= 1) return parts[0];
  return { type: 'batch', label: `Change the style of ${parts.length} shapes`, commands: parts };
}

/**
 * The action that sets traits for every element of a component, at the level the project can change
 * it (`set-component-appearance`), the element inspected losing its own values of them in the same
 * action so that it follows.
 */
export function componentStyleCommand(
  project: ProjectSnapshot,
  component: Id,
  changes: AppearanceChanges,
  inspected?: Element,
): Command {
  const level: Command = { type: 'set-component-appearance', component, appearanceTraits: changes };
  const own = inspected?.appearance as Record<string, unknown> | undefined;
  const taken = Object.keys(changes).filter((trait) => own?.[trait] !== undefined);
  if (inspected === undefined || taken.length === 0) return level;
  const name = componentOrEssence(definitionsIn(project), component).name;
  return {
    type: 'batch',
    label: `Change the appearance of the component "${name}"`,
    commands: [
      level,
      {
        type: 'update-element',
        id: inspected.id,
        changes: { appearanceTraits: Object.fromEntries(taken.map((trait) => [trait, null])) },
      },
    ],
  };
}

/** The action that sets traits for every relation of a relation type, as `componentStyleCommand`. */
export function relationTypeStyleCommand(
  project: ProjectSnapshot,
  relationType: Id,
  changes: RelationAppearanceChanges,
  inspected?: Relation,
): Command {
  const level: Command = {
    type: 'set-relation-type-appearance',
    relationType,
    appearanceTraits: changes,
  };
  const own = inspected?.appearance as Record<string, unknown> | undefined;
  const taken = Object.keys(changes).filter((trait) => own?.[trait] !== undefined);
  if (inspected === undefined || taken.length === 0) return level;
  const name = relationTypeOrRelatesTo(definitionsIn(project), relationType).name;
  return {
    type: 'batch',
    label: `Change the appearance of the relation type "${name}"`,
    commands: [
      level,
      {
        type: 'update-relation',
        id: inspected.id,
        changes: { appearanceTraits: Object.fromEntries(taken.map((trait) => [trait, null])) },
      },
    ],
  };
}

/** A trait as stored at the level the project can change a definition's appearance. */
export function storedStyleAt(
  project: ProjectSnapshot,
  kind: 'component' | 'relation-type',
  id: Id,
  trait: string,
): unknown {
  const appearance = editableAppearanceOf(project, kind, id)?.appearance as
    Readonly<Record<string, unknown>> | undefined;
  return appearance?.[trait];
}

/** The Style traits of its own an element gives the project's default. */
const DEFAULT_SHAPE_TRAITS: readonly ShapeStyleTrait[] = SHAPE_STYLE_TRAITS;
/** The traits of its own a relation gives the project's default. */
const DEFAULT_LINE_TRAITS = ['stroke', 'width', 'dash', 'opacity', 'route'] as const;

/**
 * The action that makes an element's own Style traits and the parts of its text the project's default
 * (ADR 0088): a project appearance of Essence, which every component derives from, so that every
 * shape whose component sets none of them draws them; each part of the text goes on its own, and the
 * project's other parts stay. None when the element sets none of them itself.
 */
export function projectDefaultCommand(element: Element): Command | undefined {
  const own = element.appearance ?? {};
  const traits = Object.fromEntries(
    DEFAULT_SHAPE_TRAITS.flatMap((trait) =>
      own[trait] === undefined ? [] : [[trait, own[trait]]],
    ),
  ) as AppearanceChanges;
  if (own.text !== undefined && Object.keys(own.text).length > 0) traits.text = { ...own.text };
  if (Object.keys(traits).length === 0) return undefined;
  return { type: 'set-component-appearance', component: ESSENCE_ID, appearanceTraits: traits };
}

/**
 * The action that makes a relation's own line the project's default: a project appearance of
 * "relates to", which every relation type derives from. None when it sets none of it itself.
 */
export function projectLineDefaultCommand(relation: Relation): Command | undefined {
  const own = relation.appearance ?? {};
  const traits = Object.fromEntries(
    DEFAULT_LINE_TRAITS.flatMap((trait) => (own[trait] === undefined ? [] : [[trait, own[trait]]])),
  ) as RelationAppearanceChanges;
  if (Object.keys(traits).length === 0) return undefined;
  return {
    type: 'set-relation-type-appearance',
    relationType: RELATES_TO_ID,
    appearanceTraits: traits,
  };
}

/** The second color a gradient takes when one is turned on: white, or gray on a white fill. */
export function gradientColorFor(fill: Color): Color {
  return fill.toUpperCase() === '#FFFFFF' ? '#7D7D7D' : '#FFFFFF';
}

/**
 * The hints for a shape's border, one for each canvas on which it shows neither against the canvas
 * nor against the shape's fill: a border drawn there that no one sees. None for a shape drawn with
 * no border. Pointed out, never refused (ADR 0033).
 */
export function borderHints(
  colors: Readonly<Record<ThemeName, ShapeColors>>,
  borderWidth: number,
): string[] {
  if (borderWidth <= 0) return [];
  return THEME_NAMES.flatMap((theme) => {
    const { fill, stroke } = colors[theme];
    const onCanvas = legibility(stroke)[theme];
    const onFill = contrastRatio(stroke, fill);
    if (onCanvas >= MINIMUM_MARK_CONTRAST || onFill >= MINIMUM_MARK_CONTRAST) return [];
    return [t(BORDER_HINTS[theme], { canvas: ratioText(onCanvas), fill: ratioText(onFill) })];
  });
}

const BORDER_HINTS: Readonly<Record<ThemeName, string>> = {
  light:
    'Its border hardly shows on the light canvas: it reaches 3:1 neither on the canvas ({canvas}) nor on its fill ({fill}).',
  dark: 'Its border hardly shows on the dark canvas: it reaches 3:1 neither on the canvas ({canvas}) nor on its fill ({fill}).',
};

/**
 * The hints for a shape drawn with no border, one for each canvas its fill, and its gradient's color,
 * do not stand out from: with no border, only its fill tells it from the canvas.
 */
export function borderlessHints(
  colors: Readonly<Record<ThemeName, ShapeColors>>,
  gradientTo: Color | undefined,
): string[] {
  return THEME_NAMES.flatMap((theme) => {
    const fills =
      gradientTo === undefined ? [colors[theme].fill] : [colors[theme].fill, gradientTo];
    const blends = fills.every((fill) => legibility(fill)[theme] < MINIMUM_MARK_CONTRAST);
    return blends ? [t(BORDERLESS_HINTS[theme])] : [];
  });
}

const BORDERLESS_HINTS: Readonly<Record<ThemeName, string>> = {
  light: 'Blends into the light canvas: it draws no border, and its fill does not reach 3:1 on it.',
  dark: 'Blends into the dark canvas: it draws no border, and its fill does not reach 3:1 on it.',
};
