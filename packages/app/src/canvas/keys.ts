/** The canvas's keys, as its keyboard help lists them. */
export const CANVAS_KEYS: readonly { keys: string; does: string }[] = [
  {
    keys: 'Arrow keys',
    does: 'Select the nearest shape in that direction, going into the containers on the way',
  },
  {
    keys: 'Alt+Up, Alt+Down',
    does: 'Select the container of the selected shape, or the first shape inside it',
  },
  { keys: '] and [', does: 'Select the next or the previous relation of the selected element' },
  {
    keys: 'Enter',
    does: 'Go to the far end of the selected relation; on an element or a note, edit its text',
  },
  { keys: 'F2', does: 'Rename the selected element, or edit the selected note' },
  { keys: 'Shift+arrow keys', does: 'Move the selection a small step' },
  { keys: 'Delete', does: 'Delete the selection, after showing what goes with it' },
  { keys: 'Escape', does: 'Clear the selection' },
  { keys: 'Ctrl+A or ⌘A', does: 'Select everything' },
  { keys: '+, − and 0', does: 'Zoom in, zoom out, and fit the view' },
  { keys: 'Space and drag', does: 'Pan' },
  { keys: 'Tab', does: 'Leave the canvas' },
];

/** What the canvas tells screen readers about its keys when it gets the focus. */
export const CANVAS_KEYS_HINT =
  'The arrow keys select shapes, ] and [ step through the selected element’s relations, and Enter follows a relation. Every key is listed under Keyboard, after the canvas.';
