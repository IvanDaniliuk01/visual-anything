/**
 * The physical-space panel's joints (ADR 0090), on the robot-arm sample against the stand-in worker:
 * a slider for each joint it shows, named by the joint and ranged by its limits; moving one moves
 * what the joint carries in what the worker is sent, with each moved entry's motion and the arm drawn
 * piece by piece, and stores nothing; "Keep these positions" sends one batch, one action; "Back to
 * stored positions" glides back over a moment, or jumps while motion is reduced; the read-only page
 * moves the chain and keeps nothing.
 */
import type { Command, ProjectSnapshot } from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildScene } from '../canvas/scene';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { EmphasisContext, EmphasisStore } from '../editor/emphasis';
import { HoverContext, HoverStore } from '../editor/hover';
import { EMPTY_SELECTION } from '../editor/selection';
import { MotionContext } from '../scenarios/motion';
import { createSolidClient } from '../solids/client';
import type { SpaceDrawnEntry } from '../solids/protocol';
import { StandInSolidWorker } from '../solids/stand-in';
import { loadSample } from '../test/sample';
import { SpacePanelContext } from './context';
import { JOINT_GLIDE, KEEP_POSITIONS_LABEL } from './joints';
import { SpacePanel } from './SpacePanel';
import { SpacePanelStore } from './store';

const VIEW = 'structure';

function setUp(options: { reduced?: boolean; readOnly?: boolean } = {}) {
  const project: ProjectSnapshot = loadSample('robot-arm');
  const view = project.views.find((each) => each.id === VIEW);
  if (!view) throw new Error('The sample has a structure view.');
  let time = 0;
  const frames: (() => void)[] = [];
  const store = new SpacePanelStore({
    frames: { request: (callback) => frames.push(callback), cancel: () => undefined },
    windowWidth: () => 1600,
    now: () => time,
  });
  const workers: StandInSolidWorker[] = [];
  const client = createSolidClient({
    files: {
      get: () => Promise.resolve({ ok: false, code: 'solid-file-missing', message: 'No.' }),
    },
    start: () => {
      const worker = new StandInSolidWorker();
      workers.push(worker);
      return worker;
    },
  });
  const commands: Command[] = [];
  const send = vi.fn((command: Command) => {
    commands.push(command);
    return Promise.resolve({ ok: true });
  });
  const editor = {
    project,
    viewId: VIEW,
    selection: EMPTY_SELECTION,
    ...(options.readOnly ? {} : { send }),
  } as unknown as Editor;
  render(
    <MotionContext value={{ motion: options.reduced ? 'reduced' : 'full', fades: true }}>
      <EditorContext.Provider value={editor}>
        <EmphasisContext.Provider value={new EmphasisStore()}>
          <SpacePanelContext value={store}>
            <HoverContext value={new HoverStore()}>
              <SpacePanel
                id="space-panel"
                store={store}
                project={project}
                view={view}
                scene={buildScene(project, VIEW)}
                selection={EMPTY_SELECTION}
                client={client}
                readOnly={options.readOnly}
              />
            </HoverContext>
          </SpacePanelContext>
        </EmphasisContext.Provider>
      </EditorContext.Provider>
    </MotionContext>,
  );
  const tick = (ms: number) =>
    act(() => {
      time += ms;
      for (const frame of frames.splice(0)) frame();
    });
  /** The entries the worker was told last. */
  const entries = (): readonly SpaceDrawnEntry[] => {
    const worker = workers.at(-1);
    const update = worker
      ?.ofType('space/update')
      .filter((each) => 'entries' in each)
      .at(-1);
    return update?.entries ?? worker?.ofType('space/show').at(-1)?.entries ?? [];
  };
  const entry = (element: string) => entries().find((each) => each.element === element);
  return { project, store, tick, entries, entry, commands, send };
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 10; round++) await Promise.resolve();
  });
}

const joints = () => screen.getByRole('region', { name: 'Joints' });
const slider = (name: string) => within(joints()).getByRole('slider', { name });
const status = () => screen.getByRole('status');
const origin = (entry: SpaceDrawnEntry | undefined) => entry?.matrix.slice(12, 15);

