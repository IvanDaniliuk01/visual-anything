import type { Command } from '@visual-anything/core';
import { ESSENCE_ID, RELATES_TO_ID, type Id } from '@visual-anything/schema';
import { useId } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { SelectControl, TextControl } from '../inspector/controls';
import { byPackage } from '../inspector/describe';
import { Detail, Lineage } from '../inspector/parts';
import { sameOptionalText } from '../inspector/text';
import type { DefinitionKind } from './commands';
import { Field } from './Field';
import { nameOf } from './traits';

/** The changes the identity section makes. */
export interface IdentityChanges {
  name?: string;
  description?: string | null;
  derivesFrom?: Id;
}

interface IdentitySectionProps {
  kind: DefinitionKind;
  id: Id;
  name: string;
  description: string | undefined;
  /** The name of the package that defines it; absent for Essence and "relates to". */
  packageName: string | undefined;
  /** Its own id and what it derives from, nearest first. */
  lineage: readonly Id[];
  readOnly: boolean;
  /** The command that makes these changes. */
  update: (changes: IdentityChanges) => Command;
}

/**
 * What a component or relation type is: its name and description, its package and id, which do not
 * change, and what it derives from, among the definitions in use that do not derive from it.
 */
export function IdentitySection({
  kind,
  id,
  name,
  description,
  packageName,
  lineage,
  readOnly,
  update,
}: IdentitySectionProps) {
  const { project, definitions } = useEditor();
  const headingId = useId();
  const derivesFrom = lineage[1];
  const root = kind === 'component' ? ESSENCE_ID : RELATES_TO_ID;
  const defined = kind === 'component' ? definitions.components : definitions.relationTypes;
  const derives = (other: Id) =>
    kind === 'component'
      ? definitions.componentDerives(other, id)
      : definitions.relationTypeDerives(other, id);
  const offered = byPackage(defined, project.packages)
    .map((from) => ({ ...from, members: from.members.filter((other) => !derives(other)) }))
    .filter((from) => from.members.length > 0);

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>Identity</h4>
      <Field label="Name">
        {({ id: controlId, describedBy, send }) => (
          <TextControl
            id={controlId}
            value={name}
            disabled={readOnly}
            describedBy={describedBy}
            onCommit={async (text) => {
              // A definition always has a name: an empty one goes back to the name it had.
              if (text.trim() !== '') await send(update({ name: text }));
            }}
          />
        )}
      </Field>
      <Field label="Description">
        {({ id: controlId, describedBy, send }) => (
          <TextControl
            id={controlId}
            value={description ?? ''}
            multiline
            disabled={readOnly}
            describedBy={describedBy}
            same={sameOptionalText}
            onCommit={async (text) => {
              await send(update({ description: text.trim() === '' ? null : text }));
            }}
          />
        )}
      </Field>
      <dl className="details">
        <Detail term="Package">{packageName ?? 'Built into Visual Anything'}</Detail>
        <Detail term="Id">
          <code>{id}</code>
        </Detail>
      </dl>
      {derivesFrom !== undefined && (
        <Field label="Derives from">
          {({ id: controlId, describedBy, send }) => (
            <SelectControl
              id={controlId}
              value={derivesFrom}
              disabled={readOnly}
              describedBy={describedBy}
              onCommit={(parent) => send(update({ derivesFrom: parent }))}
            >
              <option value={root}>{nameOf(definitions, kind, root)}</option>
              {offered.map((from) => (
                <optgroup key={from.id} label={from.name}>
                  {from.members.map((other) => (
                    <option key={other} value={other}>
                      {nameOf(definitions, kind, other)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </SelectControl>
          )}
        </Field>
      )}
      <Lineage
        names={lineage.slice(1).map((each) => nameOf(definitions, kind, each))}
        none={
          kind === 'component'
            ? 'It derives from no other component: every component derives from it.'
            : 'It derives from no other relation type: every relation type derives from it.'
        }
      />
    </section>
  );
}
