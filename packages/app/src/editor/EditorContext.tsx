/**
 * The editor's shared state: the open project and view, what is selected in it, and how to change the
 * project. The canvas, the inspector and the outline all read and change it.
 */
import type { Definitions, ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { createContext, useContext } from 'react';
import type { SendCommand } from '../canvas/CanvasArea';
import type { Scene } from '../canvas/scene';
import type { Explore } from '../canvas/useExplorer';
import type { Follower } from '../destinations/FollowProvider';
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
  /**
   * Moves the canvas so that something shows, as when it is chosen in the outline: an element shape
   * by its key, or a relation or a free shape by its id.
   */
  reveal: (shapeKey: string) => void;
  /**
   * Opens another view of the project on the canvas, as the view list does and as playing a scenario
   * over its view does. The shell always sets it; it is optional only so that tests can leave it out.
   */
  openView?: (viewId: Id) => void;
  /**
   * How the open view is explored: its filters and focus, which the shell keeps for each view while
   * the project is open. The shell always sets it; it is optional only so that tests can leave it out.
   */
  explore?: Explore;
  /**
   * Follows destinations (ADR 0056): a view of this project at once, another project or a web
   * address after asking. The shell always sets it; it is optional so that tests can leave it out.
   */
  follow?: Follower;
}

export const EditorContext = createContext<Editor | undefined>(undefined);

/** The editor state, for components inside the shell. */
export function useEditor(): Editor {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error('useEditor needs an EditorContext provider.');
  return editor;
}
