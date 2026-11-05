/**
 * The project's views, in the Model tab, filed in view folders (ADR 0101): each view opens on the
 * canvas when chosen, and its settings change its name, description, perspective, the nesting relation
 * types that arrange it and the folder it is in, or delete it. Each folder opens and closes, which one
 * person's browser keeps, and its settings rename, move or delete it. Views and folders are also
 * dragged to another place or into a folder. A new view is made from a name and a perspective. Each
 * change is one command, so one undoable action; while the project cannot be changed, the controls
 * are off.
 */
import {
  folderPaths,
  folderTree,
  foldersInside,
  isFolder,
  listedViews,
  moved,
  nestingTypesInView,
  placeOf,
  relationTypeOrRelatesTo,
  renamedFolder,
  withoutFolder,
  type Command,
  type Definitions,
  type EntryRef,
  type FolderPlace,
  type ListedEntry,
  type OrganizedEntry,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, ViewFile, ViewFolderEntry } from '@visual-anything/schema';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type RefObject,
} from 'react';
import { useEditor } from '../editor/EditorContext';
import { useT } from '../i18n';
import { ChevronDownIcon, ChevronRightIcon } from './icons';
import { CheckboxControl, SelectControl, TextControl } from './inspector/controls';
import { perform } from './inspector/send';
import { Secondary } from './Secondary';
import { useFolderOpenness, type FolderOpenness } from './viewFolders';
import './views.css';

interface ViewListProps {
  project: ProjectSnapshot;
  definitions: Definitions;
  /** The view drawn on the canvas, if any. */
  openViewId: Id | undefined;
  /** The id of the heading that names the list. */
  labelledBy: string;
}

/** Where a dragged entry would go over a row: before or after it, last inside a folder, or first. */
type Zone = 'before' | 'after' | 'inside' | 'first';

/** A folder as the list shows it. */
type ListedFolder = Extract<ListedEntry, { kind: 'folder' }>;

/** What every row of the list shares. */
interface ListShared {
  openViewId: Id | undefined;
  editable: boolean;
  /** The view folders with every view filed, which each change starts from. */
  tree: ViewFolderEntry[];
  openness: FolderOpenness;
  /** The row whose settings show, as `view:<id>` or `folder:<id>`. */
  editing: string | undefined;
  setEditing: (key: string | undefined) => void;
  /** Sends a new tree as one `organize-views`, unless it cannot be made or changes nothing. */
  organize: (next: OrganizedEntry[] | undefined) => Promise<boolean>;
  /** Shows the form for a new view filed in a folder. */
  newViewIn: (folder: { id: Id; name: string }) => void;
  drag: DragShared;
}

/** The drag under way, and where it would drop. */
interface DragShared {
  start: (ref: EntryRef) => void;
  end: () => void;
  /** The tree with the dragged entry put at a zone of a row, if it can go there and moves. */
  over: (target: EntryRef, zone: Zone) => OrganizedEntry[] | undefined;
  /** The row and zone a drop would go to now, which the row shows. */
  shown: { key: string; zone: Zone } | undefined;
  show: (shown: { key: string; zone: Zone } | undefined) => void;
}

const Shared = createContext<ListShared | undefined>(undefined);

function useShared(): ListShared {
  const shared = useContext(Shared);
  if (!shared) throw new Error('A row of the view list is drawn outside it.');
  return shared;
}

const keyOf = (ref: EntryRef) => ('view' in ref ? `view:${ref.view}` : `folder:${ref.folder}`);

