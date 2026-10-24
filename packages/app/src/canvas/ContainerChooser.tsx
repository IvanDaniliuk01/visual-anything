import { modelIndexOf, nestingTypesInView, type ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import './drop.css';
import { useModalFocus } from './focus';

export interface ContainerChooserProps {
  project: ProjectSnapshot;
  viewId: Id;
  /** The element to put inside a container, or to move to another one. */
  element: Id;
  /** `put`, Put inside…, for an element directly in World; `move`, Move to…, which can choose World. */
  mode: 'put' | 'move';
  /** Called with the container chosen, or `undefined` for Directly in World. */
  onChoose: (container: Id | undefined) => void;
  onCancel: () => void;
}

/** How many elements it lists at once. */
const LISTED = 20;

const IN_WORLD = 'Directly in World';

interface Option {
  container: Id | undefined;
  name: string;
}

/**
 * The dialog that chooses, by name, the container an element goes into: a text box listing the
 * elements whose names hold what is typed, whatever the case, in the model's order. It leaves out the
 * element itself, everything inside it through any nesting relation type, and the containers it sits
 * in directly in the view. Up and Down go through the list, Enter chooses, and Escape cancels; the
 * focus stays inside it while it is open.
 */
export function ContainerChooser({
  project,
  viewId,
  element,
  mode,
  onChoose,
  onCancel,
}: ContainerChooserProps) {
  const titleId = useId();
  const listId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  useModalFocus(dialog);
  useEffect(() => {
    field.current?.focus();
  }, []);

  const candidates = useMemo(
    () => containersFor(project, viewId, element),
    [project, viewId, element],
  );
  const options = useMemo(() => {
    const typed = text.toLowerCase();
    const holds = (name: string) => name.toLowerCase().includes(typed);
    const listed: Option[] =
      mode === 'move' && holds(IN_WORLD) ? [{ container: undefined, name: IN_WORLD }] : [];
    let elements = 0;
    for (const candidate of candidates) {
      if (elements === LISTED) break;
      if (!holds(candidate.name)) continue;
      listed.push({ container: candidate.id, name: candidate.name });
      elements += 1;
    }
    return listed;
  }, [candidates, text, mode]);
  const at = Math.min(active, options.length - 1);
  const chosen = options[at];

  const name = modelIndexOf(project).element(element)?.name ?? element;
  const title = mode === 'put' ? `Put "${name}" inside…` : `Move "${name}" to…`;
  const optionId = (index: number) => `${listId}-${index}`;

  return (
    <div className="dialog-backdrop">
      <div
        ref={dialog}
        className="dialog container-chooser"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !event.nativeEvent.isComposing) onCancel();
        }}
      >
        <h2 id={titleId}>{title}</h2>
        <input
          ref={field}
          type="text"
          role="combobox"
          aria-labelledby={titleId}
          aria-autocomplete="list"
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-activedescendant={chosen ? optionId(at) : undefined}
          autoComplete="off"
          spellCheck={false}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive(Math.min(at + 1, options.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive(Math.max(at - 1, 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              if (chosen) onChoose(chosen.container);
            }
          }}
        />
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={titleId}
          className="container-chooser-options"
        >
          {options.map((option, index) => (
            <li
              key={option.container ?? ''}
              id={optionId(index)}
              role="option"
              aria-selected={index === at}
              // The text box keeps the focus.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onChoose(option.container)}
            >
              {option.name}
            </li>
          ))}
        </ul>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The elements an element can go into, in the model's order: all but itself, what is inside it
 * through any nesting relation type, which would form a cycle, and the containers it sits in directly
 * in the view.
 */
function containersFor(
  project: ProjectSnapshot,
  viewId: Id,
  element: Id,
): { id: Id; name: string }[] {
  const index = modelIndexOf(project);
  const left = new Set<Id>();
  const waiting = [element];
  for (let id = waiting.pop(); id !== undefined; id = waiting.pop()) {
    if (left.has(id)) continue;
    left.add(id);
    waiting.push(...index.contentsOf(id));
  }
  const view = project.views.find((each) => each.id === viewId);
  const types = new Set(view ? nestingTypesInView(project, view) : []);
  for (const relation of index.relationsOn(element)) {
    if (relation.from === element && types.has(relation.relationType)) left.add(relation.to);
  }
  return project.model.elements
    .filter((each) => !left.has(each.id))
    .map((each) => ({ id: each.id, name: each.name }));
}
