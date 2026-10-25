import { sameColor } from '@visual-anything/core';
import { useId } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { Field } from '../definitions/Field';
import type { ColorTrait } from './colors';
import { ColorControl } from './controls';
import { selectionColorCommand, selectionColors } from './recolor';
import { useShownTheme } from './useShownTheme';

/**
 * The colors of several selected shapes, changed together as one action: a fill for the elements and
 * notes, a stroke for every element, relation, note and arrow. Each shows the color they share, or
 * "Mixed" when they differ; a pick gives each shape that color of its own, or takes its own back when
 * it would show that color without one.
 */
export function SelectionAppearance() {
  const t = useT();
  const { project, viewId, selection, send } = useEditor();
  const headingId = useId();
  const theme = useShownTheme();
  const disabled = send === undefined;
  const rows: { trait: ColorTrait; label: string }[] = [
    { trait: 'fill', label: 'Fill' },
    { trait: 'stroke', label: 'Stroke' },
  ];
  const shown = rows.flatMap(({ trait, label }) => {
    const colors = selectionColors(project, viewId, selection, trait, theme);
    const [first] = colors;
    if (first === undefined) return [];
    return [{ trait, label, first, colors }];
  });
  const shapes = Math.max(0, ...shown.map(({ colors }) => colors.length));
  if (shown.length === 0) return null;

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>
        {t(
          { one: 'Appearance of {count} shape', other: 'Appearance of {count} shapes' },
          { count: shapes },
        )}
      </h4>
      {shown.map(({ trait, label, first, colors }) => (
        <Field
          key={trait}
          label={t(label)}
          note={
            trait === 'fill' && colors.length < shapes
              ? t(
                  {
                    one: 'For the {count} shape with a fill.',
                    other: 'For the {count} shapes with a fill.',
                  },
                  { count: colors.length },
                )
              : undefined
          }
        >
          {({ id, describedBy, send: sendCommand }) => (
            <ColorControl
              id={id}
              label={t(label)}
              value={first}
              mixed={colors.some((color) => !sameColor(color, first))}
              disabled={disabled}
              describedBy={describedBy}
              onCommit={(color, { waiting }) => {
                const command = selectionColorCommand(project, viewId, selection, trait, color, {
                  always: waiting,
                  theme,
                });
                return command ? sendCommand(command) : Promise.resolve(true);
              }}
            />
          )}
        </Field>
      ))}
    </section>
  );
}
