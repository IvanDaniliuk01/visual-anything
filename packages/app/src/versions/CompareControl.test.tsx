import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ListedVersion, ProjectSnapshot } from '@visual-anything/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComparisonContext, ComparisonStore } from '../canvas/comparison/mode';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { NO_GUIDANCE, applyGuidance } from '../guidance/state';
import { setTabUseForTests, trackTabUse, type TabUse } from '../guidance/tabs';
import { LanguageProvider } from '../i18n/LanguageProvider';
import type { ComparedResult } from '../live/connection';
import { LiveContext, type Live } from '../live/context';
import { comparedSample } from '../test/comparison';
import { fakeLive } from '../test/fakeLive';
import { CompareControl } from './CompareControl';
import { CompareSession } from './session';

afterEach(() => setTabUseForTests(trackTabUse({ channel: undefined, shown: true })));

const TIME = Date.UTC(2026, 9, 28, 10, 0);

function listed(
  kind: ListedVersion['kind'],
  name: string | undefined,
  digit: string,
  subject: string,
): ListedVersion {
  return {
    kind,
    ...(name === undefined ? {} : { name }),
    commit: digit.repeat(40),
    short: digit.repeat(7),
    subject,
    author: 'Ana',
    time: TIME,
  };
}

const HEAD = listed('head', undefined, 'a', 'Add the SMS channel');
const MAIN = listed('branch', 'main', 'a', 'Add the SMS channel');
const TAG = listed('tag', 'v0.1', 'c', 'First version');
const COMMIT = listed('commit', undefined, 'd', 'Move the patient');
const VERSIONS = [HEAD, MAIN, TAG, COMMIT];

interface Setup {
  versions?: ListedVersion[];
  why?: string;
  live?: Partial<Live>;
  language?: 'en' | 'es';
  editor?: Partial<Editor>;
  /** Renders it as the app does, in React's strict mode, which runs effects twice. */
  strict?: boolean;
}

/** Compare with… in a tab of its own, with the program's answers in the test's hands. */
function setup({
  versions = VERSIONS,
  why,
  live: given = {},
  language = 'en',
  editor,
  strict = false,
}: Setup = {}) {
  const { older, newer, comparison } = comparedSample();
  const listVersions = vi.fn<NonNullable<Live['listVersions']>>(() =>
    Promise.resolve({
      ok: true,
      answer: {
        type: 'versions/listed',
        requestId: 'request-1',
        versions,
        ...(why === undefined ? {} : { why }),
      },
    }),
  );
  const answers: ((result: ComparedResult) => void)[] = [];
  const compareVersion = vi.fn<NonNullable<Live['compareVersion']>>(
    () => new Promise((resolve) => answers.push(resolve)),
  );
  const live = fakeLive({ listVersions, compareVersion, project: newer, ...given });
  const store = new ComparisonStore();
  const session = new CompareSession();
  const tree = (props: { live: Live }) => (
    <LanguageProvider language={language}>
      <LiveContext value={props.live}>
        <ComparisonContext value={store}>
          <EditorContext.Provider value={editor ? ({ ...editor } as Editor) : undefined}>
            <CompareControl session={session} />
          </EditorContext.Provider>
        </ComparisonContext>
      </LiveContext>
    </LanguageProvider>
  );
  const view = render(tree({ live }), { reactStrictMode: strict });
  /** The program answers the request asked last with the version compared. */
  const answer = async (result?: ComparedResult) => {
    await act(async () => {
      answers.at(-1)?.(
        result ?? {
          ok: true,
          version: { kind: 'commit', commit: MAIN.commit },
          older,
          newer,
          comparison,
        },
      );
      await Promise.resolve();
    });
  };
  return {
    ...view,
    rerenderWith: (next: Live) => view.rerender(tree({ live: next })),
    live,
    store,
    session,
    listVersions,
    compareVersion,
    answer,
    older,
    newer,
  };
}

async function openDialog(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: 'Compare with…' }));
  const dialog = screen.getByRole('dialog', { name: 'Compare with…' });
  await waitFor(() => expect(within(dialog).queryByText('Listing the versions…')).toBeNull());
  return dialog;
}

