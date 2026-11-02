/**
 * Actions, importers and exporters of packages, end to end (ADR 0089's M14.3 clarification): a real
 * package's code runs in QuickJS through the code worker's host, in this process; "Packages…" offers
 * its actions, Import… its importer and Export… its exporter, once its code is approved. An action's
 * or an importer's changes wait for the person's review: Accept sends them as one command, which the
 * core applies as one action of the person's that Undo takes back whole; Decline sends nothing; an
 * action answering no commands says so. An exporter's text is saved as the app's own exports are.
 */
import {
  EMPTY_HISTORY,
  definitionsIn,
  executeCommand,
  packageCodeOf,
  record,
  summarize,
  undo,
  withApproval,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { PackageFile } from '@visual-anything/schema';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { QuickJSWASMModule } from 'quickjs-emscripten-core';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ComparisonContext, ComparisonStore } from '../canvas/comparison/mode';
import { buildScene } from '../canvas/scene';
import { CodeHost, type CodeWorkerLike } from '../code/client';
import { CodeStore } from '../code/context';
import { loadNodeEngine } from '../code/engine-node';
import type { CodeReply } from '../code/messages';
import { CodeRunner } from '../code/runner';
import { CodeSandbox } from '../code/sandbox';
import { codeProject, gaugesPackage } from '../code/test/project';
import { usePackageCode } from '../code/usePackageCode';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { EMPTY_SELECTION } from '../editor/selection';
import { ExportControl } from '../export/ExportControl';
import { ImageSource } from '../export/source';
import { ImportControl } from '../import/ImportControl';
import type { CommandResult } from '../live/connection';
import { LiveContext, type Live } from '../live/context';
import { changePreferences, resetPreferencesForTests } from '../theme/store';
import {
  ChangesContext,
  ChangesStore,
  useOpenedChanges,
  type ChangesHost,
} from '../versions/changes/store';
import { PackageChangesReviewer } from './PackageChangesReview';
import { PackagesControl } from './PackagesControl';

/** Generous: the engine is slow under load, and a call may take up to 2 s. */
const PATIENCE = { timeout: 20_000 };

let engine: QuickJSWASMModule;

beforeAll(async () => {
  engine = await loadNodeEngine();
}, 60_000);

afterEach(() => {
  resetPreferencesForTests();
});

const CODE = [
  'export function act(input) {',
  '  if (input.action === "nothing") return { commands: [] };',
  '  return {',
  '    label: "Check " + input.selection.join(", "),',
  '    commands: input.selection.map((id) => ({',
  '      type: "update-element",',
  '      id,',
  '      changes: { name: "Checked " + id },',
  '    })),',
  '  };',
  '}',
  'export function importFile(input) {',
  '  return {',
  '    commands: input.text.split("\\n").filter((line) => line !== "").map((name) => ({',
  '      type: "create-element",',
  '      element: { component: "gauges.thermometer", name },',
  '    })),',
  '  };',
  '}',
  'export function exportFile(input, context) {',
  '  return "view " + input.view + ": " + context.model.elements("gauges.thermometer").join(" ");',
  '}',
];

/** Gauges, with code that adds an action for thermometers, one that does nothing, an importer and an exporter. */
function gauges(): PackageFile {
  return {
    ...gaugesPackage(CODE, ['model:read']),
    extensions: {
      actions: [
        {
          id: 'check',
          label: 'Check them',
          where: ['selection', 'packages-menu'],
          components: ['gauges.thermometer'],
        },
        { id: 'nothing', label: 'Do nothing', where: ['packages-menu'] },
      ],
      importers: [{ id: 'lines', label: 'Thermometers, one a line', extensions: ['.lines'] }],
      exporters: [{ id: 'ids', label: 'Thermometer ids', extension: '.txt' }],
    },
  };
}

/** The code worker, in this process: the real runner and QuickJS, answering as a worker would. */
function inProcessWorker(): CodeWorkerLike {
  const listeners = new Set<(event: MessageEvent<CodeReply>) => void>();
  const runner = new CodeRunner({
    newSandbox: () => Promise.resolve(new CodeSandbox(engine)),
    post: (reply) => {
      setTimeout(() => {
        for (const listener of listeners) listener({ data: reply } as MessageEvent<CodeReply>);
      }, 0);
    },
  });
  return {
    postMessage: (request) => runner.receive(request),
    addEventListener: (type: 'message' | 'error', listener: unknown) => {
      if (type === 'message') listeners.add(listener as (event: MessageEvent<CodeReply>) => void);
    },
    terminate: () => {},
  };
}

