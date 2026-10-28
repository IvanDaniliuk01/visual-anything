import { MAX_VIEW_STATE_IDS, readViewState, writeViewState } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { ALL_DEGREES, NO_FILTERS } from '../canvas/explore';
import { UNEXPLORED } from '../canvas/useExplorer';
import { EMPTY_SELECTION, selectionOf } from '../editor/selection';
import { loadSample } from '../test/sample';
import { cameraFor, cameraOf, focusFrom, selectionFrom, viewStateOf } from './state';

const sample = loadSample();
const VIEW = 'system-overview';

describe('cameraOf and cameraFor', () => {
  const viewport = { width: 800, height: 600 };

  it('keep the point at the middle of the canvas and the zoom, whatever the window', () => {
    const camera = { x: 100, y: 50, scale: 2 };
    const kept = cameraOf(camera, viewport);
    expect(kept).toEqual({ x: 150, y: 125, zoom: 2 });
    const wider = cameraFor(kept ?? { x: 0, y: 0, zoom: 1 }, { width: 1200, height: 600 });
    expect(wider).toEqual({ x: 300, y: 50, scale: 2 });
  });

  it('round the camera so that an address stays short', () => {
    expect(cameraOf({ x: 0.123456, y: -0.987654, scale: 0.333333333 }, viewport)).toEqual({
      x: 1199.6,
      y: 903,
      zoom: 0.3333,
    });
  });

  it('give nothing for a canvas that has no size yet', () => {
    expect(cameraOf({ x: 0, y: 0, scale: 1 }, { width: 0, height: 0 })).toBeUndefined();
  });

  it('zoom no further than the canvas does', () => {
    expect(cameraFor({ x: 0, y: 0, zoom: 500 }, viewport).scale).toBe(8);
  });
});

