/**
 * The built-in Machine learning package (P1, ADR 0079): its definitions beside Data science
 * pipelines, its icons, its free geometry, and the Transformer block and small convolutional network
 * drawn with parts that layers are drawn as (ADR 0066, ADR 0067).
 */
import type { Color, Element, ImageDefinition } from '@visual-anything/schema';
import { validateFile } from '@visual-anything/schema/validate';
import { describe, expect, it } from 'vitest';
import { checkProject } from '../check';
import { CANVAS_BACKGROUNDS, contrastRatio } from '../colors';
import { executeCommand } from '../commands';
import { definitionsOf } from '../definitions';
import { readGeometry } from '../geometry';
import { anchoredElements, unknownPartWarnings } from '../images/anchored';
import { cleanedImage } from '../images/cleaned';
import { partsLeftOut, partsOf } from '../images/parts';
import { readCleanedSvg, type SvgNode } from '../images/svg';
import { packageNeeds } from '../package-sharing';
import type { ProjectSnapshot } from '../snapshot';
import { DATA_SCIENCE } from './data-science';
import { BUILTIN_PACKAGES, RESERVED_PACKAGE_IDS, SYSTEMS, builtinPackage } from './index';
import {
  CNN_DRAWING,
  CNN_PARTS,
  MACHINE_LEARNING,
  TRANSFORMER_DRAWING,
  TRANSFORMER_PARTS,
} from './machine-learning';

const ML = MACHINE_LEARNING;
const BOTH = [DATA_SCIENCE, ML];
const LAYERS = [
  'machine-learning.dense-layer',
  'machine-learning.convolution-layer',
  'machine-learning.attention-layer',
  'machine-learning.embedding-layer',
  'machine-learning.normalization-layer',
  'machine-learning.recurrent-layer',
  'machine-learning.pooling-layer',
];

/** A project that uses Data science pipelines and Machine learning, with these elements. */
function project(elements: Element[] = [], relations: ProjectSnapshot['model']['relations'] = []) {
  const state: ProjectSnapshot = {
    project: { schemaVersion: 1, name: 'Models', packages: ['data-science', 'machine-learning'] },
    model: { world: { id: 'world', component: 'essence', name: 'World' }, elements, relations },
    packages: [...BOTH],
    views: [],
    scenarios: [],
    tours: [],
    comments: [],
  };
  return state;
}

function image(id: string): ImageDefinition {
  const found = ML.images?.find((each) => each.id === id);
  if (!found) throw new Error(`No image ${id}.`);
  return found;
}

