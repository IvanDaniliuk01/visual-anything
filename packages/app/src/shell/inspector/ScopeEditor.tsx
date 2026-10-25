/**
 * The open view's scope, in the inspector's view section (ADR-0040): how much of the model it shows;
 * its include and exclude rules, each with its kind, removed one by one, and a form that adds one;
 * the elements added and left out by hand, each taken back; and Show the whole model. Each change is
 * one command, `set-scope` or `add-to-view`, so one undoable action, and none of them deletes
 * anything from the model.
 */
import {
  componentOrEssence,
  modelIndexOf,
  nestingTypesInView,
  relationTypeOrRelatesTo,
  shownByScope,
  type AttributeTest,
  type Command,
  type Definitions,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, Scope, ScopeRule, ViewFile } from '@visual-anything/schema';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { ATTRIBUTE_TESTS } from '../../canvas/explore';
import { addToViewCommand } from '../../canvas/scope';
import { scopeLabel } from '../../canvas/scopeActions';
import { useEditor } from '../../editor/EditorContext';
import { useT, type Translator } from '../../i18n';
import '../scope.css';

/** How many elements each list of the scope shows before it says how many more. */
const LISTED = 30;

type Part = 'include' | 'exclude';
type Kind = ScopeRule['kind'];

const KINDS: readonly { kind: Kind; name: string }[] = [
  { kind: 'component', name: 'Component' },
  { kind: 'relation-type', name: 'Relation type' },
  { kind: 'contents', name: 'Contents of a container' },
  { kind: 'attribute', name: 'Attribute' },
];

export function ScopeEditor({ view }: { view: ViewFile }) {
  const t = useT();
  const { project, definitions, send } = useEditor();
  const headingId = useId();
  const [adding, setAdding] = useState<Part>();
  // Each message counts, so that the same words said again are heard again.
  const [message, setMessage] = useState({ text: '', count: 0 });
  const editable = send !== undefined;
  const index = modelIndexOf(project);
  const nameOf = (id: Id) => index.element(id)?.name ?? id;
  const scope = view.scope;
  const total = project.model.elements.length;
  const shown = scope === undefined ? total : shownByScope(project, view).elements.length - 1;

  const run = async (command: Command, done: string) => {
    if (!send) return;
    try {
      const result = await send(command);
      if (result.ok) setMessage((last) => ({ text: `${t.message(done)}.`, count: last.count + 1 }));
    } catch {
      // A refusal is already shown as a notice.
    }
  };
  const setScope = (next: Scope | null) =>
    void run(
      { type: 'set-scope', view: view.id, scope: next },
      next === null || isEmpty(next)
        ? `Show the whole model in "${view.name}"`
        : `Set what "${view.name}" shows`,
    );
  const without = (part: Part, at: number): Scope => {
    const rules = (scope?.[part] ?? []).filter((_, each) => each !== at);
    return { ...scope, [part]: rules };
  };

  return (
    <section className="scope-editor" aria-labelledby={headingId}>
      <h4 id={headingId}>{t('What it shows')}</h4>
      <p className="scope-summary">
        {scope === undefined
          ? t(
              {
                one: 'The whole model: {count} element.',
                other: 'The whole model: {count} elements.',
              },
              {
                count: total,
              },
            )
          : t('{shown} of {total} elements, as its scope gives them.', { shown, total })}
      </p>
      {scope !== undefined && (
        <div className="scope-actions">
          <button
            type="button"
            className="inspector-action"
            disabled={!editable}
            onClick={() => setScope(null)}
          >
            {t('Show the whole model')}
          </button>
        </div>
      )}

      {(['include', 'exclude'] as const).map((part) => (
        <RuleList
          key={part}
          part={part}
          rules={scope?.[part] ?? []}
          project={project}
          definitions={definitions}
          view={view}
          editable={editable}
          onRemove={(at) => setScope(without(part, at))}
        />
      ))}

      {adding ? (
        <RuleForm
          part={adding}
          project={project}
          definitions={definitions}
          view={view}
          onAdd={(rule) => {
            setAdding(undefined);
            setScope({ ...scope, [adding]: [...(scope?.[adding] ?? []), rule] });
          }}
          onCancel={() => setAdding(undefined)}
        />
      ) : (
        <div className="scope-actions">
          <button
            type="button"
            className="inspector-action"
            disabled={!editable}
            onClick={() => setAdding('include')}
          >
            {t('Show by a rule…')}
          </button>
          <button
            type="button"
            className="inspector-action"
            disabled={!editable}
            onClick={() => setAdding('exclude')}
          >
            {t('Leave out by a rule…')}
          </button>
        </div>
      )}

      <ElementList
        heading={t('Added by hand')}
        ids={scope?.added ?? []}
        nameOf={nameOf}
        action={t('Stop adding')}
        actionLabel={(name) => t('Stop adding “{name}” by hand', { name })}
        editable={editable}
        onAction={(id) =>
          setScope({ ...scope, added: (scope?.added ?? []).filter((each) => each !== id) })
        }
      />
      <ElementList
        heading={t('Left out by hand')}
        ids={scope?.leftOut ?? []}
        nameOf={nameOf}
        action={t('Add back')}
        actionLabel={(name) => t('Add “{name}” back to this view', { name })}
        editable={editable}
        onAction={(id) =>
          void run(addToViewCommand(view.id, [id]), scopeLabel('add', view, [id], nameOf))
        }
      />
      <p className="visually-hidden" aria-live="polite">
        {message.text}
        {message.count % 2 === 1 ? ' ' : ''}
      </p>
    </section>
  );
}

