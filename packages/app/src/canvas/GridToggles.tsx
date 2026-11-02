import { useT } from '../i18n';
import { GridIcon, RulerIcon, SnapIcon } from '../shell/icons';
import type { GridOptions } from './renderer';
import './grid.css';

export interface GridTogglesProps {
  grid: GridOptions;
  /** Changes the person's preferences: the grid, snapping, or the rulers. */
  onGrid: (changes: Partial<GridOptions>) => void;
}

/**
 * The canvas toolbar's toggles of the grid, of snapping to it and of the rulers (A3): each pressed
 * while it is on, as Shift+G and Shift+R turn the grid and the rulers on and off. Snapping takes
 * effect only while the grid shows, so its toggle is off until then.
 */
export function GridToggles({ grid, onGrid }: GridTogglesProps) {
  const t = useT();
  return (
    <div className="canvas-toolbar-grid" role="group" aria-label={t('Grid and rulers')}>
      <button
        type="button"
        aria-pressed={grid.grid}
        aria-keyshortcuts="Shift+G"
        title={t('Show the grid (Shift+G)')}
        onClick={() => onGrid({ grid: !grid.grid })}
      >
        <GridIcon />
        <span className="canvas-toolbar-label">{t('Grid')}</span>
      </button>
      <button
        type="button"
        aria-pressed={grid.snapToGrid}
        disabled={!grid.grid}
        title={
          grid.grid
            ? t('Snap shapes to the grid; hold Alt to place freely')
            : t('Show the grid to snap shapes to it')
        }
        onClick={() => onGrid({ snapToGrid: !grid.snapToGrid })}
      >
        <SnapIcon />
        <span className="canvas-toolbar-label">{t('Snap to grid')}</span>
      </button>
      <button
        type="button"
        aria-pressed={grid.rulers}
        aria-keyshortcuts="Shift+R"
        title={t('Show the rulers (Shift+R)')}
        onClick={() => onGrid({ rulers: !grid.rulers })}
      >
        <RulerIcon />
        <span className="canvas-toolbar-label">{t('Rulers')}</span>
      </button>
    </div>
  );
}
