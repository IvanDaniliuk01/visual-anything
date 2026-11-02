/**
 * Clean, the default look, and the other presets (A5.2, ADR 0086): what each new drawing puts in the
 * scene and the SVG — neutral lines whose built-in colors and widths yield to the drawing defaults,
 * regions with their name tab, the count on a collapsed container, the count badge, the person, the
 * soft shadow — and what the pointer and the selection change of neutral lines.
 */
import { DRAWING_PRESETS, type ProjectSnapshot } from '@visual-anything/core';
import type { DrawingDefaults, DrawingPreset } from '@visual-anything/schema';
import { Graphics, type CanvasTextOptions } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { writeSvg } from '../export/svg';
import { collapsedSample, SAMPLE_VIEW } from '../test/exports';
import { loadSample } from '../test/sample';
import { THEMES } from '../theme/themes';
import { countText } from './collapse';
import { drawShapeOutlines, writeRelationLabels, writeShapeLabels, type TextFactory } from './draw';
import { BASE_DRAWING, SOFT_SHADOW } from './drawing';
import { bodyOf, holdsPoint, personFigure, personLabelTop, type Rect } from './geometry';
import { GridMarks, MAX_GRID_DOTS } from './gridMarks';
import { accentsOf, FADED_OTHERS, MOST_ACCENTED } from './lineAccents';
import { legendSubtitle } from './overlays/legendText';
import { relationTypesLegend, RELATION_TYPES_LEGEND } from './overlays/relationLegend';
import { translatorFor } from '../i18n';
import { definitionsIn } from '@visual-anything/core';
import { LIGHT_REGION, regionColorsOf, regionFillOf } from './regionDraw';
import {
  buildSceneAfresh,
  containerHeaderOf,
  drawingOfScene,
  MOST_SHADOWED,
  withinShadows,
  type ElementShape,
  type RelationLine,
  type Scene,
} from './scene';

const LIGHT = THEMES.light.canvas;
const DARK = THEMES.dark.canvas;

/** A project drawn from a preset, or with drawing defaults of its own. */
function drawnWith(base: ProjectSnapshot, drawing: DrawingDefaults): ProjectSnapshot {
  return { ...base, project: { ...base.project, drawing } };
}

function preset(base: ProjectSnapshot, name: DrawingPreset): ProjectSnapshot {
  return drawnWith(base, { preset: name });
}

function lineOfType(scene: Scene, project: ProjectSnapshot, type: string): RelationLine {
  const ids = new Set(
    project.model.relations
      .filter((relation) => relation.relationType === type)
      .map((each) => each.id),
  );
  const line = scene.relations.find((each) => ids.has(each.relation));
  if (!line) throw new Error(`No line of ${type}.`);
  return line;
}

function shapeOf(scene: Scene, key: string): ElementShape {
  const shape = scene.shapes.find((each) => each.key === key);
  if (!shape) throw new Error(`No shape ${key}.`);
  return shape;
}

function readSvg(text: string): Document {
  return new DOMParser().parseFromString(text, 'image/svg+xml');
}

const COMMUNICATES = 'systems.communicates-with';
const CLINIC = 'clinic-booking';
const SCHEDULING = 'clinic-booking/scheduling';

