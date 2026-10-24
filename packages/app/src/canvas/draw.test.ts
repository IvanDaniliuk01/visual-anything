import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { writeNoteTexts, writeRelationLabels, writeShapeLabels } from './draw';
import { buildScene } from './scene';

const scene = buildScene(loadSample(), 'system-overview');
const textOf = (label: unknown) => (label as { text: string }).text;

describe('writeShapeLabels', () => {
  it('writes each element’s name and, with details, its component’s name', () => {
    const written = writeShapeLabels(scene.shapes, true).map(textOf);
    for (const shape of scene.shapes) {
      expect(written).toContain(shape.name);
      expect(written).toContain(shape.componentName);
    }
    expect(written.filter((text) => text === 'Service')).toHaveLength(2);
  });

  it('writes only the names without details', () => {
    const written = writeShapeLabels(scene.shapes, false).map(textOf);
    expect(written).toHaveLength(scene.shapes.length);
    expect(written).not.toContain('Service');
  });
});

describe('writeRelationLabels and writeNoteTexts', () => {
  it('labels the relations that have a name, and writes the notes', () => {
    expect(writeRelationLabels(scene.relations).map(textOf)).toContain('HTTPS');
    expect(writeNoteTexts(scene.notes).map(textOf)).toEqual(scene.notes.map((note) => note.text));
  });
});