describe('the built-in Machine learning package', () => {
  it('is a valid package file, built in, with its reserved id', () => {
    expect(validateFile('package', ML)).toEqual({ ok: true, value: ML });
    expect(builtinPackage('machine-learning')).toBe(ML);
    expect(BUILTIN_PACKAGES).toContain(ML);
    expect(RESERVED_PACKAGE_IDS.has(ML.id)).toBe(true);
    expect(ML.license).toBe('CC0-1.0');
    for (const { id } of [...ML.components, ...ML.relationTypes, ...(ML.images ?? [])]) {
      expect(id.startsWith('machine-learning.'), id).toBe(true);
    }
  });

  it('defines what the spec lists, with a drawing with parts for a Transformer block and a small CNN', () => {
    expect(ML.components.map((each) => each.name)).toEqual([
      'Dataset',
      'Tensor',
      'Layer',
      'Dense layer',
      'Convolution layer',
      'Attention layer',
      'Embedding layer',
      'Normalization layer',
      'Recurrent layer',
      'Pooling layer',
      'Block',
      'Transformer block',
      'Model',
      'Convolutional network',
      'Loss',
      'Optimizer',
      'Metric',
      'Training run',
    ]);
    expect(ML.relationTypes.map((each) => each.name)).toEqual([
      'flows into',
      'adds to',
      'is part of',
      'trains on',
      'is measured by',
      'minimizes',
      'updates',
    ]);
  });

  it('derives everything up to Essence and "relates to" beside Data science pipelines, its Model from theirs', () => {
    const definitions = definitionsOf(BOTH);
    expect(definitions.problems).toEqual([]);
    for (const { id } of ML.components) {
      expect(definitions.component(id)?.lineage.at(-1), id).toBe('essence');
    }
    for (const { id } of ML.relationTypes) {
      expect(definitions.relationType(id)?.lineage.at(-1), id).toBe('relates-to');
    }
    expect(definitions.component('machine-learning.model')?.lineage).toEqual([
      'machine-learning.model',
      'data-science.model',
      'essence',
    ]);
    for (const layer of LAYERS) {
      expect(definitions.componentDerives(layer, 'machine-learning.layer'), layer).toBe(true);
    }
    expect(
      definitions.componentDerives('machine-learning.transformer-block', 'machine-learning.block'),
    ).toBe(true);
    expect(
      definitions.componentDerives('machine-learning.convolutional-network', 'data-science.model'),
    ).toBe(true);
    expect(definitions.relationType('machine-learning.adds-to')?.lineage).toEqual([
      'machine-learning.adds-to',
      'machine-learning.flows-into',
      'relates-to',
    ]);
    expect([...definitions.nestingRelationTypes]).toEqual(['machine-learning.is-part-of']);
    // A model trained by Data science pipelines' "trains" is one of Machine learning's models too.
    expect(definitions.relationType('data-science.trains')?.limits.to).toEqual([
      'data-science.model',
    ]);
  });

  it('needs Data science pipelines, and nothing else', () => {
    expect(packageNeeds(project(), ML)).toEqual({ builtIn: [], missing: [] });
    const alone: ProjectSnapshot = {
      ...project(),
      project: { schemaVersion: 1, name: 'Models', packages: ['systems'] },
      packages: [SYSTEMS],
    };
    expect(packageNeeds(alone, ML)).toEqual({ builtIn: ['data-science'], missing: [] });
  });

  it('names only definitions it or Data science pipelines has, in its limits', () => {
    const definitions = definitionsOf(BOTH);
    for (const relationType of ML.relationTypes) {
      for (const limit of [relationType.limits?.from, relationType.limits?.to]) {
        for (const id of Array.isArray(limit) ? limit : []) {
          expect(definitions.component(id), `${relationType.id} names ${id}`).toBeDefined();
        }
      }
    }
  });

  it('gives every component a picture of its own: an icon, or a drawing with parts', () => {
    const images = new Map((ML.images ?? []).map((each) => [each.id, each]));
    const icons = new Set<string>();
    for (const component of ML.components) {
      const shown = component.appearance?.image;
      expect(typeof shown === 'object' && images.has(shown.image), component.id).toBe(true);
      if (typeof shown !== 'object') continue;
      if (shown.placement === 'parts') continue;
      expect(shown.placement, component.id).toBeUndefined();
      // Each kind of layer, and everything else, shows an icon no other component shows.
      expect(icons.has(shown.image), component.id).toBe(false);
      icons.add(shown.image);
    }
    expect(
      ML.components
        .filter((each) => typeof each.appearance?.image === 'object')
        .filter((each) => (each.appearance?.image as { placement?: string }).placement === 'parts')
        .map((each) => [each.id, (each.appearance?.image as { image: string }).image]),
    ).toEqual([
      ['machine-learning.transformer-block', TRANSFORMER_DRAWING.id],
      ['machine-learning.convolutional-network', CNN_DRAWING.id],
    ]);
  });

  it('draws free geometry the core reads, where a kind of shape is not enough', () => {
    const drawn = ML.components.filter((each) => each.appearance?.geometry !== undefined);
    expect(drawn.map((each) => each.id)).toEqual([
      'machine-learning.tensor',
      'machine-learning.loss',
      'machine-learning.optimizer',
      'machine-learning.metric',
      'machine-learning.training-run',
    ]);
    for (const component of drawn) {
      const geometry = component.appearance?.geometry;
      if (typeof geometry !== 'object') throw new Error(component.id);
      expect(readGeometry(geometry).ok, component.id).toBe(true);
      // Its box is the shape's own size, so it is drawn as written, and its label holds a name.
      expect([geometry.width, geometry.height], component.id).toEqual([
        component.appearance?.width,
        component.appearance?.height,
      ]);
      expect(geometry.label?.height, component.id).toBeGreaterThanOrEqual(40);
      expect(geometry.label?.width, component.id).toBeGreaterThanOrEqual(120);
    }
  });

  it('opens beside Data science pipelines with nothing to warn about', () => {
    expect(checkProject(project())).toEqual({ errors: [], warnings: [] });
  });
});