/** What the Changes tab shows above a list: here, the review's Accept and Decline. */
function OpenedControls() {
  const opened = useOpenedChanges().opened;
  if (!opened) return null;
  return (
    <section aria-label={opened.title}>
      <h2>{opened.title}</h2>
      {opened.controls}
    </section>
  );
}

interface HarnessProps {
  project: ProjectSnapshot;
  send: (command: Command) => Promise<CommandResult>;
  notify: Live['notify'];
  save: (blob: Blob, name: string) => void;
}

function Harness({ project, send, notify, save }: HarnessProps) {
  const [store] = useState(() => new CodeStore());
  const [comparisons] = useState(() => new ComparisonStore());
  const [changes] = useState(() => new ChangesStore());
  const [images] = useState(() => new ImageSource());
  const [host] = useState(() => new CodeHost(inProcessWorker, { startingMs: 60_000 }));
  usePackageCode({
    store,
    project,
    viewId: 'kitchen',
    scene: undefined,
    canvas: undefined,
    makeHost: () => host,
  });
  const editor: Editor = {
    project,
    definitions: definitionsIn(project),
    viewId: 'kitchen',
    scene: undefined,
    selection: { ...EMPTY_SELECTION, elements: new Set(['oven', 'fridge']) },
    select: () => {},
    send,
    reveal: () => {},
    code: store,
  };
  const changesHost: ChangesHost = { store: changes, show: () => {} };
  const live = { status: 'open', notify } as unknown as Live;
  const view = project.views[0]!;
  return (
    <LiveContext value={live}>
      <ComparisonContext value={comparisons}>
        <ChangesContext value={changesHost}>
          <EditorContext.Provider value={editor}>
            <PackagesControl />
            <ImportControl project={project} viewId="kitchen" send={send} />
            <ExportControl
              source={images}
              projectName={project.project.name}
              viewName={view.name}
              bounds={undefined}
              save={save}
              project={project}
              drawn={{ view, scene: buildScene(project, view.id), theme: 'light' }}
            />
            <PackageChangesReviewer />
            <OpenedControls />
          </EditorContext.Provider>
        </ChangesContext>
      </ComparisonContext>
    </LiveContext>
  );
}

function setUp({ approved = true }: { approved?: boolean } = {}) {
  const project = codeProject(gauges());
  if (approved) {
    const code = packageCodeOf(project.packages[0]!)!;
    changePreferences({
      codeApprovals: withApproval([], {
        hash: code.hash,
        package: 'gauges',
        capabilities: ['model:read'],
      }),
    });
  }
  const send = vi.fn<(command: Command) => Promise<CommandResult>>(() =>
    Promise.resolve({ ok: true, created: [], warnings: [] }),
  );
  const notify = vi.fn<Live['notify']>();
  const save = vi.fn<(blob: Blob, name: string) => void>();
  render(<Harness project={project} send={send} notify={notify} save={save} />);
  return { project, send, notify, save };
}

/** Runs one of the package's actions from "Packages…". */
function runFromPackages(label: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Packages…' }));
  const dialog = screen.getByRole('dialog', { name: 'Packages' });
  const item = within(dialog).getByRole('article', { name: 'Gauges' });
  fireEvent.click(within(item).getByRole('button', { name: `Run “${label}”` }));
  // The dialog closes, so that the review shows on the canvas behind it.
  expect(screen.queryByRole('dialog', { name: 'Packages' })).toBeNull();
}

async function reviewNamed(title: string): Promise<HTMLElement> {
  return screen.findByRole('region', { name: title }, PATIENCE);
}

