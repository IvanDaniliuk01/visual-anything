/**
 * The comments panel (ADR 0059), a tab of the model panel: who the person signs as, new threads on
 * the selection, the open view or a point of it, and the threads its filters keep (the open view's
 * or the project's, open or resolved, anyone's or one author's), the latest written in first, with
 * the detached ones apart. Choosing a thread selects what it is about and shows it whole.
 */
import { isResolved, modelIndexOf, type ProjectSnapshot } from '@visual-anything/core';
import type { CommentAnchor, Id } from '@visual-anything/schema';
import { useId, useMemo, useState } from 'react';
import { useEditor } from '../editor/EditorContext';
import type { Selection } from '../editor/selection';
import { actionTime, useToday } from '../history/time';
import { useT, type Translator } from '../i18n';
import { usePreferences } from '../theme/usePreferences';
import { aboutText } from './about';
import { AuthorForm } from './AuthorForm';
import { Composer } from './Composer';
import { createThreadCommand, personOf } from './commands';
import { useAnchorSelect } from './navigation';
import { useComments, type CommentFilters, type ThreadsShown } from './store';
import { ThreadView } from './ThreadView';
import { threadRows, type ThreadRow } from './threads';
import './comments.css';

interface CommentsTabProps {
  /** Whether the tab shows; while it does not, it works nothing out. */
  active: boolean;
}

export function CommentsTab({ active }: CommentsTabProps) {
  return active ? <CommentsTabContent /> : null;
}

function CommentsTabContent() {
  const t = useT();
  const editor = useEditor();
  const { project, viewId, selection, send } = editor;
  const { preferences } = usePreferences();
  const me = personOf(preferences.author);
  const [store, state] = useComments();
  const [changingName, setChangingName] = useState(false);
  const open =
    state.open === undefined ? undefined : project.comments.find((each) => each.id === state.open);

  const signing =
    me === undefined || changingName ? (
      <AuthorForm {...(me === undefined ? {} : { onDone: () => setChangingName(false) })} />
    ) : (
      <p className="comment-signed">
        {t('Signed as {name}', { name: me.name })}{' '}
        <button type="button" className="comment-link" onClick={() => setChangingName(true)}>
          {t('Change the name')}
        </button>
      </p>
    );

  return (
    <div className="comments-tab">
      {send !== undefined && signing}
      {open !== undefined ? (
        <ThreadView thread={open} me={me} />
      ) : (
        <ThreadList
          project={project}
          viewId={viewId}
          selection={selection}
          filters={state.filters}
          composing={state.composing}
          placing={state.placing}
          canWrite={send !== undefined}
          blocked={me === undefined ? t('Give your name above to comment.') : undefined}
          onPost={async (anchor, text) => {
            if (send === undefined || me === undefined) return false;
            const done = await send(createThreadCommand(anchor, text, me));
            if (done.ok) {
              const [created] = done.created ?? [];
              store.openThread(created);
            }
            return done.ok;
          }}
        />
      )}
    </div>
  );
}

interface ThreadListProps {
  project: ProjectSnapshot;
  viewId: Id | undefined;
  selection: Selection;
  filters: Readonly<CommentFilters>;
  composing: CommentAnchor | undefined;
  placing: boolean;
  canWrite: boolean;
  blocked: string | undefined;
  onPost: (anchor: CommentAnchor, text: string) => Promise<boolean>;
}