describe('starting to use Machine learning', () => {
  it('also starts using Data science pipelines, whose Model its Model derives from', () => {
    const state: ProjectSnapshot = {
      ...project(),
      project: { schemaVersion: 1, name: 'Models', packages: ['systems'] },
      packages: [SYSTEMS],
    };
    const outcome = executeCommand(state, {
      type: 'update-project',
      changes: { packages: ['systems', 'machine-learning'] },
    });
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.problems));
    expect(outcome.state.project.packages).toEqual(['systems', 'data-science', 'machine-learning']);
    expect(outcome.state.packages.map((each) => each.id)).toEqual([
      'systems',
      'data-science',
      'machine-learning',
    ]);
    expect(checkProject(outcome.state)).toEqual({ errors: [], warnings: [] });
  });

  it('keeps Data science pipelines while Machine learning is in use', () => {
    const outcome = executeCommand(project(), {
      type: 'update-project',
      changes: { packages: ['machine-learning'] },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problems.map((each) => each.code)).toEqual(['in-use']);
  });

  it('keeps Data science pipelines when a list that starts using Machine learning leaves it out', () => {
    const state: ProjectSnapshot = {
      ...project(),
      project: { schemaVersion: 1, name: 'Models', packages: ['data-science'] },
      packages: [DATA_SCIENCE],
    };
    const outcome = executeCommand(state, {
      type: 'update-project',
      changes: { packages: ['machine-learning'] },
    });
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.problems));
    expect(outcome.state.project.packages).toEqual(['data-science', 'machine-learning']);
    expect(definitionsOf(outcome.state.packages).problems).toEqual([]);
  });
});

