import { definitionsIn, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { CommentFile } from '@visual-anything/schema';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildScene } from '../canvas/scene';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { EMPTY_SELECTION, selectionOf, type Selection } from '../editor/selection';
import { setCurrentLanguage } from '../i18n/language';
import { changePreferences, resetPreferencesForTests } from '../theme/store';
import { loadSample } from '../test/sample';
import { CommentsTab } from './CommentsTab';
import { CommentsContext, CommentsStore } from './store';

const VIEW = 'system-overview';
const sample = loadSample();

afterEach(() => {
  resetPreferencesForTests();
});

interface Harness {
  store: CommentsStore;
  sent: Command[];
  select: ReturnType<typeof vi.fn>;
  rerender: (project: ProjectSnapshot) => void;
}

function renderTab(
  options: {
    project?: ProjectSnapshot;
    selection?: Selection;
    canWrite?: boolean;
    created?: string[];
  } = {},
): Harness {
  const store = new CommentsStore();
  const sent: Command[] = [];
  const select = vi.fn();
  const goTo = vi.fn();
  store.actions = { goTo };
  const editorOf = (project: ProjectSnapshot): Editor => ({
    project,
    definitions: definitionsIn(project),
    viewId: VIEW,
    scene: buildScene(project, VIEW),
    selection: options.selection ?? EMPTY_SELECTION,
    select,
    send:
      options.canWrite === false
        ? undefined
        : (command) => {
            sent.push(command);
            return Promise.resolve({ ok: true, created: options.created ?? [] });
          },
    reveal: () => undefined,
    openView: () => undefined,
  });
  const wrap = (project: ProjectSnapshot): ReactNode => (
    <EditorContext value={editorOf(project)}>
      <CommentsContext value={store}>
        <CommentsTab active />
      </CommentsContext>
    </EditorContext>
  );
  const view = render(wrap(options.project ?? sample));
  return { store, sent, select, rerender: (project) => view.rerender(wrap(project)) };
}

function signIn() {
  act(() => changePreferences({ author: { name: 'Bruno', email: 'bruno@example.com' } }));
}

