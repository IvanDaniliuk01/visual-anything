/**
 * A view of Systems components as a Structurizr DSL workspace (M6b, R33), the C4 model's text form:
 *
 * - **Elements.** A Person is a `person`; a System, and any other Systems component that sits in no
 *   element that is exported, is a `softwareSystem`; one inside a software system is a `container`,
 *   and one inside a container a `component`. C4 nests no deeper, so what sits inside a component is a
 *   component beside it. Elements of other packages are left out, and what they hold moves up. The
 *   view's nesting decides what sits inside what, through each element's first container.
 * - **Relations** drawn between exported elements are relationships, described by their name or their
 *   relation type, with their `protocol` as technology; an aggregated relation is one relationship.
 * - **Views.** A system landscape of the whole export, a container view of each software system that
 *   holds containers and a component view of each container that holds components, each laid out by
 *   Structurizr; and styles that give each component's elements their shape and the theme's colors.
 *
 * Everything people wrote is written in quoted strings on one line, its quotes escaped, and with
 * nothing Structurizr would read as a constant or an environment variable. What the workspace
 * cannot hold is said in its comments and listed in the export.
 */
import {
  definitionsIn,
  legendOf,
  legendShows,
  modelIndexOf,
  relationTypeOrRelatesTo,
  type Definitions,
  type ProjectSnapshot,
  type ThemeName,
} from '@visual-anything/core';
import type { Element, Id } from '@visual-anything/schema';
import { readableTextColors } from '../canvas/colors';
import { buildScene, type ElementShape, type RelationLine } from '../canvas/scene';
import { shapeColors } from '../canvas/theme/paint';
import { t, type PluralText } from '../i18n';
import type { TextExport } from './outline';

/** What a Systems component becomes in the C4 model. */
type Kind = 'person' | 'softwareSystem' | 'container' | 'component';

// The Systems package's components, and the C4 starter package's (ADR 0051). A C4 deployment node
// has no place in a static view, so it is left out, as anything else is.
const PERSON = ['systems.person', 'c4.person'];
const SYSTEM = ['systems.system', 'c4.software-system'];
const BOX = ['systems.box', 'c4.container', 'c4.component'];

const OTHER_PACKAGES: PluralText = {
  one: 'One element of another package than Systems is left out.',
  other: '{count} elements of other packages than Systems are left out.',
};
const FLATTENED: PluralText = {
  one: 'One element sat deeper than C4 nests: it is a component beside the one that held it.',
  other:
    '{count} elements sat deeper than C4 nests: each is a component beside the one that held it.',
};
const MOVED_UP: PluralText = {
  one: 'One person or system sat inside another element: it is at the top of the model.',
  other: '{count} people and systems sat inside other elements: they are at the top of the model.',
};
const COPIES: PluralText = {
  one: 'One element sits in more than one container: it is in its first one.',
  other: '{count} elements sit in more than one container: each is in its first one.',
};
const LEFT_OUT_RELATIONS: PluralText = {
  one: 'One relation is left out: it ends on a relation, on an element left out, or on what holds it, which Structurizr does not take.',
  other:
    '{count} relations are left out: they end on relations, on elements left out, or on what holds them, which Structurizr does not take.',
};
const FREE: PluralText = {
  one: 'One note or free arrow is left out.',
  other: '{count} notes and free arrows are left out.',
};

/** The words of the DSL, which an identifier must not be. */
const KEYWORDS = new Set(
  (
    'workspace model views styles person softwaresystem container component group element ' +
    'relationship tags tag description technology url properties perspectives include exclude ' +
    'autolayout this theme themes branding terminology configuration users deploymentenvironment ' +
    'deploymentnode infrastructurenode softwaresysteminstance containerinstance enterprise ' +
    'systemlandscape systemcontext dynamic deployment filtered custom image animation title ' +
    'name instances health default'
  ).split(' '),
);

/** The Structurizr shape for each kind of shape. */
const SHAPES: Record<ElementShape['kind'], string> = {
  rectangle: 'Box',
  'rounded-rectangle': 'RoundedBox',
  ellipse: 'Ellipse',
  cylinder: 'Cylinder',
  person: 'Person',
};

/** How a Structurizr workspace is written. */
export interface StructurizrOptions {
  /** The theme whose colors the styles take; light by default. */
  theme?: ThemeName;
}

/** Whether a component is one of the Systems package's, and what it becomes in C4. */
function kindOf(definitions: Definitions, component: Id): 'person' | 'system' | 'box' | undefined {
  const derives = (ids: readonly Id[]) =>
    ids.some((id) => definitions.componentDerives(component, id));
  if (derives(PERSON)) return 'person';
  if (derives(SYSTEM)) return 'system';
  if (derives(BOX)) return 'box';
  return undefined;
}

/** Whether a view shows any element the Structurizr export can write: a Systems component's. */
export function structurizrApplies(project: ProjectSnapshot, viewId: Id): boolean {
  const definitions = definitionsIn(project);
  const index = modelIndexOf(project);
  return buildScene(project, viewId).shapes.some((shape) => {
    const component = index.element(shape.element)?.component;
    return component !== undefined && kindOf(definitions, component) !== undefined;
  });
}

