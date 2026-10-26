/**
 * The keys of aligning and resizing shapes (ADR 0074), as the canvas's keyboard help lists them, in
 * English; the help shows them translated. Listed after the canvas's own, before those of routes.
 */
export const SHAPE_KEYS: readonly { keys: string; does: string }[] = [
  {
    keys: 'Alt+Shift+arrow keys (⌥⇧ on macOS)',
    does: 'Align the selected shapes to that side: left, right, top or bottom',
  },
  {
    keys: 'Shift while resizing',
    does: 'Keep the shape’s proportions; a shape whose outline keeps them changes them',
  },
  { keys: 'Alt while resizing (⌥ on macOS)', does: 'Resize the shape from its middle' },
  {
    keys: 'Ctrl while dragging or resizing (⌘ on macOS)',
    does: 'Turn the alignment guides off, as Alt does while dragging',
  },
  {
    keys: 'Escape while dragging or resizing',
    does: 'Stop, and leave the shapes as they were',
  },
];
