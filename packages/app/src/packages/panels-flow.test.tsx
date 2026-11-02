/**
 * Packages' panels, end to end (ADR 0089's M14.4 clarification): a real package's code runs in
 * QuickJS through the code worker's host, in this process; its panel shows in the inspector for a
 * thermometer, drawn from what its code answers about the element; its button runs the package's
 * action, whose changes wait for the person's review; and a panel whose code runs past its 50 ms
 * says so inside its section, with Show again.
 */
import {
  definitionsIn,
  packageCodeOf,
  withApproval,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Element, PackageFile } from '@visual-anything/schema';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { QuickJSWASMModule } from 'quickjs-emscripten-core';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ComparisonContext, ComparisonStore } from '../canvas/comparison/mode';
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
import { PackagePanels } from './PackagePanels';

/** Generous: the engine is slow under load. */
const PATIENCE = { timeout: 20_000 };

let engine: QuickJSWASMModule;

beforeAll(async () => {
  engine = await loadNodeEngine();
}, 60_000);

afterEach(() => {
  resetPreferencesForTests();
});

const CODE = [
  'export function panel(input, context) {',
  '  if (input.panel === "slow") { for (;;) {} }',
  '  const element = context.model.element(input.element);',
  '  return [',
  '    { kind: "heading", text: "About " + element.name },',
  '    { kind: "value", label: "Celsius", value: element.attributes.celsius },',
  '    { kind: "table", columns: ["Relation"], rows: context.model.relationsOn(input.element).map((id) => [id]) },',
  '    { kind: "chart", chart: "bar", labels: ["Now"], series: [{ name: "Celsius", values: [element.attributes.celsius] }] },',
  '    { kind: "button", label: "Cool it", action: "cool" },',
  '  ];',
  '}',
  'export function act(input) {',
  '  return {',
  '    label: "Cool " + input.selection.join(", "),',
  '    commands: input.selection.map((id) => ({',
  '      type: "update-element",',
  '      id,',
  '      changes: { attributes: { celsius: 0 } },',
  '    })),',
  '  };',
  '}',
];

/** Gauges, with a panel for thermometers, one that never ends, and the action its button runs. */
function gauges(): PackageFile {
  return {
    ...gaugesPackage(CODE, ['model:read']),
    extensions: {
      actions: [{ id: 'cool', label: 'Cool it', where: ['selection'] }],
      panels: [
        { id: 'readings', label: 'Readings', components: ['gauges.thermometer'] },
        { id: 'slow', label: 'Slow', components: ['gauges.thermometer'] },
      ],
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
}

function Harness({ project, send }: HarnessProps) {
  const [store] = useState(() => new CodeStore());
  const [comparisons] = useState(() => new ComparisonStore());
  const [changes] = useState(() => new ChangesStore());
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
    selection: { ...EMPTY_SELECTION, elements: new Set(['oven']) },
    select: () => {},
    send,
    reveal: () => {},
    code: store,
  };
  const changesHost: ChangesHost = { store: changes, show: () => {} };
  const live = { status: 'open', notify: vi.fn() } as unknown as Live;
  const oven = project.model.elements.find((each) => each.id === 'oven') as Element;
  return (
    <LiveContext value={live}>
      <ComparisonContext value={comparisons}>
        <ChangesContext value={changesHost}>
          <EditorContext.Provider value={editor}>
            <PackagePanels element={oven} />
            <PackageChangesReviewer />
            <OpenedControls />
          </EditorContext.Provider>
        </ChangesContext>
      </ComparisonContext>
    </LiveContext>
  );
}

function setUp() {
  const project = codeProject(gauges());
  const code = packageCodeOf(project.packages[0]!)!;
  changePreferences({
    codeApprovals: withApproval([], {
      hash: code.hash,
      package: 'gauges',
      capabilities: ['model:read'],
    }),
  });
  const send = vi.fn<(command: Command) => Promise<CommandResult>>(() =>
    Promise.resolve({ ok: true, created: [], warnings: [] }),
  );
  render(<Harness project={project} send={send} />);
  return { send };
}

describe('a package’s panel, run by its code', () => {
  it('is drawn from what the code answers about the element, and its button runs the package’s action into the review', async () => {
    const { send } = setUp();
    const region = screen.getByRole('region', { name: /^Readings/ });
    await within(region).findByRole('heading', { name: 'About Oven' }, PATIENCE);
    expect(within(region).getByRole('term')).toHaveTextContent('Celsius');
    expect(within(region).getByRole('definition')).toHaveTextContent('100');
    expect(
      within(within(region).getByRole('region', { name: 'About Oven' })).getByRole('cell'),
    ).toHaveTextContent('oven-in-kitchen');
    expect(
      within(region).getByRole('img', {
        name: 'Bar chart of Celsius, over 1 label. From 0 to 100.',
      }),
    ).toBeTruthy();

    fireEvent.click(within(region).getByRole('button', { name: 'Cool it' }));
    const review = await screen.findByRole(
      'region',
      { name: '“Cool oven”, from the package “Gauges”' },
      PATIENCE,
    );
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(within(review).getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0]![0]).toEqual({
      type: 'batch',
      label: 'Cool oven',
      commands: [{ type: 'update-element', id: 'oven', changes: { attributes: { celsius: 0 } } }],
    });
  }, 60_000);

  it('says inside its section that its code ran past its time, and Show again calls it again', async () => {
    setUp();
    const region = screen.getByRole('region', { name: /^Slow/ });
    const said = await within(region).findByText(
      'The code of the package "Gauges" was stopped in panel for "Slow": it ran past 50 ms.',
      {},
      PATIENCE,
    );
    expect(said).toBeTruthy();
    fireEvent.click(within(region).getByRole('button', { name: 'Show again' }));
    expect(await within(region).findByText('Asking the package’s code…')).toBeTruthy();
  }, 60_000);
});
