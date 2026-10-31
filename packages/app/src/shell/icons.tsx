/**
 * The icons the app draws, the one set every panel, menu and toolbar takes its icons from (A4), kept
 * in the app rather than taken from a package: paths from Lucide (https://lucide.dev, ISC license, see
 * LICENSE-lucide.txt) unless an icon says otherwise, drawn in the current text color. Each is
 * decorative (`aria-hidden`): the control that holds it carries the name, as visible or hidden text.
 * No component draws an icon of its own, as an inline `<svg>` or as a character (`icons.test.ts`).
 */
import type { ReactNode } from 'react';

interface IconProps {
  /** The size in CSS pixels; 16 by default. */
  size?: number;
  className?: string;
}

/** The box an icon's paths are drawn in, and the width of their strokes in it. */
interface IconBox {
  box: number;
  stroke: number;
}

/** Lucide's: a box of 24 with strokes of 2. */
const LUCIDE: IconBox = { box: 24, stroke: 2 };

function icon(name: string, paths: ReactNode, { box, stroke }: IconBox = LUCIDE) {
  function Icon({ size = 16, className }: IconProps) {
    return (
      <svg
        className={className === undefined ? 'icon' : `icon ${className}`}
        aria-hidden="true"
        focusable="false"
        width={size}
        height={size}
        viewBox={`0 0 ${box} ${box}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={String(stroke)}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths}
      </svg>
    );
  }
  Icon.displayName = `${name}Icon`;
  return Icon;
}

/** The product's mark, made as the icons are, so that this file exports only what its makers make. */
function productMark() {
  function ProductMark() {
    return (
      <svg
        className="shell-mark"
        aria-hidden="true"
        focusable="false"
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      >
        <rect x="1.5" y="1.5" width="11" height="11" rx="2.5" />
        <rect
          x="7.5"
          y="7.5"
          width="11"
          height="11"
          rx="2.5"
          fill="currentColor"
          fillOpacity="0.3"
        />
      </svg>
    );
  }
  return ProductMark;
}

/**
 * The product's mark: two overlapping rounded squares, in the accent color, drawn for Visual Anything
 * (not from Lucide). The header and the read-only page show it before their names.
 */
export const ProductMark = productMark();

/** Import: Lucide's "upload". */
export const ImportIcon = icon(
  'Import',
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m17 8-5-5-5 5" />
    <path d="M12 3v12" />
  </>,
);

/**
 * The stacking order's moves, drawn for Visual Anything in a box of 16 (not from Lucide): chevrons
 * up or down, to a bar at the end for the moves to the front and to the back.
 */
const STACKING: IconBox = { box: 16, stroke: 1.5 };

export const BringToFrontIcon = icon(
  'BringToFront',
  <>
    <path d="M3 2.5h10" />
    <path d="M4 9l4-4 4 4" />
    <path d="M4 13l4-4 4 4" />
  </>,
  STACKING,
);

export const BringForwardIcon = icon('BringForward', <path d="M4 10l4-4 4 4" />, STACKING);

export const SendBackwardIcon = icon('SendBackward', <path d="M4 6l4 4 4-4" />, STACKING);

export const SendToBackIcon = icon(
  'SendToBack',
  <>
    <path d="M4 3l4 4 4-4" />
    <path d="M4 7l4 4 4-4" />
    <path d="M3 13.5h10" />
  </>,
  STACKING,
);

/** A branch of a tree that is open: Lucide's "chevron-down". */
export const ChevronDownIcon = icon('ChevronDown', <path d="m6 9 6 6 6-6" />);

/** A branch of a tree that is closed: Lucide's "chevron-right". */
export const ChevronRightIcon = icon('ChevronRight', <path d="m9 18 6-6-6-6" />);

/** A column sorted up: Lucide's "arrow-up". */
export const ArrowUpIcon = icon(
  'ArrowUp',
  <>
    <path d="m5 12 7-7 7 7" />
    <path d="M12 19V5" />
  </>,
);

/** A column sorted down: Lucide's "arrow-down". */
export const ArrowDownIcon = icon(
  'ArrowDown',
  <>
    <path d="M12 5v14" />
    <path d="m19 12-7 7-7-7" />
  </>,
);

/** Back to where one came from: Lucide's "arrow-left". */
export const BackIcon = icon(
  'Back',
  <>
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </>,
);

export const ZoomInIcon = icon(
  'ZoomIn',
  <>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
    <path d="M11 8v6" />
    <path d="M8 11h6" />
  </>,
);

export const ZoomOutIcon = icon(
  'ZoomOut',
  <>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
    <path d="M8 11h6" />
  </>,
);

/** Fit the view to the window: Lucide's "maximize". */
export const FitIcon = icon(
  'Fit',
  <>
    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
    <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
    <path d="M3 16v3a2 2 0 0 0 2 2h3" />
    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
  </>,
);

/** A note: Lucide's "sticky-note". */
export const NoteIcon = icon(
  'Note',
  <>
    <path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z" />
    <path d="M15 3v6h6" />
  </>,
);

/** A free arrow: Lucide's "move-up-right". */
export const ArrowIcon = icon(
  'Arrow',
  <>
    <path d="M13 5h6v6" />
    <path d="M19 5 5 19" />
  </>,
);

/** The grid: Lucide's "grid-3x3". */
export const GridIcon = icon(
  'Grid',
  <>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M3 9h18" />
    <path d="M3 15h18" />
    <path d="M9 3v18" />
    <path d="M15 3v18" />
  </>,
);

export const RulerIcon = icon(
  'Ruler',
  <>
    <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z" />
    <path d="m14.5 12.5 2-2" />
    <path d="m11.5 9.5 2-2" />
    <path d="m8.5 6.5 2-2" />
    <path d="m17.5 15.5 2-2" />
  </>,
);

/** Snapping: Lucide's "magnet". */
export const SnapIcon = icon(
  'Snap',
  <>
    <path d="m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15" />
    <path d="m5 8 4 4" />
    <path d="m12 15 4 4" />
  </>,
);

export const SunIcon = icon(
  'Sun',
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </>,
);

export const MoonIcon = icon('Moon', <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />);

/** The system's own setting: Lucide's "monitor". */
export const MonitorIcon = icon(
  'Monitor',
  <>
    <rect width="20" height="14" x="2" y="3" rx="2" />
    <path d="M8 21h8" />
    <path d="M12 17v4" />
  </>,
);

/** The language the app reads in: Lucide's "languages". */
export const LanguageIcon = icon(
  'Language',
  <>
    <path d="m5 8 6 6" />
    <path d="m4 14 6-6 2-3" />
    <path d="M2 5h12" />
    <path d="M7 2h1" />
    <path d="m22 22-5-10-5 10" />
    <path d="M14 18h6" />
  </>,
);

/** Closing a notice or a panel: Lucide's "x". */
export const DismissIcon = icon(
  'Dismiss',
  <>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </>,
);

/** Lucide's "undo-2". */
export const UndoIcon = icon(
  'Undo',
  <>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />
  </>,
);

/** Lucide's "redo-2". */
export const RedoIcon = icon(
  'Redo',
  <>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13" />
  </>,
);

/** Lucide's "sparkles": the mark of Claude's actions in the history panel, beside its name. */
export const SparklesIcon = icon(
  'Sparkles',
  <>
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    <path d="M20 3v4" />
    <path d="M22 5h-4" />
    <path d="M4 17v2" />
    <path d="M5 18H3" />
  </>,
);

/** Lucide's "download": Export, which the browser saves. */
export const DownloadIcon = icon(
  'Download',
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m7 10 5 5 5-5" />
    <path d="M12 15V3" />
  </>,
);

/** Lucide's "git-compare-arrows", for Compare with… (ADR 0070). */
export const CompareIcon = icon(
  'Compare',
  <>
    <circle cx="5" cy="6" r="3" />
    <path d="M12 6h5a2 2 0 0 1 2 2v7" />
    <path d="m15 9-3-3 3-3" />
    <circle cx="19" cy="18" r="3" />
    <path d="M12 18H7a2 2 0 0 1-2-2V9" />
    <path d="m9 15 3 3-3 3" />
  </>,
);

/** Lucide's "link", for Copy address (W21). */
export const LinkIcon = icon(
  'Link',
  <>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </>,
);

/** Lucide's "search", for the find field (W21). */
export const SearchIcon = icon(
  'Search',
  <>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </>,
);

/** Lucide's "ellipsis", for the canvas toolbar's More (W26). */
export const MoreIcon = icon(
  'More',
  <>
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
    <circle cx="5" cy="12" r="1" />
  </>,
);

/** Lucide's "info", for the read-only page's About (W33). */
export const InfoIcon = icon(
  'Info',
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </>,
);

/** Lucide's "filter", for the read-only page's Explore (W33). */
export const FilterIcon = icon(
  'Filter',
  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />,
);

/** Lucide's "list", for the read-only page's Outline (W33). */
export const ListIcon = icon(
  'List',
  <>
    <path d="M3 6h.01" />
    <path d="M3 12h.01" />
    <path d="M3 18h.01" />
    <path d="M8 6h13" />
    <path d="M8 12h13" />
    <path d="M8 18h13" />
  </>,
);

/** Lucide's "play", for playing a scenario in the read-only page (W33). */
export const PlayIcon = icon('Play', <polygon points="6 3 20 12 6 21 6 3" />);

/** Lucide's "pause" (W33). */
export const PauseIcon = icon(
  'Pause',
  <>
    <rect x="14" y="4" width="4" height="16" rx="1" />
    <rect x="6" y="4" width="4" height="16" rx="1" />
  </>,
);

/** Lucide's "skip-back", for the previous step (W33). */
export const PreviousIcon = icon(
  'Previous',
  <>
    <polygon points="19 20 9 12 19 4 19 20" />
    <path d="M5 19V5" />
  </>,
);

/** Lucide's "skip-forward", for the next step (W33). */
export const NextIcon = icon(
  'Next',
  <>
    <polygon points="5 4 15 12 5 20 5 4" />
    <path d="M19 5v14" />
  </>,
);

/** Lucide's "table", for the element list (M8, W36). */
export const TableIcon = icon(
  'Table',
  <>
    <path d="M12 3v18" />
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M3 9h18" />
    <path d="M3 15h18" />
  </>,
);

/** Lucide's "presentation", for the read-only page's tours (ADR 0058). */
export const TourIcon = icon(
  'Tour',
  <>
    <path d="M2 3h20" />
    <path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3" />
    <path d="m7 21 5-5 5 5" />
  </>,
);

/** Lucide's "file-text", for a tour's speaker notes. */
export const NotesIcon = icon(
  'Notes',
  <>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M10 9H8" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
  </>,
);

/** Lucide's "panel-left-close", to collapse the model panel. */
export const PanelLeftCloseIcon = icon(
  'PanelLeftClose',
  <>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18" />
    <path d="m16 15-3-3 3-3" />
  </>,
);

/** Lucide's "panel-left-open", to open the model panel again. */
export const PanelLeftOpenIcon = icon(
  'PanelLeftOpen',
  <>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18" />
    <path d="m14 9 3 3-3 3" />
  </>,
);

/** Lucide's "panel-right-close", to collapse the inspector. */
export const PanelRightCloseIcon = icon(
  'PanelRightClose',
  <>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M15 3v18" />
    <path d="m8 9 3 3-3 3" />
  </>,
);

/** Lucide's "panel-right-open", to open the inspector again. */
export const PanelRightOpenIcon = icon(
  'PanelRightOpen',
  <>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M15 3v18" />
    <path d="m10 15-3-3 3-3" />
  </>,
);

/** Lucide's "box": what is in physical space, as the outline marks it (ADR 0076). */
export const SpaceIcon = icon(
  'Space',
  <>
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5" />
    <path d="M12 22V12" />
  </>,
);

/** Lucide's "scissors": the physical-space panel's cut (ADR 0076). */
export const CutIcon = icon(
  'Cut',
  <>
    <circle cx="6" cy="6" r="3" />
    <path d="M8.12 8.12 12 12" />
    <path d="M20 4 8.12 15.88" />
    <circle cx="6" cy="18" r="3" />
    <path d="M14.8 14.8 20 20" />
  </>,
);

/** Lucide's "expand": the physical-space panel's exploded view (ADR 0076). */
export const ExplodeIcon = icon(
  'Explode',
  <>
    <path d="m15 15 6 6" />
    <path d="m15 9 6-6" />
    <path d="M21 16v5h-5" />
    <path d="M21 8V3h-5" />
    <path d="M3 16v5h5" />
    <path d="m3 21 6-6" />
    <path d="M3 8V3h5" />
    <path d="M9 9 3 3" />
  </>,
);

/** Lucide's "tag": names written in the physical-space panel (ADR 0076). */
export const NamesIcon = icon(
  'Names',
  <>
    <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
    <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
  </>,
);

/** Lucide's "waypoints": the relations of the selection, drawn in the physical-space panel. */
export const RelationsIcon = icon(
  'Relations',
  <>
    <circle cx="12" cy="4.5" r="2.5" />
    <path d="m10.2 6.3-3.9 3.9" />
    <circle cx="4.5" cy="12" r="2.5" />
    <path d="M7 12h10" />
    <circle cx="19.5" cy="12" r="2.5" />
    <path d="m13.8 17.7 3.9-3.9" />
    <circle cx="12" cy="19.5" r="2.5" />
  </>,
);

/** Lucide's "globe": World, which the physical-space panel goes back to (ADR 0076). */
export const WorldIcon = icon(
  'World',
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
    <path d="M2 12h20" />
  </>,
);
