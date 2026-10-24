/**
 * The editor's shared state: the open project and view, what is selected in it, and how to change the
 * project. The canvas, the inspector and the outline all read and change it.
 */
import type { Definitions, ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { createContext, useContext } from 'react';
import type { SendCommand } from '../canvas/CanvasArea';
import type { Scene } from '../canvas/scene';
import type { Selection } from './selection';

export interface Editor {
  /** The project as this tab knows it. */
  project: ProjectSnapshot;
  /** The components and relation types of the packages in use. */
  definitions: Definitions;
  /** The id of the view the canvas shows. */
  viewId: Id | undefined;
  /** What the canvas draws of that view; absent when no view is open or it cannot be drawn. */
  scene: Scene | undefined;
  selection: Selection;
  select: (selection: Selection) => void;
  /**
   * Sends a command to the local program; absent while the project cannot be changed, such as when
   * the connection closed. A refusal is already shown to the user as a notice.
   */
  send: SendCommand | undefined;
  /** Moves the canvas so that the shape with this key shows, as when it is chosen in the outline. */
  reveal: (shapeKey: string) => void;
}

export const EditorContext = createContext<Editor | undefined>(undefined);

/** The editor state, for components inside the shell. */
export function useEditor(): Editor {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error('useEditor needs an EditorContext provider.');
  return editor;
}