function isEmpty(scope: Scope): boolean {
  return (
    !scope.include?.length &&
    !scope.exclude?.length &&
    !scope.added?.length &&
    !scope.leftOut?.length
  );
}

/** One list of rules: what an element must meet one of, or none of. */
function RuleList({
  part,
  rules,
  project,
  definitions,
  view,
  editable,
  onRemove,
}: {
  part: Part;
  rules: readonly ScopeRule[];
  project: ProjectSnapshot;
  definitions: Definitions;
  view: ViewFile;
  editable: boolean;
  onRemove: (at: number) => void;
}) {
  const t = useT();
  if (rules.length === 0) return null;
  return (
    <>
      <p className="scope-heading">
        {part === 'include'
          ? t('Shows the elements that meet one of these rules')
          : t('Leaves out the elements that meet any of these rules')}
      </p>
      <ul className="scope-list">
        {rules.map((rule, at) => {
          const text = ruleText(t, project, definitions, view, rule);
          return (
            <li key={`${at} ${JSON.stringify(rule)}`}>
              <span className="scope-what">
                <span className="scope-kind">{kindName(t, rule.kind)}</span> {text}
              </span>
              <button
                type="button"
                className="inspector-action"
                disabled={!editable}
                aria-label={t('Remove the rule {rule}', { rule: text })}
                onClick={() => onRemove(at)}
              >
                {t('Remove')}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** One list of elements named by hand, each with the action that takes it back. */
function ElementList({
  heading,
  ids,
  nameOf,
  action,
  actionLabel,
  editable,
  onAction,
}: {
  heading: string;
  ids: readonly Id[];
  nameOf: (id: Id) => string;
  action: string;
  actionLabel: (name: string) => string;
  editable: boolean;
  onAction: (id: Id) => void;
}) {
  const t = useT();
  if (ids.length === 0) return null;
  return (
    <>
      <p className="scope-heading">
        {heading} ({ids.length})
      </p>
      <ul className="scope-list">
        {ids.slice(0, LISTED).map((id) => (
          <li key={id}>
            <span className="scope-what">{nameOf(id)}</span>
            <button
              type="button"
              className="inspector-action"
              disabled={!editable}
              aria-label={actionLabel(nameOf(id))}
              onClick={() => onAction(id)}
            >
              {action}
            </button>
          </li>
        ))}
      </ul>
      {ids.length > LISTED && (
        <p className="inspector-notes">{t('and {count} more', { count: ids.length - LISTED })}</p>
      )}
    </>
  );
}

/** What a rule's kind is called. */
function kindName(t: Translator, kind: Kind): string {
  return t(KINDS.find((each) => each.kind === kind)?.name ?? kind);
}

/** What a rule takes, in words. */
function ruleText(
  t: Translator,
  project: ProjectSnapshot,
  definitions: Definitions,
  view: ViewFile,
  rule: ScopeRule,
): string {
  switch (rule.kind) {
    case 'component': {
      const component = componentOrEssence(definitions, rule.component);
      const name = t.definition(component.id, component.name);
      return rule.exactly
        ? t('“{name}” only', { name })
        : t('“{name}”, and what derives from it', { name });
    }
    case 'relation-type': {
      const type = relationTypeOrRelatesTo(definitions, rule.relationType);
      const name = t.definition(type.id, type.name);
      return rule.exactly
        ? t('the ends of “{name}” only', { name })
        : t('the ends of “{name}”, and of what derives from it', { name });
    }
    case 'contents': {
      const name = modelIndexOf(project).element(rule.container)?.name ?? rule.container;
      const arranged = nestingTypesInView(project, view).length > 0;
      const text =
        rule.depth === undefined
          ? t('“{name}” and what sits inside it, at every level', { name })
          : t(
              {
                one: '“{name}” and what sits inside it, {count} level down',
                other: '“{name}” and what sits inside it, {count} levels down',
              },
              { name, count: rule.depth },
            );
      return arranged ? text : `${text} (${t('this view nests nothing')})`;
    }
    case 'attribute': {
      const test = ATTRIBUTE_TESTS.find((each) => each.test === rule.test)?.name ?? rule.test;
      return rule.test === 'set' || rule.test === 'unset'
        ? `${rule.attribute} ${t(test)}`
        : `${rule.attribute} ${t(test)} “${rule.value ?? ''}”`;
    }
  }
}

/** The form that adds a rule: its kind, then what it takes. */
function RuleForm({
  part,
  project,
  definitions,
  view,
  onAdd,
  onCancel,
}: {
  part: Part;
  project: ProjectSnapshot;
  definitions: Definitions;
  view: ViewFile;
  onAdd: (rule: ScopeRule) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const ids = {
    kind: useId(),
    what: useId(),
    derived: useId(),
    depth: useId(),
    attribute: useId(),
    test: useId(),
    value: useId(),
    problem: useId(),
  };
  const [kind, setKind] = useState<Kind>('component');
  const [what, setWhat] = useState('');
  const [derived, setDerived] = useState(true);
  const [depth, setDepth] = useState('');
  const [attribute, setAttribute] = useState('');
  const [test, setTest] = useState<AttributeTest>('is');
  const [value, setValue] = useState('');
  const [problem, setProblem] = useState<string>();

  const choices = useMemo(
    () => choicesOf(t, project, definitions, view),
    [t, project, definitions, view],
  );
  const options =
    kind === 'component'
      ? choices.components
      : kind === 'relation-type'
        ? choices.relationTypes
        : kind === 'contents'
          ? choices.containers
          : [];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const chosen = what || options[0]?.id || '';
    switch (kind) {
      case 'component':
      case 'relation-type':
      case 'contents':
        if (chosen === '') {
          setProblem(t('There is nothing of this kind to choose.'));
          return;
        }
    }
    if (kind === 'component') {
      onAdd({ kind, component: chosen, ...(derived ? {} : { exactly: true }) });
    } else if (kind === 'relation-type') {
      onAdd({ kind, relationType: chosen, ...(derived ? {} : { exactly: true }) });
    } else if (kind === 'contents') {
      const levels = depth.trim() === '' ? undefined : Number(depth);
      if (levels !== undefined && (!Number.isInteger(levels) || levels < 1 || levels > 1000)) {
        setProblem(t('How deep is a whole number from 1 to 1000, or nothing for every level.'));
        return;
      }
      onAdd({ kind, container: chosen, ...(levels === undefined ? {} : { depth: levels }) });
    } else {
      if (attribute.trim() === '') {
        setProblem(t('Name the attribute the rule tests.'));
        return;
      }
      const compares = test !== 'set' && test !== 'unset';
      onAdd({ kind, attribute: attribute.trim(), test, ...(compares ? { value } : {}) });
    }
  };

  return (
    <form
      className="scope-form"
      aria-label={part === 'include' ? t('Show by a rule') : t('Leave out by a rule')}
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <label htmlFor={ids.kind}>{t('Kind of rule')}</label>
      <select
        id={ids.kind}
        value={kind}
        onChange={(event) => {
          setKind(event.target.value as Kind);
          setWhat('');
          setProblem(undefined);
        }}
      >
        {KINDS.map((each) => (
          <option key={each.kind} value={each.kind}>
            {t(each.name)}
          </option>
        ))}
      </select>
      {kind !== 'attribute' && (
        <>
          <label htmlFor={ids.what}>
            {kind === 'component'
              ? t('Component')
              : kind === 'relation-type'
                ? t('Relation type')
                : t('Container')}
          </label>
          <select
            id={ids.what}
            value={what || options[0]?.id || ''}
            onChange={(event) => setWhat(event.target.value)}
          >
            {options.map((each) => (
              <option key={each.id} value={each.id}>
                {each.name}
              </option>
            ))}
          </select>
        </>
      )}
      {(kind === 'component' || kind === 'relation-type') && (
        <div className="scope-form-row">
          <input
            id={ids.derived}
            type="checkbox"
            checked={derived}
            onChange={(event) => setDerived(event.target.checked)}
          />
          <label htmlFor={ids.derived}>{t('And what derives from it')}</label>
        </div>
      )}
      {kind === 'contents' && (
        <>
          <label htmlFor={ids.depth}>{t('How many levels down (empty: every level)')}</label>
          <input
            id={ids.depth}
            type="number"
            min={1}
            max={1000}
            value={depth}
            onChange={(event) => setDepth(event.target.value)}
          />
        </>
      )}
      {kind === 'attribute' && (
        <>
          <label htmlFor={ids.attribute}>{t('Attribute')}</label>
          <input
            id={ids.attribute}
            type="text"
            list={`${ids.attribute}-names`}
            value={attribute}
            onChange={(event) => setAttribute(event.target.value)}
          />
          <datalist id={`${ids.attribute}-names`}>
            {choices.attributes.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <label htmlFor={ids.test}>{t('Test')}</label>
          <select
            id={ids.test}
            value={test}
            onChange={(event) => setTest(event.target.value as AttributeTest)}
          >
            {ATTRIBUTE_TESTS.map((each) => (
              <option key={each.test} value={each.test}>
                {t(each.name)}
              </option>
            ))}
          </select>
          {test !== 'set' && test !== 'unset' && (
            <>
              <label htmlFor={ids.value}>{t('Value')}</label>
              <input
                id={ids.value}
                type="text"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </>
          )}
        </>
      )}
      {problem !== undefined && (
        <p id={ids.problem} className="inspector-problem" role="alert">
          {problem}
        </p>
      )}
      <div className="scope-form-row">
        <button type="submit" className="inspector-action">
          {t('Add the rule')}
        </button>
        <button type="button" className="inspector-action" onClick={onCancel}>
          {t('Cancel')}
        </button>
      </div>
    </form>
  );
}

/**
 * What a rule can name: the components and relation types of the packages in use, the containers of
 * the view's nesting relation types, and the attributes elements have; each sorted by name.
 */
function choicesOf(
  t: Translator,
  project: ProjectSnapshot,
  definitions: Definitions,
  view: ViewFile,
): {
  components: { id: Id; name: string }[];
  relationTypes: { id: Id; name: string }[];
  containers: { id: Id; name: string }[];
  attributes: string[];
} {
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const components = project.packages
    .flatMap((file) => file.components)
    .map((component) => ({
      id: component.id,
      name: t.definition(component.id, componentOrEssence(definitions, component.id).name),
    }))
    .sort(byName);
  const relationTypes = project.packages
    .flatMap((file) => file.relationTypes)
    .map((type) => ({
      id: type.id,
      name: t.definition(type.id, relationTypeOrRelatesTo(definitions, type.id).name),
    }))
    .sort(byName);
  const nesting = new Set(nestingTypesInView(project, view));
  const index = modelIndexOf(project);
  const holders = new Set<Id>();
  for (const relation of project.model.relations) {
    if (nesting.has(relation.relationType) && relation.from !== relation.to)
      holders.add(relation.to);
  }
  const containers = [...holders]
    .flatMap((id) => {
      const element = index.element(id);
      return element && id !== project.model.world.id ? [{ id, name: element.name }] : [];
    })
    .sort(byName);
  const attributes = new Set<string>();
  for (const element of project.model.elements) {
    for (const name of Object.keys(element.attributes ?? {})) attributes.add(name);
    for (const each of componentOrEssence(definitions, element.component).attributes) {
      attributes.add(each.name);
    }
  }
  return { components, relationTypes, containers, attributes: [...attributes].sort() };
}
