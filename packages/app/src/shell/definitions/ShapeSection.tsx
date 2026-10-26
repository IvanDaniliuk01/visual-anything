import { componentOrEssence, drawnColorsOf, editableAppearanceOf } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useId } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { originText, savedIn } from '../inspector/colors';
import { useShownTheme } from '../inspector/useShownTheme';
import { isBuiltInDefinition } from './commands';
import { GeometryEditor } from './GeometryEditor';
import { PartControl } from './PartControl';
import { componentGeometryCommand, componentPartCommand } from './shape';
import { TraitRow } from './TraitRow';
import { nameOf } from './traits';

/**
 * The component editor's Shape section (ADR 0066, ADR 0067): the free geometry its shapes are drawn
 * by, made from path data, an SVG file or a named part's outline, with Keep proportions, the label
 * area and a preview; and the named part they are drawn as. Both change at the level the project can
 * change, as colors do (`set-component-appearance`), so a built-in component's go into the project
 * file; each change is one command, and each trait shows where it comes from, with Inherited and None.
 */
export function ShapeSection({ id }: { id: Id }) {
  const t = useT();
  const { project, definitions, send } = useEditor();
  const headingId = useId();
  const theme = useShownTheme();
  const readOnly = send === undefined;
  const component = componentOrEssence(definitions, id);
  const { appearance } = component;
  // What the level the project can change stores for the component: its package, or the project file.
  const editable = editableAppearanceOf(project, 'component', id)?.appearance;
  const stored = {
    geometry: editable !== undefined && 'geometry' in editable ? editable.geometry : undefined,
    part: editable !== undefined && 'part' in editable ? editable.part : undefined,
  };
  const source = (trait: 'geometry' | 'part') =>
    originText(component.origins[trait], (each) => nameOf(definitions, 'component', each), id);
  const saved = isBuiltInDefinition(definitions, 'component', id)
    ? savedIn(project.packages, component.package)
    : undefined;
  const colors = drawnColorsOf({ component: id }, definitions, theme);

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>{t('Shape')}</h4>
      <ul className="definition-traits">
        <TraitRow
          label={t('Free geometry')}
          group
          source={source('geometry')}
          own={stored?.geometry !== undefined}
          readOnly={readOnly}
          inherit={() => componentGeometryCommand(id, null)}
          note={
            appearance.contentsAsRows
              ? t('While it draws rows, its shapes ignore free geometry.')
              : saved
          }
        >
          {(control) => (
            <GeometryEditor
              geometry={appearance.geometry}
              stored={stored?.geometry}
              width={appearance.width}
              height={appearance.height}
              colors={colors}
              readOnly={readOnly}
              control={control}
              commandFor={(geometry) => componentGeometryCommand(id, geometry)}
            />
          )}
        </TraitRow>
        <TraitRow
          label={t('Drawn as a part')}
          group
          source={source('part')}
          own={stored?.part !== undefined}
          readOnly={readOnly}
          inherit={() => componentPartCommand(id, null)}
          note={t(
            'Drawn as a named part, its shapes are the part itself: in a drawing with parts, in the part’s place; elsewhere, with the part’s outline and picture.',
          )}
        >
          {(control) => (
            <PartControl
              shown={appearance.part}
              stored={stored?.part}
              readOnly={readOnly}
              control={control}
              commandFor={(part) => componentPartCommand(id, part)}
            />
          )}
        </TraitRow>
      </ul>
    </section>
  );
}
