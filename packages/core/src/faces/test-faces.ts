/** Faces and inputs for the faces' tests. */
import type { JsonValue } from '@visual-anything/schema';
import type { ResolvedFace } from './compile';
import type { FaceInput, FaceValue } from './input';

export function face(
  markup: string | readonly string[],
  style: string | readonly string[] = [],
  more: Partial<ResolvedFace> = {},
): ResolvedFace {
  return {
    size: 'shape',
    markup: typeof markup === 'string' ? markup.split('\n') : markup,
    style: typeof style === 'string' ? style.split('\n') : style,
    variants: [],
    ...more,
  };
}

export function input(
  attributes: Record<string, JsonValue | undefined> = {},
  more: Partial<FaceInput> & { definitions?: Record<string, Partial<FaceValue>> } = {},
): FaceInput {
  const { definitions = {}, ...rest } = more;
  return {
    name: 'orders',
    component: 'Table',
    attributes: Object.entries(attributes).map(([name, value]) => ({
      name,
      value,
      ...definitions[name],
    })),
    ...rest,
  };
}

/** The ADR's example face: a table's name, a status badge, its description and its rows. */
export const ADR_FACE: ResolvedFace = face(
  [
    '<div class="head">',
    '  <b>{{name}}</b>',
    '  <span class="badge status-{{status}}" if="status">{{status}}</span>',
    '</div>',
    '<p class="desc" if="descripcion">{{descripcion}}</p>',
    '<rows/>',
  ],
  [
    '.head { display: flex; gap: 6px; padding: 8px; background: var(--fill); }',
    '.head b { flex: 1; font-size: 14px; line-clamp: 1; }',
    '.badge { padding: 2px 6px; border-radius: 4px; font-size: 11px; background: var(--highlight); }',
    '.status-frozen { background: #9DC3E6; }',
    '.desc { padding: 0 8px 8px; font-size: 11px; color: var(--text-muted); line-clamp: 3; }',
  ],
  { size: 'content', variants: [{ id: 'far', markup: ['<b class="far">{{name}}</b>'] }] },
);
