import type { ProjectSnapshot } from '@visual-anything/core';
import type { Face } from '@visual-anything/schema';

/**
 * A table's face (ADR 0083): its name in bold over its component's name, padded, as the header of its
 * rows; about 49 units tall, taller than the canvas's own header of 32.
 */
export const TABLE_FACE: Face = {
  markup: [
    '<div class="head">',
    '  <b>{{name}}</b>',
    '  <small>{{component}}</small>',
    '</div>',
    '<rows/>',
  ],
  style: ['.head { padding: 8px; }', 'b { font-size: 14px; }'],
  variants: [{ id: 'far', markup: ['<b>{{name}}</b>'] }],
};

/** A column's face: its name in monospace, its type in italics, on one line. */
export const COLUMN_FACE: Face = {
  markup: ['<p><code>{{name}}</code> <i>{{type ?? "—"}}</i> <badges/></p>'],
  style: ['face { justify-content: center; padding: 0 8px; }', 'p { white-space: nowrap; }'],
};

/** A face of size `content` for a shape of its own: its name, and a description that wraps. */
export const CARD_FACE: Face = {
  size: 'content',
  markup: ['<b>{{name}}</b>', '<p if="description">{{description}}</p>', '<p>{{component}}</p>'],
  style: ['face { padding: 8px; gap: 4px; }'],
};

/** A container's face, with what it holds under its header, and a variant for when it is collapsed. */
export const SYSTEM_FACE: Face = {
  markup: [
    '<header><b>{{name}}</b></header>',
    '<p class="note">Everything {{name}} runs</p>',
    '<contents/>',
  ],
  style: ['header { padding: 8px 12px 0; }', '.note { padding: 4px 12px 8px; }'],
  variants: [{ id: 'closed', markup: ['<b>{{name}}</b>', '<p>{{count}} inside</p>'] }],
  collapsed: 'closed',
};

/** A project whose components, by id, take these faces, wherever their package is. */
export function withFaces(project: ProjectSnapshot, faces: Record<string, Face>): ProjectSnapshot {
  return {
    ...project,
    packages: project.packages.map((file) => ({
      ...file,
      components: file.components.map((component) => {
        const face = faces[component.id];
        return face === undefined
          ? component
          : { ...component, appearance: { ...component.appearance, face } };
      }),
    })),
  };
}
