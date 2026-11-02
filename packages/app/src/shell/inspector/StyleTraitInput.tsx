import type { Color, Gradient } from '@visual-anything/schema';
import { useId } from 'react';
import { useT } from '../../i18n';
import { ColorControl, SelectControl, TextControl } from './controls';
import {
  DASHES,
  DASH_NAMES,
  RANGES,
  gradientColorFor,
  numberProblem,
  percentOf,
  type Dash,
  type LineStyleTrait,
  type ShapeStyleTrait,
} from './styleTraits';

/** A row of the Style tab: its trait, what it is called and how it is edited. */
export interface StyleRowSpec<T extends string> {
  trait: T;
  label: string;
  kind: StyleInputKind;
  range?: { least: number; most: number };
}

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

/** How a Style trait is edited: a number, a percent, a dash, a shadow, or a gradient. */
export type StyleInputKind = 'number' | 'percent' | 'dash' | 'shadow' | 'gradient';

interface StyleTraitInputProps {
  kind: StyleInputKind;
  id: string;
  /** What the trait is called, which names a gradient's color. */
  label: string;
  describedBy?: string | undefined;
  disabled: boolean;
  /** The value shown: the one the items share, or the first one's when they differ. */
  value: unknown;
  /** Whether the items differ: the control then says "Mixed" until a value is set. */
  mixed?: boolean;
  /** The range of a number. */
  range?: { least: number; most: number };
  /** The fill a gradient runs from, which picks the color a gradient turned on runs to. */
  fill?: Color;
  /**
   * Sets the value on every item; resolves once the project shows it. A gradient's color comes with
   * `waiting` when an earlier pick is on its way.
   */
  onCommit: (value: unknown, pick?: { waiting: boolean }) => Promise<unknown>;
}

const SHADOWS = [
  { value: 'none', name: 'No shadow' },
  { value: 'soft', name: 'Soft shadow' },
] as const;

const DIRECTIONS = [
  { value: 'none', name: 'No gradient' },
  { value: 'down', name: 'Top to bottom' },
  { value: 'right', name: 'Left to right' },
] as const;

const MIXED = '';

function isDash(value: string): value is Dash {
  return (DASHES as readonly string[]).includes(value);
}

/**
 * The control of one Style trait of the format panel (ADR 0088), for one item or several: each
 * commit sets the value on all of them in one action, and a value they do not share shows as mixed.
 */
export function StyleTraitInput({
  kind,
  id,
  label,
  describedBy,
  disabled,
  value,
  mixed = false,
  range,
  fill,
  onCommit,
}: StyleTraitInputProps) {
  const t = useT();
  const colorId = useId();
  const mixedOption = mixed ? (
    <option value={MIXED} disabled>
      {t('Mixed')}
    </option>
  ) : null;
  switch (kind) {
    case 'number':
    case 'percent': {
      const percent = kind === 'percent';
      const within = range ?? (percent ? RANGES.opacity : RANGES.borderWidth);
      const shown = percent ? percentOf(value as number) : (value as number);
      return (
        <TextControl
          id={id}
          inputType="number"
          value={mixed ? '' : String(shown)}
          placeholder={mixed ? t('Mixed') : undefined}
          disabled={disabled}
          describedBy={describedBy}
          problemOf={(text) => numberProblem(text, within)}
          same={(a, b) => a.trim() !== '' && b.trim() !== '' && Number(a) === Number(b)}
          onCommit={(text) => onCommit(percent ? Number(text) / 100 : Number(text))}
        />
      );
    }
    case 'dash':
      return (
        <SelectControl
          id={id}
          value={mixed ? MIXED : (value as string)}
          disabled={disabled}
          describedBy={describedBy}
          onCommit={async (next) => {
            if (isDash(next)) await onCommit(next);
          }}
        >
          {mixedOption}
          {DASHES.map((dash) => (
            <option key={dash} value={dash}>
              {t(DASH_NAMES[dash])}
            </option>
          ))}
        </SelectControl>
      );
    case 'shadow':
      return (
        <SelectControl
          id={id}
          value={mixed ? MIXED : (value as string)}
          disabled={disabled}
          describedBy={describedBy}
          onCommit={async (next) => {
            if (next === 'none' || next === 'soft') await onCommit(next);
          }}
        >
          {mixedOption}
          {SHADOWS.map((shadow) => (
            <option key={shadow.value} value={shadow.value}>
              {t(shadow.name)}
            </option>
          ))}
        </SelectControl>
      );
    case 'gradient': {
      const gradient = value === 'none' ? undefined : (value as Gradient);
      return (
        <>
          <SelectControl
            id={id}
            value={mixed ? MIXED : (gradient?.direction ?? 'none')}
            label={label}
            disabled={disabled}
            describedBy={describedBy}
            onCommit={async (next) => {
              if (next === 'none') await onCommit('none');
              else if (next === 'down' || next === 'right') {
                const to = gradient?.to ?? gradientColorFor(fill ?? '#FFFFFF');
                await onCommit({ to, direction: next });
              }
            }}
          >
            {mixedOption}
            {DIRECTIONS.map((direction) => (
              <option key={direction.value} value={direction.value}>
                {t(direction.name)}
              </option>
            ))}
          </SelectControl>
          {gradient && (
            <span className="inspector-gradient-color">
              <label htmlFor={colorId}>{t('Gradient color')}</label>
              <ColorControl
                id={colorId}
                label={label}
                value={gradient.to}
                mixed={mixed}
                disabled={disabled}
                onCommit={(to, pick) => onCommit({ to, direction: gradient.direction }, pick)}
              />
            </span>
          )}
        </>
      );
    }
  }
}
