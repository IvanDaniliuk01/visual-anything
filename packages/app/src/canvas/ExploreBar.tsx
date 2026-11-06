/**
 * Exploring the open view from the canvas toolbar: the perspective switcher, which opens another view
 * of the same model; the filters, in a panel under their button; and focus mode. Under the toolbar, a
 * strip shows what is being explored, with focus's degrees, direction and isolate, what the filters
 * hide, and the two ends of the selected relation, which a press follows. Each part shows only inside
 * the shell, which keeps the editor and the explorer.
 */
import type { Id, ViewFile } from '@visual-anything/schema';
import { viewsByScope } from './scope';
import { useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { selectionOf } from '../editor/selection';
import { useT, type Translator } from '../i18n';
import { FilterIcon, FocusIcon } from '../shell/icons';
import { SelectControl } from '../shell/inspector/controls';
import { viewsInListOrder } from '../shell/viewFolders';
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
import { liveIn, useActivePane } from './activePane';
import { useAttributeLookup } from '../live-values/context';
import { TimeRangeChooser, TimeRangeStrip } from './TimeRangeControls';
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

/**
 * The toolbar's perspective switcher, which stays in its row while the filters and focus may go under
 * More (A5).
 */
export function PerspectiveControl() {
  const editor = useContext(EditorContext);
  if (!editor?.explore || editor.viewId === undefined) return null;
  return <PerspectiveSwitcher editor={editor} viewId={editor.viewId} />;
}

/** The toolbar's explore controls: the filters and focus mode. */
export function ExploreControls() {
  const t = useT();
  const editor = useContext(EditorContext);
  const active = useActivePane();
  const explore = editor?.explore;
  if (!editor || !explore || editor.viewId === undefined) return null;
  return (
    <div className="canvas-toolbar-explore" role="group" aria-label={t('Explore')}>
      <FiltersControl editor={editor} explore={explore} />
      <FocusToggle explore={explore} />
      <p role="status" className="visually-hidden" {...liveIn(active)}>
        {statusOf(t, editor, explore)}
      </p>
    </div>
  );
}

/**
 * What is being explored, under the toolbar: focus's reach, what the filters hide, and the ends of the
 * selected relation. Nothing while none of them applies.
 */
export function ExploreStrip() {
  const t = useT();
  const editor = useContext(EditorContext);
  const explore = editor?.explore;
  if (!editor || !explore || editor.viewId === undefined) return null;
  const following = followedRelation(editor);
  const filtering = isFiltering(explore.filters);
  if (!explore.focus.on && !filtering && following === undefined) return null;
  return (
    <div className="explore-strip" role="group" aria-label={t('Exploring')}>
      {explore.focus.on && <FocusSettingsRow editor={editor} explore={explore} />}
      {filtering && (
        <div className="explore-strip-part">
          <span>{filterSummary(t, explore)}</span>
          <button type="button" onClick={() => explore.setFilters(NO_FILTERS)}>
            {t('Show everything')}
          </button>
        </div>
      )}
      {explore.filters.range !== undefined && <TimeRangeStrip editor={editor} explore={explore} />}
      {following !== undefined && <FollowRow editor={editor} relation={following} />}
    </div>
  );
}

/**
 * The switcher's options: first the views with the same scope as the open one, which show the same
 * part of the model from other perspectives, then the others (ADR-0040); in the project's order in
 * each. Only when there are both are they grouped under their headings.
 */
function PerspectiveOptions({ project, viewId }: { project: Editor['project']; viewId: Id }) {
  const t = useT();
  const { same, others } = viewsByScope(viewsInListOrder(project), viewId);
  const options = (views: readonly ViewFile[]) =>
    views.map((view) => (
      <option key={view.id} value={view.id}>
        {perspectiveOption(view)}
      </option>
    ));
  if (others.length === 0) return <>{options(same)}</>;
  return (
    <>
      <optgroup label={t('Same part of the model')}>{options(same)}</optgroup>
      <optgroup label={t('Other parts of the model')}>{options(others)}</optgroup>
    </>
  );
}

/** A select of the project's views, each by its perspective, which opens the one chosen. */
function PerspectiveSwitcher({ editor, viewId }: { editor: Editor; viewId: Id }) {
  const t = useT();
  const id = useId();
  const { project, openView } = editor;
  if (!openView) return null;
  return (
    <span
      className="canvas-toolbar-perspective"
      title={t(
        'The open view’s perspective. Choose another view to see the same model from its perspective.',
      )}
    >
      <label htmlFor={id} className="visually-hidden">
        {t('Perspective')}
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
        <PerspectiveOptions project={project} viewId={viewId} />
      </SelectControl>
    </span>
  );
}

/** The Filters button, and the panel it opens under it. */
function FiltersControl({ editor, explore }: { editor: Editor; explore: Explore }) {
  const t = useT();
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
        title={t('Hide shapes by component, relation type or attribute; nothing moves')}
        onClick={() => setOpen((last) => !last)}
      >
        <FilterIcon />
        <span className="canvas-toolbar-label">
          {count > 0 ? t('Filters ({count})', { count }) : t('Filters')}
        </span>
        {/* How many filters apply, beside the icon; its name says it to screen readers. */}
        {count > 0 && (
          <span className="canvas-toolbar-count" aria-hidden="true">
            {count}
          </span>
        )}
      </button>
      {open && <FilterPanel id={panelId} editor={editor} explore={explore} onClose={close} />}
    </span>
  );
}

