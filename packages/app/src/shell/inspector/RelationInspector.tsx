import {
  limitWarnings,
  modelIndexOf,
  relationTypeOrRelatesTo,
  type Definitions,
  type ModelIndex,
  type UpdateRelationCommand,
  wouldFormCycle,
} from '@visual-anything/core';
import { RELATES_TO_ID, type Relation } from '@visual-anything/schema';
import { useId, type Ref } from 'react';
import { useEditor } from '../../editor/EditorContext';
import type { Selectable } from '../../editor/selection';
import { isBuiltInDefinition } from '../definitions/commands';
import { useOpenDefinition } from '../definitions/opened';
import { AttributesSection } from './AttributesSection';
import { byPackage, relationLabel } from './describe';
import { SelectControl, TextControl } from './controls';
import { Detail, End, Lineage, Title } from './parts';
import { RelationAppearanceSection } from './RelationAppearanceSection';
import { perform } from './send';
import { sameOptionalText } from './text';

interface RelationInspectorProps {
  relation: Relation;
  definitions: Definitions;
  /** The title, which takes the focus when this relation was chosen in the inspector. */
  titleRef: Ref<HTMLHeadingElement>;
  /** Selects an end. */
  onSelect: (item: Selectable) => void;
}

/**
 * One relation: its relation type, the limits of that type it breaks, which only warn, its ends, its
 * name and description, the attributes its relation type defines, and how its line is drawn.
 */
export function RelationInspector({
  relation,
  definitions,
  titleRef,
  onSelect,
}: RelationInspectorProps) {
  const { project, send } = useEditor();
  const disabled = send === undefined;
  const index = modelIndexOf(project);
  const relationType = relationTypeOrRelatesTo(definitions, relation.relationType);
  const nameId = useId();
  const descriptionId = useId();
  const endsId = useId();
  const update = (changes: UpdateRelationCommand['changes']) =>
    perform(send, { type: 'update-relation', id: relation.id, changes });

  return (
    <>
      <Title titleRef={titleRef} name={relationLabel(index, relation)} detail={relationType.name} />
      <div className="inspector-control">
        <label htmlFor={nameId}>Name</label>
        <TextControl
          id={nameId}
          value={relation.name ?? ''}
          disabled={disabled}
          same={sameOptionalText}
          onCommit={async (text) => {
            // A relation's name is optional: an empty one removes it.
            await update({ name: text.trim() === '' ? null : text });
          }}
        />
      </div>
      <div className="inspector-control">
        <label htmlFor={descriptionId}>Description</label>
        <TextControl
          id={descriptionId}
          value={relation.description ?? ''}
          multiline
          disabled={disabled}
          same={sameOptionalText}
          onCommit={async (text) => {
            await update({ description: text.trim() === '' ? null : text });
          }}
        />
      </div>
      <RelationTypeSection
        relation={relation}
        index={index}
        definitions={definitions}
        disabled={disabled}
        update={update}
      />
      <section className="inspector-section" aria-labelledby={endsId}>
        <h4 id={endsId}>Ends</h4>
        <dl className="details">
          <Detail term="From">
            <End id={relation.from} index={index} definitions={definitions} onSelect={onSelect} />
          </Detail>
          <Detail term="To">
            <End id={relation.to} index={index} definitions={definitions} onSelect={onSelect} />
          </Detail>
        </dl>
      </section>
      <AttributesSection
        of="relation"
        definitions={relationType.attributes}
        values={relation.attributes}
        disabled={disabled}
        change={update}
      />
      <RelationAppearanceSection
        relation={relation}
        definitions={definitions}
        disabled={disabled}
      />
    </>
  );
}

interface RelationTypeSectionProps {
  relation: Relation;
  index: ModelIndex;
  definitions: Definitions;
  disabled: boolean;
  update: (changes: UpdateRelationCommand['changes']) => Promise<boolean>;
}

