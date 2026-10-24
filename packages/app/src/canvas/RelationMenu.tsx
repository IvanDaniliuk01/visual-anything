import type { ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useEffect, useMemo, useRef } from 'react';
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

/** The menu that asks which relation type relates two ends, after a line is dragged between them. */
export function RelationMenu({ project, from, to, at, onChoose, onClose }: RelationMenuProps) {
  const choices = useMemo(() => relationChoices(project, from, to), [project, from, to]);
  const first = useRef<HTMLButtonElement>(null);
  const nameOf = (id: Id) =>
    project.model.elements.find((element) => element.id === id)?.name ??
    project.model.relations.find((relation) => relation.id === id)?.name ??
    'the relation';

  useEffect(() => {
    first.current?.focus();
  }, []);

  return (
    <div
      className="canvas-menu"
      role="menu"
      aria-label={`Relate ${nameOf(from)} to ${nameOf(to)}`}
      style={{ left: at.x, top: at.y }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
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
          onClick={() => onChoose(relationType.id)}
        >
          {relationType.name}
          {!fits && <span className="canvas-menu-hint"> · outside its limits</span>}
        </button>
      ))}
      <button type="button" role="menuitem" className="canvas-menu-cancel" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}