/** Focus mode, on and off. */
function FocusToggle({ explore }: { explore: Explore }) {
  const t = useT();
  const { focus } = explore;
  return (
    <button
      type="button"
      aria-pressed={focus.on}
      title={t('Dim everything the selection does not reach through its relations')}
      onClick={() => (focus.on ? explore.setFocus({ on: false }) : explore.startFocus())}
    >
      <FocusIcon />
      <span className="canvas-toolbar-label">{t('Focus')}</span>
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
  const t = useT();
  const { scene, project } = editor;
  const { filters, setFilters } = explore;
  // Attributes only live values or package code give can be filtered on too (ADR 0057).
  const lookup = useAttributeLookup();
  const choices = useMemo(
    () => (scene ? filterChoices(scene, project, lookup) : NO_CHOICES),
    [scene, project, lookup],
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
      aria-label={t('Filters')}
      className="explore-panel"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <p className="explore-panel-note">{t('Filters hide shapes; nothing moves.')}</p>
      <ChoiceList
        legend={t('Components')}
        choices={choices.components}
        hidden={filters.components}
        none={t('This view draws no elements.')}
        onChange={(components) => setFilters({ ...filters, components })}
      />
      <ChoiceList
        legend={t('Relation types')}
        choices={choices.relationTypes}
        hidden={filters.relationTypes}
        none={t('This view draws no relations.')}
        onChange={(relationTypes) => setFilters({ ...filters, relationTypes })}
      />
      <fieldset className="explore-panel-group">
        <legend>{t('Attributes')}</legend>
        {filters.conditions.length === 0 ? (
          <p className="explore-panel-note">
            {t('Show only what meets conditions on its attributes.')}
          </p>
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
          {t('Add a condition')}
        </button>
      </fieldset>
      <TimeRangeChooser editor={editor} explore={explore} />
      <div className="explore-panel-actions">
        <button
          type="button"
          disabled={!isFiltering(filters) && filters.conditions.length === 0}
          onClick={() => setFilters(NO_FILTERS)}
        >
          {t('Show everything')}
        </button>
        <button type="button" onClick={onClose}>
          {t('Close')}
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
  const t = useT();
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
              {t('Show all')}
            </button>
            <button
              type="button"
              disabled={all.every((id) => hidden.has(id))}
              onClick={() => onChange(new Set([...hidden, ...all]))}
            >
              {t('Hide all')}
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
                  {t.definition(choice.id, choice.name)}
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
  const t = useT();
  const list = useId();
  const needsValue = condition.test !== 'set' && condition.test !== 'unset';
  const names = choices.attributes[condition.of];
  const subject =
    condition.attribute.trim() === '' ? t('an attribute') : `“${condition.attribute}”`;
  return (
    <li className="explore-condition">
      <select
        aria-label={t('Of')}
        value={condition.of}
        onChange={(event) =>
          onChange({ ...condition, of: event.target.value as AttributeCondition['of'] })
        }
      >
        <option value="elements">{t('Elements')}</option>
        <option value="relations">{t('Relations')}</option>
      </select>
      <input
        className="explore-condition-attribute"
        aria-label={t('Attribute')}
        list={list}
        value={condition.attribute}
        placeholder={t('attribute')}
        onChange={(event) => onChange({ ...condition, attribute: event.target.value })}
      />
      <datalist id={list}>
        {names.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <select
        aria-label={t('Test')}
        value={condition.test}
        onChange={(event) =>
          onChange({ ...condition, test: event.target.value as AttributeCondition['test'] })
        }
      >
        {ATTRIBUTE_TESTS.map(({ test, name }) => (
          <option key={test} value={test}>
            {t(name)}
          </option>
        ))}
      </select>
      {needsValue && (
        <input
          aria-label={t('Value')}
          value={condition.value}
          placeholder={t('value')}
          onChange={(event) => onChange({ ...condition, value: event.target.value })}
        />
      )}
      <button
        type="button"
        aria-label={t('Remove the condition on {subject}', { subject })}
        onClick={onRemove}
      >
        {t('Remove')}
      </button>
      {!isComplete(condition) && (
        <span className="explore-panel-note">
          {condition.attribute.trim() === '' ? t('Name an attribute.') : t('Type a value.')}
        </span>
      )}
    </li>
  );
}

/** Focus's reach: what it starts from, its degrees and direction, isolating, and ending it. */
function FocusSettingsRow({ editor, explore }: { editor: Editor; explore: Explore }) {
  const t = useT();
  const { focus, setFocus } = explore;
  const degreesId = useId();
  const directionId = useId();
  return (
    <div className="explore-strip-part">
      <span>{focusSummary(t, editor, explore)}</span>
      <label htmlFor={degreesId}>{t('Degrees')}</label>
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
        <option value="all">{t('All')}</option>
      </select>
      <label htmlFor={directionId}>{t('Direction')}</label>
      <select
        id={directionId}
        value={focus.direction}
        onChange={(event) => setFocus({ direction: event.target.value as FocusDirection })}
      >
        {DIRECTIONS.map(({ direction, name }) => (
          <option key={direction} value={direction}>
            {t(name)}
          </option>
        ))}
      </select>
      <label className="explore-isolate">
        <input
          type="checkbox"
          checked={focus.isolate}
          onChange={(event) => setFocus({ isolate: event.target.checked })}
        />
        {t('Isolate')}
      </label>
      <button type="button" onClick={() => setFocus({ on: false })}>
        {t('End focus')}
      </button>
    </div>
  );
}

/** The two ends of the selected relation, each a button that follows the relation there. */
function FollowRow({ editor, relation }: { editor: Editor; relation: Id }) {
  const t = useT();
  const { scene, project } = editor;
  const ends = scene ? endsOf(scene, project, relation, hiddenIn(scene)) : {};
  const go = (end: FollowedEnd) => {
    editor.select(selectionOf([{ kind: end.kind, id: end.id }]));
    editor.reveal(end.key);
  };
  const button = (end: FollowedEnd | undefined, starts: boolean): ReactNode =>
    end && (
      <button
        type="button"
        title={
          starts
            ? t('Go to where it starts: {name}', { name: end.name })
            : t('Go to where it ends: {name}', { name: end.name })
        }
        onClick={() => go(end)}
      >
        {starts ? '← ' : '→ '}
        {end.name}
      </button>
    );
  if (!ends.from && !ends.to) return null;
  return (
    <div className="explore-strip-part" role="group" aria-label={t('Follow the relation')}>
      <span>{t('Follow to')}</span>
      {button(ends.from, true)}
      {button(ends.to, false)}
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

const ELEMENT_SHAPES = { one: '{count} element shape', other: '{count} element shapes' };
const ELEMENTS = { one: '{count} element', other: '{count} elements' };
const RELATIONS = { one: '{count} relation', other: '{count} relations' };

/** What the filters hide, as the strip says it. */
function filterSummary(t: Translator, explore: Explore): string {
  const { hiddenShapes, hiddenRelations } = explore.filtered;
  if (hiddenShapes === 0 && hiddenRelations === 0) return t('The filters hide nothing here.');
  const shapes = t(ELEMENT_SHAPES, { count: hiddenShapes });
  const relations = t(RELATIONS, { count: hiddenRelations });
  return t('The filters hide {things}.', {
    things:
      hiddenShapes > 0 && hiddenRelations > 0
        ? t('{first} and {last}', { first: shapes, last: relations })
        : hiddenShapes > 0
          ? shapes
          : relations,
  });
}

/** What focus starts from, as the strip says it. */
function focusSummary(t: Translator, editor: Editor, explore: Explore): string {
  const { targets } = explore.focus;
  const { scene, project } = editor;
  // Both indexes are kept for each scene, so this looks at the targets only.
  const shapes = scene ? indexedShapes(scene) : undefined;
  const lines = scene ? drawnRelations(scene, project) : undefined;
  const elements = [...targets.elements].filter((id) => shapes?.has(id));
  const relations = [...targets.relations].filter((id) => lines?.line(id) !== undefined);
  if (elements.length + relations.length === 0) {
    return holdsTargets(editor.selection)
      ? t('Focus: this view does not draw what is selected.')
      : t('Focus: select an element or a relation.');
  }
  const [only] = elements;
  if (only !== undefined && elements.length === 1 && relations.length === 0) {
    return t('Focus on “{name}”', { name: shapes?.get(only)?.[0]?.name ?? only });
  }
  const someElements = t(ELEMENTS, { count: elements.length });
  const someRelations = t(RELATIONS, { count: relations.length });
  return t('Focus on {things}', {
    things:
      elements.length > 0 && relations.length > 0
        ? t('{first} and {last}', { first: someElements, last: someRelations })
        : elements.length > 0
          ? someElements
          : someRelations,
  });
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
function statusOf(t: Translator, editor: Editor, explore: Explore): string {
  const said: string[] = [];
  if (isFiltering(explore.filters)) said.push(filterSummary(t, explore));
  if (explore.focus.on) said.push(`${focusSummary(t, editor, explore)}.`);
  return said.join(' ');
}
