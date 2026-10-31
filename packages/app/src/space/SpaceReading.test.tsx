/**
 * The physical-space panel's ways of reading and Show World (ADR 0076), against the stand-in worker:
 * each control writes what the tab keeps for the view, so the worker draws it and view addresses
 * carry it; Cut across an axis, where it crosses and the side it keeps; Explode, eased in unless
 * motion is reduced; Names and Relations of the selection, pressed while on; each said aloud. The
 * read-only page's panel has them too, and Show World takes the panel from an element back to World.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildScene } from '../canvas/scene';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { EmphasisContext, EmphasisStore } from '../editor/emphasis';
import { HoverContext, HoverStore } from '../editor/hover';
import { EMPTY_SELECTION } from '../editor/selection';
import { MotionContext } from '../scenarios/motion';
import { createSolidClient } from '../solids/client';
import { StandInSolidWorker } from '../solids/stand-in';
import { workcell } from '../test/space';
import { SpacePanelContext } from './context';
import { EXPLODE_EASE } from './reading';
import { SpacePanel } from './SpacePanel';
import { SpacePanelStore } from './store';

const VIEW = 'cell-view';

function setUp(options: { reduced?: boolean; readOnly?: boolean } = {}) {
  const project = workcell();
  const view = project.views[0];
  if (!view) throw new Error('The workcell has a view.');
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
  const editor = { project, viewId: VIEW, selection: EMPTY_SELECTION } as unknown as Editor;
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
  /** The newest value of a part of what the worker was told the space shows. */
  const sent = <K extends 'cut' | 'explode' | 'names'>(key: K) => {
    const worker = workers.at(-1);
    const update = worker
      ?.ofType('space/update')
      .filter((each) => key in each)
      .at(-1);
    return update ? update[key] : worker?.ofType('space/show').at(-1)?.[key];
  };
  return { store, tick, sent };
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 10; round++) await Promise.resolve();
  });
}

const reading = () => screen.getByRole('group', { name: 'Ways of reading' });
const status = () => screen.getByRole('status');

