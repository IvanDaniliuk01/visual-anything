/**
 * Search and jump (R25): a find field over the canvas that opens on Ctrl+F, or ⌘F, while the canvas or
 * a panel has the focus; elsewhere the browser's own find keeps working. It matches names, ids,
 * components and attribute values across the project (`find.ts`), and lists what it found grouped by
 * the views that draw it, the open view first.
 *
 * The keys, from the field:
 * - ↓ and ↑ move through what was found;
 * - Enter selects it in the open view, or opens a view that draws it, brings it into sight (with a
 *   glide, or at once under reduced motion) and says so;
 * - Alt+Enter lists every view that draws it, and Enter on one of those opens it there;
 * - Escape closes that list, then the field, and gives the focus back: to the canvas once something
 *   was brought into sight there.
 */
import { modelIndexOf, type Definitions, type ProjectSnapshot } from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import {
  useContext,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import { useT } from '../i18n';
import { IS_APPLE } from '../live/platform';
import { DismissIcon, SearchIcon } from '../shell/icons';
import type { GoTo } from '../view-state/applier';
import { MOST_FOUND, find, type Entry, type Found } from './find';
import { addToViewCommand, toAdd } from '../canvas/scope';
import { scopeLabel } from '../canvas/scopeActions';
import { EditorContext } from '../editor/EditorContext';
import {
  groupsOf,
  kindOf,
  matchedText,
  shownText,
  titleOf,
  viewShows,
  viewsDrawing,
} from './groups';
import { IndexSource } from './source';
import { isFindShortcut, useFindShortcut } from './useFindShortcut';
import './search.css';

interface FindBarProps {
  project: ProjectSnapshot;
  definitions: Definitions;
  /** The view open on the canvas. */
  viewId: Id | undefined;
  /** Goes to what was found, in a view that draws it (the view state's `goTo`). */
  goTo: (request: GoTo) => void;
}

/**
 * One line of the list the keys move through: something found, going to the view of its group, or a
 * view that draws it, listed under it; `group` is the index of the group it shows in.
 */
type Option =
  | { kind: 'found'; found: Found; view: ViewFile | undefined; group: number; key: string }
  | { kind: 'view'; found: Found; view: ViewFile; group: number; key: string }
  // Add to this view: brings what the open view's scope leaves out into it (ADR-0040).
  | { kind: 'add'; found: Found; view: ViewFile; group: number; key: string };

const SHORTCUT = IS_APPLE ? '⌘F' : 'Ctrl+F';

export function FindBar({ project, definitions, viewId, goTo }: FindBarProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  // The found thing whose views are listed, by its key.
  const [listing, setListing] = useState<string>();
  // Each message counts, so that the same words said again are heard again.
  const [said, setSaid] = useState({ text: '', count: 0 });
  const input = useRef<HTMLInputElement>(null);
  const before = useRef<HTMLElement | null>(null);
  const jumped = useRef(false);
  const listId = useId();
  const optionId = useId();

  const [source] = useState(() => new IndexSource());
  useEffect(() => {
    if (open) source.want(project, definitions);
    else source.stop();
  }, [open, project, definitions, source]);
  useEffect(() => () => source.stop(), [source]);
  const index = useSyncExternalStore(source.subscribe, source.get);

  const searched = useDeferredValue(query);
  const result = useMemo(
    () => (index ? find(index, searched) : { found: [], total: 0 }),
    [index, searched],
  );
  const groups = useMemo(() => groupsOf(result.found, project, viewId), [result, project, viewId]);
  const openView = project.views.find((view) => view.id === viewId);
  // Add to this view only while the project can be changed: never in the read-only page (ADR-0041).
  const editor = useContext(EditorContext);
  const canAdd = editor?.send !== undefined;
  const options = useMemo(() => {
    const list: Option[] = [];
    groups.forEach((group, at) => {
      for (const found of group.found) {
        const key = keyOf(found.entry);
        list.push({ kind: 'found', found, view: group.view, group: at, key });
        if (listing === key) {
          for (const view of viewsDrawing(project, found.entry)) {
            list.push({ kind: 'view', found, view, group: at, key: `${key} in ${view.id}` });
          }
        }
        if (canAdd && openView && addable(project, openView, found.entry)) {
          list.push({ kind: 'add', found, view: openView, group: at, key: `${key} add` });
        }
      }
    });
    return list;
  }, [groups, listing, project, openView, canAdd]);
  const current = options[Math.min(active, options.length - 1)];

  const say = (text: string) => setSaid((last) => ({ text, count: last.count + 1 }));

  // Counts the times the field was asked for, so that asking again while it is open focuses it again.
  const [asked, setAsked] = useState(0);
  const show = () => {
    if (!open) {
      before.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      jumped.current = false;
      setOpen(true);
    }
    setAsked((last) => last + 1);
  };
  useFindShortcut(show);
  // The field takes the focus with what it holds selected, so that typing replaces it.
  useEffect(() => {
    if (asked === 0) return;
    input.current?.focus();
    input.current?.select();
  }, [asked]);

  const close = () => {
    setOpen(false);
    setListing(undefined);
    const canvas = document.querySelector<HTMLElement>('.canvas-area [role="application"]');
    const back = jumped.current ? canvas : before.current;
    back?.focus();
  };

  const jump = (found: Found, view: ViewFile | undefined) => {
    if (!view) {
      say(t('No view draws {name}.', { name: titleOf(t, project, found.entry) }));
      return;
    }
    goToIn(found, view);
  };
  /** Goes to what was found in a view that draws it, and says so once it is in sight. */
  const goToIn = (found: Found, view: ViewFile) => {
    const { entry } = found;
    jumped.current = true;
    goTo({
      kind: 'jump',
      view: view.id,
      target: { kind: entry.kind, id: entry.id },
      shown: (shown) => say(shownText(t, project, definitions, entry, view, shown)),
    });
  };

  // What was added to the open view from here, to go to once the view shows it (ADR-0040).
  const [adding, setAdding] = useState<{ found: Found; view: Id }>();
  const wentTo = useRef<object>(undefined);
  useEffect(() => {
    if (!adding || wentTo.current === adding || adding.view !== viewId) return;
    const view = project.views.find((each) => each.id === adding.view);
    if (!view || !viewShows(project, view, adding.found.entry)) return;
    wentTo.current = adding;
    goToIn(adding.found, view);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once the project shows what was added
  }, [project, adding, viewId]);

  const add = async (found: Found, view: ViewFile) => {
    const send = editor?.send;
    const { entry } = found;
    const elements = toAdd(
      project,
      view,
      entry.kind === 'element' ? { elements: [entry.id] } : { relations: [entry.id] },
    );
    if (!send || elements.length === 0) return;
    const result = await send(addToViewCommand(view.id, elements));
    if (!result.ok) return;
    say(`${t.message(scopeLabel('add', view, elements, (id) => nameOfElement(project, id)))}.`);
    setAdding({ found, view: view.id });
  };

  const choose = (option: Option) => {
    if (option.kind === 'add') void add(option.found, option.view);
    else jump(option.found, option.view);
  };

  /** Stops listing the views of a found thing, which becomes the chosen line again. */
  const unlist = () => {
    const at = options.findIndex((each) => each.kind === 'found' && each.key === listing);
    setListing(undefined);
    if (at >= 0) setActive(at);
  };

  const listViews = (option: Option) => {
    const key = option.kind === 'found' ? option.key : keyOf(option.found.entry);
    if (listing === key) {
      unlist();
      return;
    }
    setListing(key);
    const views = viewsDrawing(project, option.found.entry);
    setActive(
      Math.max(
        0,
        options.findIndex((each) => each.key === key),
      ) + 1,
    );
    say(
      t(
        { one: 'Drawn in {count} view: {views}.', other: 'Drawn in {count} views: {views}.' },
        { count: views.length, views: views.map((view) => view.name).join(', ') },
      ),
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (isFindShortcut(event.nativeEvent)) {
      event.preventDefault();
      input.current?.select();
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (options.length === 0) return;
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActive((Math.min(active, options.length - 1) + step + options.length) % options.length);
        return;
      }
      case 'Enter':
        event.preventDefault();
        if (!current) return;
        if (event.altKey) listViews(current);
        else choose(current);
        return;
      case 'Escape':
        event.preventDefault();
        if (listing !== undefined) unlist();
        else close();
        return;
    }
  };

  if (!open) return null;
  const activeId = current ? `${optionId}-${options.indexOf(current)}` : undefined;
  const count =
    query.trim() === ''
      ? ''
      : index === undefined
        ? t('Getting ready to find…')
        : result.total === 0
          ? t('Nothing found')
          : result.total > MOST_FOUND
            ? t('{shown} of {count} found', { shown: MOST_FOUND, count: result.total })
            : t({ one: '{count} found', other: '{count} found' }, { count: result.total });

  return (
    <div className="find-bar" role="search" aria-label={t('Find in the project')}>
      <div className="find-field">
        <SearchIcon className="find-icon" />
        <input
          ref={input}
          type="text"
          role="combobox"
          aria-label={t('Find in the project')}
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          {...(activeId === undefined ? {} : { 'aria-activedescendant': activeId })}
          aria-keyshortcuts="Control+F Meta+F"
          aria-describedby={`${listId}-hint`}
          placeholder={t('Names, ids, components, values…')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setListing(undefined);
          }}
          onKeyDown={onKeyDown}
        />
        <span className="find-count" aria-live="polite">
          {count}
        </span>
        <button
          type="button"
          className="find-close"
          aria-label={t('Close find')}
          title={t('Close find (Escape)')}
          onClick={close}
        >
          <DismissIcon />
        </button>
      </div>
      <p id={`${listId}-hint`} className="visually-hidden">
        {t(
          'Up and down move through what was found. Enter goes to it; Alt+Enter lists every view that draws it. Escape closes. {shortcut} finds again.',
          { shortcut: SHORTCUT },
        )}
      </p>
      {options.length > 0 && (
        <div className="find-results" role="listbox" id={listId} aria-label={t('Found')}>
          {groups.map((group, at) => (
            <div
              key={group.view?.id ?? ''}
              role="group"
              aria-label={groupName(t, group.view, group.open)}
            >
              <div className="find-group" aria-hidden="true">
                {groupName(t, group.view, group.open)}
              </div>
              {options.map((option, place) =>
                option.group !== at ? null : (
                  <div
                    key={option.key}
                    id={`${optionId}-${place}`}
                    role="option"
                    aria-selected={option === current}
                    className={
                      option.kind === 'found' ? 'find-option' : 'find-option find-option-view'
                    }
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setActive(place);
                      choose(option);
                    }}
                  >
                    {option.kind === 'view' ? (
                      t('Open in {view}', { view: option.view.name })
                    ) : option.kind === 'add' ? (
                      t('Add to this view, “{view}”', { view: option.view.name })
                    ) : (
                      <>
                        <span className="find-name">{titleOf(t, project, option.found.entry)}</span>
                        <span className="find-detail">
                          {[
                            kindOf(t, definitions, option.found.entry),
                            matchedText(t, option.found),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </>
                    )}
                  </div>
                ),
              )}
            </div>
          ))}
        </div>
      )}
      <p className="visually-hidden" aria-live="polite">
        {said.text}
        {said.count % 2 === 1 ? ' ' : ''}
      </p>
    </div>
  );
}

/** A group's heading: the view, and whether it is open. */
function groupName(t: ReturnType<typeof useT>, view: ViewFile | undefined, open: boolean): string {
  if (!view) return t('In no view');
  return open ? t('In {view}, open now', { view: view.name }) : t('In {view}', { view: view.name });
}

/**
 * Whether the open view can add what an entry stands for: an element or a relation its scope leaves
 * out, of which adding brings in an element (ADR-0040).
 */
function addable(project: ProjectSnapshot, view: ViewFile, entry: Entry): boolean {
  if (view.scope === undefined || entry.kind === 'free-shape') return false;
  if (viewShows(project, view, entry)) return false;
  const items = entry.kind === 'element' ? { elements: [entry.id] } : { relations: [entry.id] };
  return toAdd(project, view, items).length > 0;
}

function nameOfElement(project: ProjectSnapshot, id: Id): string {
  return modelIndexOf(project).element(id)?.name ?? id;
}

/** A found thing's key among the options. */
function keyOf(entry: Entry): string {
  return `${entry.kind}:${entry.view ?? ''}:${entry.id}`;
}
