/**
 * What the Drawing panel edits (A5.4, ADR 0086): the drawing defaults of the project or of the open
 * view, one layer at a time. It says where each value shown comes from (the preset, the project or
 * the view), and makes each change, a value set or reset, a group reset, every value reset or another
 * preset, into one `set-drawing-defaults` command that writes the layer's whole `drawing`.
 */
import {
  DEFAULT_DRAWING_PRESET,
  compactDrawing,
  resolveDrawing,
  type DrawingGroup,
  type ProjectSnapshot,
  type ResolvedDrawing,
  type SetDrawingDefaultsCommand,
} from '@visual-anything/core';
import type { DrawingDefaults, DrawingPreset, Id } from '@visual-anything/schema';

/** Which layer the panel changes: the project's, or the open view's alone. */
export type DrawingScope = 'project' | 'view';

/** Where a value shown comes from. */
export type DrawingSource = 'preset' | 'project' | 'view';

/** A value a drawing group holds. */
export type DrawingValue = string | number | boolean;

/** The two layers over the preset: the project's drawing defaults and the open view's. */
export interface DrawingLayers {
  project: DrawingDefaults | undefined;
  /** The open view's id, if a view is open. */
  viewId: Id | undefined;
  view: DrawingDefaults | undefined;
}

export function layersOf(project: ProjectSnapshot, viewId: Id | undefined): DrawingLayers {
  const view = viewId === undefined ? undefined : project.views.find((each) => each.id === viewId);
  return {
    project: project.project.drawing,
    viewId: view?.id,
    view: view?.drawing,
  };
}

/** The layer a scope changes. */
export function layerOf(layers: DrawingLayers, scope: DrawingScope): DrawingDefaults | undefined {
  return scope === 'project' ? layers.project : layers.view;
}

/** Whether the open view names a preset of its own, so that the project's values do not reach it. */
export function viewHasOwnPreset(layers: DrawingLayers): boolean {
  return layers.view?.preset !== undefined;
}

/** The values the panel shows for a scope: the project's, or what the open view is drawn with. */
export function shownDrawing(layers: DrawingLayers, scope: DrawingScope): ResolvedDrawing {
  return scope === 'project'
    ? resolveDrawing(layers.project, undefined)
    : resolveDrawing(layers.project, layers.view);
}

function setIn(layer: DrawingDefaults | undefined, group: DrawingGroup, name: string): boolean {
  const values = layer?.[group] as Record<string, unknown> | undefined;
  return values?.[name] !== undefined;
}

/** Where the value of `group.name` shown for a scope comes from, as `resolveDrawing` lays them. */
export function sourceOf(
  layers: DrawingLayers,
  scope: DrawingScope,
  group: DrawingGroup,
  name: string,
): DrawingSource {
  if (scope === 'view' && setIn(layers.view, group, name)) return 'view';
  const projectReaches = scope === 'project' || !viewHasOwnPreset(layers);
  if (projectReaches && setIn(layers.project, group, name)) return 'project';
  return 'preset';
}

/** Where the preset shown for a scope comes from: Clean as built in when neither layer names one. */
export function presetSourceOf(layers: DrawingLayers, scope: DrawingScope): DrawingSource {
  if (scope === 'view' && layers.view?.preset !== undefined) return 'view';
  if (layers.project?.preset !== undefined) return 'project';
  return 'preset';
}

/** The preset the project names, Clean when it names none. */
export function projectPresetOf(layers: DrawingLayers): DrawingPreset {
  return layers.project?.preset ?? DEFAULT_DRAWING_PRESET;
}

/**
 * Whether, in the project's scope, the open view changes `group.name` for itself: then the canvas,
 * which shows the view, does not draw the project's value there.
 */
export function viewChanges(layers: DrawingLayers, group: DrawingGroup, name: string): boolean {
  return setIn(layers.view, group, name);
}

/** How many values of a group the layer sets. */
export function countSetIn(layer: DrawingDefaults | undefined, group: DrawingGroup): number {
  const values = layer?.[group] as Record<string, unknown> | undefined;
  return values === undefined
    ? 0
    : Object.values(values).filter((each) => each !== undefined).length;
}

/** The layer with `group.name` set to `value`. */
export function withValue(
  layer: DrawingDefaults | undefined,
  group: DrawingGroup,
  name: string,
  value: DrawingValue,
): DrawingDefaults {
  const values = { ...(layer?.[group] as Record<string, unknown> | undefined), [name]: value };
  return { ...layer, [group]: values };
}

/** The layer without `group.name`: the layer under it shows again. */
export function withoutValue(
  layer: DrawingDefaults | undefined,
  group: DrawingGroup,
  name: string,
): DrawingDefaults {
  const values = { ...(layer?.[group] as Record<string, unknown> | undefined) };
  delete values[name];
  return { ...layer, [group]: values };
}

/** The layer without any value of `group`. */
export function withoutGroup(
  layer: DrawingDefaults | undefined,
  group: DrawingGroup,
): DrawingDefaults {
  const next = { ...layer };
  delete next[group];
  return next;
}

/** The layer naming `preset`, or, with none, the layer under it's. Its values stay as they are. */
export function withPreset(
  layer: DrawingDefaults | undefined,
  preset: DrawingPreset | undefined,
): DrawingDefaults {
  const next = { ...layer };
  if (preset === undefined) delete next.preset;
  else next.preset = preset;
  return next;
}

/**
 * The command that writes a scope's layer whole, as `next` gives it; `null`, when nothing is left,
 * goes back to the preset as built in, or, for a view, to the project's. None when nothing changes.
 */
export function drawingCommand(
  layers: DrawingLayers,
  scope: DrawingScope,
  next: DrawingDefaults | null,
): SetDrawingDefaultsCommand | undefined {
  const drawing = next === null ? null : (compactDrawing(next) ?? null);
  const before = layerOf(layers, scope);
  const was = before === undefined ? null : (compactDrawing(before) ?? null);
  if (sorted(drawing) === sorted(was)) return undefined;
  if (scope === 'view') {
    if (layers.viewId === undefined) return undefined;
    return { type: 'set-drawing-defaults', view: layers.viewId, drawing };
  }
  return { type: 'set-drawing-defaults', drawing };
}

/** The JSON of a value with its keys in order, so that two layers that hold the same compare equal. */
function sorted(value: unknown): string {
  return JSON.stringify(value, (_key, each: unknown) =>
    typeof each === 'object' && each !== null && !Array.isArray(each)
      ? Object.fromEntries(Object.entries(each).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : each,
  );
}