describe('viewStateOf', () => {
  it('holds only the view when nothing else is set', () => {
    expect(
      viewStateOf({ project: sample, viewId: VIEW, selection: EMPTY_SELECTION, ...UNEXPLORED }),
    ).toEqual({ state: { view: VIEW }, selectionLeftOut: false });
  });

  it('holds the camera, the selection, the filters that apply, focus and the scenario’s step', () => {
    const selection = selectionOf([
      { kind: 'element', id: 'appointments-api' },
      { kind: 'relation', id: 'agent-to-api' },
    ]);
    const { state } = viewStateOf({
      project: sample,
      viewId: VIEW,
      camera: { x: 10, y: 20, zoom: 1.5 },
      selection,
      filters: {
        components: new Set(['systems.person']),
        relationTypes: new Set(),
        conditions: [
          { of: 'elements', attribute: 'owner', test: 'is', value: 'Scheduling team' },
          // Not complete yet, so it applies nothing and is left out.
          { of: 'elements', attribute: 'engine', test: 'is', value: '' },
          // Set takes no value, whatever was typed before the test changed.
          { of: 'relations', attribute: 'protocol', test: 'set', value: 'left over' },
        ],
      },
      focus: {
        on: true,
        targets: { elements: selection.elements, relations: selection.relations },
        degrees: ALL_DEGREES,
        direction: 'outgoing',
        isolate: true,
      },
      scenario: { id: 'patient-books-appointment', step: 1 },
    });
    expect(state).toEqual({
      view: VIEW,
      camera: { x: 10, y: 20, zoom: 1.5 },
      select: ['appointments-api', 'agent-to-api'],
      filters: {
        components: ['systems.person'],
        relationTypes: [],
        conditions: [
          { of: 'elements', attribute: 'owner', test: 'is', value: 'Scheduling team' },
          { of: 'relations', attribute: 'protocol', test: 'set', value: '' },
        ],
      },
      // It starts from the selection, so it names no ids of its own.
      focus: { degrees: 'all', direction: 'outgoing', isolate: true },
      scenario: 'patient-books-appointment',
      step: sample.scenarios[0]?.steps[1]?.id,
    });
    expect(readViewState(writeViewState(state))).toEqual({ ok: true, state });
  });

  it('holds the time range of the filters, alone or beside the rest', () => {
    const range = {
      of: 'elements' as const,
      attribute: 'sizeGb',
      kind: 'number' as const,
      from: 2,
      to: 20,
    };
    const { state } = viewStateOf({
      project: sample,
      viewId: VIEW,
      selection: EMPTY_SELECTION,
      ...UNEXPLORED,
      filters: { ...NO_FILTERS, range },
    });
    expect(state).toEqual({
      view: VIEW,
      filters: { components: [], relationTypes: [], conditions: [], range },
    });
    expect(readViewState(writeViewState(state))).toEqual({ ok: true, state });
    const period = { ...range, attribute: 'opened', until: 'closed', kind: 'date' as const };
    const beside = viewStateOf({
      project: sample,
      viewId: VIEW,
      selection: EMPTY_SELECTION,
      ...UNEXPLORED,
      filters: { ...NO_FILTERS, components: new Set(['systems.person']), range: period },
    }).state;
    expect(beside.filters).toEqual({
      components: ['systems.person'],
      relationTypes: [],
      conditions: [],
      range: period,
    });
  });

  it('leaves out a time range an address cannot hold, keeping the other filters', () => {
    const { state } = viewStateOf({
      project: sample,
      viewId: VIEW,
      selection: EMPTY_SELECTION,
      ...UNEXPLORED,
      filters: {
        ...NO_FILTERS,
        components: new Set(['systems.person']),
        range: { of: 'elements', attribute: 'a'.repeat(201), kind: 'number', from: 0, to: 1 },
      },
    });
    expect(state.filters).toEqual({
      components: ['systems.person'],
      relationTypes: [],
      conditions: [],
    });
  });

  it('names what focus starts from when it is not the selection', () => {
    const { state } = viewStateOf({
      project: sample,
      viewId: VIEW,
      selection: EMPTY_SELECTION,
      filters: NO_FILTERS,
      focus: {
        on: true,
        targets: { elements: new Set(['patient']), relations: new Set() },
        degrees: 2,
        direction: 'both',
        isolate: false,
      },
    });
    expect(state.focus).toEqual({
      degrees: 2,
      direction: 'both',
      isolate: false,
      from: ['patient'],
    });
  });

  it('leaves out a scenario whose first step it is on, and one that plays over another view', () => {
    const at = (step: number, viewId = VIEW) =>
      viewStateOf({
        project: sample,
        viewId,
        selection: EMPTY_SELECTION,
        ...UNEXPLORED,
        scenario: { id: 'patient-books-appointment', step },
      }).state;
    expect(at(0)).toEqual({ view: VIEW, scenario: 'patient-books-appointment' });
    expect(at(1, 'another-view')).toEqual({ view: 'another-view' });
  });

  // ADR 0078: the alternatives the tab chose, so that the address opens the step in them.
  it('holds the alternatives the tab chose at the scenario’s decisions, only when it chose some', () => {
    const at = (choices: Record<string, string>) =>
      viewStateOf({
        project: sample,
        viewId: VIEW,
        selection: EMPTY_SELECTION,
        ...UNEXPLORED,
        scenario: { id: 'patient-books-appointment', step: 5, choices },
      }).state;
    expect(at({ 'free-slot': 'week-full' })).toEqual({
      view: VIEW,
      scenario: 'patient-books-appointment',
      step: 'join-waiting-list',
      choices: { 'free-slot': 'week-full' },
    });
    expect(at({})).toEqual({
      view: VIEW,
      scenario: 'patient-books-appointment',
      step: 'join-waiting-list',
    });
    // A choice the scenario does not have is never written.
    expect(at({ gone: 'x' })).not.toHaveProperty('choices');
  });

  it('leaves out a selection too large for an address, and says so', () => {
    const ids = Array.from({ length: MAX_VIEW_STATE_IDS + 1 }, (_, n) => `e${n}`);
    const selection = selectionOf(ids.map((id) => ({ kind: 'element', id })));
    expect(viewStateOf({ project: sample, viewId: VIEW, selection, ...UNEXPLORED })).toEqual({
      state: { view: VIEW },
      selectionLeftOut: true,
    });
  });
});

describe('selectionFrom', () => {
  it('selects the elements, relations and free shapes it names, and lists what is not there', () => {
    const view = sample.views[0];
    const note = view?.freeShapes[0]?.id;
    const ids = ['patient', 'agent-to-api', ...(note ? [note] : []), 'ghost'];
    const { selection, missing } = selectionFrom(sample, view, ids);
    expect([...selection.elements]).toEqual(['patient']);
    expect([...selection.relations]).toEqual(['agent-to-api']);
    expect([...selection.freeShapes]).toEqual(note ? [note] : []);
    expect(missing).toEqual(['ghost']);
  });
});

describe('focusFrom', () => {
  it('starts from the ids it names, or else from the selection', () => {
    const selection = selectionOf([{ kind: 'element', id: 'patient' }]);
    expect(
      focusFrom(sample, { degrees: 'all', direction: 'both', isolate: true }, selection),
    ).toEqual({
      targets: { elements: new Set(['patient']), relations: new Set() },
      settings: { degrees: ALL_DEGREES, direction: 'both', isolate: true },
    });
    expect(
      focusFrom(
        sample,
        { degrees: 3, direction: 'incoming', isolate: false, from: ['agent-to-api'] },
        selection,
      ).targets,
    ).toEqual({ elements: new Set(), relations: new Set(['agent-to-api']) });
  });
});
