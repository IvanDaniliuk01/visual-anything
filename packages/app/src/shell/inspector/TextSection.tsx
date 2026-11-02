import {
  appearanceOf,
  appearanceOriginsOf,
  componentOrEssence,
  definitionsIn,
  drawingOf,
  drawnColorsOf,
  type Command,
  type Definitions,
  type TraitPath,
} from '@visual-anything/core';
import type { Color, Element, Id } from '@visual-anything/schema';
import { useId } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { Field } from '../definitions/Field';
import { TraitRow } from '../definitions/TraitRow';
import { ColorHints } from './colorParts';
import { idsOf, originText } from './colors';
import { ColorControl, SelectControl, TextControl } from './controls';
import { numberProblem, sharedValue } from './styleTraits';
import {
  TEXT_ROWS,
  choiceOf,
  componentTextCommand,
  elementsTextCommand,
  storedChoice,
  storedTextAt,
  textChange,
  textContrastHints,
  textValues,
  unsetSource,
  type TextRowSpec,
  type TextValues,
} from './textTraits';
import { useShownTheme, useStoredColorsInDark } from './useShownTheme';

const MIXED = '';

interface TextPartInputProps {
  row: TextRowSpec;
  id: string;
  describedBy?: string | undefined;
  disabled: boolean;
  /** The value shown: the one the elements share, or the first one's when they differ. */
  value: unknown;
  /** What a color with no value of its own shows: its fill for a back, its stroke for a border. */
  fallback: Color;
  mixed?: boolean;
  /** Sets the value on every element; resolves once the project shows it. */
  onCommit: (value: unknown) => Promise<unknown>;
}

/**
 * The control of one part of the text (ADR 0088), for one element or several: a choice, a number or
 * a color with the swatches first; each commit sets it on all of them in one action, and a value they
 * do not share shows as mixed.
 */
function TextPartInput({
  row,
  id,
  describedBy,
  disabled,
  value,
  fallback,
  mixed = false,
  onCommit,
}: TextPartInputProps) {
  const t = useT();
  switch (row.kind) {
    case 'choice':
      return (
        <SelectControl
          id={id}
          value={mixed ? MIXED : choiceOf(value)}
          disabled={disabled}
          describedBy={describedBy}
          onCommit={async (next) => {
            if (row.choices?.some((choice) => choice.value === next)) {
              await onCommit(storedChoice(row.part, next));
            }
          }}
        >
          {mixed && (
            <option value={MIXED} disabled>
              {t('Mixed')}
            </option>
          )}
          {row.choices?.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {t(choice.name)}
            </option>
          ))}
        </SelectControl>
      );
    case 'number': {
      const range = row.range ?? { least: 0, most: 48 };
      return (
        <TextControl
          id={id}
          inputType="number"
          value={mixed ? '' : String(value)}
          placeholder={mixed ? t('Mixed') : undefined}
          disabled={disabled}
          describedBy={describedBy}
          problemOf={(text) => numberProblem(text, range)}
          same={(a, b) => a.trim() !== '' && b.trim() !== '' && Number(a) === Number(b)}
          onCommit={(text) => onCommit(Number(text))}
        />
      );
    }
    case 'color':
      return (
        <ColorControl
          id={id}
          label={t(row.label)}
          value={(value as Color | undefined) ?? fallback}
          mixed={mixed}
          disabled={disabled}
          describedBy={describedBy}
          onCommit={(color) => onCommit(color)}
        />
      );
  }
}

/** What a color with no value of its own shows: the fill behind it, or the shape's stroke. */
function fallbackOf(row: TextRowSpec, colors: { fill: Color; stroke: Color }): Color {
  return row.part === 'border' ? colors.stroke : colors.fill;
}

/** The notes the Text tab ends with: what Roboto Mono writes, and what containers take. */
function TextNotes({ mono }: { mono: boolean }) {
  const t = useT();
  return (
    <>
      {mono && (
        <p className="inspector-notes">
          {t(
            'Roboto Mono is written upright in one weight: bold and italics apply to the other fonts.',
          )}
        </p>
      )}
      <p className="inspector-notes">
        {t(
          'Containers, tables and rows write their names as always; a container takes only the text color.',
        )}
      </p>
    </>
  );
}

interface ElementTextProps {
  element: Element;
  definitions: Definitions;
  disabled: boolean;
  /** Whether a change goes to every element of the component. */
  ofComponent: boolean;
}

/**
 * How one element writes its name (ADR 0088): each part of its text, its own as a particularity, or
 * its component's at the level the project can change it, which takes back the element's own value
 * of that part in the same action. Each part says where its value comes from, and a text color that
 * reads poorly on its back or its fill is pointed out for each canvas.
 */