function ThreadList(props: ThreadListProps) {
  const { project, viewId, selection, filters, composing, placing, canWrite, blocked, onPost } =
    props;
  const t = useT();
  const [store] = useComments();
  const { selectAnchor } = useAnchorSelect();
  const rows = useMemo(() => threadRows(project, viewId, filters), [project, viewId, filters]);
  const ids = { where: useId(), state: useId(), author: useId() };
  const selected = selectedAnchor(project, selection);
  const choose = (row: ThreadRow) => {
    store.openThread(row.thread.id);
    selectAnchor(row.thread.anchor);
  };

  return (
    <>
      {canWrite && (
        <div className="comment-new" role="group" aria-label={t('New thread')}>
          <button
            type="button"
            className="comment-button"
            disabled={selected === undefined}
            title={
              selected === undefined ? t('Select one element or one relation first.') : undefined
            }
            onClick={() => selected && store.compose(selected)}
          >
            {t('Comment on the selection')}
          </button>
          <button
            type="button"
            className="comment-button"
            disabled={viewId === undefined}
            onClick={() => viewId && store.compose({ kind: 'view', view: viewId })}
          >
            {t('Comment on this view')}
          </button>
          <button
            type="button"
            className="comment-button"
            aria-pressed={placing}
            disabled={viewId === undefined}
            onClick={() => store.setPlacing(!placing)}
          >
            {t('Comment on a point…')}
          </button>
        </div>
      )}
      {placing && (
        <p className="comment-hint" role="status">
          {t(
            'Click on the canvas where the comment goes, or press Enter for its middle. Escape gives up.',
          )}
        </p>
      )}
      {composing !== undefined && (
        <section className="comment-new-thread" aria-label={t('New thread')}>
          <h3>{t('New thread: {about}', { about: aboutText(t, project, composing) })}</h3>
          <Composer
            label={t('Your comment')}
            submit={t('Comment')}
            blocked={blocked}
            autoFocus
            onCancel={() => store.compose(undefined)}
            onSubmit={(text) => onPost(composing, text)}
          />
        </section>
      )}
      <div className="comment-filters" role="group" aria-label={t('Which threads show')}>
        <label htmlFor={ids.where}>{t('Where')}</label>
        <select
          id={ids.where}
          value={filters.where}
          onChange={(event) =>
            store.setFilters({ where: event.target.value === 'all' ? 'all' : 'view' })
          }
        >
          <option value="view">{t('This view')}</option>
          <option value="all">{t('All views')}</option>
        </select>
        <label htmlFor={ids.state}>{t('State')}</label>
        <select
          id={ids.state}
          value={filters.state}
          onChange={(event) => store.setFilters({ state: event.target.value as ThreadsShown })}
        >
          <option value="open">{t('Open threads')}</option>
          <option value="resolved">{t('Resolved threads')}</option>
          <option value="all">{t('Open and resolved')}</option>
        </select>
        <label htmlFor={ids.author}>{t('Author')}</label>
        <select
          id={ids.author}
          value={filters.author ?? ''}
          onChange={(event) => store.setFilters({ author: event.target.value || undefined })}
        >
          <option value="">{t('Everyone')}</option>
          {rows.authors.map((author) => (
            <option key={author.key} value={author.key}>
              {author.name}
            </option>
          ))}
        </select>
      </div>
      {filters.about !== undefined && (
        <p className="comment-about-filter">
          {t('Only the threads on: {about}', { about: aboutOfId(t, project, filters.about) })}{' '}
          <button
            type="button"
            className="comment-link"
            onClick={() => store.setFilters({ about: undefined })}
          >
            {t('Show every thread')}
          </button>
        </p>
      )}
      {rows.attached.length === 0 ? (
        <p className="panel-empty">{emptyText(t, project, filters, canWrite)}</p>
      ) : (
        <ThreadRows rows={rows.attached} project={project} onChoose={choose} />
      )}
      {rows.detached.length > 0 && (
        <section className="comment-detached" aria-label={t('Detached threads')}>
          <h3>{t('Detached')}</h3>
          <p className="comment-hint">
            {t(
              'What these threads are about was deleted. They are kept: resolve or delete them, or undo the deletion.',
            )}
          </p>
          <ThreadRows rows={rows.detached} project={project} onChoose={choose} />
        </section>
      )}
    </>
  );
}

function ThreadRows({
  rows,
  project,
  onChoose,
}: {
  rows: readonly ThreadRow[];
  project: ProjectSnapshot;
  onChoose: (row: ThreadRow) => void;
}) {
  const t = useT();
  const today = useToday();
  return (
    <ul className="comment-rows">
      {rows.map((row) => {
        const { thread } = row;
        const first = thread.comments[0];
        const last = thread.comments.at(-1);
        const by = last?.author.kind === 'claude' ? 'Claude' : last?.author.name;
        return (
          <li key={thread.id}>
            <button type="button" className="comment-row" onClick={() => onChoose(row)}>
              <span className="comment-row-about">{aboutText(t, project, thread.anchor)}</span>
              {first !== undefined && (
                <span className="comment-row-text">{excerpt(first.text)}</span>
              )}
              <span className="comment-row-meta">
                {t(
                  { one: '{count} comment', other: '{count} comments' },
                  { count: thread.comments.length },
                )}
                {' · '}
                {t('last by {name}, {time}', {
                  name: by ?? '',
                  time: actionTime(Date.parse(row.last), today, t.language),
                })}
                {isResolved(thread) && ` · ${t('Resolved')}`}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The one element or relation selected, to comment on; none for anything else. */
function selectedAnchor(project: ProjectSnapshot, selection: Selection): CommentAnchor | undefined {
  if (selection.freeShapes.size > 0) return undefined;
  const elements = [...selection.elements];
  const relations = [...selection.relations];
  if (elements.length === 1 && relations.length === 0) {
    const [element] = elements as [Id];
    return element === project.model.world.id ? undefined : { kind: 'element', element };
  }
  if (relations.length === 1 && elements.length === 0) {
    const [relation] = relations as [Id];
    return { kind: 'relation', relation };
  }
  return undefined;
}

/** What a thread filter is about, by the id it keeps. */
function aboutOfId(t: Translator, project: ProjectSnapshot, id: Id): string {
  const index = modelIndexOf(project);
  if (index.relation(id)) return aboutText(t, project, { kind: 'relation', relation: id });
  if (project.views.some((view) => view.id === id))
    return aboutText(t, project, { kind: 'view', view: id });
  return aboutText(t, project, { kind: 'element', element: id });
}

/** The first line of a comment, cut to read in a row. */
function excerpt(text: string): string {
  const line = text.split('\n').find((each) => each.trim() !== '') ?? '';
  return line.length > 120 ? `${line.slice(0, 119)}…` : line;
}

function emptyText(
  t: Translator,
  project: ProjectSnapshot,
  filters: Readonly<CommentFilters>,
  canWrite: boolean,
): string {
  if (project.comments.length === 0) {
    return canWrite
      ? t(
          'No comments yet. Select an element or a relation and comment on it, or comment on this view.',
        )
      : t('No comments yet.');
  }
  return filters.state === 'open'
    ? t('No open threads here. Show resolved ones, or every view’s.')
    : t('No threads match. Show every view’s, or everyone’s.');
}
