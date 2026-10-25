/**
 * The outline of a view in Markdown (M6b, R33): what the outline panel lists, as text. What sits
 * directly in World, then what sits inside each container, in the model's order, with the relations
 * drawn from each shape under it, the relations that end on a relation under that one, the view's
 * notes, and the steps of the scenarios that play over it.
 *
 * It is the view's long description (W3C's complex images; the SVG's `<desc>` and the PDF name it),
 * and context for a language model, as IcePanel's LLMs.txt export is. Everything people wrote is
 * escaped, so that a name can never become a heading, a link, a list or HTML where it is read.
 */
import { modelIndexOf, type ProjectSnapshot } from '@visual-anything/core';
import type { Id, JsonValue, ScenarioFile, Step, ViewFile } from '@visual-anything/schema';
import { nameOfEnd } from '../canvas/announce';
import { buildScene } from '../canvas/scene';
import { t } from '../i18n';
import {
  outlineOf,
  type OutlineItem,
  type RelationItem,
  type ShapeItem,
} from '../shell/outlineItems';
import { codeSpan, markdownBlock, markdownInline } from './markdown';

/** A text export: its text, and what it could not say, in the language the app reads in. */
export interface TextExport {
  text: string;
  lost: string[];
}

/** The longest a step's data is written, in characters; past it, it is cut with "…". */
const MOST_DATA = 600;

/** Writes the outline of the view with this id in Markdown. Throws when the project has no such view. */
export function writeOutline(project: ProjectSnapshot, viewId: Id): TextExport {
  const view = project.views.find((each) => each.id === viewId);
  if (!view) throw new RangeError(`The project has no view "${viewId}".`);
  const scene = buildScene(project, viewId);
  // Everything the view draws: filters and focus belong to an open app, and hide nothing here.
  const outline = outlineOf(scene, project, new Set());
  const lines: string[] = [`# ${markdownInline(view.name)}`, ''];
  const description = view.description?.trim();
  if (description) lines.push(markdownBlock(description), '');
  lines.push(
    t('Perspective: {perspective}.', { perspective: markdownInline(view.perspective.name) }),
    '',
    t(
      'An outline of the view “{view}” of the project “{project}”: what sits directly in World, what sits inside each container, and the relations drawn from each shape, in the model’s order.',
      { view: markdownInline(view.name), project: markdownInline(project.project.name) },
    ),
    '',
  );

  const shapes: string[] = [];
  const notes: string[] = [];
  const visit = (item: OutlineItem, depth: number, path: ReadonlySet<string>) => {
    const indent = '  '.repeat(depth);
    switch (item.kind) {
      case 'shape':
        shapes.push(`${indent}- ${shapeLine(item)}`);
        break;
      case 'relation':
        shapes.push(`${indent}- ${relationLine(item)}`);
        break;
      case 'undrawn':
        shapes.push(
          `${indent}- ${t('{name}, held by its row and not drawn', { name: `**${markdownInline(item.name)}**` })}`,
        );
        return;
      case 'note':
        notes.push(`- ${markdownInline(item.note.text)}`);
        return;
      case 'arrow':
        return;
    }
    // A row's insides are listed once on the way down, whatever loops a malformed file holds.
    if (path.has(item.id)) return;
    const inner = new Set(path).add(item.id);
    for (const child of outline.inside(item)) visit(child, depth + 1, inner);
  };
  for (const item of outline.top) visit(item, 0, new Set());

  lines.push(`## ${t('Shapes and relations')}`, '');
  lines.push(...(shapes.length > 0 ? shapes : [t('The view draws no shape.')]), '');
  if (notes.length > 0) lines.push(`## ${t('Notes')}`, '', ...notes, '');

  const scenarios = project.scenarios.filter((scenario) => scenario.view === view.id);
  if (scenarios.length > 0) {
    lines.push(`## ${t('Scenarios')}`, '');
    for (const scenario of scenarios) lines.push(...scenarioLines(project, scenario));
  }

  const lost = lostOf(view, scene.arrows.length);
  lines.push(`## ${t('What this outline leaves out')}`, '', ...lost.map((each) => `- ${each}`), '');
  return { text: `${lines.join('\n').trimEnd()}\n`, lost };
}

/** A shape's line: its name in bold, its component, and when collapsed, how many it holds. */
function shapeLine(item: ShapeItem): string {
  const { shape } = item;
  const name = `**${markdownInline(shape.name)}**`;
  const component = markdownInline(shape.componentName);
  return shape.collapsed === undefined
    ? `${name} (${component})`
    : t('{name} ({component}), collapsed, with {count} inside', {
        name,
        component,
        count: shape.collapsed.contents,
      });
}

/** The arrow a relation's line starts with, seen from the shape it is listed under. */
const WAYS = { out: '→', in: '←', both: '—' } as const;

/** A relation's line: which way it runs, its relation type, its far end, and its own name. */
function relationLine(item: RelationItem): string {
  const type = markdownInline(item.relationType);
  const far = `**${markdownInline(item.farName)}**`;
  if (item.stands) {
    return t('{way} {count} relations “{type}” with {far}, aggregated', {
      way: WAYS[item.way],
      count: item.stands.length,
      type,
      far,
    });
  }
  const line = `${WAYS[item.way]} ${type} ${far}`;
  return item.name ? `${line}: “${markdownInline(item.name)}”` : line;
}

/** A scenario's heading, description and steps, each step with its relations and its data. */
function scenarioLines(project: ProjectSnapshot, scenario: ScenarioFile): string[] {
  const index = modelIndexOf(project);
  const lines = [`### ${markdownInline(scenario.name)}`, ''];
  const description = scenario.description?.trim();
  if (description) lines.push(markdownBlock(description), '');
  scenario.steps.forEach((step: Step, at) => {
    const text =
      step.description.trim() === '' ? t('(no description)') : markdownInline(step.description);
    lines.push(`${at + 1}. ${text}`);
    for (const relation of step.relations) {
      lines.push(
        index.relation(relation)
          ? `   - ${markdownInline(nameOfEnd(project, relation))}`
          : `   - ${t('A relation that no longer exists: a broken step.')}`,
      );
    }
    if (step.dataIn !== undefined) lines.push(`   - ${t('Takes in')}: ${dataOf(step.dataIn)}`);
    if (step.dataOut !== undefined) lines.push(`   - ${t('Produces')}: ${dataOf(step.dataOut)}`);
  });
  lines.push('');
  return lines;
}

/** A step's data as JSON in a code span, cut when long. */
function dataOf(value: JsonValue): string {
  const json = JSON.stringify(value);
  return codeSpan(json.length > MOST_DATA ? `${json.slice(0, MOST_DATA)}…` : json);
}

/** What an outline of a view says nothing about. */
function lostOf(view: ViewFile, arrows: number): string[] {
  const lost = [
    t(
      'Where each shape is, its size and its colors: the outline lists what the view shows, not how it draws it.',
    ),
    t('The routes of relations and their bend points.'),
    t('Pictures.'),
  ];
  if (arrows > 0) lost.push(t('Free arrows, which point at places rather than at shapes.'));
  if ((view.collapsed?.length ?? 0) > 0) {
    lost.push(t('What collapsed containers hold, as the view draws none of it.'));
  }
  return lost;
}
