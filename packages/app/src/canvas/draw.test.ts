import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { drawScene } from './draw';
import { buildScene } from './scene';

describe('drawScene', () => {
  const scene = buildScene(loadSample(), 'system-overview');
  const drawn = drawScene(scene);
  const written = drawn.texts.map((text) => text.text);

  it('writes each element’s name and its component’s name', () => {
    for (const shape of scene.shapes) {
      expect(written).toContain(shape.name);
      expect(written).toContain(shape.componentName);
    }
    expect(written.filter((text) => text === 'Service')).toHaveLength(2);
  });

  it('labels the relations that have a name, and writes the notes', () => {
    expect(written).toContain('HTTPS');
    expect(written).toContain(scene.notes[0]?.text);
  });

  it('draws everything into one container', () => {
    expect(drawn.content.children.length).toBeGreaterThan(drawn.texts.length);
    for (const text of drawn.texts) expect(text.parent).toBe(drawn.content);
  });
});
