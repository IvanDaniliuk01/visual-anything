/**
 * Exploring the open view from the canvas toolbar: the perspective switcher, which opens another view
 * of the same model; the filters, in a panel under their button; and focus mode. Under the toolbar, a
 * strip shows what is being explored, with focus's degrees, direction and isolate, what the filters
 * hide, and the two ends of the selected relation, which a press follows. Each part shows only inside
 * the shell, which keeps the editor and the explorer.
 */
import type { Id } from '@visual-anything/schema';
import { useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { selectionOf } from '../editor/selection';
import { SelectControl } from '../shell/inspector/controls';
import {
  ALL_DEGREES,
  ATTRIBUTE_TESTS,
  NO_FILTERS,
  endsOf,
  filterChoices,
  isComplete,
  isFiltering,
  perspectiveOption,
  type AttributeCondition,
  type FilterChoice,
  type FilterChoices,
  type Filters,
  type FocusDirection,
  type FollowedEnd,
} from './explore';
import './explore.css';
import { holdsTargets, type Explore } from './useExplorer';
import { useOutsidePress } from './focus';
import { indexScene, type IndexedScene } from './hit';
import { drawnRelations, hiddenIn } from './navigation';
import type { Scene } from './scene';

/** The degrees focus offers; past them, every degree. */
const DEGREES = [1, 2, 3, 4, 5] as const;

const DIRECTIONS: readonly { direction: FocusDirection; name: string }[] = [
  { direction: 'both', name: 'Both ways' },
  { direction: 'outgoing', name: 'Outgoing' },
  { direction: 'incoming', name: 'Incoming' },
];

const NO_CHOICES: FilterChoices = {
  components: [],
  relationTypes: [],
  attributes: { elements: [], relations: [] },
};

/** The toolbar's explore controls: the perspective switcher, the filters and focus mode. */
export function ExploreControls() {
  const editor = useContext(EditorContext);
  const explore = editor?.explore;
  if (!editor || !explore || editor.viewId === undefined) return null;
  return (
    <div className="canvas-toolbar-explore" role="group" aria-label="Explore">
      <PerspectiveSwitcher editor={editor} viewId={editor.viewId} />
      <FiltersControl editor={editor} explore={explore} />
      <FocusToggle explore={explore} />
      <p role="status" className="visually-hidden">
        {statusOf(editor, explore)}
      </p>
    </div>
  );
}

/**
 * What is being explored, under the toolbar: focus's reach, what the filters hide, and the ends of the
 * selected relation. Nothing while none of them applies.
 */
export function ExploreStrip() {
  const editor = useContext(EditorContext);
  const explore = editor?.explore;
  if (!editor || !explore || editor.viewId === undefined) return null;
  const following = followedRelation(editor);
  const filtering = isFiltering(explore.filters);
  if (!explore.focus.on && !filtering && following === undefined) return null;
  return (
    <div className="explore-strip" role="group" aria-label="Exploring">
      {explore.focus.on && <FocusSettingsRow editor={editor} explore={explore} />}
      {filtering && (
        <div className="explore-strip-part">
          <span>{filterSummary(explore)}</span>
          <button type="button" onClick={() => explore.setFilters(NO_FILTERS)}>
            Show everything
          </button>
        </div>
      )}
      {following !== undefined && <FollowRow editor={editor} relation={following} />}
    </div>
  );
}

/** A select of the project's views, each by its perspective, which opens the one chosen. */
function PerspectiveSwitcher({ editor, viewId }: { editor: Editor; viewId: Id }) {
  const id = useId();
  const { project, openView } = editor;
  if (!openView) return null;
  return (
    <span
      className="canvas-toolbar-perspective"
      title="The open view’s perspective. Choose another view to see the same model from its perspective."
    >
      <label htmlFor={id} className="visually-hidden">
        Perspective
      </label>
      <SelectControl
        id={id}
        disabled={false}
        value={viewId}
        onCommit={(next) => {
          openView(next);
          return Promise.resolve();
        }}
      >
        {project.views.map((view) => (
          <option key={view.id} value={view.id}>
            {perspectiveOption(view)}
          </option>
        ))}
      </SelectControl>
    </span>
  );
}

/** The Filters button, and the panel it opens under it. */
function FiltersControl({ editor, explore }: { editor: Editor; explore: Explore }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useOutsidePress(wrapper, () => setOpen(false));
  const count = filterCount(explore.filters);
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  return (
    <span ref={wrapper} className="canvas-toolbar-filters">
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title="Hide shapes by component, relation type or attribute; nothing moves"
        onClick={() => setOpen((last) => !last)}
      >
        {count > 0 ? `Filters (${count})` : 'Filters'}
      </button>
      {open && <FilterPanel id={panelId} editor={editor} explore={explore} onClose={close} />}
    </span>
  );
}

/** Focus mode, on and off. */
function FocusToggle({ explore }: { explore: Explore }) {
  const { focus } = explore;
  return (
    <button
      type="button"
      aria-pressed={focus.on}
      title="Dim everything the selection does not reach through its relations"
      onClick={() => (focus.on ? explore.setFocus({ on: false }) : explore.startFocus())}
    >
      Focus
    </button>
  );
}

interface FilterPanelProps {
  id: string;
  editor: Editor;
  explore: Explore;
  onClose: () => void;
}

/**
 * The filters: a checkbox for each component and relation type the view draws, checked while it is
 * shown, and conditions on attributes. Escape or Close closes it, and the focus goes back to its
 * button.
 */
function FilterPanel({ id, editor, explore, onClose }: FilterPanelProps) {
  const { scene, project } = editor;
  const { filters, setFilters } = explore;
  const choices = useMemo(
    () => (scene ? filterChoices(scene, project) : NO_CHOICES),
    [scene, project],
  );
  const panel = useRef<HTMLDivElement>(null);
  const added = useRef(false);
  // The panel opens on its first choice, or else on its first control that can be used.
  useEffect(() => {
    const inside = panel.current;
    (
      inside?.querySelector<HTMLElement>('input[type="checkbox"]') ??
      inside?.querySelector<HTMLElement>(':is(input, select, button):not(:disabled)')
    )?.focus();
  }, []);
  // A condition just added takes the focus, in its attribute.
  const conditionCount = filters.conditions.length;
  useEffect(() => {
    if (!added.current) return;
    added.current = false;
    const inputs = panel.current?.querySelectorAll<HTMLInputElement>(
      '.explore-condition-attribute',
    );
    inputs?.[inputs.length - 1]?.focus();
  }, [conditionCount]);

  const setConditions = (conditions: AttributeCondition[]) =>
    setFilters({ ...filters, conditions });

  return (
    <div
      ref={panel}
      id={id}
      role="dialog"
      aria-label="Filters"
      className="explore-panel"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <p className="explore-panel-note">Filters hide shapes; nothing moves.</p>
      <ChoiceList
        legend="Components"
        choices={choices.components}
        hidden={filters.components}
        none="This view draws no elements."
        onChange={(components) => setFilters({ ...filters, components })}
      />
      <ChoiceList
        legend="Relation types"
        choices={choices.relationTypes}
        hidden={filters.relationTypes}
        none="This view draws no relations."
        onChange={(relationTypes) => setFilters({ ...filters, relationTypes })}
      />
      <fieldset className="explore-panel-group">
        <legend>Attributes</legend>
        {filters.conditions.length === 0 ? (
          <p className="explore-panel-note">Show only what meets conditions on its attributes.</p>
        ) : (
          <ul className="explore-conditions">
            {filters.conditions.map((condition, at) => (
              <ConditionRow
                // Conditions are added only at the end, and every control in a row shows its
                // condition, so a row can be known by its place.
                key={at}
                condition={condition}
                choices={choices}
                onChange={(next) =>
                  setConditions(
                    filters.conditions.map((each, index) => (index === at ? next : each)),
                  )
                }
                onRemove={() =>
                  setConditions(filters.conditions.filter((_, index) => index !== at))
                }
              />
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => {
            added.current = true;
            setConditions([
              ...filters.conditions,
              {
                of: 'elements',
                attribute: choices.attributes.elements[0] ?? '',
                test: 'is',
                value: '',
              },
            ]);
          }}
        >
          Add a condition
        </button>
      </fieldset>
      <div className="explore-panel-actions">
        <button
          type="button"
          disabled={!isFiltering(filters) && filters.conditions.length === 0}
          onClick={() => setFilters(NO_FILTERS)}
        >
          Show everything
        </button>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

interface ChoiceListProps {
  legend: string;
  choices: readonly FilterChoice[];
  hidden: ReadonlySet<Id>;
  none: string;
  onChange: (hidden: ReadonlySet<Id>) => void;
}

/** A checkbox for each choice, checked while it is shown, with buttons to show or hide them all. */
function ChoiceList({ legend, choices, hidden, none, onChange }: ChoiceListProps) {
  const all = choices.map((choice) => choice.id);
  return (
    <fieldset className="explore-panel-group">
      <legend>{legend}</legend>
      {choices.length === 0 ? (
        <p className="explore-panel-note">{none}</p>
      ) : (
        <>
          <div className="explore-panel-all">
            <button
              type="button"
              disabled={all.every((id) => !hidden.has(id))}
              onClick={() => onChange(new Set([...hidden].filter((id) => !all.includes(id))))}
            >
              Show all
            </button>
            <button
              type="button"
              disabled={all.every((id) => hidden.has(id))}
              onClick={() => onChange(new Set([...hidden, ...all]))}
            >
              Hide all
            </button>
          </div>
          <ul className="explore-choices">
            {choices.map((choice) => (
              <li key={choice.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={!hidden.has(choice.id)}
                    onChange={(event) => {
                      const next = new Set(hidden);
                      if (event.target.checked) next.delete(choice.id);
                      else next.add(choice.id);
                      onChange(next);
                    }}
                  />
                  {choice.name}
                  <span className="explore-choice-count">{choice.count}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </fieldset>
  );
}

interface ConditionRowProps {
  condition: AttributeCondition;
  choices: FilterChoices;
  onChange: (condition: AttributeCondition) => void;
  onRemove: () => void;
}

/** One condition: what it tests, which attribute, how, and against what value. */
function ConditionRow({ condition, choices, onChange, onRemove }: ConditionRowProps) {
  const list = useId();
  const needsValue = condition.test !== 'set' && condition.test !== 'unset';
  const names = choices.attributes[condition.of];
  const subject = condition.attribute.trim() === '' ? 'an attribute' : `“${condition.attribute}”`;
  return (
    <li className="explore-condition">
      <select
        aria-label="Of"
        value={condition.of}
        onChange={(event) =>
          onChange({ ...condition, of: event.target.value as AttributeCondition['of'] })
        }
      >
        <option value="elements">Elements</option>
        <option value="relations">Relations</option>
      </select>
      <input
        className="explore-condition-attribute"
        aria-label="Attribute"
        list={list}
        value={condition.attribute}
        placeholder="attribute"
        onChange={(event) => onChange({ ...condition, attribute: event.target.value })}
      />
      <datalist id={list}>
        {names.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <select
        aria-label="Test"
        value={condition.test}
        onChange={(event) =>
          onChange({ ...condition, test: event.target.value as AttributeCondition['test'] })
        }
      >
        {ATTRIBUTE_TESTS.map(({ test, name }) => (
          <option key={test} value={test}>
            {name}
          </option>
        ))}
      </select>
      {needsValue && (
        <input
          aria-label="Value"
          value={condition.value}
          placeholder="value"
          onChange={(event) => onChange({ ...condition, value: event.target.value })}
        />
      )}
      <button type="button" aria-label={`Remove the condition on ${subject}`} onClick={onRemove}>
        Remove
      </button>
      {!isComplete(condition) && (
        <span className="explore-panel-note">
          {condition.attribute.trim() === '' ? 'Name an attribute.' : 'Type a value.'}
        </span>
      )}
    </li>
  );
}

/** Focus's reach: what it starts from, its degrees and direction, isolating, and ending it. */
function FocusSettingsRow({ editor, explore }: { editor: Editor; explore: Explore }) {
  const { focus, setFocus } = explore;
  const degreesId = useId();
  const directionId = useId();
  return (
    <div className="explore-strip-part">
      <span>{focusSummary(editor, explore)}</span>
      <label htmlFor={degreesId}>Degrees</label>
      <select
        id={degreesId}
        value={focus.degrees === ALL_DEGREES ? 'all' : String(focus.degrees)}
        onChange={(event) =>
          setFocus({
            degrees: event.target.value === 'all' ? ALL_DEGREES : Number(event.target.value),
          })
        }
      >
        {DEGREES.map((degree) => (
          <option key={degree} value={String(degree)}>
            {degree}
          </option>
        ))}
        <option value="all">All</option>
      </select>
      <label htmlFor={directionId}>Direction</label>
      <select
        id={directionId}
        value={focus.direction}
        onChange={(event) => setFocus({ direction: event.target.value as FocusDirection })}
      >
        {DIRECTIONS.map(({ direction, name }) => (
          <option key={direction} value={direction}>
            {name}
          </option>
        ))}
      </select>
      <label className="explore-isolate">
        <input
          type="checkbox"
          checked={focus.isolate}
          onChange={(event) => setFocus({ isolate: event.target.checked })}
        />
        Isolate
      </label>
      <button type="button" onClick={() => setFocus({ on: false })}>
        End focus
      </button>
    </div>
  );
}

/** The two ends of the selected relation, each a button that follows the relation there. */
function FollowRow({ editor, relation }: { editor: Editor; relation: Id }) {
  const { scene, project } = editor;
  const ends = scene ? endsOf(scene, project, relation, hiddenIn(scene)) : {};
  const go = (end: FollowedEnd) => {
    editor.select(selectionOf([{ kind: end.kind, id: end.id }]));
    editor.reveal(end.key);
  };
  const button = (end: FollowedEnd | undefined, where: string): ReactNode =>
    end && (
      <button type="button" title={`Go to ${where}: ${end.name}`} onClick={() => go(end)}>
        {where === 'where it starts' ? '← ' : '→ '}
        {end.name}
      </button>
    );
  if (!ends.from && !ends.to) return null;
  return (
    <div className="explore-strip-part" role="group" aria-label="Follow the relation">
      <span>Follow to</span>
      {button(ends.from, 'where it starts')}
      {button(ends.to, 'where it ends')}
    </div>
  );
}

/** The relation selected on its own, which the strip offers to follow. */
function followedRelation(editor: Editor): Id | undefined {
  const { elements, relations, freeShapes } = editor.selection;
  if (relations.size !== 1 || elements.size > 0 || freeShapes.size > 0) return undefined;
  const [relation] = relations;
  return relation;
}

/** How many filters are on: components and relation types hidden, and conditions that apply. */
function filterCount(filters: Filters): number {
  return (
    filters.components.size +
    filters.relationTypes.size +
    filters.conditions.filter(isComplete).length
  );
}

/** What the filters hide, as the strip says it. */
function filterSummary(explore: Explore): string {
  const { hiddenShapes, hiddenRelations } = explore.filtered;
  if (hiddenShapes === 0 && hiddenRelations === 0) return 'The filters hide nothing here.';
  const parts = [
    hiddenShapes > 0 ? count(hiddenShapes, 'element shape') : undefined,
    hiddenRelations > 0 ? count(hiddenRelations, 'relation') : undefined,
  ].filter((part) => part !== undefined);
  return `The filters hide ${parts.join(' and ')}.`;
}

/** What focus starts from, as the strip says it. */
function focusSummary(editor: Editor, explore: Explore): string {
  const { targets } = explore.focus;
  const { scene, project } = editor;
  // Both indexes are kept for each scene, so this looks at the targets only.
  const shapes = scene ? indexedShapes(scene) : undefined;
  const lines = scene ? drawnRelations(scene, project) : undefined;
  const elements = [...targets.elements].filter((id) => shapes?.has(id));
  const relations = [...targets.relations].filter((id) => lines?.line(id) !== undefined);
  if (elements.length + relations.length === 0) {
    return holdsTargets(editor.selection)
      ? 'Focus: this view does not draw what is selected.'
      : 'Focus: select an element or a relation.';
  }
  const [only] = elements;
  if (only !== undefined && elements.length === 1 && relations.length === 0) {
    return `Focus on “${shapes?.get(only)?.[0]?.name ?? only}”`;
  }
  const parts = [
    elements.length > 0 ? count(elements.length, 'element') : undefined,
    relations.length > 0 ? count(relations.length, 'relation') : undefined,
  ].filter((part) => part !== undefined);
  return `Focus on ${parts.join(' and ')}`;
}

/** Each element's shapes in a scene; none for a scene that cannot be indexed, which the canvas reports. */
function indexedShapes(scene: Scene): IndexedScene['byElement'] | undefined {
  try {
    return indexScene(scene).byElement;
  } catch {
    return undefined;
  }
}

/** What screen readers hear when the filters or focus change. */
function statusOf(editor: Editor, explore: Explore): string {
  const said: string[] = [];
  if (isFiltering(explore.filters)) said.push(filterSummary(explore));
  if (explore.focus.on) said.push(`${focusSummary(editor, explore)}.`);
  return said.join(' ');
}

function count(amount: number, one: string): string {
  return `${amount} ${amount === 1 ? one : `${one}s`}`;
}
