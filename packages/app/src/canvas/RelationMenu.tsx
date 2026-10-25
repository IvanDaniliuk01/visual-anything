import type { ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useEffect, useMemo, useRef } from 'react';
import { useT } from '../i18n';
import { menuKeyDown, useMenuInsideFrame, useOutsidePress } from './focus';
import type { Point } from './geometry';
import { relationChoices } from './gestures';

interface RelationMenuProps {
  project: ProjectSnapshot;
  from: Id;
  to: Id;
  /** Where the line was dropped, on screen relative to the canvas. */
  at: Point;
  onChoose: (relationType: Id) => void;
  onClose: () => void;
}

/**
 * The menu that asks which relation type relates two ends, after a line is dragged between them. The
 * arrow keys, Home and End move through it, Enter chooses, and Escape or a press outside it closes it.
 * Dropped near the canvas's edge, it moves in, so that every item shows.
 */
export function RelationMenu({ project, from, to, at, onChoose, onClose }: RelationMenuProps) {
  const t = useT();
  const choices = useMemo(() => relationChoices(project, from, to), [project, from, to]);
  const menu = useMenuInsideFrame<HTMLDivElement>(at);
  const first = useRef<HTMLButtonElement>(null);
  const nameOf = (id: Id) =>
    project.model.elements.find((element) => element.id === id)?.name ??
    project.model.relations.find((relation) => relation.id === id)?.name ??
    t('the relation');

  useEffect(() => {
    first.current?.focus();
  }, []);
  useOutsidePress(menu, onClose);

  return (
    <div
      ref={menu}
      className="canvas-menu"
      role="menu"
      aria-label={t('Relate {from} to {to}', { from: nameOf(from), to: nameOf(to) })}
      style={{ left: at.x, top: at.y }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
        else menuKeyDown(event);
      }}
    >
      <p className="canvas-menu-title">
        {nameOf(from)} → {nameOf(to)}
      </p>
      {choices.map(({ relationType, fits }, index) => (
        <button
          key={relationType.id}
          ref={index === 0 ? first : undefined}
          type="button"
          role="menuitem"
          tabIndex={-1}
          onClick={() => onChoose(relationType.id)}
        >
          {t.definition(relationType.id, relationType.name)}
          {!fits && <span className="canvas-menu-hint"> · {t('outside its limits')}</span>}
        </button>
      ))}
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        className="canvas-menu-cancel"
        onClick={onClose}
      >
        {t('Cancel')}
      </button>
    </div>
  );
}
