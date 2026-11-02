/**
 * Copy appearance and paste appearance (ADR 0088, A6.4): what is copied of an element or a relation,
 * that pasting is one action that makes the selection look as the copied item does, and the keys.
 */
import {
  appearanceOf,
  definitionsIn,
  executeCommand,
  relationAppearanceOf,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { selectionOf } from '../editor/selection';
import { loadSample } from '../test/sample';
import { projectDefaultCommand } from '../shell/inspector/styleTraits';
import {
  appearanceShortcut,
  appearanceToCopy,
  pasteAppearanceCommand,
  type CopiedAppearance,
} from './appearanceCopy';

const sample = loadSample();
const SOURCE = 'appointments-api';
const TARGETS = ['whatsapp', 'scheduling'];

function applied(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

function elementIn(project: ProjectSnapshot, id: string) {
  const found = project.model.elements.find((each) => each.id === id);
  if (!found) throw new Error(`No element ${id}`);
  return found;
}

/** The sample with the source styled as a person would style it in the format panel. */
const styled = applied(sample, {
  type: 'update-element',
  id: SOURCE,
  changes: {
    appearanceTraits: {
      fill: '#0F9688',
      borderWidth: 3,
      dash: 'dashed',
      shadow: 'soft',
      opacity: 0.6,
      gradient: { to: '#3E63DD', direction: 'right' },
      text: { bold: true, size: 16, align: 'left' },
      textPlacement: 'top',
    },
  },
});

function copiedFrom(project: ProjectSnapshot, ids: { elements?: string[]; relations?: string[] }) {
  const found = appearanceToCopy(
    project,
    selectionOf([
      ...(ids.elements ?? []).map((id) => ({ kind: 'element' as const, id })),
      ...(ids.relations ?? []).map((id) => ({ kind: 'relation' as const, id })),
    ]),
  );
  if ('reason' in found) throw new Error(found.reason);
  return found.copied;
}

function pasted(
  project: ProjectSnapshot,
  copied: CopiedAppearance,
  ids: { elements?: string[]; relations?: string[] },
) {
  const result = pasteAppearanceCommand(
    project,
    selectionOf([
      ...(ids.elements ?? []).map((id) => ({ kind: 'element' as const, id })),
      ...(ids.relations ?? []).map((id) => ({ kind: 'relation' as const, id })),
    ]),
    copied,
  );
  if ('reason' in result) throw new Error(result.reason);
  return result;
}

describe('copying and pasting appearance', () => {
  it('pastes every Style and Text trait of an element onto the selection, in one action', () => {
    const copied = copiedFrom(styled, { elements: [SOURCE] });
    const { command, label } = pasted(styled, copied, { elements: [SOURCE, ...TARGETS] });
    expect(command.type).toBe('batch');
    // The copied element itself is left out.
    expect(label).toBe('Paste the appearance onto 2 items');
    const project = applied(styled, command);
    const definitions = definitionsIn(project);
    const source = appearanceOf(elementIn(project, SOURCE), definitions);
    for (const id of TARGETS) {
      const target = appearanceOf(elementIn(project, id), definitions);
      expect(target.shape).toBe(source.shape);
      expect([target.fill, target.stroke]).toEqual([source.fill, source.stroke]);
      expect(target.borderWidth).toBe(3);
      expect(target.dash).toBe('dashed');
      expect(target.shadow).toBe('soft');
      expect(target.opacity).toBe(0.6);
      expect(target.gradient).toEqual({ to: '#3E63DD', direction: 'right' });
      expect(target.text).toEqual({ bold: true, size: 16, align: 'left' });
      expect(target.textPlacement).toBe('top');
    }
  });

  it('takes away what the copied item leaves to the drawing defaults', () => {
    const target = applied(styled, {
      type: 'update-element',
      id: 'whatsapp',
      changes: { appearanceTraits: { cornerRadius: 12, text: { italic: true } } },
    });
    const copied = copiedFrom(target, { elements: [SOURCE] });
    const project = applied(target, pasted(target, copied, { elements: ['whatsapp'] }).command);
    const look = appearanceOf(elementIn(project, 'whatsapp'), definitionsIn(project));
    expect(look.cornerRadius).toBeUndefined();
    expect(look.text.italic).toBeUndefined();
    expect(look.text.bold).toBe(true);
  });

  it('keeps what was copied, whatever the copied item becomes', () => {
    const copied = copiedFrom(styled, { elements: [SOURCE] });
    const changed = applied(styled, {
      type: 'update-element',
      id: SOURCE,
      changes: { appearanceTraits: { borderWidth: 9 } },
    });
    const project = applied(changed, pasted(changed, copied, { elements: ['whatsapp'] }).command);
    expect(appearanceOf(elementIn(project, 'whatsapp'), definitionsIn(project)).borderWidth).toBe(
      3,
    );
  });

  it('pastes a relation’s line onto relations, and the stroke, dash and opacity across', () => {
    const [first, second] = sample.model.relations;
    if (!first || !second) throw new Error('The sample has too few relations');
    const lined = applied(sample, {
      type: 'update-relation',
      id: first.id,
      changes: { appearanceTraits: { stroke: '#E5484D', width: 3, dash: 'dotted', opacity: 0.5 } },
    });
    const copied = copiedFrom(lined, { relations: [first.id] });
    const { command, label } = pasted(lined, copied, {
      relations: [second.id],
      elements: ['whatsapp'],
    });
    expect(label).toBe('Paste the appearance onto 2 items');
    const project = applied(lined, command);
    const definitions = definitionsIn(project);
    const line = relationAppearanceOf(
      project.model.relations.find((each) => each.id === second.id) as typeof second,
      definitions,
    );
    expect(line).toMatchObject({ stroke: '#E5484D', width: 3, dash: 'dotted', opacity: 0.5 });
    const shape = appearanceOf(elementIn(project, 'whatsapp'), definitionsIn(project));
    expect([shape.stroke, shape.dash, shape.opacity]).toEqual(['#E5484D', 'dotted', 0.5]);
  });

  it('says why it copies or pastes nothing', () => {
    expect(appearanceToCopy(sample, selectionOf([]))).toEqual({
      reason: 'Select one element or one relation to copy its appearance.',
    });
    expect(
      appearanceToCopy(
        sample,
        selectionOf(TARGETS.map((id) => ({ kind: 'element' as const, id }))),
      ),
    ).toHaveProperty('reason');
    expect(
      pasteAppearanceCommand(sample, selectionOf([{ kind: 'element', id: SOURCE }]), undefined),
    ).toEqual({ reason: 'Copy the appearance of an element or a relation first.' });
    const copied = copiedFrom(styled, { elements: [SOURCE] });
    expect(
      pasteAppearanceCommand(styled, selectionOf([{ kind: 'element', id: SOURCE }]), copied),
    ).toHaveProperty('reason');
  });
});

describe('the keys', () => {
  const press = (code: string, mods: Partial<Record<'ctrl' | 'meta' | 'alt' | 'shift', boolean>>) =>
    appearanceShortcut({
      code,
      ctrlKey: mods.ctrl ?? false,
      metaKey: mods.meta ?? false,
      altKey: mods.alt ?? false,
      shiftKey: mods.shift ?? false,
    });

  it('copies with Ctrl+Alt+C and pastes with Ctrl+Alt+V, or ⌥⌘ on Apple’s keyboards', () => {
    expect(press('KeyC', { ctrl: true, alt: true })).toBe('copy');
    expect(press('KeyV', { ctrl: true, alt: true })).toBe('paste');
    expect(press('KeyV', { meta: true, alt: true })).toBe('paste');
    expect(press('KeyC', { ctrl: true })).toBeUndefined();
    expect(press('KeyC', { alt: true })).toBeUndefined();
    expect(press('KeyC', { ctrl: true, alt: true, shift: true })).toBeUndefined();
  });
});

describe('the project’s default', () => {
  it('takes the parts of the text an element sets, each on its own', () => {
    const command = projectDefaultCommand(elementIn(styled, SOURCE));
    expect(command).toMatchObject({
      type: 'set-component-appearance',
      component: 'essence',
      appearanceTraits: { borderWidth: 3, text: { bold: true, size: 16, align: 'left' } },
    });
    const project = applied(styled, command as Command);
    const other = appearanceOf(elementIn(project, 'whatsapp'), definitionsIn(project));
    expect(other.text.bold).toBe(true);
  });
});
