/**
 * The element list's toggle in the header, and the list below the canvas while it is open (R42),
 * which share whether it is open through the shell's store. Closing the list from itself gives the
 * focus back to the toggle.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useT } from '../i18n';
import { TableIcon } from '../shell/icons';
import { ElementList } from './ElementList';
import type { ElementListStore } from './store';

export function ElementListToggle({ store }: { store: ElementListStore }) {
  const t = useT();
  const open = useSyncExternalStore(store.subscribe, store.isOpen);
  const closed = useSyncExternalStore(store.subscribe, store.closedTimes);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (closed > 0) button.current?.focus();
  }, [closed]);
  return (
    <button
      ref={button}
      type="button"
      className="element-list-toggle"
      aria-pressed={open}
      title={t('List the elements with their attributes, to read and edit them as a table')}
      onClick={() => store.toggle()}
    >
      <TableIcon />
      <span>{t('Element list')}</span>
    </button>
  );
}

export function ElementListPanel({ store }: { store: ElementListStore }) {
  const open = useSyncExternalStore(store.subscribe, store.isOpen);
  return open ? <ElementList onClose={() => store.close()} /> : null;
}