/** The colours an SVG node and everything inside it paints with, each once. */
function paints(node: SvgNode): Color[] {
  const found = new Set<Color>();
  const visit = (each: SvgNode) => {
    for (const name of ['fill', 'stroke']) {
      const value = each.attributes.get(name);
      if (value !== undefined && /^#[0-9A-F]{6}$/.test(value)) found.add(value);
    }
    each.children.forEach(visit);
  };
  visit(node);
  return [...found];
}

/** The fills and the strokes an SVG node and everything inside it paints with. */
function fillsAndStrokes(node: SvgNode): { fills: Color[]; strokes: Color[] } {
  const fills = new Set<Color>();
  const strokes = new Set<Color>();
  const visit = (each: SvgNode) => {
    const fill = each.attributes.get('fill');
    const stroke = each.attributes.get('stroke');
    if (fill !== undefined && fill !== 'none') fills.add(fill);
    if (stroke !== undefined && stroke !== 'none') strokes.add(stroke);
    each.children.forEach(visit);
  };
  visit(node);
  return { fills: [...fills], strokes: [...strokes] };
}

describe('the pictures of Machine learning', () => {
  const definitions = definitionsOf(BOTH);
  const fillsOf = (componentId: string) => {
    const resolved = definitions.component(componentId);
    return [resolved?.appearance.fill ?? '', resolved?.darkColors.fill ?? ''];
  };

  it('are its own drawings, under CC0-1.0, as every built-in picture says', () => {
    for (const each of ML.images ?? []) {
      expect(each.kind, each.id).toBe('svg');
      expect(each.source, each.id).toBe('Drawn for Visual Anything');
      expect(each.license, each.id).toBe('CC0-1.0');
    }
  });

  it('draw icons in one colour that reads at 3:1 or more on their component’s fill, in both themes', () => {
    for (const component of ML.components) {
      const shown = component.appearance?.image;
      if (typeof shown !== 'object' || shown.placement === 'parts') continue;
      const icon = image(shown.image);
      if (icon.kind !== 'svg') throw new Error(icon.id);
      expect([icon.width, icon.height], icon.id).toEqual([24, 24]);
      const colors = paints(readCleanedSvg(icon.svg) as SvgNode);
      expect(colors, icon.id).toHaveLength(1);
      for (const fill of fillsOf(component.id)) {
        expect(
          contrastRatio(colors[0] as Color, fill),
          `${icon.id} on ${fill}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it.each([
    ['Transformer block', TRANSFORMER_DRAWING, TRANSFORMER_PARTS],
    ['small CNN', CNN_DRAWING, CNN_PARTS],
  ] as const)(
    'the %s names its parts in order, within the caps on parts',
    (_name, drawing, ids) => {
      const cleaned = cleanedImage(drawing);
      if (!cleaned) throw new Error(drawing.id);
      expect(partsOf(cleaned).map((each) => each.id)).toEqual([...ids]);
      expect(partsLeftOut(cleaned)).toEqual({ contours: 0, segments: false });
      for (const each of partsOf(cleaned)) {
        // Large enough to write a layer's name in, at one canvas unit for each of the picture's.
        expect(each.bounds.height, each.id).toBeGreaterThanOrEqual(40);
        expect(each.bounds.width, each.id).toBeGreaterThanOrEqual(56);
      }
    },
  );

  it.each([
    ['machine-learning.transformer-block', TRANSFORMER_DRAWING, TRANSFORMER_PARTS],
    ['machine-learning.convolutional-network', CNN_DRAWING, CNN_PARTS],
  ] as const)('%s reads in both themes, its parts and its lines', (componentId, drawing, ids) => {
    if (drawing.kind !== 'svg') throw new Error(drawing.id);
    const [light, dark] = fillsOf(componentId) as [Color, Color];
    const root = readCleanedSvg(drawing.svg) as SvgNode;
    const parts: SvgNode[] = [];
    const loose: SvgNode[] = [];
    const visit = (node: SvgNode) => {
      const id = node.attributes.get('id');
      if (id !== undefined && (ids as readonly string[]).includes(id)) parts.push(node);
      else if (node.children.length === 0) loose.push(node);
      else node.children.forEach(visit);
    };
    root.children.forEach(visit);
    expect(parts.map((each) => each.attributes.get('id'))).toEqual([...ids]);
    for (const part of parts) {
      const { fills, strokes } = fillsAndStrokes(part);
      const id = part.attributes.get('id');
      for (const stroke of strokes) {
        // Its edges and marks read on its own fill, and its edge on the drawing's light fill…
        for (const fill of fills) {
          expect(contrastRatio(stroke, fill), `${id} ${stroke} on ${fill}`).toBeGreaterThanOrEqual(
            4.5,
          );
        }
        expect(contrastRatio(stroke, light), `${id} ${stroke} on ${light}`).toBeGreaterThanOrEqual(
          3,
        );
      }
      // …and its fill on the drawing's dark one, since a picture is drawn as stored in both themes.
      for (const fill of fills) {
        expect(contrastRatio(fill, dark), `${id} ${fill} on ${dark}`).toBeGreaterThanOrEqual(3);
      }
    }
    // What no part holds, its arrows and its frame, reads on the drawing's fill in both themes.
    const lines = new Set(loose.flatMap(paints));
    expect(lines.size).toBe(1);
    for (const color of lines) {
      for (const fill of [light, dark]) {
        expect(contrastRatio(color, fill), `${color} on ${fill}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('anchors a layer to every part of both drawings, with nothing to warn about', () => {
    const inside = (container: string, id: string, component: string, part: string): Element => ({
      id,
      component,
      name: part,
      appearance: { part: { part } },
    });
    const transformer = TRANSFORMER_PARTS.map((part, at) =>
      inside('encoder', `t-${at}`, 'machine-learning.layer', part),
    );
    const cnn = CNN_PARTS.map((part, at) =>
      inside('cnn', `c-${at}`, 'machine-learning.layer', part),
    );
    const contents = [...transformer, ...cnn];
    const state = project(
      [
        { id: 'encoder', component: 'machine-learning.transformer-block', name: 'Encoder' },
        { id: 'cnn', component: 'machine-learning.convolutional-network', name: 'Digits' },
        ...contents,
      ],
      contents.map((each) => ({
        id: `${each.id}-in`,
        relationType: 'machine-learning.is-part-of',
        from: each.id,
        to: each.id.startsWith('t-') ? 'encoder' : 'cnn',
      })),
    );
    expect(
      anchoredElements(state).map((each) => [each.element.id, each.part.part, each.images]),
    ).toEqual([
      ...TRANSFORMER_PARTS.map((part, at) => [`t-${at}`, part, [TRANSFORMER_DRAWING.id]]),
      ...CNN_PARTS.map((part, at) => [`c-${at}`, part, [CNN_DRAWING.id]]),
    ]);
    expect(unknownPartWarnings(state)).toEqual([]);
    expect(checkProject(state)).toEqual({ errors: [], warnings: [] });
  });
});

describe('the colors of Machine learning', () => {
  const definitions = definitionsOf(BOTH);

  it('give every component a stroke that reads at 4.5:1 on its fill and on the light canvas', () => {
    for (const component of ML.components) {
      const { fill, stroke } = definitions.component(component.id)?.appearance ?? {};
      if (fill === undefined || stroke === undefined) throw new Error(component.id);
      expect(contrastRatio(stroke, fill), component.id).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(stroke, CANVAS_BACKGROUNDS.light), component.id).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it('give every relation type a stroke that reads at 4.5:1 on the light canvas', () => {
    for (const relationType of ML.relationTypes) {
      const stroke = definitions.relationType(relationType.id)?.appearance.stroke ?? '';
      expect(
        contrastRatio(stroke, CANVAS_BACKGROUNDS.light),
        relationType.id,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('are the same as the colours of the layers its drawings draw, part by part', () => {
    const colorsOf = (id: string) => {
      const { fill, stroke } = definitions.component(id)?.appearance ?? {};
      return { fill, stroke };
    };
    const cleaned = cleanedImage(TRANSFORMER_DRAWING);
    if (!cleaned) throw new Error(TRANSFORMER_DRAWING.id);
    const main = new Map(partsOf(cleaned).map((each) => [each.id, each.color]));
    expect(main.get('input-embedding')).toBe(colorsOf('machine-learning.embedding-layer').fill);
    expect(main.get('positional-encoding')).toBe(colorsOf('machine-learning.layer').fill);
    expect(main.get('multi-head-attention')).toBe(
      colorsOf('machine-learning.attention-layer').fill,
    );
    expect(main.get('add-norm-1')).toBe(colorsOf('machine-learning.normalization-layer').fill);
    expect(main.get('feed-forward')).toBe(colorsOf('machine-learning.dense-layer').fill);
    expect(main.get('add-norm-2')).toBe(colorsOf('machine-learning.normalization-layer').fill);
    expect(main.get('output')).toBe(colorsOf('machine-learning.tensor').fill);
  });
});
