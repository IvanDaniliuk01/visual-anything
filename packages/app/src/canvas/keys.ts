import { SHAPE_KEYS } from './shapeKeys';

/**
 * The keys of a selected relation's route (ADR 0039): its menu, removing a bend point, Alt, and the
 * keys of route editing, after Edit the route… in the relation's menu or the inspector. Listed after
 * the canvas's own.
 */
export const ROUTE_KEYS: readonly { keys: string; does: string }[] = [
  {
    keys: 'Shift+F10 or the menu key, on a relation',
    does: 'Open the relation’s menu: its style, Reset route, and Edit the route…',
  },
  {
    keys: 'Alt while dragging an end or a bend point of a route (⌥ on macOS)',
    does: 'Place it without snapping, at the exact border point or where it is let go',
  },
  {
    keys: 'Delete, with a bend point chosen',
    does: 'Remove the bend point from the route; double-clicking it does too',
  },
  {
    keys: 'Tab and Shift+Tab, editing a route',
    does: 'The next or the previous handle: the start, the bend points and the middles of the segments, the end',
  },
  {
    keys: 'Arrow keys, editing a route',
    does: 'Move the bend point or the segment by 1 unit, with Shift by 8; on an end, move it along the border by 1 unit, round the corners, and with Shift to the next connection point',
  },
  {
    keys: 'Insert or Ctrl+Enter, editing a route',
    does: 'Add a bend point at the middle of the chosen segment, or after the chosen bend point',
  },
  { keys: 'Delete or Backspace, editing a route', does: 'Remove the chosen bend point' },
  { keys: 'A, editing a route', does: 'Attach the chosen end automatically' },
  { keys: 'Enter, editing a route', does: 'Apply every change, as one action' },
  { keys: 'Escape, editing a route', does: 'Cancel, and leave the route as it was' },
];

/** The canvas's keys, as its keyboard help lists them, in English; the help shows them translated. */
export const CANVAS_KEYS: readonly { keys: string; does: string }[] = [
  {
    keys: 'Arrow keys',
    does: 'Select the nearest shape in that direction, going into the containers on the way',
  },
  {
    keys: 'Alt+Up, Alt+Down',
    does: 'Select the container of the selected shape, or the first shape inside it',
  },
  {
    keys: '] and [, or . and ,',
    does: 'Select the next or the previous relation of the selected element',
  },
  {
    keys: 'Enter',
    does: 'Go to the far end of the selected relation; on an element or a note, edit its text',
  },
  { keys: 'F2', does: 'Rename the selected element, or edit the selected note' },
  {
    keys: 'Alt+Enter',
    does: 'Follow the selected element’s destination, as double-clicking the mark in its bottom left corner does',
  },
  { keys: 'Shift+arrow keys', does: 'Move the selection one grid step' },
  {
    keys: 'Shift+Up, Shift+Down on a row',
    does: 'Move the row up or down among the rows of its table, in the model’s order',
  },
  {
    keys: 'Ctrl+Enter (⌘Enter on macOS)',
    does: 'On a table, add a row at its end; on a row, add one below it; then edit its name, where Ctrl+Enter adds the next row and Escape stops',
  },
  {
    keys: 'Ctrl+↑ and Ctrl+↓ (⌘ on macOS), or Ctrl+] and Ctrl+[',
    does: 'Bring the selection forward or send it backward, past the next shape it overlaps; these keys work wherever the focus is, except while typing',
  },
  {
    keys: 'Ctrl+Shift+↑ and Ctrl+Shift+↓, or Ctrl+} and Ctrl+{ (⌥⌘] and ⌥⌘[ on macOS)',
    does: 'Bring the selection to the front or send it to the back of its container',
  },
  {
    keys: 'Shift+F10 or the menu key',
    does: 'Open the selected shape’s menu: stacking order, putting it inside a container or taking it out, adding inside it',
  },
  {
    keys: 'Alt while dragging (⌥ on macOS)',
    does: 'Move without putting shapes inside a container or taking them out, and place them freely, without snapping to the grid',
  },
  { keys: 'Delete', does: 'Delete the selection, after showing what goes with it' },
  { keys: 'Escape', does: 'Clear the selection' },
  { keys: 'Ctrl+A or ⌘A', does: 'Select everything' },
  { keys: '+, − and 0', does: 'Zoom in, zoom out, and fit the view' },
  { keys: 'Alt+− and Alt++', does: 'Collapse or expand the selected containers' },
  { keys: 'Shift+G', does: 'Show or hide the grid' },
  { keys: 'Shift+R', does: 'Show or hide the rulers' },
  { keys: 'Space and drag', does: 'Pan' },
  {
    keys: 'Ctrl+F or ⌘F',
    does: 'Find names, ids, components and attribute values in the project, and go to what was found',
  },
  { keys: 'Tab', does: 'Leave the canvas' },
  ...SHAPE_KEYS,
  ...ROUTE_KEYS,
];

/** What the canvas tells screen readers about its keys when it gets the focus. */
export const CANVAS_KEYS_HINT =
  'The arrow keys select shapes, ] and [ (or . and ,) step through the selected element’s relations, and Enter follows a relation, and Shift+F10 opens the selected shape’s menu. Every key is listed under Keyboard, after the canvas.';