describe('Clean, the look of a project that names no preset (A5.2)', () => {
  it('is the Clean preset', () => {
    expect(BASE_DRAWING).toEqual(DRAWING_PRESETS.clean);
  });

  it('draws a built-in relation type in the neutral color, at the drawing’s width, keeping its color for hover', () => {
    const sample = loadSample();
    const line = lineOfType(buildSceneAfresh(sample, SAMPLE_VIEW), sample, COMMUNICATES);
    expect(line.stroke).toBe(LIGHT.neutralLine);
    expect(line.darkStroke).toBe(DARK.neutralLine);
    expect(line.width).toBe(DRAWING_PRESETS.clean.lines.width);
    // Systems draws "communicates with" in #3D4651, 2 wide: both yield, the color kept for hover.
    expect(line.typeStroke?.light).toBe('#3D4651');
  });

  it('keeps a color and a width a project appearance gives, and a relation’s own color', () => {
    const sample = loadSample();
    const appearances = {
      ...sample.project.appearances,
      relationTypes: { [COMMUNICATES]: { stroke: '#AA2200', width: 3 } },
    };
    const project = { ...sample, project: { ...sample.project, appearances } };
    const line = lineOfType(buildSceneAfresh(project, SAMPLE_VIEW), project, COMMUNICATES);
    expect(line.stroke).toBe('#AA2200');
    expect(line.width).toBe(3);
    expect(line.typeStroke).toBeUndefined();

    const [first] = sample.model.relations.filter((each) => each.relationType === COMMUNICATES);
    if (!first) throw new Error('No relation.');
    const own = {
      ...sample,
      model: {
        ...sample.model,
        relations: sample.model.relations.map((each) =>
          each.id === first.id ? { ...each, appearance: { stroke: '#008844' } } : each,
        ),
      },
    };
    const mine = buildSceneAfresh(own, SAMPLE_VIEW).relations.find(
      (each) => each.relation === first.id,
    );
    expect(mine?.stroke).toBe('#008844');
    expect(mine?.typeStroke).toBeUndefined();
    // Its width still yields: only its color is its own.
    expect(mine?.width).toBe(DRAWING_PRESETS.clean.lines.width);
  });

  it('keeps a relation type’s dash, which carries meaning', () => {
    const sample = loadSample();
    const scene = buildSceneAfresh(sample, SAMPLE_VIEW);
    const dashed = scene.relations.filter((line) => line.dash !== 'solid');
    expect(dashed.length).toBeGreaterThan(0);
    for (const line of dashed) expect(line.typeStroke).toBeDefined();
  });

  it('draws lines by their type’s color in Dense, Expressive and High contrast, at each one’s width', () => {
    const sample = loadSample();
    for (const name of ['dense', 'expressive', 'high-contrast'] as const) {
      const project = preset(sample, name);
      const line = lineOfType(buildSceneAfresh(project, SAMPLE_VIEW), project, COMMUNICATES);
      expect(line.stroke).toBe('#3D4651');
      expect(line.typeStroke).toBeUndefined();
      expect(line.width).toBe(DRAWING_PRESETS[name].lines.width);
    }
  });
});