describe('the joints’ sliders', () => {
  it('gives each joint the panel shows a slider, named by it, ranged by its limits, in degrees', async () => {
    const { store } = setUp();
    act(() => store.open(VIEW, {}));
    await settle();
    const toggle = within(joints()).getByRole('button', { name: '6 joints' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const shoulder = slider('Joint 2');
    expect(shoulder).toHaveAttribute('min', '-120');
    expect(shoulder).toHaveAttribute('max', '120');
    expect(shoulder).toHaveAttribute('step', '1');
    expect(shoulder).toHaveAttribute('aria-valuetext', '0°');
    expect(slider('Joint 6')).toHaveAttribute('min', '-180');
    // It closes and opens again.
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(joints()).queryByRole('slider')).toBeNull();
    fireEvent.click(toggle);
    expect(slider('Joint 2')).toBeInTheDocument();
  });

  it('moves what a joint carries as its slider moves, its motion sent with it, storing nothing', async () => {
    const { store, entry, send } = setUp();
    act(() => store.open(VIEW, {}));
    await settle();
    // At rest, nothing moves, and the arm, whose parts are joints, is drawn piece by piece.
    expect(entry('arm')?.jointed).toBe(true);
    expect(entry('gripper')?.motion).toBeUndefined();
    const gripper = origin(entry('gripper'));
    const base = origin(entry('base'));
    fireEvent.change(slider('Joint 2'), { target: { value: '40' } });
    expect(slider('Joint 2')).toHaveAttribute('aria-valuetext', '40°');
    expect(entry('gripper')?.motion).toHaveLength(16);
    expect(origin(entry('gripper'))).not.toEqual(gripper);
    expect(origin(entry('base'))).toEqual(base);
    expect(entry('base')?.motion).toBeUndefined();
    // The wrist camera, mounted on link 6, goes with it.
    expect(entry('wrist-camera')?.motion).toHaveLength(16);
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps the positions given as one batch, one action of the person’s, then lets them go', async () => {
    const { store, commands, entry } = setUp();
    act(() => store.open(VIEW, {}));
    await settle();
    const keep = within(joints()).getByRole('button', { name: 'Keep these positions' });
    expect(keep).toBeDisabled();
    fireEvent.change(slider('Joint 2'), { target: { value: '30' } });
    fireEvent.change(slider('Joint 3'), { target: { value: '-45' } });
    expect(keep).toBeEnabled();
    fireEvent.click(keep);
    await settle();
    expect(commands).toEqual([
      {
        type: 'batch',
        label: KEEP_POSITIONS_LABEL,
        commands: [
          { type: 'update-element', id: 'joint-2', changes: { attributes: { position: 30 } } },
          { type: 'update-element', id: 'joint-3', changes: { attributes: { position: -45 } } },
        ],
      },
    ]);
    expect(status()).toHaveTextContent('Kept the positions of 2 joints.');
    // Kept, the panel gives no positions of its own: it draws what the project stores.
    expect(slider('Joint 2')).toHaveAttribute('aria-valuetext', '0°');
    expect(entry('gripper')?.motion).toBeUndefined();
  });

  it('glides back to the stored positions over a moment', async () => {
    const { store, tick, entry } = setUp();
    act(() => store.open(VIEW, {}));
    await settle();
    const rest = origin(entry('gripper'));
    fireEvent.change(slider('Joint 2'), { target: { value: '60' } });
    const back = within(joints()).getByRole('button', { name: 'Back to stored positions' });
    fireEvent.click(back);
    expect(status()).toHaveTextContent('Back to the stored positions.');
    tick(JOINT_GLIDE / 2);
    const halfway = Number(slider('Joint 2').getAttribute('value'));
    expect(halfway).toBeGreaterThan(0);
    expect(halfway).toBeLessThan(60);
    tick(JOINT_GLIDE);
    expect(slider('Joint 2')).toHaveAttribute('aria-valuetext', '0°');
    expect(origin(entry('gripper'))).toEqual(rest);
    expect(back).toBeDisabled();
  });

  it('jumps back at once while motion is reduced', async () => {
    const { store, entry } = setUp({ reduced: true });
    act(() => store.open(VIEW, {}));
    await settle();
    const rest = origin(entry('gripper'));
    fireEvent.change(slider('Joint 2'), { target: { value: '60' } });
    fireEvent.click(within(joints()).getByRole('button', { name: 'Back to stored positions' }));
    expect(slider('Joint 2')).toHaveAttribute('aria-valuetext', '0°');
    expect(origin(entry('gripper'))).toEqual(rest);
  });

  it('moves the chain where nothing can be changed, and offers nothing to keep', async () => {
    const { store, entry } = setUp({ readOnly: true });
    act(() => store.open(VIEW, {}));
    await settle();
    fireEvent.change(slider('Joint 1'), { target: { value: '90' } });
    expect(entry('gripper')?.motion).toHaveLength(16);
    expect(within(joints()).queryByRole('button', { name: 'Keep these positions' })).toBeNull();
  });
});