describe('a package’s action from Packages…', () => {
  it('runs its code, and its changes wait for review; Accept sends them as one action of the person’s', async () => {
    const { project, send } = setUp();
    runFromPackages('Check them');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Running “Check them”, of the package “Gauges”…',
    );
    const review = await reviewNamed('“Check oven, fridge”, from the package “Gauges”');
    expect(send).not.toHaveBeenCalled();
    expect(review.textContent).toContain('The package “Gauges” proposes: Check oven, fridge');
    expect(review.textContent).toContain('Accepting makes its 2 commands one action of yours');

    fireEvent.click(within(review).getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const command = send.mock.calls[0]![0];
    expect(command).toEqual({
      type: 'batch',
      label: 'Check oven, fridge',
      commands: [
        { type: 'update-element', id: 'oven', changes: { name: 'Checked oven' } },
        { type: 'update-element', id: 'fridge', changes: { name: 'Checked fridge' } },
      ],
    });
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull());

    // Applied as the local program applies it: one action of the person's, undone whole.
    const outcome = executeCommand(project, command, { author: 'user' });
    if (!outcome.ok) throw new Error('Refused');
    const history = record(EMPTY_HISTORY, {
      label: outcome.label,
      author: 'user',
      operations: outcome.operations,
      inverse: outcome.inverse,
    });
    expect(summarize(history).undo).toEqual({ label: 'Check oven, fridge', author: 'user' });
    expect(outcome.state.model.elements.find((each) => each.id === 'oven')?.name).toBe(
      'Checked oven',
    );
    expect(undo(outcome.state, history)?.state).toStrictEqual(project);
  }, 60_000);

  it('changes nothing when declined', async () => {
    const { send } = setUp();
    runFromPackages('Check them');
    const review = await reviewNamed('“Check oven, fridge”, from the package “Gauges”');
    fireEvent.click(within(review).getByRole('button', { name: 'Decline' }));
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull());
    expect(send).not.toHaveBeenCalled();
  }, 60_000);

  it('says so when the action answers no commands, and opens no review', async () => {
    const { send, notify } = setUp();
    runFromPackages('Do nothing');
    await waitFor(
      () =>
        expect(notify).toHaveBeenCalledWith(
          'info',
          '“Do nothing”, of the package “Gauges”, proposes no changes.',
        ),
      PATIENCE,
    );
    expect(screen.queryByRole('region')).toBeNull();
    expect(send).not.toHaveBeenCalled();
  }, 60_000);

  it('is not offered while the code waits for approval', () => {
    setUp({ approved: false });
    fireEvent.click(screen.getByRole('button', { name: 'Packages…' }));
    const item = within(screen.getByRole('dialog', { name: 'Packages' })).getByRole('article', {
      name: 'Gauges',
    });
    expect(within(item).queryByRole('button', { name: /^Run / })).toBeNull();
  });
});

describe('a package’s importer', () => {
  it('is offered by Import…, reads the file with its code, and its changes wait for review', async () => {
    const { send } = setUp();
    fireEvent.click(screen.getByRole('button', { name: 'Import…' }));
    const dialog = screen.getByRole('dialog', { name: 'Import' });
    const format = within(dialog).getByRole<HTMLSelectElement>('combobox', { name: 'Format' });
    expect(
      within(format).getByRole('option', {
        name: 'Thermometers, one a line (.lines), from the package “Gauges”',
      }),
    ).toBeTruthy();
    const file = within(dialog).getByLabelText<HTMLInputElement>('File');
    expect(file.accept.split(',')).toContain('.lines');
    await act(async () => {
      fireEvent.change(file, {
        target: { files: [new File(['Hob\nGrill\n'], 'more.lines')] },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Read' }));
    const review = await reviewNamed('“Thermometers, one a line”, from the package “Gauges”');
    expect(screen.queryByRole('dialog', { name: 'Import' })).toBeNull();
    fireEvent.click(within(review).getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0]![0]).toEqual({
      type: 'batch',
      label: 'Thermometers, one a line',
      commands: [
        { type: 'create-element', element: { component: 'gauges.thermometer', name: 'Hob' } },
        { type: 'create-element', element: { component: 'gauges.thermometer', name: 'Grill' } },
      ],
    });
  }, 60_000);
});

describe('a package’s exporter', () => {
  it('is offered by Export…, and the text its code writes is saved with its extension', async () => {
    const { save } = setUp();
    fireEvent.click(screen.getByRole('button', { name: 'Export…' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('radio', { name: /^Thermometer ids/ }));
    expect(dialog.textContent).toContain('Written by the package “Gauges”, as a .txt file');
    fireEvent.click(within(dialog).getByRole('button', { name: /^Save/ }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1), PATIENCE);
    const [blob, name] = save.mock.calls[0]!;
    expect(name).toBe('Kitchen - Kitchen.txt');
    expect(await blob.text()).toBe('view kitchen: oven fridge loose');
  }, 60_000);
});