describe('a container drawn as a region (A5.2)', () => {
  it('is an open container in Clean, Dense and High contrast, and never in Expressive', () => {
    const sample = loadSample();
    for (const name of ['clean', 'dense', 'high-contrast', 'expressive'] as const) {
      const scene = buildSceneAfresh(preset(sample, name), SAMPLE_VIEW);
      expect(shapeOf(scene, CLINIC).region).toBe(name === 'expressive' ? undefined : true);
      // A shape that holds nothing never is one.
      expect(scene.shapes.filter((shape) => !shape.holdsContents).some((s) => s.region)).toBe(
        false,
      );
    }
  });

  it('starts its contents under its name tab, a shorter header than a box’s', () => {
    expect(containerHeaderOf(DRAWING_PRESETS.clean)).toBeLessThan(
      containerHeaderOf(DRAWING_PRESETS.expressive),
    );
    // As the canvas drew before drawing defaults: 48.
    expect(
      containerHeaderOf({
        ...DRAWING_PRESETS.clean,
        containers: { ...DRAWING_PRESETS.clean.containers, drawn: 'as-kind' },
        text: {
          ...DRAWING_PRESETS.clean.text,
          containerNameSize: 14,
          detailSize: 11,
          lineHeight: 1.3,
        },
      }),
    ).toBe(48);
  });

  it('is written in the SVG as its stroke, faint, a border at 40 % and its kind’s icon, in both themes', () => {
    const sample = loadSample();
    for (const theme of ['light', 'dark'] as const) {
      const svg = readSvg(writeSvg(sample, SAMPLE_VIEW, { theme }).text);
      const group = svg.querySelector(`[data-shape="${CLINIC}"]`);
      const body = group?.querySelector('rect');
      // One alpha in both themes, so that a switch never draws a region again.
      expect(body?.getAttribute('fill-opacity')).toBe('0.07');
      expect(body?.getAttribute('stroke-opacity')).toBe('0.4');
      expect(body?.getAttribute('stroke-width')).toBe('1');
      expect(group?.querySelector('[data-part="region-icon"]')).not.toBeNull();
      // Its name in the theme's muted text, at 500.
      const name = [...(group?.querySelectorAll('text') ?? [])].find((text) =>
        text.textContent?.includes('Clinic booking'),
      );
      expect(name?.getAttribute('fill')).toBe(THEMES[theme].canvas.regionText);
    }
  });

  it('draws a database container as a region with the database icon, never stretched as a cylinder', () => {
    const sample = loadSample();
    const database = {
      ...sample,
      model: {
        ...sample.model,
        elements: sample.model.elements.map((element) =>
          element.id === 'scheduling'
            ? { ...element, appearance: { ...element.appearance, shape: 'cylinder' as const } }
            : element,
        ),
      },
    };
    const scene = buildSceneAfresh(database, SAMPLE_VIEW);
    expect(shapeOf(scene, SCHEDULING).kind).toBe('cylinder');
    expect(shapeOf(scene, SCHEDULING).region).toBe(true);
    const svg = readSvg(writeSvg(database, SAMPLE_VIEW).text);
    const group = svg.querySelector(`[data-shape="${SCHEDULING}"]`);
    // One rounded rectangle for its body, and the database icon's top ellipse.
    expect(group?.querySelector('[data-part="region-icon"] ellipse')).not.toBeNull();
    // Only the toggle's sign is a path: no cylinder's body or cap.
    for (const path of group?.querySelectorAll(':scope > path') ?? []) {
      expect(path.getAttribute('fill')).toBe('none');
    }
  });

  it('writes its name in its tab at 500, in the theme’s muted text, and on the canvas draws its fill faint', () => {
    const sample = loadSample();
    const scene = buildSceneAfresh(sample, SAMPLE_VIEW);
    const region = shapeOf(scene, CLINIC);
    const written: { text: string; options: CanvasTextOptions }[] = [];
    const recording: TextFactory = (options) => {
      written.push({ text: String(options.text), options });
      return undefined;
    };
    writeShapeLabels([region], true, recording, undefined, undefined, BASE_DRAWING);
    expect(written).toHaveLength(1);
    expect(written[0]?.text).toBe(region.name);
    expect(written[0]?.options.style).toMatchObject({
      fontWeight: '500',
      fontSize: DRAWING_PRESETS.clean.text.containerNameSize,
      fill: LIGHT.regionText,
    });
    const graphics = new Graphics();
    drawShapeOutlines(graphics, [region], undefined, BASE_DRAWING, LIGHT_REGION);
    expect(graphics.bounds.width).toBeGreaterThanOrEqual(region.rect.width);
    expect(regionColorsOf(DARK).fillAlpha).toBe(LIGHT_REGION.fillAlpha);
  });
});

describe('a collapsed container’s count (A5.2)', () => {
  it('draws a second border inside rather than a sheet in Clean, and both in Expressive', () => {
    const clean = shapeOf(buildSceneAfresh(collapsedSample(), SAMPLE_VIEW), SCHEDULING);
    expect(clean.collapsed?.look).toBe('count');
    expect(bodyOf(clean)).toBe(clean.rect);
    const svg = readSvg(writeSvg(collapsedSample(), SAMPLE_VIEW).text);
    const group = svg.querySelector(`[data-shape="${SCHEDULING}"]`);
    // Its body, then its second border, unfilled, 1 wide.
    const rects = [...(group?.querySelectorAll(':scope > rect') ?? [])].filter(
      (rect) => rect.getAttribute('data-part') !== 'toggle',
    );
    expect(rects).toHaveLength(2);
    expect(rects[1]?.getAttribute('fill')).toBe('none');
    expect(Number(rects[1]?.getAttribute('x'))).toBeCloseTo(clean.rect.x + 3);

    const expressive = shapeOf(
      buildSceneAfresh(preset(collapsedSample(), 'expressive'), SAMPLE_VIEW),
      SCHEDULING,
    );
    expect(expressive.collapsed?.look).toBe('stack-and-count');
    expect(bodyOf(expressive)).not.toBe(expressive.rect);
  });

  it('names its contents’ component when they all come from one', () => {
    const sample = collapsedSample();
    const scene = buildSceneAfresh(sample, SAMPLE_VIEW);
    const mixed = shapeOf(scene, SCHEDULING);
    expect(mixed.collapsed?.component).toBeUndefined();
    expect(countText(mixed.collapsed as NonNullable<ElementShape['collapsed']>)).toBe('3 inside');

    const services = {
      ...sample,
      model: {
        ...sample.model,
        elements: sample.model.elements.map((element) =>
          element.id === 'appointments-db' ? { ...element, component: 'systems.service' } : element,
        ),
      },
    };
    const one = shapeOf(buildSceneAfresh(services, SAMPLE_VIEW), SCHEDULING);
    expect(one.collapsed?.component).toBe('Service');
    expect(countText(one.collapsed as NonNullable<ElementShape['collapsed']>)).toBe('3 × Service');
  });
});