/**
 * The relation's relation type, among those of the packages in use. Each choice says when the ends
 * would break its limits, which only warns. A relation type that nests cannot be chosen where the core
 * would refuse it: it needs two elements as ends, World sits inside nothing, and containment never
 * forms a cycle. It leads into the component editor: editing a relation type of the project's own,
 * or deriving one from a built-in relation type, which the relation can then be of.
 */
function RelationTypeSection({
  relation,
  index,
  definitions,
  disabled,
  update,
}: RelationTypeSectionProps) {
  const { project } = useEditor();
  const { open } = useOpenDefinition();
  const headingId = useId();
  const selectId = useId();
  const relationType = relationTypeOrRelatesTo(definitions, relation.relationType);
  const known = definitions.relationType(relation.relationType) !== undefined;
  const offered = byPackage(definitions.relationTypes, project.packages);
  const listed = offered.some((from) => from.members.includes(relation.relationType));
  const warnings = limitWarnings(relation, index, definitions);
  const nestingRefusal = nestingRefusalOf(relation, index);

  const option = (id: string) => {
    const each = relationTypeOrRelatesTo(definitions, id);
    const refused = each.nests ? nestingRefusal : undefined;
    const fits =
      limitWarnings({ relationType: id, from: relation.from, to: relation.to }, index, definitions)
        .length === 0;
    const hint = refused !== undefined ? ` · ${refused}` : fits ? '' : ' · outside its limits';
    return (
      <option key={id} value={id} disabled={refused !== undefined && id !== relation.relationType}>
        {`${each.name}${hint}`}
      </option>
    );
  };

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>Relation type</h4>
      <SelectControl
        id={selectId}
        labelledBy={headingId}
        value={relation.relationType}
        disabled={disabled}
        onCommit={(id) => update({ relationType: id })}
      >
        {!listed && option(relation.relationType)}
        {offered.map((from) => (
          <optgroup key={from.id} label={from.name}>
            {from.members.map(option)}
          </optgroup>
        ))}
      </SelectControl>
      {relationType.description !== undefined && (
        <p className="inspector-notes">{relationType.description}</p>
      )}
      {known ? (
        <>
          <Lineage
            names={relationType.lineage
              .slice(1)
              .map((id) => relationTypeOrRelatesTo(definitions, id).name)}
            none="It derives from no other relation type."
          />
          {relationType.lineage.at(-1) !== RELATES_TO_ID && (
            <p className="inspector-warning">
              Its chain stops before “relates to”, because a relation type in it is missing.
            </p>
          )}
        </>
      ) : (
        <p className="inspector-warning">
          No package in use defines the relation type “{relation.relationType}”, so it behaves like
          “relates to”.
        </p>
      )}
      {warnings.length > 0 && (
        <ul className="inspector-warnings" aria-label="Warnings">
          {warnings.map((warning) => (
            <li key={warning.message}>{warning.message}</li>
          ))}
        </ul>
      )}
      {open !== undefined &&
        (known || relation.relationType === RELATES_TO_ID) &&
        (isBuiltInDefinition(definitions, 'relation-type', relation.relationType) ? (
          <button
            type="button"
            className="inspector-action"
            disabled={disabled}
            onClick={() =>
              open(
                {
                  kind: 'derive',
                  of: 'relation-type',
                  base: relation.relationType,
                  useFor: relation.id,
                },
                { focus: true },
              )
            }
          >
            Derive a relation type from “{relationType.name}”
          </button>
        ) : (
          <button
            type="button"
            className="inspector-action"
            onClick={() =>
              open({ kind: 'relation-type', id: relation.relationType }, { focus: true })
            }
          >
            Edit “{relationType.name}”
          </button>
        ))}
    </section>
  );
}

/**
 * Why the relation could not be of a relation type that nests, as the core would refuse it; undefined
 * when it could be.
 */
function nestingRefusalOf(relation: Relation, index: ModelIndex): string | undefined {
  if (index.element(relation.from) === undefined || index.element(relation.to) === undefined) {
    return 'needs two elements';
  }
  if (relation.from === index.world.id) return 'World cannot sit inside anything';
  if (wouldFormCycle(index, relation.from, relation.to)) {
    return 'would make containment form a cycle';
  }
  return undefined;
}
