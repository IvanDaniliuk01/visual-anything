import { definitionsOf, type ProjectSnapshot } from '@visual-anything/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildScene } from '../canvas/scene';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { EmphasisContext, EmphasisStore } from '../editor/emphasis';
import { EMPTY_SELECTION } from '../editor/selection';
import { LiveContext, type Live } from '../live/context';
import { fakeLive } from '../test/fakeLive';
import { loadSample } from '../test/sample';
import { GuidanceLayer } from './GuidanceLayer';
import type { GuidanceState } from './state';
import { setTabUseForTests, trackTabUse, type TabUse } from './tabs';

/** Another tab of the browser was used after this one. */
const usedElsewhere: TabUse = {
  used: () => undefined,
  isLastUsed: () => false,
  dispose: () => undefined,
};

afterEach(() => setTabUseForTests(trackTabUse({ channel: undefined, shown: true })));

const sample = loadSample();

/** The sample with a second view, so that guidance can name a view that is not open. */
const project: ProjectSnapshot = {
  ...sample,
  views: [
    ...sample.views,
    { ...(sample.views[0] as ProjectSnapshot['views'][number]), id: 'second', name: 'Second' },
  ],
};

function editorFor(viewId: string, overrides: Partial<Editor> = {}): Editor {
  return {
    project,
    definitions: definitionsOf(project.packages),
    viewId,
    scene: buildScene(project, viewId),
    selection: EMPTY_SELECTION,
    select: vi.fn(),
    send: undefined,
    reveal: vi.fn(),
    openView: vi.fn(),
    ...overrides,
  };
}

function Harness(props: { live: Live; editor: Editor; store: EmphasisStore; children: ReactNode }) {
  return (
    <LiveContext value={props.live}>
      <EditorContext.Provider value={props.editor}>
        <EmphasisContext.Provider value={props.store}>{props.children}</EmphasisContext.Provider>
      </EditorContext.Provider>
    </LiveContext>
  );
}

function renderWith(guidance: GuidanceState, editor = editorFor('system-overview')) {
  const store = new EmphasisStore();
  const clearGuidance = vi.fn();
  const live = fakeLive({ project, guidance, clearGuidance });
  const view = render(
    <Harness live={live} editor={editor} store={store}>
      <GuidanceLayer />
    </Harness>,
  );
  const rerender = (next: GuidanceState, nextEditor = editor) =>
    view.rerender(
      <Harness
        live={fakeLive({ project, guidance: next, clearGuidance })}
        editor={nextEditor}
        store={store}
      >
        <GuidanceLayer />
      </Harness>,
    );
  return { store, editor, clearGuidance, rerender };
}

const keyOf = (element: string) =>
  buildScene(project, 'system-overview').shapes.find((shape) => shape.element === element)?.key;

