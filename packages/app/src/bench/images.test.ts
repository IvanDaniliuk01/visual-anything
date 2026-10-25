import { IMAGE_CAPS, SVG_CAPS, checkProject, imagesIn, isClean } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { buildScene } from '../canvas/scene';
import { SYNTHETIC_IMAGES, syntheticImagePackages } from './images';
import { syntheticProject } from './synthetic';

describe('the benchmark’s "images" variant', () => {
  const project = syntheticProject({ elements: 10_000, images: true });
  const scene = buildScene(project, 'everything');

  it('keeps 10,000 shapes and the rules, its pictures stored as the core cleans them', () => {
    expect(project.model.elements).toHaveLength(10_000);
    const check = checkProject(project);
    expect(check.errors).toEqual([]);
    expect(check.warnings.filter((each) => each.code.startsWith('image'))).toEqual([]);
    for (const file of syntheticImagePackages()) {
      expect(file.images?.length).toBeLessThanOrEqual(IMAGE_CAPS.perPackage);
      for (const image of file.images ?? []) expect(isClean(image)).toBe(true);
    }
  });

  it('shows 20 distinct SVG icons and 300 distinct bitmaps as drawings, all drawn', () => {
    const catalog = imagesIn(project);
    expect(catalog.pastTotal.size).toBe(0);
    const icons = new Set<number>();
    const photos = new Set<number>();
    for (const shape of scene.shapes) {
      if (!shape.image) continue;
      if (shape.image.image.kind === 'svg') icons.add(shape.image.serial);
      else {
        photos.add(shape.image.serial);
        expect(shape.image.placement).toBe('drawing');
      }
    }
    expect(icons.size).toBe(SYNTHETIC_IMAGES.icons);
    expect(photos.size).toBe(SYNTHETIC_IMAGES.photos);
  });

  it('holds four icons at the cleaner’s caps on drawing cost', () => {
    const [elements, path, gradients, masks] = (syntheticImagePackages()[0]?.images ?? []).map(
      (image) => (image.kind === 'svg' ? image.svg : ''),
    );
    expect((elements ?? '').length).toBeGreaterThan(SVG_CAPS.output * 0.8);
    expect((path?.match(/[hv]/g) ?? []).length).toBeGreaterThan(SVG_CAPS.pathCommands * 0.95);
    expect(gradients?.match(/<linearGradient/g)).toHaveLength(SVG_CAPS.gradients);
    expect(gradients?.match(/<stop/g)).toHaveLength(SVG_CAPS.gradients * SVG_CAPS.stopsPerGradient);
    expect((masks?.match(/<mask/g)?.length ?? 0) + (masks?.match(/<clipPath/g)?.length ?? 0)).toBe(
      SVG_CAPS.clipsAndMasks,
    );
  });

  it('is the same every time', () => {
    expect(syntheticProject({ elements: 400, images: true })).toEqual(
      syntheticProject({ elements: 400, images: true }),
    );
  });
});
