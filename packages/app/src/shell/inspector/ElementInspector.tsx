import {
  componentOrEssence,
  modelIndexOf,
  type Definitions,
  type ModelIndex,
  type UpdateElementCommand,
} from '@visual-anything/core';
import { ESSENCE_ID, type Element } from '@visual-anything/schema';
import { useId, type Ref } from 'react';
import { useEditor } from '../../editor/EditorContext';
import type { Selectable } from '../../editor/selection';
import { AppearanceSection } from './AppearanceSection';
import { AttributesSection } from './AttributesSection';
import { byPackage, relationLabel, relationSentence } from './describe';
import { SelectControl, TextControl } from './controls';
import { End, Lineage, SelectButton, Title } from './parts';
import { perform } from './send';

interface ElementInspectorProps {
  element: Element;
  definitions: Definitions;
  /** The title, which takes the focus when this element was chosen in the inspector. */
  titleRef: Ref<HTMLHeadingElement>;
  /** Selects what the inspector lists: a container, a relation, an end. */
  onSelect: (item: Selectable) => void;
}

/**
 * One element: its name and description, its component, where it sits, the relations on it, its
 * attributes and its appearance. Its particularities are marked, and each can be taken back.
 */
export function ElementInspector({
  element,
  definitions,
  titleRef,
  onSelect,
}: ElementInspectorProps) {
  const { project, send } = useEditor();
  const disabled = send === undefined;
  const index = modelIndexOf(project);
  const component = componentOrEssence(definitions, element.component);
  const nameId = useId();
  const descriptionId = useId();
  const update = (changes: UpdateElementCommand['changes']) =>
    perform(send, { type: 'update-element', id: element.id, changes });

  return (
    <>
      <Title titleRef={titleRef} name={element.name} detail={component.name} />
      <div className="inspector-control">
        <label htmlFor={nameId}>Name</label>
        <TextControl
          id={nameId}
          value={element.name}
          disabled={disabled}
          onCommit={async (name) => {
            // An element always has a name: an empty one goes back to the name it had.
            if (name.trim() !== '') await update({ name });
          }}
        />
      </div>
      <div className="inspector-control">
        <label htmlFor={descriptionId}>Description</label>
        <TextControl
          id={descriptionId}
          value={element.description ?? ''}
          multiline
          disabled={disabled}
          onCommit={async (text) => {
            const description = text.trim() === '' ? undefined : text;
            if (description !== element.description) {
              await update({ description: description ?? null });
            }
          }}
        />
      </div>
      <ComponentSection
        element={element}
        definitions={definitions}
        disabled={disabled}
        update={update}
      />
      <PlacesSection
        element={element}
        index={index}
        definitions={definitions}
        onSelect={onSelect}
      />
      <AttributesSection
        of="element"
        definitions={component.attributes}
        values={element.attributes}
        disabled={disabled}
        change={update}
      />
      <AppearanceSection
        element={element}
        definitions={definitions}
        disabled={disabled}
        update={update}
      />
    </>
  );
}

interface ComponentSectionProps {
  element: Element;
  definitions: Definitions;
  disabled: boolean;
  update: (changes: UpdateElementCommand['changes']) => Promise<boolean>;
}

/** The element's component, among the components of the packages in use, and what it derives from. */
function ComponentSection({ element, definitions, disabled, update }: ComponentSectionProps) {
  const { project } = useEditor();
  const headingId = useId();
  const selectId = useId();
  const component = componentOrEssence(definitions, element.component);
  const known = definitions.component(element.component) !== undefined;
  const offered = byPackage(definitions.components, project.packages);
  const listed = offered.some((from) => from.members.includes(element.component));
  const derivesFrom = component.lineage.slice(1);

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>Component</h4>
      <SelectControl
        id={selectId}
        labelledBy={headingId}
        value={element.component}
        disabled={disabled}
        onCommit={(id) => update({ component: id })}
      >
        {!listed && <option value={element.component}>{component.name}</option>}
        {offered.map((from) => (
          <optgroup key={from.id} label={from.name}>
            {from.members.map((id) => (
              <option key={id} value={id}>
                {componentOrEssence(definitions, id).name}
              </option>
            ))}
          </optgroup>
        ))}
      </SelectControl>
      {component.description !== undefined && (
        <p className="inspector-notes">{component.description}</p>
      )}
      {known ? (
        <>
          <Lineage
            names={derivesFrom.map((id) => componentOrEssence(definitions, id).name)}
            none="It derives from no other component."
          />
          {component.lineage.at(-1) !== ESSENCE_ID && (
            <p className="inspector-warning">
              Its chain stops before Essence, because a component in it is missing.
            </p>
          )}
        </>
      ) : (
        <p className="inspector-warning">
          No package in use defines the component “{element.component}”, so it looks like Essence.
        </p>
      )}
    </section>
  );
}

interface PlacesSectionProps {
  element: Element;
  index: ModelIndex;
  definitions: Definitions;
  onSelect: (item: Selectable) => void;
}

/** Where the element sits and how it relates: its containers, then every relation that ends on it. */
function PlacesSection({ element, index, definitions, onSelect }: PlacesSectionProps) {
  const containersId = useId();
  const relationsId = useId();
  const containers = index.containersOf(element.id);
  const relations = index.relationsOn(element.id);
  const isWorld = element.id === index.world.id;

  return (
    <>
      <section className="inspector-section" aria-labelledby={containersId}>
        <h4 id={containersId}>Containers</h4>
        {containers.length > 0 ? (
          <ul className="inspector-selectables" aria-labelledby={containersId}>
            {containers.map((id) => (
              <li key={id}>
                <End id={id} index={index} definitions={definitions} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="panel-empty">
            {isWorld ? 'World contains every other element.' : 'It sits directly in World.'}
          </p>
        )}
      </section>
      <section className="inspector-section" aria-labelledby={relationsId}>
        <h4 id={relationsId}>Relations</h4>
        {relations.length > 0 ? (
          <ul className="inspector-selectables" aria-labelledby={relationsId}>
            {relations.map((relation) => {
              const sentence = relationSentence(index, definitions, relation);
              return (
                <li key={relation.id}>
                  <SelectButton
                    name={relation.name === undefined ? sentence : relationLabel(index, relation)}
                    detail={relation.name === undefined ? undefined : sentence}
                    onSelect={() => onSelect({ kind: 'relation', id: relation.id })}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="panel-empty">No relation ends on it.</p>
        )}
      </section>
    </>
  );
}