describe('the ways of reading', () => {
  it('cut across an axis, where the slider moves it, keeping the side chosen', async () => {
    const { store, sent } = setUp();
    act(() => store.open(VIEW, {}));
    await settle();
    const cut = within(reading()).getByRole('combobox', { name: 'Cut' });
    expect(cut).toHaveValue('');
    expect(screen.queryByRole('slider', { name: /Where the cut crosses/ })).toBeNull();
    // The workcell draws from the floor to 2 m up: a new cut crosses at its middle.
    fireEvent.change(cut, { target: { value: 'y' } });
    expect(store.state(VIEW)?.cut).toEqual({ axis: 'y', at: 1, keep: 'below' });
    expect(sent('cut')).toEqual({ axis: 'y', at: 1, keep: 'below' });
    expect(status()).toHaveTextContent('Cut across Y, keeping what is below.');
    const slider = screen.getByRole('slider', { name: 'Where the cut crosses Y' });
    expect(Number(slider.getAttribute('min'))).toBeCloseTo(-0.1);
    expect(Number(slider.getAttribute('max'))).toBeCloseTo(2.1);
    expect(slider).toHaveAttribute('aria-valuetext', '1 m');
    fireEvent.change(slider, { target: { value: '0.5' } });
    expect(store.state(VIEW)?.cut?.at).toBe(0.5);
    expect(slider).toHaveAttribute('aria-valuetext', '50 cm');
    fireEvent.change(screen.getByRole('combobox', { name: 'What the cut keeps' }), {
      target: { value: 'above' },
    });
    expect(store.state(VIEW)?.cut).toEqual({ axis: 'y', at: 0.5, keep: 'above' });
    expect(status()).toHaveTextContent('Keeping what is above the cut.');
    fireEvent.change(cut, { target: { value: '' } });
    expect(store.state(VIEW)).toEqual({});
    expect(sent('cut')).toBeNull();
    expect(status()).toHaveTextContent('Not cut.');
  });

  it('explode at once while motion is reduced', async () => {
    const { store, sent } = setUp({ reduced: true });
    act(() => store.open(VIEW, {}));
    await settle();
    const slider = within(reading()).getByRole('slider', { name: 'Explode' });
    expect(slider).toHaveAttribute('aria-valuetext', 'Not exploded');
    fireEvent.change(slider, { target: { value: '1.5' } });
    expect(store.state(VIEW)).toEqual({ explode: 1.5 });
    expect(sent('explode')).toBe(1.5);
    expect(slider).toHaveAttribute('aria-valuetext', 'Exploded by 1.5');
    fireEvent.change(slider, { target: { value: '0' } });
    expect(store.state(VIEW)).toEqual({});
    expect(sent('explode')).toBe(0);
  });

  it('ease the exploded view in otherwise, keeping the factor at once', async () => {
    const { store, sent, tick } = setUp();
    act(() => store.open(VIEW, {}));
    await settle();
    fireEvent.change(within(reading()).getByRole('slider', { name: 'Explode' }), {
      target: { value: '2' },
    });
    expect(store.state(VIEW)?.explode).toBe(2);
    tick(EXPLODE_EASE / 2);
    const halfway = sent('explode');
    expect(halfway).toBeGreaterThan(0);
    expect(halfway).toBeLessThan(2);
    tick(EXPLODE_EASE);
    expect(sent('explode')).toBe(2);
  });

  it('turn Names and Relations of the selection on and off, pressed while on', async () => {
    const { store, sent } = setUp();
    act(() => store.open(VIEW, {}));
    await settle();
    const names = within(reading()).getByRole('button', { name: 'Names' });
    const relations = within(reading()).getByRole('button', { name: 'Relations of the selection' });
    expect(names).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(names);
    expect(names).toHaveAttribute('aria-pressed', 'true');
    expect(store.state(VIEW)).toEqual({ names: true });
    expect(sent('names')).toBe(true);
    expect(status()).toHaveTextContent('Names on.');
    fireEvent.click(relations);
    expect(relations).toHaveAttribute('aria-pressed', 'true');
    expect(store.state(VIEW)).toEqual({ names: true, relations: true });
    expect(status()).toHaveTextContent('Relations of the selection on.');
    fireEvent.click(names);
    expect(store.state(VIEW)).toEqual({ relations: true });
    expect(sent('names')).toBe(false);
    expect(status()).toHaveTextContent('Names off.');
  });

  it('are in the read-only page’s panel, which offers nothing that poses', async () => {
    const { store } = setUp({ readOnly: true });
    act(() => store.open(VIEW, {}));
    await settle();
    expect(within(reading()).getByRole('combobox', { name: 'Cut' })).toBeEnabled();
    fireEvent.click(within(reading()).getByRole('button', { name: 'Names' }));
    expect(store.state(VIEW)).toEqual({ names: true });
    expect(screen.queryByRole('button', { name: 'Move' })).toBeNull();
  });
});

describe('Show World', () => {
  const CAMERA = { target: { x: 0, y: 1, z: 0 }, azimuth: 30, elevation: 20, distance: 5 };

  it('takes the panel from the element it shows back to World, keeping how it reads', async () => {
    const { store } = setUp();
    act(() => store.open(VIEW, {}));
    await settle();
    expect(screen.queryByRole('button', { name: 'Show World' })).toBeNull();
    act(() =>
      store.set(VIEW, {
        root: 'arm',
        camera: CAMERA,
        cut: { axis: 'x', at: 0, keep: 'below' },
        explode: 1,
        names: true,
      }),
    );
    await settle();
    expect(screen.getByRole('region', { name: 'Physical space' })).toHaveTextContent('Shows “Arm”');
    fireEvent.click(screen.getByRole('button', { name: 'Show World' }));
    expect(store.state(VIEW)).toEqual({ explode: 1, names: true });
    expect(status()).toHaveTextContent('Shows World.');
    expect(screen.queryByRole('button', { name: 'Show World' })).toBeNull();
  });
});
