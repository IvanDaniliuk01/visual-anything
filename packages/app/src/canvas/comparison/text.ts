/** What the comparison's drawings are called, on the canvas and in exports (ADR 0070). */
import type { Translator } from '../../i18n';
import type { ComparisonDrawing } from './scene';

/** What a drawing is called on its button. */
export function drawingName(t: Translator, drawing: ComparisonDrawing): string {
  switch (drawing) {
    case 'before':
      return t('Before');
    case 'after':
      return t('After');
    case 'comparison':
      return t('Comparison');
  }
}
