import {
  componentOrEssence,
  modelIndexOf,
  type Definitions,
  type ModelIndex,
  type UpdateElementCommand,
} from '@visual-anything/core';
import { ESSENCE_ID, type Element } from '@visual-anything/schema';
import { useId, type Ref } from 'react';
import { CodeSection } from '../../code/CodeSection';
import { LiveValuesSection } from '../../live-values/LiveValuesSection';
import { useEditor } from '../../editor/EditorContext';
import type { Selectable } from '../../editor/selection';
import { useT } from '../../i18n';
import { isBuiltInDefinition } from '../definitions/commands';
import { useOpenDefinition } from '../definitions/opened';
import { AppearanceSection } from './AppearanceSection';
import { AttributesSection } from './AttributesSection';
import { byPackage, relationLabel, relationSentence } from './describe';
import { SelectControl, TextControl } from './controls';
import { describedAs } from './detail';
import { End, FirstOnes, Lineage, SelectButton, Title } from './parts';
import { PartsSection } from './PartsSection';
import { RowsSection } from './RowsSection';
import { perform } from './send';
import { sameOptionalText } from './text';
import { ScopeSection } from './ScopeSection';
import { ViewSection } from './ViewSection';
import { DestinationsSection } from '../../destinations/DestinationsSection';
import { ExternalIdsSection } from '../../destinations/ExternalIdsSection';

interface ElementInspectorProps {
  element: Element;
  definitions: Definitions;
  /** The title, which takes the focus when this element was chosen in the inspector. */
  titleRef: Ref<HTMLHeadingElement>;
  /** Selects what the inspector lists: a container, a relation, an end. */
  onSelect: (item: Selectable) => void;
}

/**
 * One element: its name and description, its component, where it sits, the relations on it, where
 * it sits in the open view and its stacking order there, its attributes and its appearance. Its
 * particularities are marked, and each can be taken back.
 */
