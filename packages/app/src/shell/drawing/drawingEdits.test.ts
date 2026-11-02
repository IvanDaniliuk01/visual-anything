/**
 * What the Drawing panel edits (A5.4, ADR 0086): where each value shown comes from, the preset, the
 * project or the view, and the one command each change makes, the layer's whole drawing written.
 */
import {
  DRAWING_GROUPS,
  DRAWING_PRESETS,
  DRAWING_PRESET_IDS,
  DRAWING_VALUES,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { untranslatedParts } from '../../i18n/translate';
import { loadSample } from '../../test/sample';
import {
  countSetIn,
  drawingCommand,
  layersOf,
  presetSourceOf,
  shownDrawing,
  sourceOf,
  viewChanges,
  withPreset,
  withValue,
  withoutGroup,
  withoutValue,
  type DrawingLayers,
} from './drawingEdits';
import { CHOICE_NAMES, GROUP_NAMES, PRESET_NAMES, PRESET_NOTES, VALUE_NAMES } from './drawingNames';

const sample = loadSample();
const VIEW = 'system-overview';

function run(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

function layers(project: DrawingLayers['project'], view: DrawingLayers['view']): DrawingLayers {
  return { project, viewId: VIEW, view };
}

describe('where a value comes from', () => {
  it('is the preset while neither layer sets it', () => {
    const none = layers(undefined, undefined);
    expect(sourceOf(none, 'project', 'lines', 'width')).toBe('preset');
    expect(sourceOf(none, 'view', 'lines', 'width')).toBe('preset');
    expect(presetSourceOf(none, 'view')).toBe('preset');
    expect(shownDrawing(none, 'view').lines.width).toBe(DRAWING_PRESETS.clean.lines.width);
  });

  it('is the project for what it sets, in both scopes, and the view for what the view sets', () => {
    const both = layers(
      { preset: 'dense', lines: { width: 3 } },
      { lines: { cornerRadius: 4 }, text: { nameSize: 20 } },
    );
    expect(sourceOf(both, 'project', 'lines', 'width')).toBe('project');
    expect(sourceOf(both, 'view', 'lines', 'width')).toBe('project');
    expect(sourceOf(both, 'view', 'lines', 'cornerRadius')).toBe('view');
    // In the project's scope, what the view sets is the preset's for the project.
    expect(sourceOf(both, 'project', 'lines', 'cornerRadius')).toBe('preset');
    expect(viewChanges(both, 'lines', 'cornerRadius')).toBe(true);
    expect(viewChanges(both, 'lines', 'width')).toBe(false);
    expect(presetSourceOf(both, 'view')).toBe('project');
    expect(shownDrawing(both, 'project')).toMatchObject({
      preset: 'dense',
      lines: { width: 3, cornerRadius: DRAWING_PRESETS.dense.lines.cornerRadius },
    });
    expect(shownDrawing(both, 'view')).toMatchObject({
      lines: { width: 3, cornerRadius: 4 },
      text: { nameSize: 20 },
    });
  });

  it('leaves the project out for a view with a preset of its own', () => {
    const own = layers({ lines: { width: 3 } }, { preset: 'expressive' });
    expect(sourceOf(own, 'view', 'lines', 'width')).toBe('preset');
    expect(presetSourceOf(own, 'view')).toBe('view');
    expect(shownDrawing(own, 'view').lines.width).toBe(DRAWING_PRESETS.expressive.lines.width);
  });

  it('counts what a layer sets in a group', () => {
    expect(countSetIn({ lines: { width: 1, color: 'neutral' } }, 'lines')).toBe(2);
    expect(countSetIn({ lines: { width: 1 } }, 'text')).toBe(0);
    expect(countSetIn(undefined, 'lines')).toBe(0);
  });
});

describe('the command a change makes', () => {
  it('writes the project’s whole drawing with a value set, and no view', () => {
    const now = layersOf(sample, VIEW);
    const project = { preset: 'dense' as const, text: { nameSize: 16 } };
    const set = drawingCommand(
      layers(project, undefined),
      'project',
      withValue(project, 'lines', 'width', 2.5),
    );
    expect(set).toEqual({
      type: 'set-drawing-defaults',
      drawing: { preset: 'dense', lines: { width: 2.5 }, text: { nameSize: 16 } },
    });
    const done = run(sample, drawingCommand(now, 'project', { lines: { width: 2.5 } }) as Command);
    expect(done.project.drawing).toEqual({ lines: { width: 2.5 } });
    expect(done.views.find((each) => each.id === VIEW)?.drawing).toBeUndefined();
  });

  it('writes the open view’s whole drawing for “This view only”', () => {
    const now = layersOf(sample, VIEW);
    const command = drawingCommand(now, 'view', withValue(undefined, 'grid', 'look', 'dots'));
    expect(command).toEqual({
      type: 'set-drawing-defaults',
      view: VIEW,
      drawing: { grid: { look: 'dots' } },
    });
    const done = run(sample, command as Command);
    expect(done.views.find((each) => each.id === VIEW)?.drawing).toEqual({
      grid: { look: 'dots' },
    });
    expect(done.project.drawing).toBeUndefined();
  });

  it('resets a value, a group and everything, and goes back to null when nothing is left', () => {
    const view = { preset: 'dense' as const, lines: { width: 3, color: 'neutral' as const } };
    const now = layers(undefined, view);
    expect(drawingCommand(now, 'view', withoutValue(view, 'lines', 'width'))).toEqual({
      type: 'set-drawing-defaults',
      view: VIEW,
      drawing: { preset: 'dense', lines: { color: 'neutral' } },
    });
    expect(drawingCommand(now, 'view', withoutGroup(view, 'lines'))).toEqual({
      type: 'set-drawing-defaults',
      view: VIEW,
      drawing: { preset: 'dense' },
    });
    expect(drawingCommand(now, 'view', null)).toEqual({
      type: 'set-drawing-defaults',
      view: VIEW,
      drawing: null,
    });
    const last = { lines: { width: 3 } };
    expect(
      drawingCommand(layers(last, undefined), 'project', withoutValue(last, 'lines', 'width')),
    ).toEqual({
      type: 'set-drawing-defaults',
      drawing: null,
    });
  });

  it('changes the preset and keeps the values the layer sets', () => {
    const project = { lines: { width: 3 } };
    expect(
      drawingCommand(layers(project, undefined), 'project', withPreset(project, 'expressive')),
    ).toEqual({
      type: 'set-drawing-defaults',
      drawing: { preset: 'expressive', lines: { width: 3 } },
    });
    const view = { preset: 'dense' as const };
    expect(drawingCommand(layers(undefined, view), 'view', withPreset(view, undefined))).toEqual({
      type: 'set-drawing-defaults',
      view: VIEW,
      drawing: null,
    });
  });

  it('makes none when nothing changes, whatever the order of the keys', () => {
    const project = { text: { nameSize: 14, padding: 9 }, lines: { width: 3 } };
    expect(
      drawingCommand(
        layers(project, undefined),
        'project',
        withValue(project, 'lines', 'width', 3),
      ),
    ).toBeUndefined();
    expect(
      drawingCommand(layers(project, undefined), 'project', {
        lines: { width: 3 },
        text: { padding: 9, nameSize: 14 },
      }),
    ).toBeUndefined();
    expect(drawingCommand(layers(undefined, undefined), 'project', null)).toBeUndefined();
    expect(
      drawingCommand({ project: undefined, viewId: undefined, view: undefined }, 'view', {
        grid: { look: 'dots' },
      }),
    ).toBeUndefined();
  });
});

describe('the names the panel shows', () => {
  it('name every preset, group, value and choice, each with its Spanish', () => {
    const texts: string[] = [];
    for (const preset of DRAWING_PRESET_IDS) texts.push(PRESET_NAMES[preset], PRESET_NOTES[preset]);
    for (const group of DRAWING_GROUPS) {
      texts.push(GROUP_NAMES[group]);
      for (const [name, rule] of Object.entries(DRAWING_VALUES[group])) {
        const named = VALUE_NAMES[group][name];
        expect(named, `${group}.${name}`).toBeDefined();
        texts.push(named?.name ?? '', ...(named?.note === undefined ? [] : [named.note]));
        if (rule.kind === 'choice' && typeof rule.choices[0] !== 'boolean') {
          for (const choice of rule.choices) {
            const choiceName = CHOICE_NAMES[group]?.[name]?.[String(choice)];
            expect(choiceName, `${group}.${name} ${String(choice)}`).toBeDefined();
            texts.push(choiceName ?? '');
          }
        }
      }
      expect(Object.keys(VALUE_NAMES[group]).sort()).toEqual(
        Object.keys(DRAWING_VALUES[group]).sort(),
      );
    }
    expect(texts.flatMap((text) => untranslatedParts('es', text))).toEqual([]);
  });
});