function optionsIn(dialog: HTMLElement): string[] {
  return within(dialog)
    .getAllByRole('option')
    .map((option) => option.textContent ?? '');
}

describe('Compare with…', () => {
  it('lists the project as opened, HEAD, branches, tags and commits, with what names each', async () => {
    const { listVersions } = setup();
    const dialog = await openDialog();

    expect(listVersions).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole('combobox', { name: 'Find a version' })).toHaveFocus();
    const options = within(dialog).getAllByRole('option');
    expect(options).toHaveLength(5);
    expect(options[0]).toHaveTextContent(/^As openedThe project as opened/);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(options[1]).toHaveTextContent(/^HEADaaaaaaaAdd the SMS channelAna, /);
    expect(options[2]).toHaveTextContent(/^Branchmainaaaaaaa/);
    expect(options[3]).toHaveTextContent(/^Tagv0\.1ccccccc/);
    expect(options[4]).toHaveTextContent(/^CommitdddddddMove the patientAna, /);
  });

  it('finds versions as they are typed, and chooses one from the keyboard', async () => {
    const { compareVersion, answer, store } = setup();
    const dialog = await openDialog();
    const field = within(dialog).getByRole('combobox');

    fireEvent.change(field, { target: { value: 'MAIN' } });
    expect(optionsIn(dialog)).toHaveLength(1);
    fireEvent.change(field, { target: { value: '' } });
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    expect(within(dialog).getAllByRole('option')[2]).toHaveAttribute('aria-selected', 'true');
    expect(field).toHaveAttribute(
      'aria-activedescendant',
      within(dialog).getAllByRole('option')[2]?.id,
    );
    fireEvent.keyDown(field, { key: 'Enter' });

    // It asks the program for the version by the commit it listed, and says it waits.
    expect(compareVersion).toHaveBeenCalledWith({ kind: 'commit', commit: MAIN.commit });
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'Reading main (aaaaaaa) to compare it with the project now…',
    );
    await answer();

    // The comparison shows, following the project now, and the dialog closes.
    expect(store.get()).toMatchObject({
      title: 'Compared with main (aaaaaaa)',
      follows: true,
      drawing: 'comparison',
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Compare with…' })).toHaveFocus();
  });

  it('chooses a version with a click, and compares the project as opened without git', async () => {
    const { compareVersion, answer, store } = setup({
      versions: [],
      why: 'The project folder is not in a git repository, so it has no commits to compare with. Comparing with the project as opened works without one.',
    });
    const dialog = await openDialog();

    expect(within(dialog).getByRole('status')).toHaveTextContent(
      /not in a git repository, so it has no commits/,
    );
    expect(optionsIn(dialog)).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole('option'));
    expect(compareVersion).toHaveBeenCalledWith({ kind: 'opened' });
    await answer();
    expect(store.get()?.title).toBe('Compared with the project as opened');
  });

  it('says in words why the program could not compare a version, and stays open', async () => {
    const { answer, store } = setup();
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getAllByRole('option')[3] as HTMLElement);

    await answer({
      ok: false,
      problems: [
        {
          code: 'invalid-command',
          message:
            'That commit is not one the program listed in its latest listing of versions: list them again, then choose one.',
        },
      ],
    });

    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Could not compare with v0.1 (ccccccc): That commit is not one the program listed',
    );
    expect(store.get()).toBeUndefined();
  });

  it('lists the versions in strict mode too, as the app runs', async () => {
    setup({ strict: true });
    const dialog = await openDialog();
    expect(optionsIn(dialog)).toHaveLength(5);
  });

  it('lists again when asked', async () => {
    const { listVersions } = setup();
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'List again' }));
    await waitFor(() => expect(listVersions).toHaveBeenCalledTimes(2));
  });

  it('closes with Escape, and drops the answer it was waiting for', async () => {
    const { answer, store } = setup();
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getAllByRole('option')[1] as HTMLElement);

    fireEvent.keyDown(within(dialog).getByRole('combobox'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await answer();
    expect(store.get()).toBeUndefined();
  });

  it('cannot be used without a live session', () => {
    setup({ live: { status: 'closed' } });
    const button = screen.getByRole('button', { name: 'Compare with…' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('speaks Spanish', async () => {
    setup({ language: 'es' });
    fireEvent.click(screen.getByRole('button', { name: 'Comparar con…' }));
    const dialog = screen.getByRole('dialog', { name: 'Comparar con…' });
    await waitFor(() => expect(within(dialog).getAllByRole('option')).toHaveLength(5));
    expect(within(dialog).getAllByRole('option')[0]).toHaveTextContent(
      /^Tal como se abrióEl proyecto tal como se abrió/,
    );
    expect(within(dialog).getAllByRole('option')[2]).toHaveTextContent(/^Rama/);
  });
});

describe('Claude’s guidance to compare', () => {
  const lastUsed: TabUse = { used: () => {}, isLastUsed: () => true, dispose: () => {} };
  const usedElsewhere: TabUse = { used: () => {}, isLastUsed: () => false, dispose: () => {} };

  function guided(live: Live, guidance: Parameters<typeof applyGuidance>[1]): Live {
    return { ...live, guidance: applyGuidance(NO_GUIDANCE, guidance, 1) };
  }

  it('compares the version Claude named as if the person had chosen it', async () => {
    setTabUseForTests(lastUsed);
    const openView = vi.fn();
    const { live, rerenderWith, compareVersion, answer, store, session } = setup({
      editor: { viewId: 'system-overview', openView, project: comparedSample().newer },
    });
    // The tab heard the program list the commit, so the comparison is named after its branch.
    session.listed([HEAD, MAIN]);
    rerenderWith(
      guided(live, {
        kind: 'comparison',
        version: { kind: 'commit', commit: MAIN.commit },
        show: 'before',
      }),
    );

    expect(compareVersion).toHaveBeenCalledWith({ kind: 'commit', commit: MAIN.commit });
    expect(screen.getByRole('button', { name: 'Comparing…' })).toHaveAttribute('aria-busy', 'true');
    await answer();
    expect(store.get()).toMatchObject({
      title: 'Compared with main (aaaaaaa)',
      drawing: 'before',
      follows: true,
    });
    expect(openView).not.toHaveBeenCalled();
  });

  it('opens the view Claude named first, and names a commit it never listed by its id', async () => {
    setTabUseForTests(lastUsed);
    const openView = vi.fn();
    const { live, rerenderWith, answer, store } = setup({
      editor: { viewId: 'system-overview', openView, project: withSecondView() },
    });
    rerenderWith(
      guided(live, {
        kind: 'comparison',
        version: { kind: 'commit', commit: 'e'.repeat(40) },
        view: 'second',
      }),
    );
    expect(openView).toHaveBeenCalledWith('second');
    await answer();
    expect(store.get()?.title).toBe('Compared with commit eeeeeee');
  });

  it('says why in a notice when the version Claude named cannot be compared', async () => {
    setTabUseForTests(lastUsed);
    const { live, rerenderWith, answer } = setup();
    rerenderWith(guided(live, { kind: 'comparison', version: { kind: 'opened' } }));
    await answer({
      ok: false,
      problems: [{ code: 'program-failed', message: 'The version could not be compared: boom' }],
    });
    expect(live.notify).toHaveBeenCalledWith(
      'error',
      'Could not compare with the version Claude named: The version could not be compared: boom',
    );
  });

  it('applies only in the tab the person used last', () => {
    setTabUseForTests(usedElsewhere);
    const { live, rerenderWith, compareVersion } = setup();
    rerenderWith(guided(live, { kind: 'comparison', version: { kind: 'opened' } }));
    expect(compareVersion).not.toHaveBeenCalled();
  });
});

/** The sample with a second view, to open. */
function withSecondView(): ProjectSnapshot {
  const { newer } = comparedSample();
  const [first] = newer.views;
  if (!first) throw new Error('The sample has no view.');
  return { ...newer, views: [...newer.views, { ...first, id: 'second', name: 'Second' }] };
}
