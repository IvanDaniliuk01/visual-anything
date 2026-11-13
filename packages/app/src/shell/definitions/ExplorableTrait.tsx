/**
 * The `explorable` trait of an appearance (ADR 0107), edited in the app: which explorable a
 * component's elements, or one element, show in the explorable panel and on their shapes. One list:
 * Inherited (the trait taken out, so the component's, or its parent's, is shown), None (`none`, which
 * shows none whatever is inherited), then every explorable the project's packages define. Each choice
 * sends the appearance's trait whole, one undoable action, through the same commands as every other
 * trait: `update-component` for a component, `update-element`'s `appearanceTraits` for an element.
 * The row shows only where there is something to choose or to see: the project's packages define an
 * explorable, or the appearance shows or inherits one.
 */
import {
  appearanceOriginsOf,
  componentExplorable,
  componentOrEssence,
  explorablesIn,
  type AppearanceChanges,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Appearance, Element, Id } from '@visual-anything/schema';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { originText } from '../inspector/colors';
import { SelectControl } from '../inspector/controls';
import { INHERITED, NONE, explorableChange, explorableValueOf } from './explorableChoice';
import { TraitRow } from './TraitRow';

interface ExplorableChoiceProps {
  id: string;
  project: ProjectSnapshot;
  /** What the appearance itself sets. */
  own: Appearance['explorable'];
  /** The explorable it would show with the trait taken out. */
  inherited: Id | undefined;
  disabled: boolean;
  describedBy?: string | undefined;
  onChoose: (change: AppearanceChanges['explorable']) => Promise<unknown>;
}

/** The list itself, shared by the component editor and the element's appearance. */
export function ExplorableChoice({
  id,
  project,
  inherited,
  own,
  disabled,
  describedBy,
  onChoose,
}: ExplorableChoiceProps) {
  const t = useT();
  const catalog = explorablesIn(project);
  const explorables = [...catalog.explorables.values()];
  const nameOf = (explorable: Id) => catalog.explorable(explorable)?.definition.name ?? explorable;
  const value = explorableValueOf(own);
  return (
    <SelectControl
      id={id}
      value={value}
      disabled={disabled}
      describedBy={describedBy}
      onCommit={async (next) => {
        if (next !== value) await onChoose(explorableChange(next));
      }}
    >
      <option value={INHERITED}>
        {t('Inherited ({value})', {
          value: inherited === undefined ? t('None') : nameOf(inherited),
        })}
      </option>
      <option value={NONE}>{t('None')}</option>
      {own !== undefined && own !== 'none' && catalog.explorable(own.explorable) === undefined && (
        <option value={own.explorable}>
          {t('“{id}”, which no package defines', { id: own.explorable })}
        </option>
      )}
      {explorables.map(({ definition }) => (
        <option key={definition.id} value={definition.id}>
          {definition.name}
        </option>
      ))}
    </SelectControl>
  );
}

interface ComponentExplorableTraitProps {
  component: Id;
  /** The row's where-from and whether the component sets it, as the editor's other rows give. */
  source: string;
  own: boolean;
  readOnly: boolean;
}

/** The component editor's Explorable row. */
export function ComponentExplorableTrait({
  component,
  source,
  own,
  readOnly,
}: ComponentExplorableTraitProps) {
  const t = useT();
  const { project, definitions } = useEditor();
  const update = (explorable: AppearanceChanges['explorable']): Command => ({
    type: 'update-component',
    id: component,
    changes: { appearance: { explorable } },
  });
  const set = definitions.components.get(component)?.definition.appearance?.explorable;
  const parent = definitions.component(component)?.lineage[1];
  const inherited = parent === undefined ? undefined : componentExplorable(definitions, parent);
  if (set === undefined && inherited === undefined && explorablesIn(project).explorables.size === 0)
    return null;
  return (
    <TraitRow
      label={t('Its explorable')}
      source={source}
      own={own}
      readOnly={readOnly}
      inherit={() => update(null)}
    >
      {({ id, describedBy, send }) => (
        <ExplorableChoice
          id={id}
          project={project}
          own={set}
          inherited={inherited}
          disabled={readOnly}
          describedBy={describedBy}
          onChoose={(change) => send(update(change))}
        />
      )}
    </TraitRow>
  );
}

interface ElementExplorableTraitProps {
  element: Element;
  disabled: boolean;
}

/**
 * The explorable one element shows, as a trait of its own appearance in the inspector: its
 * component's, or one of its own, which wins over its component's.
 */
export function ElementExplorableTrait({ element, disabled }: ElementExplorableTraitProps) {
  const t = useT();
  const { project, definitions, send } = useEditor();
  const own = element.appearance?.explorable;
  const origin = appearanceOriginsOf(element, definitions).explorable;
  const nameOf = (id: Id) => t.definition(id, componentOrEssence(definitions, id).name);
  const off = disabled || send === undefined;
  const update = (explorable: AppearanceChanges['explorable']): Command => ({
    type: 'update-element',
    id: element.id,
    changes: { appearanceTraits: { explorable } },
  });
  const inherited = componentExplorable(definitions, element.component);
  if (own === undefined && inherited === undefined && explorablesIn(project).explorables.size === 0)
    return null;
  return (
    <TraitRow
      label={t('Its explorable')}
      source={originText(origin, nameOf)}
      own={own !== undefined}
      readOnly={off}
      inherit={() => update(null)}
      inheritLabel={t('Use the component’s explorable')}
    >
      {({ id, describedBy, send: sendTrait }) => (
        <ExplorableChoice
          id={id}
          project={project}
          own={own}
          inherited={inherited}
          disabled={off}
          describedBy={describedBy}
          onChoose={(change) => sendTrait(update(change))}
        />
      )}
    </TraitRow>
  );
}