export function ElementTextTraits({
  element,
  definitions,
  disabled,
  ofComponent,
}: ElementTextProps) {
  const t = useT();
  const hintId = useId();
  const { project, viewId } = useEditor();
  const theme = useShownTheme();
  const storedInDark = useStoredColorsInDark();
  const id = element.component;
  const component = componentOrEssence(definitions, id);
  const subject = ofComponent ? { component: id } : element;
  const shown = ofComponent ? component.appearance : appearanceOf(element, definitions);
  const origins = ofComponent ? component.origins : appearanceOriginsOf(element, definitions);
  const drawn = drawnColorsOf(subject, definitions, theme);
  const values: TextValues = textValues(shown, drawingOf(project, viewId), drawn.fill);
  const nameOf = (each: Id) => t.definition(each, componentOrEssence(definitions, each).name);
  const hints = textContrastHints(
    {
      light: drawnColorsOf(subject, definitions, 'light'),
      dark: drawnColorsOf(subject, definitions, 'dark', storedInDark),
    },
    shown.text,
    storedInDark,
  );
  const commandFor = (row: TextRowSpec, value: unknown): Command =>
    ofComponent
      ? componentTextCommand(project, id, row.part, value, element)
      : {
          type: 'update-element',
          id: element.id,
          changes: { appearanceTraits: textChange(row.part, value) },
        };
  const sourceOf = (row: TextRowSpec): string => {
    const path = `text.${row.part}` as TraitPath;
    if (shown.text[row.part] === undefined) return unsetSource(row.part);
    return originText(origins[path], nameOf, ofComponent ? id : undefined);
  };
  const ownOf = (row: TextRowSpec): boolean =>
    ofComponent
      ? storedTextAt(project, id, row.part) !== undefined
      : origins[`text.${row.part}` as TraitPath].kind === 'own';

  return (
    <>
      <ul className="definition-traits">
        {TEXT_ROWS.map((row) => (
          <TraitRow
            key={row.part}
            label={t(row.label)}
            source={sourceOf(row)}
            own={ownOf(row)}
            readOnly={disabled}
            inherit={() => commandFor(row, null)}
            note={
              ofComponent && element.appearance?.text?.[row.part] !== undefined
                ? t(
                    'This element has a {what} of its own: a change here takes it back, so that it follows.',
                    { what: t(row.label).toLowerCase() },
                  )
                : undefined
            }
          >
            {({ id: controlId, describedBy, send }) => (
              <TextPartInput
                row={row}
                id={controlId}
                describedBy={idsOf(
                  describedBy,
                  hints.length > 0 && row.kind === 'color' ? hintId : undefined,
                )}
                disabled={disabled}
                value={values[row.part]}
                fallback={fallbackOf(row, drawn)}
                onCommit={(value) => send(commandFor(row, value))}
              />
            )}
          </TraitRow>
        ))}
      </ul>
      <ColorHints id={hintId} hints={hints} />
      <TextNotes mono={values.font === 'mono'} />
    </>
  );
}

/**
 * How several selected elements write their names (ADR 0088): each part, the value they share or
 * "Mixed", set on all of them in one action; and the hints of each one whose text color reads
 * poorly.
 */
export function SelectionTextTraits({
  elements,
  disabled,
}: {
  elements: readonly Element[];
  disabled: boolean;
}) {
  const t = useT();
  const hintId = useId();
  const { project, viewId } = useEditor();
  const theme = useShownTheme();
  const storedInDark = useStoredColorsInDark();
  const definitions = definitionsIn(project);
  const drawing = drawingOf(project, viewId);
  const each = elements.map((element) => {
    const appearance = appearanceOf(element, definitions);
    const drawn = drawnColorsOf(element, definitions, theme);
    return { element, appearance, drawn, values: textValues(appearance, drawing, drawn.fill) };
  });
  const [first] = each;
  if (!first) return null;
  const hints = [
    ...new Set(
      each.flatMap(({ element, appearance }) =>
        textContrastHints(
          {
            light: drawnColorsOf(element, definitions, 'light'),
            dark: drawnColorsOf(element, definitions, 'dark', storedInDark),
          },
          appearance.text,
          storedInDark,
        ),
      ),
    ),
  ];
  return (
    <>
      {TEXT_ROWS.map((row) => {
        const shared = sharedValue(each.map(({ values }) => values[row.part]));
        if (!shared) return null;
        return (
          <Field key={row.part} label={t(row.label)}>
            {({ id, describedBy, send }) => (
              <TextPartInput
                row={row}
                id={id}
                describedBy={idsOf(
                  describedBy,
                  hints.length > 0 && row.kind === 'color' ? hintId : undefined,
                )}
                disabled={disabled}
                value={shared.value}
                mixed={shared.mixed}
                fallback={fallbackOf(row, first.drawn)}
                onCommit={async (value) => {
                  const command = elementsTextCommand(elements, row.part, value);
                  return command ? send(command) : true;
                }}
              />
            )}
          </Field>
        );
      })}
      <ColorHints id={hintId} hints={hints} />
      <TextNotes mono={each.some(({ values }) => values.font === 'mono')} />
    </>
  );
}
