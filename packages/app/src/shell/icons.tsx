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