export function ElementInspector({
  element,
  definitions,
  titleRef,
  onSelect,
}: ElementInspectorProps) {
  const t = useT();
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
      <Title
        titleRef={titleRef}
        name={element.name}
        detail={describedAs(element, index, definitions)}
      />
      <div className="inspector-control">
        <label htmlFor={nameId}>{t('Name')}</label>
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
        <label htmlFor={descriptionId}>{t('Description')}</label>
        <TextControl
          id={descriptionId}
          value={element.description ?? ''}
          multiline
          disabled={disabled}
          same={sameOptionalText}
          onCommit={async (text) => {
            // An empty description removes it.
            await update({ description: text.trim() === '' ? null : text });
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
      <ViewSection element={element} />
      <ScopeSection element={element} />
      <RowsSection element={element} />
      <PartsSection element={element} onSelect={onSelect} />
      <DestinationsSection item={element} definitions={component.attributes} />
      <AttributesSection
        of="element"
        definitions={component.attributes}
        lineage={component.lineage}
        values={element.attributes}
        disabled={disabled}
        change={update}
      />
      <LiveValuesSection item={{ kind: 'element', element }} />
      <CodeSection element={element} />
      <ExternalIdsSection ids={element.ids} disabled={disabled} change={(ids) => update({ ids })} />
      <AppearanceSection
        element={element}
        index={index}
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

/**
 * The element's component, among the components of the packages in use, and what it derives from;
 * with the way into the component editor: editing a component of the project's own, or deriving one
 * from a built-in component, which the element can then be created from.
 */
function ComponentSection({ element, definitions, disabled, update }: ComponentSectionProps) {
  const t = useT();
  const { project } = useEditor();
  const { open } = useOpenDefinition();
  const headingId = useId();
  const selectId = useId();
  const component = componentOrEssence(definitions, element.component);
  const known = definitions.component(element.component) !== undefined;
  const offered = byPackage(definitions.components, project.packages);
  const listed = offered.some((from) => from.members.includes(element.component));
  const derivesFrom = component.lineage.slice(1);
  const nameOf = (id: string) => t.definition(id, componentOrEssence(definitions, id).name);

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>{t('Component')}</h4>
      <SelectControl
        id={selectId}
        labelledBy={headingId}
        value={element.component}
        disabled={disabled}
        onCommit={(id) => update({ component: id })}
      >
        {!listed && <option value={element.component}>{nameOf(element.component)}</option>}
        {offered.map((from) => (
          <optgroup key={from.id} label={t.definition(from.id, from.name)}>
            {from.members.map((id) => (
              <option key={id} value={id}>
                {nameOf(id)}
              </option>
            ))}
          </optgroup>
        ))}
      </SelectControl>
      {component.description !== undefined && (
        <p className="inspector-notes">{t.description(component.id, component.description)}</p>
      )}
      {known ? (
        <>
          <Lineage
            names={derivesFrom.map(nameOf)}
            none={t('It derives from no other component.')}
          />
          {component.lineage.at(-1) !== ESSENCE_ID && (
            <p className="inspector-warning">
              {t('Its chain stops before Essence, because a component in it is missing.')}
            </p>
          )}
        </>
      ) : (
        <p className="inspector-warning">
          {t('No package in use defines the component “{id}”, so it looks like Essence.', {
            id: element.component,
          })}
        </p>
      )}
      {open !== undefined &&
        (known || element.component === ESSENCE_ID) &&
        (isBuiltInDefinition(definitions, 'component', element.component) ? (
          <button
            type="button"
            className="inspector-action"
            disabled={disabled}
            onClick={() =>
              open(
                {
                  kind: 'derive',
                  of: 'component',
                  base: element.component,
                  ...(element.id === project.model.world.id ? {} : { useFor: element.id }),
                },
                { focus: true },
              )
            }
          >
            {t('Derive a component from “{name}”', { name: nameOf(element.component) })}
          </button>
        ) : (
          <button
            type="button"
            className="inspector-action"
            onClick={() => open({ kind: 'component', id: element.component }, { focus: true })}
          >
            {t('Edit “{name}”', { name: nameOf(element.component) })}
          </button>
        ))}
    </section>
  );
}

interface PlacesSectionProps {
  element: Element;
  index: ModelIndex;
  definitions: Definitions;
  onSelect: (item: Selectable) => void;
}

/**
 * Where the element sits and how it relates: its containers, then every relation that ends on it. A
 * container that holds thousands of elements has a relation for each; the lists show the first ones
 * until all are asked for, so that selecting it stays quick.
 */
function PlacesSection({ element, index, definitions, onSelect }: PlacesSectionProps) {
  const t = useT();
  const containersId = useId();
  const relationsId = useId();
  const containers = index.containersOf(element.id);
  const relations = index.relationsOn(element.id);
  const isWorld = element.id === index.world.id;

  return (
    <>
      <section className="inspector-section" aria-labelledby={containersId}>
        <h4 id={containersId}>{t('Containers')}</h4>
        {containers.length > 0 ? (
          <FirstOnes
            labelledBy={containersId}
            items={containers}
            keyOf={(id) => id}
            many="containers"
            render={(id) => (
              <End id={id} index={index} definitions={definitions} onSelect={onSelect} />
            )}
          />
        ) : (
          <p className="panel-empty">
            {isWorld ? t('World contains every other element.') : t('It sits directly in World.')}
          </p>
        )}
      </section>
      <section className="inspector-section" aria-labelledby={relationsId}>
        <h4 id={relationsId}>{t('Relations')}</h4>
        {relations.length > 0 ? (
          <FirstOnes
            labelledBy={relationsId}
            items={relations}
            keyOf={(relation) => relation.id}
            many="relations"
            render={(relation) => {
              const sentence = relationSentence(index, definitions, relation);
              return (
                <SelectButton
                  name={relation.name === undefined ? sentence : relationLabel(index, relation)}
                  detail={relation.name === undefined ? undefined : sentence}
                  onSelect={() => onSelect({ kind: 'relation', id: relation.id })}
                />
              );
            }}
          />
        ) : (
          <p className="panel-empty">{t('No relation ends on it.')}</p>
        )}
      </section>
    </>
  );
}