describe('the count badge of an aggregated relation (A5.2)', () => {
  it('writes the count alone in a pill, at the type’s width, in Clean', () => {
    const scene = buildSceneAfresh(collapsedSample(), SAMPLE_VIEW);
    const aggregated = scene.relations.filter((line) => line.aggregate);
    expect(aggregated.length).toBeGreaterThan(0);
    for (const line of aggregated) {
      expect(line.badge).toBe(true);
      expect(line.label).toBe(String(line.aggregate?.relations.length));
      expect(line.width).toBe(DRAWING_PRESETS.clean.lines.width);
    }
    const kinds: string[] = [];
    writeRelationLabels(aggregated, (options, kind) => {
      kinds.push(kind);
      return undefined;
    });
    expect(new Set(kinds)).toEqual(new Set(['badge']));
  });

  it('is a rounded rectangle in the SVG, bordered in its line’s color over the canvas', () => {
    const svg = readSvg(writeSvg(collapsedSample(), SAMPLE_VIEW, { theme: 'dark' }).text);
    const badges = [...svg.querySelectorAll('[data-part="count-badge"]')];
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) {
      expect(Number(badge.getAttribute('rx'))).toBeCloseTo(
        Number(badge.getAttribute('height')) / 2,
        1,
      );
      expect(badge.getAttribute('fill')).toBe(DARK.background);
      expect(badge.getAttribute('stroke')).toBe(DARK.neutralLine);
    }
  });

  it('grows the line with its count in Expressive, and writes ×N as a label in High contrast', () => {
    const expressive = buildSceneAfresh(preset(collapsedSample(), 'expressive'), SAMPLE_VIEW);
    const grown = expressive.relations.filter((line) => line.aggregate);
    expect(grown.every((line) => line.badge && line.width > 2)).toBe(true);
    const high = buildSceneAfresh(preset(collapsedSample(), 'high-contrast'), SAMPLE_VIEW);
    const labelled = high.relations.filter((line) => line.aggregate);
    expect(labelled.every((line) => !line.badge && line.label?.startsWith('×'))).toBe(true);
  });
});

describe('the person (A5.2)', () => {
  const rect: Rect = { x: 0, y: 0, width: 144, height: 80 };

  it('is a head over shoulders drawn as one rounded arc, its label under the shoulders', () => {
    const { head, body, shoulder } = personFigure(rect);
    expect(head.y + head.radius).toBeLessThan(body.y);
    expect(shoulder).toBeGreaterThan(10);
    expect(personLabelTop(rect)).toBeGreaterThan(body.y - rect.y);
    // The head and the body hold points; a top corner above the shoulders' arc does not.
    expect(holdsPoint('person', rect, { x: head.x, y: head.y })).toBe(true);
    expect(holdsPoint('person', rect, { x: 72, y: 75 })).toBe(true);
    expect(holdsPoint('person', rect, { x: 1, y: body.y + 1 })).toBe(false);
    expect(holdsPoint('person', rect, { x: 10, y: 5 })).toBe(false);
  });

  it('is written in the SVG as a path and a circle', () => {
    const sample = loadSample();
    const svg = readSvg(writeSvg(sample, SAMPLE_VIEW).text);
    const person = buildSceneAfresh(sample, SAMPLE_VIEW).shapes.find(
      (shape) => shape.kind === 'person',
    );
    const group = svg.querySelector(`[data-shape="${person?.key}"]`);
    expect(group?.querySelector(':scope > path')?.getAttribute('d')).toMatch(/^M.*Z$/);
    expect(group?.querySelector(':scope > circle')).not.toBeNull();
  });
});

