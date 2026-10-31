/**
 * The physical-space panel's list (ADR 0076): what the panel shows as a tree, by what each is posed or
 * anchored in, so that everything it draws is reached from the keyboard and heard by a screen reader.
 * It follows the selection, made anywhere; a click selects a row's element, Enter selects it and
 * frames it, and +, − and 0 zoom and fit the camera as on the frames. Each row's name says where its
 * element is, and resting the pointer on a row hovers its element everywhere.
 */
import { modelIndexOf, type ProjectSnapshot, type Space } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useId, useMemo, useState } from 'react';
import { useEditor } from '../editor/EditorContext';
import { useHoverStore } from '../editor/hover';
import { selectionOf } from '../editor/selection';
import { useT } from '../i18n';
import { shownRows, type TreeRow } from '../shell/tree';
import { VirtualTree, type TreeRequest } from '../shell/VirtualTree';
import type { SpaceControl } from './control';
import { holdersOf, spaceListOf, type SpaceListItem } from './list';
import { cameraKeyOf, cameraMovedByKey } from './orbit';
import { whereIs } from './where';

interface SpaceListProps {
  project: ProjectSnapshot;
  space: Space;
  control: SpaceControl;
  say: (text: string) => void;
}

export function SpaceList({ project, space, control, say }: SpaceListProps) {
  const t = useT();
  const heading = useId();
  const editor = useEditor();
  const { selection } = editor;
  const hovers = useHoverStore();
  const index = modelIndexOf(project);
  const items = useMemo(() => spaceListOf(space), [space]);
  const [closed, setClosed] = useState<ReadonlySet<Id>>(new Set());
  const shown = useMemo(() => shownRows(items, (_, id) => !closed.has(id)), [items, closed]);
  const selected = [...selection.elements].find(
    (element) => space.entries.has(element) || space.faint.has(element),
  );

  // The list follows the selection: what holds it opens, and its row scrolls into view. The state is
  // adjusted while rendering, so that the row's holders draw open in the same pass.
  const [request, setRequest] = useState<TreeRequest>();
  const [followed, setFollowed] = useState<{ selected: Id | undefined; items: typeof items }>({
    selected: undefined,
    items,
  });
  if (followed.selected !== selected || followed.items !== items) {
    setFollowed({ selected, items });
    if (selected !== undefined) {
      const holders = holdersOf(items, selected);
      if (holders.some((each) => closed.has(each))) {
        const open = new Set(closed);
        for (const each of holders) open.delete(each);
        setClosed(open);
      }
      setRequest({ id: selected, focus: false, serial: (request?.serial ?? 0) + 1 });
    }
  }

  const nameOf = (element: Id) => index.element(element)?.name ?? element;
  const howOf = (item: SpaceListItem): string => {
    switch (item.how) {
      case 'root':
        return t('shown');
      case 'posed':
        return t('posed');
      case 'anchored':
        return t('anchored');
      case 'faint':
        return t('not in this view');
    }
  };

  const activate = (row: TreeRow<SpaceListItem>, how: 'key' | 'pointer') => {
    const element = row.item.element;
    editor.select?.(selectionOf([{ kind: 'element', id: element }]));
    say(`${whereIs(t, project, space, element)}.`);
    if (how === 'key') void control.fit([element]);
  };

  return (
    <section className="space-panel-list" aria-labelledby={heading}>
      <h3 id={heading} className="space-panel-list-title">
        {t('What the panel shows')}
      </h3>
      <div
        className="space-panel-list-rows"
        onPointerOver={(event) => {
          const row = (event.target as HTMLElement).closest('[role="treeitem"]');
          const at = Number(row?.getAttribute('data-index'));
          const element = Number.isInteger(at) ? shown.rows[at]?.item.element : undefined;
          hovers?.set('space', element);
        }}
        onPointerLeave={() => hovers?.set('space', undefined)}
      >
        <VirtualTree
          shown={shown}
          labelledBy={heading}
          selectedId={selected}
          request={request}
          isSelected={(row) => selection.elements.has(row.item.element)}
          textOf={(row) => nameOf(row.item.element)}
          labelOf={(row) => whereIs(t, project, space, row.item.element)}
          onOpen={(row, open) =>
            setClosed((now) => {
              const next = new Set(now);
              if (open) next.delete(row.id);
              else next.add(row.id);
              return next;
            })
          }
          onActivate={activate}
          renderRow={(row) => (
            <>
              <span className="space-panel-list-name">{nameOf(row.item.element)}</span>
              <span className="space-panel-list-how" aria-hidden="true">
                {howOf(row.item)}
              </span>
            </>
          )}
          onKey={(_, event) => {
            // The arrows are the list's; +, − and 0 move the camera as on the frames.
            if (event.key.startsWith('Arrow')) return false;
            const key = cameraKeyOf(event);
            if (!key) return false;
            if (key.kind === 'fit') {
              void control.fit();
              return true;
            }
            const camera = control.camera();
            if (camera) control.setCamera(cameraMovedByKey(camera, key, 400));
            return true;
          }}
        />
      </div>
    </section>
  );
}
