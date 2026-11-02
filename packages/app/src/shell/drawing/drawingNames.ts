/**
 * What the Drawing panel calls each preset, group, value and choice, in plain words and in English;
 * they show translated. Every value `DRAWING_VALUES` holds has a name here, and every choice a name
 * (`drawingNames.test.ts`).
 */
import type { DrawingGroup } from '@visual-anything/core';
import type { DrawingPreset } from '@visual-anything/schema';

export const PRESET_NAMES: Readonly<Record<DrawingPreset, string>> = {
  clean: 'Clean',
  dense: 'Dense',
  expressive: 'Expressive',
  'high-contrast': 'High contrast',
};

/** What each preset is, in a sentence (ADR 0086). */
export const PRESET_NOTES: Readonly<Record<DrawingPreset, string>> = {
  clean:
    'Thin neutral lines, quiet containers with a name tab, collapsed containers that count what they hold, and a dot grid.',
  dense: 'Smaller text and tighter room, rows shown sooner, and lines colored by their type.',
  expressive: 'Rounder and bolder: larger corners and names, soft shadows, lines colored by type.',
  'high-contrast': 'Thicker lines and borders, and stronger text.',
};

export const GROUP_NAMES: Readonly<Record<DrawingGroup, string>> = {
  lines: 'Lines',
  shapes: 'Shapes',
  text: 'Text',
  containers: 'Containers',
  aggregated: 'Aggregated relations',
  reading: 'Reading by zoom',
  grid: 'Grid',
};

/** A value's name, and, where the number needs it, what it is measured in. */
export interface ValueName {
  name: string;
  note?: string;
}

const CANVAS_UNITS = 'In canvas units.';
const SCALE = 'A scale of the canvas: 1 is 100 %.';

export const VALUE_NAMES: Readonly<Record<DrawingGroup, Readonly<Record<string, ValueName>>>> = {
  lines: {
    width: { name: 'Line width', note: CANVAS_UNITS },
    arrowhead: { name: 'Arrowheads' },
    arrowSize: { name: 'Arrowhead size', note: 'Times the preset’s size.' },
    cornerRadius: { name: 'Rounding of line corners', note: CANVAS_UNITS },
    parallelGap: { name: 'Gap between parallel lines', note: CANVAS_UNITS },
    color: { name: 'Line color' },
    fadeOthers: { name: 'Fade the lines away from what is pointed at or selected' },
  },
  shapes: {
    borderWidth: { name: 'Border width', note: CANVAS_UNITS },
    cornerRadius: { name: 'Rounding of corners', note: CANVAS_UNITS },
    shadow: { name: 'Shadow' },
  },
  text: {
    font: { name: 'Font' },
    nameSize: { name: 'Size of names', note: CANVAS_UNITS },
    nameWeight: { name: 'Weight of names' },
    detailSize: { name: 'Size of details', note: CANVAS_UNITS },
    rowSize: { name: 'Size of rows', note: CANVAS_UNITS },
    containerNameSize: { name: 'Size of container names', note: CANVAS_UNITS },
    labelSize: { name: 'Size of relation names', note: CANVAS_UNITS },
    noteSize: { name: 'Size of notes', note: CANVAS_UNITS },
    lineHeight: { name: 'Line spacing', note: 'Times the text’s size.' },
    padding: { name: 'Room around text in a shape', note: CANVAS_UNITS },
  },
  containers: {
    drawn: { name: 'Containers are drawn' },
    padding: { name: 'Room around their contents', note: CANVAS_UNITS },
    collapsed: { name: 'A collapsed container shows' },
  },
  aggregated: {
    count: { name: 'How many it stands for' },
    growsWithCount: { name: 'Thicker the more relations it stands for' },
  },
  reading: {
    namesFrom: { name: 'Names show from', note: SCALE },
    detailsFrom: { name: 'Details show from', note: SCALE },
    rowsFrom: { name: 'Rows show from', note: SCALE },
    labelsFrom: { name: 'Relation names show from', note: SCALE },
    farNameSize: { name: 'Size of names far out', note: 'In screen pixels.' },
  },
  grid: {
    look: { name: 'Grid drawn as' },
  },
};

/** The names of the choices of each value that takes choices, by the choice as text. */
export const CHOICE_NAMES: Readonly<
  Partial<Record<DrawingGroup, Readonly<Record<string, Readonly<Record<string, string>>>>>>
> = {
  lines: {
    arrowhead: { filled: 'Filled', open: 'Open', none: 'No arrowhead' },
    color: { 'by-type': 'By relation type', neutral: 'Neutral, the type’s when pointed at' },
  },
  shapes: { shadow: { none: 'No shadow', soft: 'Soft' } },
  text: {
    font: { roboto: 'Roboto', system: 'The system’s font' },
    nameWeight: { '400': 'Regular', '500': 'Medium', '700': 'Bold' },
  },
  containers: {
    drawn: { 'as-kind': 'As their kind', region: 'As an area with a name tab' },
    collapsed: {
      stack: 'A stack',
      count: 'How many it holds',
      'stack-and-count': 'A stack, and how many it holds',
    },
  },
  aggregated: {
    count: { label: 'A number beside the line', badge: 'A number in a rounded box on the line' },
  },
  grid: { look: { lines: 'Lines', dots: 'Dots' } },
};