describe('the soft shadow (A5.2)', () => {
  it('is drawn under each shape that holds nothing in Expressive, in layers of 12 % in all', () => {
    const svg = readSvg(writeSvg(preset(loadSample(), 'expressive'), SAMPLE_VIEW).text);
    const shadows = [...svg.querySelectorAll('[fill="#000000"]')];
    expect(shadows.length % SOFT_SHADOW.layers).toBe(0);
    expect(shadows.length).toBeGreaterThan(0);
    const total = shadows
      .slice(0, SOFT_SHADOW.layers)
      .reduce((sum, each) => sum + Number(each.getAttribute('fill-opacity')), 0);
    expect(total).toBeCloseTo(SOFT_SHADOW.alpha);
    expect(writeSvg(loadSample(), SAMPLE_VIEW).text).not.toContain('fill="#000000"');
  });

  it('is left out of a view of 2,000 shapes or more, which lays out the same', () => {
    const expressive = DRAWING_PRESETS.expressive;
    expect(withinShadows(expressive, MOST_SHADOWED - 1)).toBe(expressive);
    const plain = withinShadows(expressive, MOST_SHADOWED);
    expect(plain.shapes.shadow).toBe('none');
    expect(withinShadows(expressive, MOST_SHADOWED + 5)).toBe(plain);
    expect(
      drawingOfScene(buildSceneAfresh(preset(loadSample(), 'expressive'), SAMPLE_VIEW)).shapes
        .shadow,
    ).toBe('soft');
  });
});

describe('neutral lines under the pointer and the selection (A5.2)', () => {
  const sample = loadSample();
  const scene = buildSceneAfresh(sample, SAMPLE_VIEW);
  const none = { selectedShapes: new Set<string>(), selectedRelations: new Set<string>() };
  const options = { fadeOthers: true, theme: 'light' as const, hidden: new Set<string>() };
  const api = 'clinic-booking/scheduling/appointments-api';

  it('give the lines touching a shape under the pointer their type’s color, and fade the rest', () => {
    const accents = accentsOf(scene, { ...none, shape: api }, options);
    expect(accents.othersAlpha).toBe(FADED_OTHERS);
    expect(accents.lines.length).toBeGreaterThan(0);
    for (const { line, stroke } of accents.lines) {
      expect(
        [line.ends?.from, line.ends?.to].some(
          (end) => end?.kind === 'shape' && end.key.startsWith(api),
        ),
      ).toBe(true);
      expect(stroke).toBe(line.typeStroke?.light);
    }
  });

  it('give a selected shape’s lines their color without fading, and leave lines alone with nothing pointed at', () => {
    const selected = accentsOf(scene, { ...none, selectedShapes: new Set([api]) }, options);
    expect(selected.othersAlpha).toBe(1);
    expect(selected.lines.length).toBeGreaterThan(0);
    expect(accentsOf(scene, none, options)).toEqual({ lines: [], othersAlpha: 1 });
  });

  it('take the dark shade in the dark theme, and leave out hidden lines and selections of too many', () => {
    const dark = accentsOf(scene, { ...none, shape: api }, { ...options, theme: 'dark' });
    for (const { line, stroke } of dark.lines) {
      expect(stroke).toBe(line.typeStroke?.dark ?? line.typeStroke?.light);
    }
    const hidden = new Set(scene.relations.map((line) => line.relation));
    expect(accentsOf(scene, { ...none, shape: api }, { ...options, hidden }).lines).toEqual([]);
    expect(MOST_ACCENTED).toBeGreaterThan(scene.relations.length);
  });

  it('do nothing in a view of lines by type that does not fade them', () => {
    const dense = buildSceneAfresh(preset(sample, 'dense'), SAMPLE_VIEW);
    expect(accentsOf(dense, { ...none, shape: api }, { ...options, fadeOthers: false })).toEqual({
      lines: [],
      othersAlpha: 1,
    });
  });
});

