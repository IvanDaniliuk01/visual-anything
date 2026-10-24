import { definitionsOf, type ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useMemo } from 'react';

interface CanvasToolbarProps {
  project: ProjectSnapshot;
  /** Whether the project can be changed; adding is off while it cannot. */
  editable: boolean;
  /** The current zoom, as a scale. */
  scale: number | undefined;
  onAdd: (component: Id) => void;
  onAddNote: () => void;
  onAddArrow: () => void;
  onZoom: (factor: number) => void;
  onFit: () => void;
}

/** The canvas toolbar: the component palette, free shapes and zoom. */
export function CanvasToolbar(props: CanvasToolbarProps) {
  const { project, editable, scale } = props;
  const palette = useMemo(() => {
    const definitions = definitionsOf(project.packages);
    return project.packages.map((file) => ({
      id: file.id,
      name: file.name,
      components: file.components.map((component) => ({
        id: component.id,
        name: definitions.component(component.id)?.name ?? component.name,
      })),
    }));
  }, [project.packages]);

  return (
    <div className="canvas-toolbar" role="toolbar" aria-label="Canvas">
      <label className="canvas-toolbar-add">
        <span className="visually-hidden">Add an element</span>
        <select
          value=""
          disabled={!editable}
          onChange={(event) => {
            if (event.target.value) props.onAdd(event.target.value);
          }}
        >
          <option value="">Add element…</option>
          {palette.map((file) => (
            <optgroup key={file.id} label={file.name}>
              {file.components.map((component) => (
                <option key={component.id} value={component.id}>
                  {component.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <button type="button" disabled={!editable} onClick={props.onAddNote}>
        Note
      </button>
      <button type="button" disabled={!editable} onClick={props.onAddArrow}>
        Arrow
      </button>
      <span className="canvas-toolbar-spacer" />
      <button type="button" aria-label="Zoom out" onClick={() => props.onZoom(1 / 1.25)}>
        −
      </button>
      <output className="canvas-toolbar-zoom" aria-label="Zoom">
        {scale === undefined ? '' : `${Math.round(scale * 100)}%`}
      </output>
      <button type="button" aria-label="Zoom in" onClick={() => props.onZoom(1.25)}>
        +
      </button>
      <button type="button" onClick={props.onFit}>
        Fit
      </button>
    </div>
  );
}
