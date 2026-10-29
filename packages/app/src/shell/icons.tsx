/**
 * The icons the app draws, kept in the app rather than taken from a package: paths from Lucide
 * (https://lucide.dev, ISC license, see LICENSE-lucide.txt), drawn in the current text color. Each is
 * decorative (`aria-hidden`): the control that holds it carries the name, as visible or hidden text.
 */
import type { ReactNode } from 'react';

interface IconProps {
  /** The size in CSS pixels; 16 by default. */
  size?: number;
  className?: string;
}

function icon(name: string, paths: ReactNode) {
  function Icon({ size = 16, className }: IconProps) {
    return (
      <svg
        className={className === undefined ? 'icon' : `icon ${className}`}
        aria-hidden="true"
        focusable="false"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
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
