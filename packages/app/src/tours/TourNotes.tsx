/**
 * The speaker notes of a tour (ADR 0058), in a second window of this tab's own, which the person
 * presenting can keep on another screen. The window is a blank page of this origin, opened by the
 * click that asks for it and filled through the DOM with React, never through HTML: it gets the app's
 * stylesheets and theme, and the keys pressed in it move through the tour as they do in the tab.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import { nameWindow, type NotesWindow } from './notes-window';
import { tourKeyAction, type TourKeyAction } from './player';

/** How often the tab looks whether the person closed the window, in milliseconds. */
const CLOSED_CHECK = 500;

interface TourNotesWindowProps {
  notes: NotesWindow;
  title: string;
  /** Called once the window is closed, by the person, or because it could not open. */
  onClosed: () => void;
  /** Called for each key of the tour pressed in the window. */
  onKey: (action: TourKeyAction) => void;
  children: ReactNode;
}

export function TourNotesWindow({ notes, title, onClosed, onKey, children }: TourNotesWindowProps) {
  const t = useT();
  const latest = useRef({ onClosed, onKey });
  useEffect(() => {
    latest.current = { onClosed, onKey };
  });

  // The window closes a moment after the notes go, so that the same notes mounted again at once, as
  // React's StrictMode does, keep it.
  const closing = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (notes === 'blocked') return;
    clearTimeout(closing.current);
    const opened = notes.window;
    const onKeyDown = (event: KeyboardEvent) => {
      const action = tourKeyAction(event);
      if (action === undefined) return;
      event.preventDefault();
      latest.current.onKey(action);
    };
    opened.addEventListener('keydown', onKeyDown);
    const watch = setInterval(() => {
      if (opened.closed) latest.current.onClosed();
    }, CLOSED_CHECK);
    return () => {
      clearInterval(watch);
      opened.removeEventListener('keydown', onKeyDown);
      closing.current = setTimeout(() => opened.close(), 0);
    };
  }, [notes]);

  useEffect(() => {
    if (notes !== 'blocked') nameWindow(notes.root.ownerDocument, title);
  }, [notes, title]);

  if (notes === 'blocked') {
    return (
      <p className="tour-notes-blocked" role="alert">
        {t(
          'The browser did not open the speaker notes window. Allow pop-up windows for this page, then try again.',
        )}
        <button type="button" onClick={() => latest.current.onClosed()}>
          {t('Close')}
        </button>
      </p>
    );
  }
  return createPortal(children, notes.root);
}