describe('the comments tab', () => {
  it('lists the open view’s open threads, and shows one whole when chosen', () => {
    signIn();
    const { store } = renderTab();
    const row = screen.getByRole('button', { name: /Reminder service/ });
    expect(row).toHaveTextContent('Is one day ahead the right time for the reminder?');
    expect(row).toHaveTextContent('1 comment');
    fireEvent.click(row);
    expect(store.getState().open).toBe('reminder-timing');
    expect(store.actions.goTo).toHaveBeenCalledWith({
      kind: 'jump',
      view: VIEW,
      target: { kind: 'element', id: 'reminder-service' },
    });
    const thread = screen.getByRole('region', { name: 'Thread: Reminder service' });
    expect(within(thread).getByRole('listitem')).toHaveTextContent('Ana');
  });

  it('asks for the person’s name before they can comment, and keeps it as a preference', () => {
    renderTab();
    expect(screen.getByLabelText('Your name')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email (optional)'), { target: { value: 'not one' } });
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: '  Bruno ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign my comments' }));
    expect(screen.getByRole('alert')).toHaveTextContent('That is not an email address.');
    fireEvent.change(screen.getByLabelText('Email (optional)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign my comments' }));
    expect(screen.getByText(/Signed as Bruno/)).toBeInTheDocument();
  });

  it('answers a thread in the person’s name', async () => {
    signIn();
    const { store, sent } = renderTab();
    act(() => store.openThread('reminder-timing'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Reply' }), {
      target: { value: 'Two hours ahead, then.' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
      await Promise.resolve();
    });
    expect(sent).toEqual([
      {
        type: 'add-comment',
        thread: 'reminder-timing',
        comment: {
          text: 'Two hours ahead, then.',
          author: { kind: 'person', name: 'Bruno', email: 'bruno@example.com' },
        },
      },
    ]);
  });

  it('starts a thread on the selection, then shows it', async () => {
    signIn();
    const { store, sent } = renderTab({
      selection: selectionOf([{ kind: 'relation', id: 'agent-to-api' }]),
      created: ['new-thread', 'c'],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Comment on the selection' }));
    const box = screen.getByRole('textbox', { name: 'Your comment' });
    fireEvent.change(box, { target: { value: 'Is this call retried?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mention the selection' }));
    expect(box).toHaveValue('Is this call retried? @[agent-to-api]');
    await act(async () => {
      fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
      await Promise.resolve();
    });
    expect(sent).toEqual([
      {
        type: 'create-thread',
        thread: {
          anchor: { kind: 'relation', relation: 'agent-to-api' },
          comment: {
            text: 'Is this call retried? @[agent-to-api]',
            author: { kind: 'person', name: 'Bruno', email: 'bruno@example.com' },
          },
        },
      },
    ]);
    expect(store.getState().open).toBe('new-thread');
  });

  it('edits only the person’s own comments, resolves, and deletes after asking', async () => {
    act(() => changePreferences({ author: { name: 'ana ' } }));
    const { store, sent } = renderTab();
    act(() => store.openThread('reminder-timing'));
    // Ana wrote it, whatever the case and the spaces around her name.
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit your comment' }), {
      target: { value: 'Is a day ahead right?' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete thread…' }));
    const asked = screen.getByRole('alertdialog', { name: 'Delete the thread?' });
    expect(asked).toHaveTextContent('Delete this thread and its 1 comment? You can undo it.');
    await act(async () => {
      fireEvent.click(within(asked).getByRole('button', { name: 'Delete thread' }));
      await Promise.resolve();
    });
    expect(sent.map((command) => command.type)).toEqual([
      'edit-comment',
      'resolve-thread',
      'delete-thread',
    ]);
    expect(store.getState().open).toBeUndefined();
  });

  it('lists detached threads apart, and filters by state and author', () => {
    signIn();
    const extra: CommentFile = {
      id: 'gone',
      anchor: { kind: 'element', element: 'nothing-here' },
      comments: [
        {
          id: 'g',
          author: { kind: 'claude' },
          time: '2026-10-25T11:00:00.000Z',
          text: 'About a deleted one.',
        },
      ],
    };
    const { store } = renderTab({ project: { ...sample, comments: [...sample.comments, extra] } });
    const detached = screen.getByRole('region', { name: 'Detached threads' });
    expect(within(detached).getByRole('button')).toHaveTextContent('“nothing-here”, deleted');
    fireEvent.change(screen.getByLabelText('Author'), { target: { value: 'claude' } });
    expect(store.getState().filters.author).toBe('claude');
    expect(screen.queryByRole('button', { name: /Reminder service/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'resolved' } });
    expect(screen.getByText(/No threads match/)).toBeInTheDocument();
  });

  it('shows the text as text, never as markup, and offers nothing to write while it cannot', () => {
    const hostile: CommentFile = {
      id: 'hostile',
      anchor: { kind: 'view', view: VIEW },
      comments: [
        {
          id: 'h',
          author: { kind: 'person', name: '<b>Eve</b>' },
          time: '2026-10-25T11:00:00.000Z',
          text: '<img src=x onerror="alert(1)"> and @[patient]',
        },
      ],
    };
    const { store } = renderTab({ project: { ...sample, comments: [hostile] }, canWrite: false });
    expect(screen.queryByRole('button', { name: 'Comment on this view' })).not.toBeInTheDocument();
    act(() => store.openThread('hostile'));
    const thread = screen.getByRole('region', { name: /^Thread:/ });
    expect(thread.querySelector('img')).toBeNull();
    expect(thread).toHaveTextContent('<img src=x onerror="alert(1)"> and Patient');
    expect(within(thread).getByText('<b>Eve</b>')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('reads in Spanish', () => {
    setCurrentLanguage('es');
    signIn();
    renderTab();
    expect(screen.getByRole('button', { name: 'Comentar esta vista' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reminder service/ })).toHaveTextContent(
      '1 comentario',
    );
  });
});
