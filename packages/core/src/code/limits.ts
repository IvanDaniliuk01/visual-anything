/**
 * The limits of package code (ADR 0054): how long a call and how much memory a package may take, how
 * large its code may be, and how large each answer of its hooks may be. An answer past a cap is
 * dropped with a warning, never cut and kept.
 */
export const CODE_LIMITS = Object.freeze({
  /** How long one call may run, in milliseconds, before it is stopped. */
  callMs: 50,
  /** How much memory the runtime of one package may hold, in bytes. */
  memoryBytes: 32 * 1024 * 1024,
  /** The calls in a row that may stop before the package's code is turned off. */
  stopsBeforeOff: 3,
  /** The longest code a package may hold, in characters, its lines joined by line feeds. */
  codeText: 256 * 1024,
  /** The most lines and the longest line, as the schema has them. */
  lines: 20_000,
  lineLength: 10_000,
  /** The most capabilities a package may declare. */
  capabilities: 16,
  /** The longest answer of one call, written as JSON, in characters. */
  answerText: 64 * 1024,
  /** How deep an answer's values may nest. */
  depth: 16,
  /** The most computed attributes for one element, and the longest value of one, as JSON. */
  attributes: 64,
  attributeText: 1024,
  /** The longest name of a computed attribute. */
  attributeName: 64,
  /** The most problems `check` may answer for one element, and the longest message of one. */
  problems: 16,
  problemText: 300,
  /** The most items of one drawing, points of one line and characters of one text. */
  drawingItems: 256,
  drawingPoints: 64,
  drawingText: 80,
  /** The largest box a drawing may declare, either way, in its own units. */
  drawingSize: 10_000,
  /** The most relations, containers and contents a hook's context holds. */
  contextItems: 500,
  /**
   * How long one call of `act`, `importFile` or `exportFile` may run (ADR 0089), in milliseconds: the
   * person asked for it and waits, with a notice, so it has longer than the hooks the canvas calls.
   */
  extensionCallMs: 2000,
  /** The most commands an action or an importer may answer, and its longest answer as JSON. */
  changesCommands: 500,
  changesText: 1024 * 1024,
  /** The longest file an importer is given and an exporter may answer, in characters. */
  importText: 4 * 1024 * 1024,
  exportText: 4 * 1024 * 1024,
  /** The most blocks of a panel, the longest text of one, and a table's and a chart's sizes. */
  panelBlocks: 64,
  panelText: 2000,
  panelColumns: 12,
  panelRows: 200,
  panelSeries: 6,
});
