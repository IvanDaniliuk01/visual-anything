import {
  componentOrEssence,
  drawnColorsOf,
  drawnRelationAppearanceOf,
  relationTypeOrRelatesTo,
  type Definitions,
  type TraitOrigin,
} from '@visual-anything/core';
import type { Color, Id } from '@visual-anything/schema';
import { useId } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { ColorHints } from '../inspector/colorParts';
import {
  idsOf,
  lineHints,
  originText,
  savedIn,
  shapeHints,
  wayBack,
  type ColorTrait,
} from '../inspector/colors';
import { ColorControl } from '../inspector/controls';
import { definitionColorCommand, storedAtLevel } from '../inspector/recolor';
import { isBuiltInDefinition, type DefinitionKind } from './commands';
import { TraitRow } from './TraitRow';
import { nameOf } from './traits';

interface ColorRowProps {
  kind: DefinitionKind;
  id: Id;
  trait: ColorTrait;
  label: string;
  /** Whether this row says how the definition's shapes read on each canvas. */
  hints?: boolean;
}

/**
 * A color of a component or relation type in the component editor. It changes at the level the
 * project can change (`set-component-appearance` or `set-relation-type-appearance`, ADR-0034): a
 * built-in definition's color goes into the project file and the built-in package stays as it is, so
 * built-in definitions can be recolored here too; one of the project's own changes in its package.
 */
export function ColorRow({ kind, id, trait, label, hints: withHints = false }: ColorRowProps) {
  const t = useT();
  const { project, definitions, send } = useEditor();
  const hintId = useId();
  const readOnly = send === undefined;
  const component = kind === 'component';
  const { package: packageId, origin, shown } = colorOf(definitions, kind, id, trait);
  const stored = storedAtLevel(project, kind, id, trait);
  const hints = !withHints
    ? []
    : component
      ? shapeHints({
          light: drawnColorsOf({ component: id }, definitions, 'light'),
          dark: drawnColorsOf({ component: id }, definitions, 'dark'),
        })
      : lineHints({
          light: drawnRelationAppearanceOf({ relationType: id }, definitions, 'light').stroke,
          dark: drawnRelationAppearanceOf({ relationType: id }, definitions, 'dark').stroke,
        });

  return (
    <TraitRow
      label={label}
      source={originText(origin, (each) => nameOf(definitions, kind, each), id)}
      own={stored !== undefined}
      readOnly={readOnly}
      inherit={() => wayBack(definitionColorCommand(project, kind, id, trait, null))}
      inheritLabel={t('Use the inherited color')}
      note={
        isBuiltInDefinition(definitions, kind, id)
          ? savedIn(project.packages, packageId)
          : undefined
      }
    >
      {({ id: controlId, describedBy, send: sendCommand }) => (
        <>
          <ColorControl
            id={controlId}
            label={label}
            value={shown}
            disabled={readOnly}
            describedBy={idsOf(describedBy, hints.length > 0 ? hintId : undefined)}
            onCommit={(color, { waiting }) => {
              const command = definitionColorCommand(project, kind, id, trait, color, undefined, {
                always: waiting,
              });
              return command ? sendCommand(command) : Promise.resolve(true);
            }}
          />
          <ColorHints id={hintId} hints={hints} />
        </>
      )}
    </TraitRow>
  );
}

/** A definition's color as it is drawn, where it comes from, and the package that defines it. */
function colorOf(
  definitions: Definitions,
  kind: DefinitionKind,
  id: Id,
  trait: ColorTrait,
): { package: Id | undefined; origin: TraitOrigin; shown: Color } {
  if (kind === 'component') {
    const component = componentOrEssence(definitions, id);
    return {
      package: component.package,
      origin: component.origins[trait],
      shown: component.appearance[trait],
    };
  }
  const relationType = relationTypeOrRelatesTo(definitions, id);
  return {
    package: relationType.package,
    origin: relationType.origins.stroke,
    shown: relationType.appearance.stroke,
  };
}