describe('GuidanceLayer', () => {
  it('shows nothing and emphasizes nothing without guidance', () => {
    const { store } = renderWith({});
    expect(
      screen.queryByRole('complementary', { name: 'Claude’s guidance' }),
    ).not.toBeInTheDocument();
    expect(store.get()).toEqual({});
  });

  it('highlights Claude’s targets through the emphasis store, and says so in words', () => {
    const { store } = renderWith({
      marks: { kind: 'highlight', targets: ['patient'], request: 1 },
    });
    expect(store.get().highlighted).toEqual(new Set([keyOf('patient')]));
    const panel = screen.getByRole('complementary', { name: 'Claude’s guidance' });
    expect(panel).toHaveTextContent('Claude highlights “Patient”.');
  });

  it('shows Claude’s caption as plain text, never as markup', () => {
    const text = '<img src=x onerror=alert(1)> The patient writes first.';
    renderWith({ caption: text });
    const panel = screen.getByRole('complementary', { name: 'Claude’s guidance' });
    expect(panel).toHaveTextContent(text);
    expect(panel.querySelector('img')).toBeNull();
  });

  it('lets the person dismiss it', () => {
    const { clearGuidance } = renderWith({ caption: 'Here.' });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Claude’s guidance' }));
    expect(clearGuidance).toHaveBeenCalledOnce();
  });

  it('takes its emphasis away when the guidance goes', () => {
    const { store, rerender } = renderWith({
      marks: { kind: 'focus', targets: ['patient'], request: 1 },
    });
    expect(store.get().dimmed?.size).toBeGreaterThan(0);
    act(() => rerender({}));
    expect(store.get()).toEqual({});
  });

  it('moves the canvas to the target, once per request', () => {
    const { editor, rerender } = renderWith({ panTo: { target: 'whatsapp', request: 1 } });
    expect(editor.reveal).toHaveBeenCalledWith(keyOf('whatsapp'));
    act(() => rerender({ panTo: { target: 'whatsapp', request: 1 } }));
    expect(editor.reveal).toHaveBeenCalledTimes(1);
    act(() => rerender({ panTo: { target: 'whatsapp', request: 2 } }));
    expect(editor.reveal).toHaveBeenCalledTimes(2);
  });

  it('opens the view Claude names first, then moves there once it is drawn', () => {
    const { editor, rerender } = renderWith({
      panTo: { target: 'whatsapp', view: 'second', request: 1 },
    });
    expect(editor.openView).toHaveBeenCalledWith('second');
    expect(editor.reveal).not.toHaveBeenCalled();
    const second = editorFor('second', { reveal: editor.reveal, openView: editor.openView });
    act(() => rerender({ panTo: { target: 'whatsapp', view: 'second', request: 1 } }, second));
    expect(editor.reveal).toHaveBeenCalledOnce();
    expect(editor.openView).toHaveBeenCalledOnce();
  });

  it('leaves a tab the person did not use last on its view, and moves it nowhere', () => {
    setTabUseForTests(usedElsewhere);
    const { editor, rerender } = renderWith({
      panTo: { target: 'whatsapp', view: 'second', request: 1 },
      marks: { kind: 'highlight', targets: ['patient'], view: 'second', request: 1 },
    });
    expect(editor.openView).not.toHaveBeenCalled();
    // Opened by hand later, the view takes no move asked for before.
    const second = editorFor('second', { reveal: editor.reveal, openView: editor.openView });
    act(() =>
      rerender(
        {
          panTo: { target: 'whatsapp', view: 'second', request: 1 },
          marks: { kind: 'highlight', targets: ['patient'], view: 'second', request: 1 },
        },
        second,
      ),
    );
    expect(editor.reveal).not.toHaveBeenCalled();
  });

  it('moves a tab the person did not use last when the move is for the view it shows', () => {
    setTabUseForTests(usedElsewhere);
    const { editor } = renderWith({
      panTo: { target: 'whatsapp', view: 'system-overview', request: 1 },
    });
    expect(editor.reveal).toHaveBeenCalledWith(keyOf('whatsapp'));
  });

  it('shows marks made for another view only in that view', () => {
    const { store } = renderWith({
      marks: { kind: 'highlight', targets: ['patient'], view: 'second', request: 1 },
    });
    expect(store.get()).toEqual({});
  });

  it('works outside a live session, showing nothing', () => {
    const store = new EmphasisStore();
    render(
      <EmphasisContext.Provider value={store}>
        <GuidanceLayer />
      </EmphasisContext.Provider>,
    );
    expect(store.get()).toEqual({});
  });
});

