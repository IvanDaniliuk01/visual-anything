import type { Id } from '@visual-anything/schema';
import { useId, useMemo } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { selectionOf } from '../../editor/selection';
import { useT } from '../../i18n';
import { usersOf, type DefinitionKind } from './commands';
import { useOpenDefinition } from './opened';
import { nameOf } from './traits';

interface UsedBySectionProps {
  kind: DefinitionKind;
  id: Id;
}

/**
 * What uses a component or relation type: the elements created from it or the relations of it, which
 * can be selected; the definitions derived from it; the limits and badges that name it; and the views
 * that nest by it. While any is left, it cannot be removed.
 */
export function UsedBySection({ kind, id }: UsedBySectionProps) {
  const t = useT();
  const editor = useEditor();
  const { project, definitions } = editor;
  const { open } = useOpenDefinition();
  const headingId = useId();
  const users = useMemo(() => usersOf(project, definitions, id), [project, definitions, id]);
  const world = project.model.world.id;
  const elements = users.elements.filter((each) => each !== world);
  const badgeComponents = users.badges.filter((each) => definitions.components.has(each));
  const badgeElements = users.badges.length - badgeComponents.length;
  const viewNames = users.views.map(
    (view) => project.views.find((each) => each.id === view)?.name ?? view,
  );
  const nothing =
    elements.length +
      users.relations.length +
      users.derived.length +
      users.limits.length +
      users.badges.length +
      users.views.length ===
      0 && !users.elements.includes(world);

  const opener = (target: DefinitionKind, other: Id) =>
    open === undefined ? undefined : () => open({ kind: target, id: other }, { focus: true });

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>{t('Used by')}</h4>
      {nothing && (
        <p className="panel-empty">
          {kind === 'component'
            ? t(
                'Nothing uses it yet. Add an element made from it with Add an element, on the canvas.',
              )
            : t(
                'Nothing uses it yet. Relate two shapes on the canvas, and choose it for the relation.',
              )}
        </p>
      )}
      {users.elements.includes(world) && (
        <p className="inspector-notes">{t('World is created from it.')}</p>
      )}
      {elements.length > 0 && (
        <p className="definition-used">
          {t(
            {
              one: '{count} element is created from it.',
              other: '{count} elements are created from it.',
            },
            { count: elements.length },
          )}{' '}
          <button
            type="button"
            className="inspector-action"
            onClick={() =>
              editor.select(selectionOf(elements.map((each) => ({ kind: 'element', id: each }))))
            }
          >
            {elements.length === 1 ? t('Select it') : t('Select them')}
          </button>
        </p>
      )}
      {users.relations.length > 0 && (
        <p className="definition-used">
          {t(
            { one: '{count} relation is of it.', other: '{count} relations are of it.' },
            { count: users.relations.length },
          )}{' '}
          <button
            type="button"
            className="inspector-action"
            onClick={() =>
              editor.select(
                selectionOf(users.relations.map((each) => ({ kind: 'relation', id: each }))),
              )
            }
          >
            {users.relations.length === 1 ? t('Select it') : t('Select them')}
          </button>
        </p>
      )}
      <Named
        title={
          kind === 'component'
            ? t('Components derived from it')
            : t('Relation types derived from it')
        }
        ids={users.derived}
        name={(other) => nameOf(definitions, kind, other)}
        open={(other) => opener(kind, other)}
      />
      <Named
        title={t('Relation types whose limits name it')}
        ids={users.limits}
        name={(other) => nameOf(definitions, 'relation-type', other)}
        open={(other) => opener('relation-type', other)}
      />
      <Named
        title={t('Components whose badges name it')}
        ids={badgeComponents}
        name={(other) => nameOf(definitions, 'component', other)}
        open={(other) => opener('component', other)}
      />
      {badgeElements > 0 && (
        <p className="inspector-notes">
          {t(
            {
              one: 'The own appearance of {count} element has a badge that names it.',
              other: 'The own appearance of {count} elements has a badge that names it.',
            },
            { count: badgeElements },
          )}
        </p>
      )}
      {viewNames.length > 0 && (
        <p className="inspector-notes">
          {t(
            { one: 'The view {names} nests by it.', other: 'The views {names} nest by it.' },
            {
              names: viewNames.map((name) => `“${name}”`).join(', '),
              count: viewNames.length,
            },
          )}
        </p>
      )}
    </section>
  );
}

interface NamedProps {
  title: string;
  ids: readonly Id[];
  name: (id: Id) => string;
  /** What opens one in the component editor; absent where nothing can. */
  open: (id: Id) => (() => void) | undefined;
}

/** Definitions that use this one, each of which opens in the component editor. */
function Named({ title, ids, name, open }: NamedProps) {
  const headingId = useId();
  if (ids.length === 0) return null;
  return (
    <div className="definition-named">
      <p id={headingId} className="inspector-notes">
        {title}
      </p>
      <ul className="inspector-selectables" aria-labelledby={headingId}>
        {ids.map((each) => {
          const opens = open(each);
          return (
            <li key={each}>
              {opens ? (
                <button type="button" className="inspector-selectable" onClick={opens}>
                  <span className="inspector-selectable-name">{name(each)}</span>
                </button>
              ) : (
                name(each)
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
