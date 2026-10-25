import {
  drawnRelationAppearanceOf,
  relationAppearanceOf,
  relationAppearanceOriginsOf,
  relationTypeOrRelatesTo,
  type Command,
  type Definitions,
} from '@visual-anything/core';
import { RELATES_TO_ID, type Id, type Relation } from '@visual-anything/schema';
import { useId, useState } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { TraitRow } from '../definitions/TraitRow';
import { ColorHints, ScopeChoice } from './colorParts';
import { idsOf, lineHints, originText, savedIn, wayBack } from './colors';
import { ColorControl } from './controls';
import { definitionColorCommand, relationColorCommand, storedAtLevel } from './recolor';

interface RelationAppearanceSectionProps {
  relation: Relation;
  definitions: Definitions;
  disabled: boolean;
}

/** Where the section makes its changes: the relation's own appearance, or its relation type's. */
type Scope = 'relation' | 'relation-type';

/**
 * How the relation's line is drawn, and where a change goes: only this relation, as a particularity
 * (ADR-0035), or every relation of its relation type, at the level the project can change it
 * (ADR-0034). Each pick is one undoable action.
 */
export function RelationAppearanceSection({
  relation,
  definitions,
  disabled,
}: RelationAppearanceSectionProps) {
  const { project } = useEditor();
  const headingId = useId();
  const hintId = useId();
  const [scope, setScope] = useState<Scope>('relation');
  const id = relation.relationType;
  const relationType = relationTypeOrRelatesTo(definitions, id);
  const known = id === RELATES_TO_ID || definitions.relationType(id) !== undefined;
  const ofType = scope === 'relation-type' && known;
  const nameOf = (each: Id) => relationTypeOrRelatesTo(definitions, each).name;
  const stored = storedAtLevel(project, 'relation-type', id, 'stroke');
  const drawn = ofType ? { relationType: id } : relation;
  const hints = lineHints({
    light: drawnRelationAppearanceOf(drawn, definitions, 'light').stroke,
    dark: drawnRelationAppearanceOf(drawn, definitions, 'dark').stroke,
  });
  const origin = ofType
    ? relationType.origins.stroke
    : relationAppearanceOriginsOf(relation, definitions).stroke;
  const own = ofType ? stored !== undefined : origin.kind === 'own';
  const shown = ofType
    ? relationType.appearance.stroke
    : relationAppearanceOf(relation, definitions).stroke;
  const strokeOf = (color: string | null, always = false): Command | undefined =>
    ofType
      ? definitionColorCommand(project, 'relation-type', id, 'stroke', color, relation, { always })
      : color === null
        ? {
            type: 'update-relation',
            id: relation.id,
            changes: { appearanceTraits: { stroke: null } },
          }
        : relationColorCommand(relation, color, definitions, { always });

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>Appearance</h4>
      {known && (
        <ScopeChoice
          value={scope}
          options={[
            { value: 'relation', label: 'Only this relation' },
            { value: 'relation-type', label: `Every ${relationType.name}` },
          ]}
          onChange={setScope}
        />
      )}
      {ofType && (
        <p className="inspector-notes">{savedIn(project.packages, relationType.package)}</p>
      )}
      <ul className="definition-traits">
        <TraitRow
          // A new row for each scope, so that a pick on its way is not shown in the other.
          key={scope}
          label="Stroke"
          source={originText(origin, nameOf, ofType ? id : undefined)}
          own={own}
          readOnly={disabled}
          inherit={() => wayBack(strokeOf(null))}
          inheritLabel="Use the inherited color"
          note={
            ofType && relation.appearance?.stroke !== undefined
              ? 'This relation has a stroke of its own: a change here takes it back, so that it follows.'
              : undefined
          }
        >
          {({ id: controlId, describedBy, send }) => (
            <ColorControl
              id={controlId}
              label="Stroke"
              value={shown}
              disabled={disabled}
              describedBy={idsOf(describedBy, hints.length > 0 ? hintId : undefined)}
              onCommit={(color, { waiting }) => {
                const command = strokeOf(color, waiting);
                return command ? send(command) : Promise.resolve(true);
              }}
            />
          )}
        </TraitRow>
      </ul>
      <ColorHints id={hintId} hints={hints} />
    </section>
  );
}
