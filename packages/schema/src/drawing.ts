/**
 * Drawing defaults (A5, ADR 0086): the values the canvas, the read-only page and every export draw
 * with wherever no appearance sets them, kept in the project file and changed again by a view. Each
 * value left out is the layer's under it: a view's, then the project's, then its preset's.
 */

/** A named, built-in set of drawing defaults. */
export type DrawingPreset = 'clean' | 'dense' | 'expressive' | 'high-contrast';

/** How a relation's lines are drawn where its appearance sets nothing. */
export interface DrawingLines {
  /**
   * @minimum 0.5
   * @maximum 8
   */
  width?: number;
  arrowhead?: 'filled' | 'open' | 'none';
  /**
   * The arrowhead's size as a multiple of the preset's.
   *
   * @minimum 0.5
   * @maximum 3
   */
  arrowSize?: number;
  /**
   * The radius of a rounded route's corners.
   *
   * @minimum 0
   * @maximum 48
   */
  cornerRadius?: number;
  /**
   * How far apart parallel lines between the same shapes run.
   *
   * @minimum 8
   * @maximum 64
   */
  parallelGap?: number;
  /** A relation type's built-in color, or one neutral color, with the type's on hover and selection. */
  color?: 'by-type' | 'neutral';
  /** Whether the lines that do not touch what the pointer is on fade; selecting fades by the view's `selectionFadesLines`. */
  fadeOthers?: boolean;
}

/** How shapes are drawn where their appearance sets nothing. */
export interface DrawingShapes {
  /**
   * @minimum 0.5
   * @maximum 6
   */
  borderWidth?: number;
  /**
   * The corner radius of rounded kinds.
   *
   * @minimum 0
   * @maximum 32
   */
  cornerRadius?: number;
  shadow?: 'none' | 'soft';
}

/** The type the canvas writes in. */
export interface DrawingText {
  font?: 'roboto' | 'system';
  /**
   * @minimum 9
   * @maximum 32
   */
  nameSize?: number;
  nameWeight?: 400 | 500 | 700;
  /**
   * @minimum 8
   * @maximum 24
   */
  detailSize?: number;
  /**
   * @minimum 8
   * @maximum 24
   */
  rowSize?: number;
  /**
   * @minimum 8
   * @maximum 32
   */
  containerNameSize?: number;
  /**
   * @minimum 8
   * @maximum 24
   */
  labelSize?: number;
  /**
   * @minimum 8
   * @maximum 32
   */
  noteSize?: number;
  /**
   * @minimum 1
   * @maximum 2
   */
  lineHeight?: number;
  /**
   * The inset of a shape's text block.
   *
   * @minimum 2
   * @maximum 32
   */
  padding?: number;
}

/** How containers are drawn. */
export interface DrawingContainers {
  /** As their kind, or as a region with a name tab and their kind's icon. */
  drawn?: 'as-kind' | 'region';
  /**
   * The room between a container's border and its contents.
   *
   * @minimum 8
   * @maximum 96
   */
  padding?: number;
  /** How a collapsed container shows that it holds more. */
  collapsed?: 'stack' | 'count' | 'stack-and-count';
}

/** How the one line drawn for several relations shows how many it stands for. */
export interface DrawingAggregated {
  count?: 'label' | 'badge';
  growsWithCount?: boolean;
}

/** The zoom levels at which what a shape says shows. */
export interface DrawingReading {
  /**
   * @minimum 0.05
   * @maximum 2
   */
  namesFrom?: number;
  /**
   * @minimum 0.05
   * @maximum 2
   */
  detailsFrom?: number;
  /**
   * @minimum 0.05
   * @maximum 2
   */
  rowsFrom?: number;
  /**
   * @minimum 0.05
   * @maximum 2
   */
  labelsFrom?: number;
  /**
   * The size, in screen pixels, of the names written over shapes too small to hold them.
   *
   * @minimum 9
   * @maximum 24
   */
  farNameSize?: number;
}

/** How the grid is drawn when it shows. */
export interface DrawingGrid {
  look?: 'lines' | 'dots';
}

/** Drawing defaults, by group; whatever is left out is the layer's under it. */
export interface DrawingDefaults {
  /** The preset the values below change; in a view, a preset of its own. Left out: Clean. */
  preset?: DrawingPreset;
  lines?: DrawingLines;
  shapes?: DrawingShapes;
  text?: DrawingText;
  containers?: DrawingContainers;
  aggregated?: DrawingAggregated;
  reading?: DrawingReading;
  grid?: DrawingGrid;
}
