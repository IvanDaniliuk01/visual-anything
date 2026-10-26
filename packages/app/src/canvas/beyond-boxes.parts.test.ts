/**
 * The heart of `examples/beyond-boxes` as the canvas draws it (ADR 0067), as the person saw it: its
 * picture asked for large enough to be sharp, its parts' names written whole or beside them, never cut
 * and never with their component's name, and the part layer over its fourteen parts.
 */
import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { writeShapeLabels } from './draw';
import { ImageStore, sharpBucketFor, type ImagePlatform } from './images';
import { pictureOf } from './images-draw';
import { namedBeside } from './namesBeside';
import { writesNameInside } from './outlined';
import { PartLayer, partMarksOf } from './partsDraw';
import { buildScene, type ElementShape } from './scene';

const heart = () => buildScene(loadSample('beyond-boxes'), 'heart');

const labels = (shapes: readonly ElementShape[]) =>
  writeShapeLabels(shapes, true, (options) => {
    const label = new Container();
    label.label = String(options.text);
    return label;
  }).map((each) => each.label);

describe('the heart of the beyond-boxes sample', () => {
  const scene = heart();
  const drawing = scene.shapes.find((shape) => shape.key === 'heart') as ElementShape;
  const parts = scene.shapes.filter((shape) => shape.part?.inDrawing === true);

  it('is a drawing with fourteen anchored parts', () => {
    expect(drawing.picture).toBeDefined();
    expect(parts).toHaveLength(14);
  });

  it('asks for its picture at a size that keeps it sharp at full size', () => {
    const picture = pictureOf(drawing);
    expect(picture?.placement).toBe('parts');
    const side = Math.max(picture?.rect.width ?? 0, picture?.rect.height ?? 0);
    expect(side).toBeGreaterThan(512);
    expect(sharpBucketFor(side, true)).toBeGreaterThanOrEqual(side);
  });

  it('writes each part’s name whole inside it, or beside it, and never its component’s name', () => {
    for (const part of parts) {
      const written = labels([part]);
      if (writesNameInside(part)) {
        // Whole: on lines broken only between its words.
        expect(written).toHaveLength(1);
        expect(written[0]?.split('\n').join(' ')).toBe(part.name);
      } else {
        expect(written).toEqual([]);
        expect(namedBeside(part)).toBe(true);
      }
    }
    expect(labels(parts)).not.toContain('Chamber');
    expect(labels(parts)).not.toContain('Vessel');
    expect(labels(parts).length).toBeGreaterThan(0);
  });

  it('is drawn over by the part layer, part by part in its picture’s order', () => {
    const [marks] = partMarksOf(scene, new Set(), new Set());
    expect(marks?.parts.map((each) => each.shape.key)).toHaveLength(14);
    const platform = {} as ImagePlatform<never, unknown>;
    const layer = new PartLayer(new ImageStore(platform));
    layer.setScene(scene, new Set(), new Set());
    expect(layer.drawings).toBe(1);
    layer.destroy();
  });
});
