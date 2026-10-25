/**
 * Opening the speaker notes window of a tour (ADR 0058): a blank page of this origin, opened by the
 * click that asks for it, since browsers open a window only for one, with the app's stylesheets and
 * theme and an empty place for its content, which React fills through the DOM, never through HTML.
 */

/** The name the window is opened under, so that opening it again reuses it. */
export const NOTES_WINDOW = 'visual-anything-speaker-notes';

/** The notes window, and where its content goes; or that the browser did not open it. */
export type NotesWindow = { window: Window; root: HTMLElement } | 'blocked';

/** Opens the notes window, as a click asks. */
export function openNotesWindow(): NotesWindow {
  const opened = window.open('', NOTES_WINDOW, 'popup,width=560,height=680');
  if (!opened) return 'blocked';
  const page = opened.document;
  page.head.replaceChildren(
    ...[...document.querySelectorAll('link[rel="stylesheet"], style')].map((node) =>
      page.importNode(node, true),
    ),
  );
  for (const name of ['data-theme', 'lang', 'style']) {
    const value = document.documentElement.getAttribute(name);
    if (value === null) page.documentElement.removeAttribute(name);
    else page.documentElement.setAttribute(name, value);
  }
  const root = page.createElement('main');
  root.className = 'tour-notes-window';
  page.body.replaceChildren(root);
  return { window: opened, root };
}

/** Gives a window's page its title. */
export function nameWindow(page: Document, title: string): void {
  page.title = title;
}