/** What the export knows of each element it writes. */
interface Written {
  element: Element;
  shape: ElementShape;
  kind: Kind;
  identifier: string;
  parent?: Written;
  children: Written[];
}

/**
 * A text as a DSL string: on one line, in double quotes, its quotes escaped, a backslash written as
 * "∖" and "${" as "$ {", so that nothing in it ends the string or is read as a constant or an
 * environment variable.
 */
export function dslString(text: string): string {
  const escaped = text
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .replace(/\\/g, '∖')
    .replace(/\$\{/g, '$ {')
    .replace(/"/g, '\\"')
    .trim();
  return `"${escaped}"`;
}

/** Writes a view of Systems components as a Structurizr DSL workspace. Throws when there is no such view. */
export function writeStructurizr(
  project: ProjectSnapshot,
  viewId: Id,
  options: StructurizrOptions = {},
): TextExport {
  const view = project.views.find((each) => each.id === viewId);
  if (!view) throw new RangeError(`The project has no view "${viewId}".`);
  const theme = options.theme ?? 'light';
  const scene = buildScene(project, viewId);
  const index = modelIndexOf(project);
  const definitions = definitionsIn(project);

  const byKey = new Map(scene.shapes.map((shape) => [shape.key, shape]));
  const firsts = new Map<Id, ElementShape>();
  const copied = new Set<Id>();
  for (const shape of scene.shapes) {
    if (!firsts.has(shape.element)) firsts.set(shape.element, shape);
    else copied.add(shape.element);
  }
  const copies = copied.size;

  const identifiers = new Set<string>();
  const identifierOf = (id: Id): string => {
    let base = id.replace(/[^A-Za-z0-9_-]/g, '_');
    if (KEYWORDS.has(base.toLowerCase())) base = `e_${base}`;
    let identifier = base;
    for (let n = 2; identifiers.has(identifier.toLowerCase()); n++) identifier = `${base}_${n}`;
    identifiers.add(identifier.toLowerCase());
    return identifier;
  };

  // Each element at its first shape, in containment order, so that what holds it comes first.
  const written = new Map<Id, Written>();
  const top: Written[] = [];
  let otherPackages = 0;
  let flattened = 0;
  let movedUp = 0;
  for (const shape of firsts.values()) {
    const element = index.element(shape.element);
    const kind = element ? kindOf(definitions, element.component) : undefined;
    if (!element || !kind) {
      otherPackages += 1;
      continue;
    }
    // The nearest shape around this one whose element is written.
    let holder: Written | undefined;
    for (let key = shape.containerShape; key !== undefined && !holder;) {
      const around = byKey.get(key);
      if (!around) break;
      const found = written.get(around.element);
      if (found && found.shape === around) holder = found;
      key = around.containerShape;
    }
    let c4: Kind;
    let parent: Written | undefined;
    if (kind === 'person' || kind === 'system') {
      c4 = kind === 'person' ? 'person' : 'softwareSystem';
      if (holder) movedUp += 1;
    } else if (!holder || holder.kind === 'person') {
      c4 = 'softwareSystem';
      if (holder) movedUp += 1;
    } else if (holder.kind === 'softwareSystem') {
      c4 = 'container';
      parent = holder;
    } else if (holder.kind === 'container') {
      c4 = 'component';
      parent = holder;
    } else {
      c4 = 'component';
      parent = holder.parent;
      flattened += 1;
    }
    const entry: Written = {
      element,
      shape,
      kind: c4,
      identifier: identifierOf(element.id),
      ...(parent ? { parent } : {}),
      children: [],
    };
    written.set(element.id, entry);
    if (parent) parent.children.push(entry);
    else top.push(entry);
  }

  const componentName = (entry: Written) => entry.shape.componentName;
  const fields = (entry: Written): string => {
    const description = dslString(entry.element.description ?? '');
    const technology = entry.element.attributes?.technology;
    const tag = dslString(componentName(entry));
    switch (entry.kind) {
      case 'person':
      case 'softwareSystem':
        return `${description} ${tag}`;
      case 'container':
      case 'component':
        return `${description} ${dslString(typeof technology === 'string' ? technology : '')} ${tag}`;
    }
  };
  const model: string[] = [];
  const writeEntry = (entry: Written, depth: number) => {
    const indent = '    '.repeat(depth);
    const head = `${indent}${entry.identifier} = ${entry.kind} ${dslString(entry.element.name)} ${fields(entry)}`;
    if (entry.children.length === 0) {
      model.push(head);
      return;
    }
    model.push(`${head} {`);
    for (const child of entry.children) writeEntry(child, depth + 1);
    model.push(`${indent}}`);
  };
  for (const entry of top) writeEntry(entry, 2);

  // Relationships between written elements, but between an element and what holds it.
  const holds = (outer: Written, inner: Written): boolean => {
    for (let at = inner.parent; at; at = at.parent) if (at === outer) return true;
    return false;
  };
  const endOf = (line: RelationLine, end: 'from' | 'to'): Written | undefined => {
    const drawn = line.ends?.[end];
    let element: Id | undefined;
    if (drawn) element = drawn.kind === 'shape' ? byKey.get(drawn.key)?.element : undefined;
    else element = index.relation(line.relation)?.[end];
    return element === undefined ? undefined : written.get(element);
  };
  const relationships: string[] = [];
  const said = new Map<string, number>();
  let leftOutRelations = 0;
  for (const line of scene.relations) {
    const from = endOf(line, 'from');
    const to = endOf(line, 'to');
    if (!from || !to || holds(from, to) || holds(to, from)) {
      leftOutRelations += 1;
      continue;
    }
    const relation = line.aggregate ? undefined : index.relation(line.relation);
    const type = relationTypeOrRelatesTo(
      definitions,
      line.aggregate ? line.aggregate.relationType : (relation?.relationType ?? ''),
    );
    const typeName = t.definition(type.id, type.name);
    let description = line.aggregate
      ? `×${line.aggregate.relations.length} ${typeName}`
      : (relation?.name ?? typeName);
    // Structurizr takes one relationship of a description between the same two elements.
    const key = `${from.identifier} ${to.identifier} ${description}`;
    const times = (said.get(key) ?? 0) + 1;
    said.set(key, times);
    if (times > 1) description = `${description} (${times})`;
    const protocol = relation?.attributes?.protocol;
    const technology = typeof protocol === 'string' ? ` ${dslString(protocol)}` : '';
    relationships.push(
      `        ${from.identifier} -> ${to.identifier} ${dslString(description)}${technology}`,
    );
  }

  // Views: the landscape, then each software system's containers and each container's components.
  const key = (text: string) => text.replace(/[^A-Za-z0-9_-]/g, '_');
  const viewKey = key(view.id);
  const views: string[] = [
    `        systemLandscape ${dslString(viewKey)} ${dslString(view.description ?? view.name)} {`,
    '            include *',
    '            autoLayout lr',
    '        }',
  ];
  for (const entry of written.values()) {
    if (entry.children.length === 0) continue;
    if (entry.kind !== 'softwareSystem' && entry.kind !== 'container') continue;
    const kind = entry.kind === 'softwareSystem' ? 'container' : 'component';
    views.push(
      `        ${kind} ${entry.identifier} ${dslString(`${viewKey}-${entry.identifier}`)} {`,
      '            include *',
      '            autoLayout lr',
      '        }',
    );
  }

  // Styles: each component's tag with its shape and the theme's colors of its first element.
  const styles = new Map<string, string[]>();
  for (const entry of written.values()) {
    const tag = componentName(entry);
    if (styles.has(tag)) continue;
    const colors = shapeColors(entry.shape, theme);
    styles.set(tag, [
      `            element ${dslString(tag)} {`,
      `                shape ${SHAPES[entry.shape.kind]}`,
      `                background ${colors.fill}`,
      `                stroke ${colors.stroke}`,
      `                color ${readableTextColors(colors.fill).name}`,
      '            }',
    ]);
  }

  const free = scene.notes.length + scene.arrows.length;
  const pictures = [...written.values()].filter((entry) => entry.shape.image).length;
  const scenarios = project.scenarios.filter((scenario) => scenario.view === view.id).length;
  const lost = [
    t(
      'Structurizr lays the views out itself: positions, sizes, routes and bend points are left out.',
    ),
    ...(written.size === 0 ? [t('The view shows no element of the Systems package.')] : []),
    ...(otherPackages > 0 ? [t(OTHER_PACKAGES, { count: otherPackages })] : []),
    ...(movedUp > 0 ? [t(MOVED_UP, { count: movedUp })] : []),
    ...(flattened > 0 ? [t(FLATTENED, { count: flattened })] : []),
    ...(copies > 0 ? [t(COPIES, { count: copies })] : []),
    ...(leftOutRelations > 0 ? [t(LEFT_OUT_RELATIONS, { count: leftOutRelations })] : []),
    ...(free > 0 ? [t(FREE, { count: free })] : []),
    ...(pictures > 0 ? [t('Pictures are left out.')] : []),
    ...(scenarios > 0 ? [t('Scenarios are left out.')] : []),
    // Structurizr draws no legend, though its styles take the overlays' colors (ADR 0055).
    ...(legendShows(legendOf(view, definitions, theme))
      ? [
          t(
            'The legend of the view’s overlays, whose colors it draws: the outline in Markdown, the SVG and the PDF carry it.',
          ),
        ]
      : []),
  ];

  const comment = (text: string) => `// ${text.replace(/\s*[\r\n]+\s*/g, ' ')}`;
  const lines = [
    comment(
      t('The view “{view}” of the project “{project}”, from Visual Anything.', {
        view: view.name,
        project: project.project.name,
      }),
    ),
    ...lost.map((each) => comment(t('Lost: {what}', { what: each }))),
    `workspace ${dslString(project.project.name)} ${dslString(project.project.description ?? '')} {`,
    '    model {',
    ...model,
    ...relationships,
    '    }',
    '    views {',
    ...views,
    '        styles {',
    ...[...styles.values()].flat(),
    '        }',
    '    }',
    '}',
  ];
  return { text: `${lines.join('\n')}\n`, lost };
}