describe('GuidanceLayer says when it applied guidance, which Claude’s pictures wait for (#16)', () => {
  function renderApplying(guidance: GuidanceState, editor: Editor) {
    const store = new EmphasisStore();
    const guidanceApplied = vi.fn();
    const live = fakeLive({ project, guidance, guidanceApplied });
    const view = render(
      <Harness live={live} editor={editor} store={store}>
        <GuidanceLayer />
      </Harness>,
    );
    const rerender = (nextEditor: Editor) =>
      view.rerender(
        <Harness live={live} editor={nextEditor} store={store}>
          <GuidanceLayer />
        </Harness>,
      );
    return { guidanceApplied, rerender };
  }

  it('says so at once for guidance that opens no view and moves nothing', () => {
    const guidance: GuidanceState = { caption: 'Here.' };
    const { guidanceApplied } = renderApplying(guidance, editorFor('system-overview'));
    expect(guidanceApplied).toHaveBeenCalledWith(guidance);
  });

  it('says so only once the view pan_to named opened and its move shows', () => {
    const guidance: GuidanceState = { panTo: { target: 'whatsapp', view: 'second', request: 1 } };
    const first = editorFor('system-overview');
    const { guidanceApplied, rerender } = renderApplying(guidance, first);
    expect(first.openView).toHaveBeenCalledWith('second');
    expect(guidanceApplied).not.toHaveBeenCalled();
    // The view opened: the move is asked for, and shows once the canvas has drawn it, after.
    const second = editorFor('second', { reveal: first.reveal, openView: first.openView });
    act(() => rerender(second));
    expect(first.reveal).toHaveBeenCalledOnce();
    expect(guidanceApplied).not.toHaveBeenCalled();
    act(() => rerender({ ...second }));
    expect(guidanceApplied).toHaveBeenCalledWith(guidance);
  });

  it('says so after a move to the view already open, once the shell drew again', () => {
    const guidance: GuidanceState = {
      panTo: { target: 'whatsapp', view: 'system-overview', request: 1 },
    };
    const editor = editorFor('system-overview');
    const { guidanceApplied, rerender } = renderApplying(guidance, editor);
    // The camera may be there already: the canvas decides, and draws once the shell draws again.
    expect(editor.openView).not.toHaveBeenCalled();
    expect(editor.reveal).toHaveBeenCalledOnce();
    expect(guidanceApplied).not.toHaveBeenCalled();
    act(() => rerender({ ...editor }));
    expect(guidanceApplied).toHaveBeenCalledWith(guidance);
  });

  it('waits for the view that highlight marks open, in the tab the person used last only', () => {
    const guidance: GuidanceState = {
      marks: { kind: 'highlight', targets: ['patient'], view: 'second', request: 1 },
    };
    const first = editorFor('system-overview');
    const { guidanceApplied, rerender } = renderApplying(guidance, first);
    expect(first.openView).toHaveBeenCalledWith('second');
    expect(guidanceApplied).not.toHaveBeenCalled();
    act(() => rerender(editorFor('second', { openView: first.openView })));
    expect(guidanceApplied).toHaveBeenCalledWith(guidance);
  });

  it('says so at once in a tab that leaves guidance for another view to the tab used last', () => {
    setTabUseForTests(usedElsewhere);
    const guidance: GuidanceState = {
      marks: { kind: 'highlight', targets: ['patient'], view: 'second', request: 1 },
      panTo: { target: 'whatsapp', view: 'second', request: 1 },
    };
    const editor = editorFor('system-overview');
    const { guidanceApplied } = renderApplying(guidance, editor);
    expect(editor.openView).not.toHaveBeenCalled();
    expect(guidanceApplied).toHaveBeenCalledWith(guidance);
  });

  it('waits for a move that cannot happen no longer than for a view to open', () => {
    const guidance: GuidanceState = { panTo: { target: 'whatsapp', request: 1 } };
    // No scene drawn: the move waits for one.
    const editor = editorFor('system-overview', { scene: undefined });
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    try {
      const { guidanceApplied, rerender } = renderApplying(guidance, editor);
      expect(guidanceApplied).not.toHaveBeenCalled();
      now.mockReturnValue(1_000 + 10_001);
      act(() => rerender({ ...editor }));
      expect(guidanceApplied).toHaveBeenCalledWith(guidance);
    } finally {
      now.mockRestore();
    }
  });

  it('waits for the view that filters open too', () => {
    const guidance: GuidanceState = {
      filter: {
        filters: { components: [], relationTypes: [], conditions: [] },
        view: 'second',
        request: 1,
      },
    };
    const first = editorFor('system-overview', { explore: fakeExplore() });
    const { guidanceApplied, rerender } = renderApplying(guidance, first);
    expect(first.openView).toHaveBeenCalledWith('second');
    expect(guidanceApplied).not.toHaveBeenCalled();
    act(() => rerender(editorFor('second', { explore: fakeExplore() })));
    expect(guidanceApplied).toHaveBeenCalledWith(guidance);
  });
});

function fakeExplore(): NonNullable<Editor['explore']> {
  return {
    setFilters: vi.fn(),
    setFocus: vi.fn(),
    focusOn: vi.fn(),
  } as unknown as NonNullable<Editor['explore']>;
}
