/**
 * What packages add to the menus and dialogs (ADR 0089's M14.3 clarification): actions by where
 * their files say they show and the components they are for, by derivation; importers by the
 * endings they read; exporters; and only those of approved code that runs on this computer.
 */
import {
  codeStatusOf,
  packageCodeOf,
  withApproval,
  type CodeApproval,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, PackageExtensions, PackageFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import type { PackageCodeView } from '../code/context';
import { codeProject, gaugesPackage } from '../code/test/project';
import { EMPTY_SELECTION, type Selection } from '../editor/selection';
import {
  elementPanels,
  importerFor,
  menuActions,
  offeredExporters,
  offeredImporters,
  packageImporterFor,
  selectionActions,
  selectionIds,
} from './offered';

const EXTENSIONS: PackageExtensions = {
  actions: [
    { id: 'anywhere', label: 'Anywhere', where: ['selection', 'packages-menu'] },
    { id: 'menu', label: 'Menu only', where: ['packages-menu'] },
    {
      id: 'thermometers',
      label: 'Thermometers only',
      where: ['selection'],
      components: ['gauges.thermometer'],
    },
  ],
  importers: [{ id: 'lines', label: 'Lines', extensions: ['.lines', '.csv'] }],
  exporters: [{ id: 'csv', label: 'As CSV', extension: '.csv' }],
  panels: [
    { id: 'any', label: 'Any element' },
    { id: 'readings', label: 'Readings', components: ['gauges.thermometer'] },
    { id: 'probes', label: 'Probes', components: ['gauges.oven-thermometer'] },
  ],
};

/** Gauges with a thermometer derived from the thermometer, and the actions above. */
function gauges(): PackageFile {
  const file = gaugesPackage();
  return {
    ...file,
    components: [
      ...file.components,
      {
        id: 'gauges.oven-thermometer',
        name: 'Oven thermometer',
        derivesFrom: 'gauges.thermometer',
      },
    ],
    extensions: EXTENSIONS,
  };
}

function project(): ProjectSnapshot {
  const made = codeProject(gauges());
  return {
    ...made,
    model: {
      ...made.model,
      elements: [
        ...made.model.elements,
        { id: 'probe', component: 'gauges.oven-thermometer', name: 'Probe' },
      ],
    },
  };
}

function views(
  state: ProjectSnapshot,
  how: 'approved' | 'unapproved' | 'turned-off' | 'off' = 'approved',
): Map<Id, PackageCodeView> {
  const code = packageCodeOf(state.packages[0]!)!;
  const approvals: CodeApproval[] =
    how === 'unapproved'
      ? []
      : withApproval([], { hash: code.hash, package: 'gauges', capabilities: [] });
  const view: PackageCodeView = {
    code,
    status: codeStatusOf(code, approvals),
    ...(how === 'turned-off' ? { turnedOff: true as const } : {}),
    ...(how === 'off' ? { run: { package: 'gauges', state: 'off', hooks: [], stops: 3 } } : {}),
  };
  return new Map([['gauges', view]]);
}

function selected(elements: Id[], relations: Id[] = []): Selection {
  return { ...EMPTY_SELECTION, elements: new Set(elements), relations: new Set(relations) };
}

const ids = (list: { declared: { id: string } }[]) => list.map((each) => each.declared.id);

describe('the actions offered', () => {
  it('in the canvas menu: those for the selection, by the components named or derived from them', () => {
    const state = project();
    const code = views(state);
    expect(ids(selectionActions(state, code, selected(['oven'])))).toEqual([
      'anywhere',
      'thermometers',
    ]);
    // A component derived from one named is named too.
    expect(ids(selectionActions(state, code, selected(['oven', 'probe'])))).toEqual([
      'anywhere',
      'thermometers',
    ]);
    // One element of another component, or a relation, leaves out what names components.
    expect(ids(selectionActions(state, code, selected(['oven', 'kitchen'])))).toEqual(['anywhere']);
    expect(ids(selectionActions(state, code, selected(['oven'], ['oven-in-kitchen'])))).toEqual([
      'anywhere',
    ]);
    expect(selectionActions(state, code, EMPTY_SELECTION)).toEqual([]);
  });

  it('in Packages…: those whose file says the Packages menu', () => {
    const state = project();
    expect(ids(menuActions(state, views(state)))).toEqual(['anywhere', 'menu']);
    expect(menuActions(state, views(state))[0]?.package).toEqual({ id: 'gauges', name: 'Gauges' });
  });

  it('none of code that waits for approval, is turned off here, or is off after its calls stopped', () => {
    const state = project();
    for (const how of ['unapproved', 'turned-off', 'off'] as const) {
      expect(selectionActions(state, views(state, how), selected(['oven']))).toEqual([]);
      expect(menuActions(state, views(state, how))).toEqual([]);
      expect(offeredImporters(state, views(state, how))).toEqual([]);
      expect(offeredExporters(state, views(state, how))).toEqual([]);
    }
    expect(menuActions(state, new Map())).toEqual([]);
  });

  it('are run with the selected elements, then the selected relations', () => {
    expect(selectionIds(selected(['oven', 'fridge'], ['oven-in-kitchen']))).toEqual([
      'oven',
      'fridge',
      'oven-in-kitchen',
    ]);
  });
});

describe('the importers and exporters offered', () => {
  it('are those of approved code that runs here', () => {
    const state = project();
    expect(ids(offeredImporters(state, views(state)))).toEqual(['lines']);
    expect(ids(offeredExporters(state, views(state)))).toEqual(['csv']);
  });

  it('read a file by the ending its name has, unless a built-in format reads it', () => {
    const state = project();
    const importers = offeredImporters(state, views(state));
    expect(importerFor(importers, 'Readings.LINES')?.declared.id).toBe('lines');
    expect(importerFor(importers, 'readings.txt')).toBeUndefined();
    expect(importerFor(importers, 'lines')).toBeUndefined();
    // As the file says: the package's, for an ending no built-in format reads.
    expect(packageImporterFor(importers, '', 'readings.lines')?.declared.id).toBe('lines');
    // A CSV file is the built-in spreadsheet format's, unless the package's importer is chosen.
    expect(packageImporterFor(importers, '', 'readings.csv')).toBeUndefined();
    expect(packageImporterFor(importers, 'package:gauges:lines', 'readings.csv')).toBe(
      importers[0],
    );
    expect(packageImporterFor(importers, 'mermaid', 'readings.lines')).toBeUndefined();
  });
});

describe('the panels offered for an element', () => {
  it('are those naming no components, or its component or one it derives from', () => {
    const state = project();
    const code = views(state);
    expect(ids(elementPanels(state, code, 'kitchen'))).toEqual(['any']);
    expect(ids(elementPanels(state, code, 'oven'))).toEqual(['any', 'readings']);
    // An oven thermometer derives from a thermometer.
    expect(ids(elementPanels(state, code, 'probe'))).toEqual(['any', 'readings', 'probes']);
    expect(elementPanels(state, code, 'missing')).toEqual([]);
  });

  it('carry their package and the actions it declares, which their buttons run', () => {
    const state = project();
    const [panel] = elementPanels(state, views(state), 'oven');
    expect(panel?.package).toEqual({ id: 'gauges', name: 'Gauges' });
    expect(panel?.actions.map((each) => each.id)).toEqual(['anywhere', 'menu', 'thermometers']);
  });

  it('are none of code that waits for approval, is turned off here, or is off after its calls stopped', () => {
    const state = project();
    for (const how of ['unapproved', 'turned-off', 'off'] as const) {
      expect(elementPanels(state, views(state, how), 'oven')).toEqual([]);
    }
    expect(elementPanels(state, new Map(), 'oven')).toEqual([]);
  });
});