describe('the legend of relation types (A5.2)', () => {
  it('names each type with its color and dash where lines are neutral', () => {
    const sample = loadSample();
    const scene = buildSceneAfresh(sample, SAMPLE_VIEW);
    const part = relationTypesLegend(
      scene,
      sample,
      definitionsIn(sample),
      'light',
      'Relation types',
    );
    expect(part?.id).toBe(RELATION_TYPES_LEGEND);
    const names = part?.entries.map((entry) => entry.label);
    expect(names).toContain('communicates with');
    expect(part?.entries.some((entry) => (entry as { dash?: string }).dash !== 'solid')).toBe(true);
    // The SVG writes it under the drawing, a dashed line among its swatches.
    const svg = readSvg(writeSvg(sample, SAMPLE_VIEW).text);
    const legend = svg.querySelector('[data-part="legend"]');
    expect(legend).not.toBeNull();
    expect(legend?.querySelector('[stroke-dasharray]')).not.toBeNull();
  });

  it('says the neutral lines take their type’s color only when pointed at or selected', () => {
    const sample = loadSample();
    const neutral = relationTypesLegend(
      buildSceneAfresh(sample, SAMPLE_VIEW),
      sample,
      definitionsIn(sample),
      'light',
      'Relation types',
    );
    const english = translatorFor('en');
    expect(neutral && legendSubtitle(english, neutral)).toBe(
      'Line dash by relation type, and its color when pointed at or selected',
    );
    const dense = preset(loadSample(), 'dense');
    const byType = relationTypesLegend(
      buildSceneAfresh(dense, SAMPLE_VIEW),
      dense,
      definitionsIn(dense),
      'light',
      'Relation types',
    );
    expect(byType && legendSubtitle(english, byType)).toBe('Line color and dash by relation type');
  });

  it('shows no part for a view whose lines are of one type and drawn in their own color', () => {
    const sample = preset(loadSample(), 'dense');
    const scene = buildSceneAfresh(sample, SAMPLE_VIEW);
    const one = {
      ...scene,
      relations: scene.relations.filter((line) => line.dash === 'solid').slice(0, 1),
    };
    expect(
      relationTypesLegend(one, sample, definitionsIn(sample), 'light', 'Relation types'),
    ).toBeUndefined();
  });
});

describe('the dot grid (A5.2)', () => {
  const camera = { x: 0, y: 0, scale: 1 };
  const viewport = { width: 1600, height: 900 };

  it('draws a dot where its lines cross, by the same families, within its most', () => {
    const lines = new GridMarks();
    lines.set({ shown: true, snapping: false });
    lines.follow(camera, viewport, 1, true);
    const dots = new GridMarks();
    dots.set({ shown: true, snapping: false });
    dots.setLook('dots');
    dots.follow(camera, viewport, 1, true);
    expect(dots.lineCount).toBeGreaterThan(lines.lineCount);
    expect(dots.lineCount).toBeLessThanOrEqual(MAX_GRID_DOTS);
    // Far out, the finest families are left out first, as for lines.
    dots.follow({ x: 0, y: 0, scale: 0.2 }, viewport, 2, true);
    expect(dots.lineCount).toBeLessThanOrEqual(MAX_GRID_DOTS);
  });

  it('is Clean’s and Expressive’s look, and lines are Dense’s and High contrast’s', () => {
    expect(DRAWING_PRESETS.clean.grid.look).toBe('dots');
    expect(DRAWING_PRESETS.expressive.grid.look).toBe('dots');
    expect(DRAWING_PRESETS.dense.grid.look).toBe('lines');
    expect(DRAWING_PRESETS['high-contrast'].grid.look).toBe('lines');
  });
});

describe('a region’s fill under what it holds', () => {
  it('is its stroke at 7 % over the light canvas', () => {
    expect(regionFillOf('#000000', LIGHT_REGION)).toBe('#EDEDED');
  });
});
