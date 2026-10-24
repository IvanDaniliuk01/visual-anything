/**
 * The editor's shared state: the open view and what is selected in it. The canvas, the inspector and
 * the outline all read and change it.
 */
import type { Id } from '@visual-anything/schema';
import { createContext, useContext } from 'react';
import type { Selection } from './selection';

export interface Editor {
  /** The id of the view the canvas shows. */
  viewId: Id | undefined;
  selection: Selection;
  select(selection: Selection): void;
}

export const EditorContext = createContext<Editor | undefined>(undefined);

/** The editor state, for components inside the shell. */
export function useEditor(): Editor {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error('useEditor needs an EditorContext provider.');
  return editor;
}
