import {
  applyOperations,
  definitionsIn,
  executeCommand,
  modelIndexOf,
  type Operation,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SendCommand } from '../canvas/CanvasArea';
import { buildScene } from '../canvas/scene';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { selectionOf, type Selectable, type Selection } from '../editor/selection';
import { ComponentsTab } from '../shell/ComponentsTab';
import { DefinitionInspector } from '../shell/definitions/DefinitionInspector';
import { DefinitionProvider } from '../shell/definitions/DefinitionProvider';
import { ElementInspector } from '../shell/inspector/ElementInspector';
import { inspectedOf } from '../shell/inspector/inspected';
import { RelationInspector } from '../shell/inspector/RelationInspector';
import '../shell/inspector.css';

/** What a test does to the project from outside the panels, as the local program would. */
export interface HarnessControls {
  /** Puts another project in place, as an edit by Claude or a reload does. */
  replace: (project: ProjectSnapshot) => void;
  /** Undoes the last action the panels sent. */
  undo: () => void;
}

export interface DefinitionsHarnessProps {
  project: ProjectSnapshot;
  selected: readonly Selectable[];
  /** Whether the project can be changed; when not, the editor has no `send`. */
  editable: boolean;
  /** What the local program answers; an accepted command is then applied with the core. */
  send: SendCommand;
  select: (selection: Selection) => void;
  onReady: (controls: HarnessControls) => void;
}

/**
 * The Components tab and the inspector, as the shell mounts them: one store of what the inspector
 * shows in place of the selection around both, and the inspector's content wrapped in the component
 * editor. What `send` accepts is applied to the project with the core, and kept for undo.
 */
export function DefinitionsHarness({
  project: initial,
  selected,
  editable,
  send,
  select,
  onReady,
}: DefinitionsHarnessProps) {
  const [project, setProject] = useState(initial);
  const [selection, setSelection] = useState(() => selectionOf(selected));
  const state = useRef<{ project: ProjectSnapshot; undo: Operation[][] }>({
    project: initial,
    undo: [],
  });
  useEffect(() => {
    onReady({
      replace: (next) => {
        state.current.project = next;
        setProject(next);
      },
      undo: () => {
        const inverse = state.current.undo.pop();
        if (!inverse) throw new Error('Nothing to undo.');
        const next = applyOperations(state.current.project, inverse).state;
        state.current.project = next;
        setProject(next);
      },
    });
  }, [onReady]);
  const definitions = useMemo(() => definitionsIn(project), [project]);
  const view = project.views[0];
  const scene = useMemo(() => (view ? buildScene(project, view.id) : undefined), [project, view]);
  const apply: SendCommand = async (command) => {
    const answer = await send(command);
    if (!answer.ok) return answer;
    const outcome = executeCommand(state.current.project, command);
    if (!outcome.ok) return { ok: false };
    state.current.project = outcome.state;
    state.current.undo.push(outcome.inverse);
    setProject(outcome.state);
    return { ok: true, created: outcome.created };
  };
  const editor: Editor = {
    project,
    definitions,
    viewId: view?.id,
    scene,
    selection,
    select: (next) => {
      select(next);
      setSelection(next);
    },
    send: editable ? apply : undefined,
    reveal: () => {},
  };
  const inspected = inspectedOf(selection, modelIndexOf(project), view);
  const choose = (item: Selectable) => editor.select(selectionOf([item]));

  return (
    <EditorContext.Provider value={editor}>
      <DefinitionProvider>
        <section aria-label="Components tab">
          <ComponentsTab active />
        </section>
        <aside className="panel inspector" aria-label="Inspector">
          <h2>Inspector</h2>
          <DefinitionInspector>
            {inspected.kind === 'element' && (
              <ElementInspector
                key={inspected.element.id}
                element={inspected.element}
                definitions={definitions}
                titleRef={null}
                onSelect={choose}
              />
            )}
            {inspected.kind === 'relation' && (
              <RelationInspector
                key={inspected.relation.id}
                relation={inspected.relation}
                definitions={definitions}
                titleRef={null}
                onSelect={choose}
              />
            )}
            {inspected.kind !== 'element' && inspected.kind !== 'relation' && (
              <p className="inspector-selection">Nothing is selected.</p>
            )}
          </DefinitionInspector>
        </aside>
      </DefinitionProvider>
    </EditorContext.Provider>
  );
}