/** Whether two trees file the same views and folders, in the same order and with the same names. */
function sameTree(a: readonly OrganizedEntry[], b: readonly OrganizedEntry[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** How many entries a folder of the tree holds, or its top level. */
function countIn(tree: readonly OrganizedEntry[], folder: Id | undefined): number {
  if (folder === undefined) return tree.length;
  const find = (entries: readonly OrganizedEntry[]): number | undefined => {
    for (const entry of entries) {
      if (!isFolder(entry)) continue;
      if (entry.folder === folder) return entry.entries.length;
      const inside = find(entry.entries);
      if (inside !== undefined) return inside;
    }
    return undefined;
  };
  return find(tree) ?? 0;
}

/** The folders that hold a view, outermost first. */
function foldersHolding(listed: readonly ListedEntry[], view: Id | undefined): Id[] {
  for (const entry of listed) {
    if (entry.kind === 'view') {
      if (entry.view.id === view) return [];
      continue;
    }
    if (holds(entry, view)) return [entry.id, ...foldersHolding(entry.entries, view)];
  }
  return [];
}

function holds(entry: ListedEntry, view: Id | undefined): boolean {
  return entry.kind === 'view'
    ? entry.view.id === view
    : entry.entries.some((each) => holds(each, view));
}

/** The place a zone over a row stands for. */
function placeAt(tree: readonly OrganizedEntry[], target: EntryRef, zone: Zone): FolderPlace {
  if ('folder' in target && zone === 'inside') return { folder: target.folder };
  if ('folder' in target && zone === 'first') return { folder: target.folder, index: 0 };
  const at = placeOf(tree, target);
  if (!at) return {};
  return { folder: at.folder, index: zone === 'after' ? at.index + 1 : at.index };
}

/**
 * Where over a row the pointer is: its upper half before it, its lower half after it; over a folder,
 * its upper quarter before it, its lower quarter after it, or before what it shows while it is open,
 * and the middle last inside it.
 */
function zoneOf(event: DragEvent<HTMLElement>, folder: { open: boolean } | undefined): Zone {
  const box = event.currentTarget.getBoundingClientRect();
  if (box.height <= 0) return folder ? 'inside' : 'before';
  const at = (event.clientY - box.top) / box.height;
  if (!folder) return at < 0.5 ? 'before' : 'after';
  if (at < 0.25) return 'before';
  if (at > 0.75) return folder.open ? 'first' : 'after';
  return 'inside';
}

/** What makes a row's line a place to drag from and to drop on, while the project can be changed. */
function useDragRow(ref: EntryRef, folder: { open: boolean } | undefined) {
  const { editable, drag, organize } = useShared();
  const key = keyOf(ref);
  const zone = drag.shown?.key === key ? drag.shown.zone : undefined;
  if (!editable) return { className: 'view-row-line', handlers: {} };
  return {
    className: zone === undefined ? 'view-row-line' : `view-row-line view-drop-${zone}`,
    handlers: {
      draggable: true,
      onDragStart: (event: DragEvent<HTMLElement>) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', key);
        drag.start(ref);
      },
      onDragEnd: () => drag.end(),
      onDragOver: (event: DragEvent<HTMLElement>) => {
        const where = zoneOf(event, folder);
        if (!drag.over(ref, where)) {
          // Not a place it can go: the drop is refused, by not taking the event.
          if (zone !== undefined) drag.show(undefined);
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        if (zone !== where) drag.show({ key, zone: where });
      },
      onDragLeave: () => {
        if (zone !== undefined) drag.show(undefined);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        const next = drag.over(ref, zoneOf(event, folder));
        drag.end();
        if (!next) return;
        event.preventDefault();
        void organize(next);
      },
    },
  };
}

export function ViewList({ project, definitions, openViewId, labelledBy }: ViewListProps) {
  const t = useT();
  const { send, openView } = useEditor();
  const [editing, setEditing] = useState<string>();
  const [creating, setCreating] = useState<{ folder?: { id: Id; name: string } }>();
  const [naming, setNaming] = useState(false);
  const [dropShown, setDropShown] = useState<{ key: string; zone: Zone }>();
  const dragged = useRef<EntryRef>(undefined);
  const newButton = useRef<HTMLButtonElement>(null);
  const folderButton = useRef<HTMLButtonElement>(null);
  const editable = send !== undefined;
  const listed = useMemo(
    () => listedViews(project.project, project.views),
    [project.project, project.views],
  );
  const tree = useMemo(
    () => folderTree(project.project, project.views),
    [project.project, project.views],
  );
  const openness = useFolderOpenness(project.project.name);

  // A folder holding the open view opens by itself: when another view opens, or the open one moves.
  const holding = foldersHolding(listed, openViewId).join('\n');
  const { open: openFolders } = openness;
  useEffect(() => {
    if (holding !== '') openFolders(holding.split('\n'));
  }, [holding, openFolders]);

  const organize = (next: OrganizedEntry[] | undefined) =>
    !next || sameTree(next, tree)
      ? Promise.resolve(false)
      : perform(send, { type: 'organize-views', viewFolders: next });

  const shared: ListShared = {
    openViewId,
    editable,
    tree,
    openness,
    editing,
    setEditing,
    organize,
    newViewIn: (folder) => {
      setNaming(false);
      setCreating({ folder });
    },
    drag: {
      start: (ref) => {
        dragged.current = ref;
      },
      end: () => {
        dragged.current = undefined;
        setDropShown(undefined);
      },
      over: (target, zone) => {
        const ref = dragged.current;
        if (!ref) return undefined;
        const next = moved(tree, ref, placeAt(tree, target, zone));
        return next && !sameTree(next, tree) ? next : undefined;
      },
      shown: dropShown,
      show: setDropShown,
    },
  };

  // The button comes back once the form goes, and takes the focus back then.
  const focusLater = (button: RefObject<HTMLButtonElement | null>) =>
    setTimeout(() => button.current?.focus(), 0);
  const closeNew = () => {
    setCreating(undefined);
    focusLater(newButton);
  };
  const closeFolder = () => {
    setNaming(false);
    focusLater(folderButton);
  };

  return (
    <Shared.Provider value={shared}>
      {listed.length > 0 ? (
        <ul className="item-list view-list" aria-labelledby={labelledBy}>
          <Entries entries={listed} project={project} definitions={definitions} />
        </ul>
      ) : (
        <p className="panel-empty">
          {t('This project has no views yet. Make one with New view…, below.')}
        </p>
      )}
      {creating && editable ? (
        <NewViewForm
          folder={creating.folder}
          onCreated={(id) => {
            closeNew();
            openView?.(id);
          }}
          onCancel={closeNew}
        />
      ) : naming && editable ? (
        <NewFolderForm
          onCreate={(name) => organize([...tree, { name, entries: [] }])}
          onDone={closeFolder}
        />
      ) : (
        <div className="view-list-actions">
          <button
            ref={newButton}
            type="button"
            className="view-action"
            disabled={!editable}
            onClick={() => setCreating({})}
          >
            {t('New view…')}
          </button>
          <button
            ref={folderButton}
            type="button"
            className="view-action"
            disabled={!editable}
            onClick={() => setNaming(true)}
          >
            {t('New folder…')}
          </button>
        </div>
      )}
    </Shared.Provider>
  );
}

interface EntriesProps {
  entries: readonly ListedEntry[];
  project: ProjectSnapshot;
  definitions: Definitions;
}

/** The rows of a list of entries: views, and folders with their own entries below them. */
function Entries({ entries, project, definitions }: EntriesProps) {
  return entries.map((entry) =>
    entry.kind === 'view' ? (
      <ViewRow
        key={`view:${entry.view.id}`}
        project={project}
        definitions={definitions}
        view={entry.view}
      />
    ) : (
      <FolderRow
        key={`folder:${entry.id}`}
        project={project}
        definitions={definitions}
        folder={entry}
      />
    ),
  );
}

interface FolderRowProps {
  project: ProjectSnapshot;
  definitions: Definitions;
  folder: ListedFolder;
}

/** One folder: its name, which opens and closes it, its settings on demand, and what it holds. */
function FolderRow({ project, definitions, folder }: FolderRowProps) {
  const t = useT();
  const { openness, editing: editingKey, setEditing } = useShared();
  const settingsId = useId();
  const entriesId = useId();
  const open = openness.isOpen(folder.id);
  const ref = { folder: folder.id };
  const editing = editingKey === keyOf(ref);
  const drag = useDragRow(ref, { open: open && folder.entries.length > 0 });
  const label = t('Settings of the folder "{name}"', { name: folder.name });
  return (
    <li className="view-row view-folder">
      <div className={drag.className} {...drag.handlers}>
        <button
          type="button"
          className="view-open view-folder-toggle"
          aria-expanded={open}
          aria-controls={open ? entriesId : undefined}
          onClick={() => openness.setOpen(folder.id, !open)}
        >
          <span className="view-folder-chevron" aria-hidden="true">
            {open ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
          </span>
          <span className="item-name">{folder.name}</span>
        </button>
        <button
          type="button"
          className="view-action"
          aria-label={label}
          aria-expanded={editing}
          aria-controls={editing ? settingsId : undefined}
          onClick={() => setEditing(editing ? undefined : keyOf(ref))}
        >
          {t('Settings')}
        </button>
      </div>
      {editing && <FolderSettings id={settingsId} folder={folder} label={label} />}
      {open &&
        (folder.entries.length > 0 ? (
          <ul
            id={entriesId}
            className="item-list view-list view-folder-entries"
            aria-label={folder.name}
          >
            <Entries entries={folder.entries} project={project} definitions={definitions} />
          </ul>
        ) : (
          <p id={entriesId} className="view-note view-folder-empty">
            {t('This folder is empty.')}
          </p>
        ))}
    </li>
  );
}

/**
 * A folder's name, where it sits, a new view in it, and deleting it, which files what it held in its
 * place, so no confirmation is asked: undo brings it back.
 */
function FolderSettings({
  id,
  folder,
  label,
}: {
  id: string;
  folder: ListedFolder;
  label: string;
}) {
  const t = useT();
  const { tree, editable, organize, setEditing, newViewIn } = useShared();
  const ids = { name: useId(), inside: useId(), deleting: useId() };
  const ref = { folder: folder.id };
  return (
    <div id={id} className="view-settings" role="group" aria-label={label}>
      <div className="view-control">
        <label htmlFor={ids.name}>{t('Name')}</label>
        <TextControl
          id={ids.name}
          disabled={!editable}
          value={folder.name}
          problemOf={(text) => (text.trim() === '' ? t('A folder needs a name.') : undefined)}
          onCommit={(name) => organize(renamedFolder(tree, folder.id, name.trim()))}
        />
      </div>
      <FolderChoice
        id={ids.inside}
        label={t('Inside')}
        none={t('The top level')}
        entry={ref}
        leftOut={new Set([folder.id, ...foldersInside(tree, folder.id)])}
      />
      <MoveButtons entry={ref} />
      <div className="view-new-actions">
        <button
          type="button"
          className="view-action"
          disabled={!editable}
          onClick={() => newViewIn({ id: folder.id, name: folder.name })}
        >
          {t('New view in this folder…')}
        </button>
        <button
          type="button"
          className="view-action view-delete"
          disabled={!editable}
          aria-describedby={ids.deleting}
          onClick={() => {
            void organize(withoutFolder(tree, folder.id)).then((done) => {
              if (done) setEditing(undefined);
            });
          }}
        >
          {t('Delete folder')}
        </button>
      </div>
      <p id={ids.deleting} className="view-note">
        {t(
          'Deleting the folder deletes no view: what it holds takes its place. Undo brings it back.',
        )}
      </p>
    </div>
  );
}

interface FolderChoiceProps {
  id: string;
  label: string;
  /** What the option of no folder, the top level, is called. */
  none: string;
  entry: EntryRef;
  /** The folders it cannot go into. */
  leftOut?: ReadonlySet<Id>;
}

/**
 * The folder an entry is in, chosen from every folder by its path, such as "Stories › Ticket 12", or
 * none: choosing one moves the entry last into it.
 */
function FolderChoice({ id, label, none, entry, leftOut }: FolderChoiceProps) {
  const { tree, editable, organize } = useShared();
  const at = placeOf(tree, entry);
  const folders = folderPaths(tree).filter((each) => !leftOut?.has(each.folder));
  return (
    <div className="view-control">
      <label htmlFor={id}>{label}</label>
      <SelectControl
        id={id}
        disabled={!editable}
        value={at?.folder ?? ''}
        onCommit={(value) => organize(moved(tree, entry, value === '' ? {} : { folder: value }))}
      >
        <option value="">{none}</option>
        {folders.map((each) => (
          <option key={each.folder} value={each.folder}>
            {[...each.path, each.name].join(' › ')}
          </option>
        ))}
      </SelectControl>
    </div>
  );
}

/** Moves an entry one place up or down in the list it is in. */
function MoveButtons({ entry }: { entry: EntryRef }) {
  const t = useT();
  const { tree, editable, organize } = useShared();
  const at = placeOf(tree, entry);
  const move = (index: number) => {
    if (at) void organize(moved(tree, entry, { folder: at.folder, index }));
  };
  return (
    <div className="view-new-actions">
      <button
        type="button"
        className="view-action"
        disabled={!editable || !at || at.index === 0}
        onClick={() => at && move(at.index - 1)}
      >
        {t('Move up')}
      </button>
      <button
        type="button"
        className="view-action"
        disabled={!editable || !at || at.index >= countIn(tree, at.folder) - 1}
        // A place in its own list counts from before the move: two on is just after the next one.
        onClick={() => at && move(at.index + 2)}
      >
        {t('Move down')}
      </button>
    </div>
  );
}

interface ViewRowProps {
  project: ProjectSnapshot;
  definitions: Definitions;
  view: ViewFile;
}

/** One view: its name and perspective, which open it, and its settings, shown on demand. */
function ViewRow({ project, definitions, view }: ViewRowProps) {
  const t = useT();
  const { openViewId, editing: editingKey, setEditing } = useShared();
  const { openView } = useEditor();
  const settingsId = useId();
  const ref = { view: view.id };
  const open = view.id === openViewId;
  const editing = editingKey === keyOf(ref);
  const drag = useDragRow(ref, undefined);
  return (
    <li aria-current={open ? 'true' : undefined} className="view-row">
      <div className={drag.className} {...drag.handlers}>
        <button
          type="button"
          className="view-open"
          title={
            open
              ? t('This view is open on the canvas')
              : t('Open "{name}" on the canvas', { name: view.name })
          }
          onClick={() => openView?.(view.id)}
        >
          <span className="item-name">{view.name}</span>
          <Secondary text={view.perspective.name} />
        </button>
        {open && (
          <span className="item-badge" aria-hidden="true">
            {t('Open')}
          </span>
        )}
        <button
          type="button"
          className="view-action"
          aria-label={t('Settings of "{name}"', { name: view.name })}
          aria-expanded={editing}
          aria-controls={editing ? settingsId : undefined}
          onClick={() => setEditing(editing ? undefined : keyOf(ref))}
        >
          {t('Settings')}
        </button>
      </div>
      {editing && (
        <ViewSettings
          id={settingsId}
          project={project}
          definitions={definitions}
          view={view}
          onDeleted={() => setEditing(undefined)}
        />
      )}
    </li>
  );
}

interface ViewSettingsProps {
  id: string;
  project: ProjectSnapshot;
  definitions: Definitions;
  view: ViewFile;
  onDeleted: () => void;
}

/**
 * What a view is: its name, description and perspective, how it nests, the folder it is in and its
 * place there, and deleting it.
 */
function ViewSettings({ id, project, definitions, view, onDeleted }: ViewSettingsProps) {
  const t = useT();
  const { send } = useEditor();
  const { editable } = useShared();
  const ids = {
    folder: useId(),
    name: useId(),
    description: useId(),
    perspective: useId(),
    perspectiveDescription: useId(),
    nesting: useId(),
  };
  const [confirming, setConfirming] = useState(false);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const update = (changes: Extract<Command, { type: 'update-view' }>['changes']) =>
    perform(send, { type: 'update-view', id: view.id, changes });
  const nesting = nestingTypesInView(project, view);
  const players = project.scenarios.filter((scenario) => scenario.view === view.id);
  const perspective = view.perspective;

  return (
    <div
      id={id}
      className="view-settings"
      role="group"
      aria-label={t('Settings of "{name}"', { name: view.name })}
    >
      <div className="view-control">
        <label htmlFor={ids.name}>{t('Name')}</label>
        <TextControl
          id={ids.name}
          disabled={!editable}
          value={view.name}
          problemOf={(text) => (text.trim() === '' ? t('A view needs a name.') : undefined)}
          onCommit={(name) => update({ name })}
        />
      </div>
      <div className="view-control">
        <label htmlFor={ids.description}>{t('Description')}</label>
        <TextControl
          id={ids.description}
          disabled={!editable}
          multiline
          emphasis
          value={view.description ?? ''}
          onCommit={(text) => update({ description: text.trim() === '' ? null : text })}
        />
      </div>
      <div className="view-control">
        <label htmlFor={ids.perspective}>{t('Perspective')}</label>
        <TextControl
          id={ids.perspective}
          disabled={!editable}
          value={perspective.name}
          problemOf={(text) =>
            text.trim() === '' ? t('A perspective needs a name, such as Security.') : undefined
          }
          onCommit={(name) => update({ perspective: { ...perspective, name } })}
        />
      </div>
      <div className="view-control">
        <label htmlFor={ids.perspectiveDescription}>{t('What the perspective looks at')}</label>
        <TextControl
          id={ids.perspectiveDescription}
          disabled={!editable}
          multiline
          emphasis
          value={perspective.description ?? ''}
          onCommit={(text) =>
            update({
              perspective:
                text.trim() === ''
                  ? { name: perspective.name }
                  : { ...perspective, description: text },
            })
          }
        />
      </div>
      <fieldset className="view-nesting" aria-describedby={ids.nesting}>
        <legend>{t('Nesting relation types')}</legend>
        <p id={ids.nesting} className="view-note">
          {t('The relation types whose relations put shapes inside containers in this view.')}
        </p>
        {definitions.nestingRelationTypes.size === 0 ? (
          <p className="view-note">
            {t('The packages in use define no relation type that nests.')}
          </p>
        ) : (
          <ul className="view-nesting-types">
            {[...definitions.nestingRelationTypes].map((type) => (
              <NestingType
                key={type}
                name={t.definition(type, relationTypeOrRelatesTo(definitions, type).name)}
                checked={nesting.includes(type)}
                disabled={!editable}
                onCommit={(checked) =>
                  update({
                    nestingRelationTypes: checked
                      ? [...nesting.filter((each) => each !== type), type]
                      : nesting.filter((each) => each !== type),
                  })
                }
              />
            ))}
          </ul>
        )}
      </fieldset>
      <FolderChoice
        id={ids.folder}
        label={t('Folder')}
        none={t('No folder')}
        entry={{ view: view.id }}
      />
      <MoveButtons entry={{ view: view.id }} />
      {players.length > 0 ? (
        <p className="view-note">
          {t(
            {
              one: '{names} plays over this view, so it cannot be deleted.',
              other: '{names} play over this view, so it cannot be deleted.',
            },
            {
              count: players.length,
              names: players.map((scenario) => `"${scenario.name}"`).join(', '),
            },
          )}
        </p>
      ) : confirming ? (
        <div
          className="view-confirm"
          role="group"
          aria-label={t('Delete "{name}"?', { name: view.name })}
        >
          <p>
            {t(
              'Delete "{name}"? Its positions, stacking order and free shapes go with it; the model stays as it is. Undo brings it back.',
              { name: view.name },
            )}
          </p>
          <button
            type="button"
            className="view-action view-delete"
            disabled={!editable}
            onClick={() => {
              void perform(send, { type: 'delete-view', id: view.id }).then((done) => {
                if (done) onDeleted();
              });
            }}
          >
            {t('Delete')}
          </button>
          <button
            type="button"
            className="view-action"
            onClick={() => {
              setConfirming(false);
              setTimeout(() => deleteButton.current?.focus(), 0);
            }}
          >
            {t('Keep it')}
          </button>
        </div>
      ) : (
        <button
          ref={deleteButton}
          type="button"
          className="view-action"
          disabled={!editable}
          onClick={() => setConfirming(true)}
        >
          {t('Delete view…')}
        </button>
      )}
    </div>
  );
}

/** A nesting relation type, checked while it arranges the view. */
function NestingType({
  name,
  checked,
  disabled,
  onCommit,
}: {
  name: string;
  checked: boolean;
  disabled: boolean;
  onCommit: (checked: boolean) => Promise<unknown>;
}) {
  const id = useId();
  return (
    <li>
      <CheckboxControl id={id} disabled={disabled} checked={checked} onCommit={onCommit} />
      <label htmlFor={id}>{name}</label>
    </li>
  );
}

/**
 * Makes a new view from a name and a perspective, filed last in a folder when one is given; every
 * relation type that nests arranges it.
 */
function NewViewForm({
  folder,
  onCreated,
  onCancel,
}: {
  folder: { id: Id; name: string } | undefined;
  onCreated: (id: Id) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const { send } = useEditor();
  const ids = { heading: useId(), name: useId(), perspective: useId(), problem: useId() };
  const [name, setName] = useState('');
  const [perspective, setPerspective] = useState('');
  const [problem, setProblem] = useState<string>();
  const [sending, setSending] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameInput.current?.focus();
  }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === '') {
      setProblem(t('Give the view a name.'));
      return;
    }
    if (perspective.trim() === '') {
      setProblem(t('Name the perspective it is seen from, such as Security or Ownership.'));
      return;
    }
    if (!send) return;
    setProblem(undefined);
    setSending(true);
    try {
      const result = await send({
        type: 'create-view',
        view: { name: name.trim(), perspective: { name: perspective.trim() } },
        ...(folder ? { folder: folder.id } : {}),
      });
      const created = result.created?.[0];
      if (result.ok && created !== undefined) onCreated(created);
    } catch {
      // A refusal is already shown as a notice.
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      className="view-new"
      aria-labelledby={ids.heading}
      onSubmit={(event) => void create(event)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <p id={ids.heading} className="view-new-title">
        {folder ? t('New view in "{folder}"', { folder: folder.name }) : t('New view')}
      </p>
      <div className="view-control">
        <label htmlFor={ids.name}>{t('Name')}</label>
        <input
          id={ids.name}
          ref={nameInput}
          value={name}
          placeholder={t('Security overview')}
          aria-describedby={problem ? ids.problem : undefined}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="view-control">
        <label htmlFor={ids.perspective}>{t('Perspective')}</label>
        <input
          id={ids.perspective}
          value={perspective}
          placeholder={t('Security')}
          aria-describedby={problem ? ids.problem : undefined}
          onChange={(event) => setPerspective(event.target.value)}
        />
      </div>
      <p className="view-note">
        {t('Every relation type that nests arranges it at first; its settings change that.')}
      </p>
      {problem !== undefined && (
        <p id={ids.problem} role="alert" className="view-problem">
          {problem}
        </p>
      )}
      <div className="view-new-actions">
        <button type="submit" className="view-action" disabled={sending}>
          {t('Create')}
        </button>
        <button type="button" className="view-action" onClick={onCancel}>
          {t('Cancel')}
        </button>
      </div>
    </form>
  );
}

/** Makes a new, empty folder from a name, last at the top level of the list. */
function NewFolderForm({
  onCreate,
  onDone,
}: {
  onCreate: (name: string) => Promise<boolean>;
  onDone: () => void;
}) {
  const t = useT();
  const ids = { heading: useId(), name: useId(), problem: useId() };
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string>();
  const [sending, setSending] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameInput.current?.focus();
  }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === '') {
      setProblem(t('Give the folder a name.'));
      return;
    }
    setProblem(undefined);
    setSending(true);
    const done = await onCreate(name.trim());
    setSending(false);
    if (done) onDone();
  };

  return (
    <form
      className="view-new"
      aria-labelledby={ids.heading}
      onSubmit={(event) => void create(event)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onDone();
        }
      }}
    >
      <p id={ids.heading} className="view-new-title">
        {t('New folder')}
      </p>
      <div className="view-control">
        <label htmlFor={ids.name}>{t('Name')}</label>
        <input
          id={ids.name}
          ref={nameInput}
          value={name}
          placeholder={t('Stories')}
          aria-describedby={problem ? ids.problem : undefined}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      {problem !== undefined && (
        <p id={ids.problem} role="alert" className="view-problem">
          {problem}
        </p>
      )}
      <div className="view-new-actions">
        <button type="submit" className="view-action" disabled={sending}>
          {t('Create')}
        </button>
        <button type="button" className="view-action" onClick={onDone}>
          {t('Cancel')}
        </button>
      </div>
    </form>
  );
}
