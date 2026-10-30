import type { ProjectSnapshot } from '@visual-anything/core';
import type { Component } from '@visual-anything/schema';
import { loadSample } from './sample';

/** The sample's view these helpers change. */
export const EMPHASIS_VIEW = 'system-overview';

/**
 * The sample with its Calendar taking a `note` that takes text emphasis (ADR 0082) and a plain
 * `code`, both shown in its detail, with its own appearance traits; the calendar's note written as
 * given, and, when given, the view's note's text.
 */
export function withEmphasis(
  note: string,
  own: Partial<Component['appearance']> = {},
  noteText?: string,
): ProjectSnapshot {
  const sample = loadSample();
  const packages = sample.packages.map((each) =>
    each.id !== 'clinic'
      ? each
      : {
          ...each,
          components: (each.components ?? []).map((component) =>
            component.id !== 'clinic.calendar'
              ? component
              : {
                  ...component,
                  attributes: [
                    ...(component.attributes ?? []),
                    { name: 'note', type: 'string' as const, format: 'emphasis' as const },
                    { name: 'code', type: 'string' as const },
                  ],
                  appearance: {
                    ...component.appearance,
                    detail: { attributes: ['note', 'code'] },
                    ...own,
                  },
                },
          ),
        },
  );
  const elements = sample.model.elements.map((element) =>
    element.component === 'clinic.calendar'
      ? { ...element, attributes: { ...element.attributes, note, code: "'**'::text" } }
      : element,
  );
  const views =
    noteText === undefined
      ? sample.views
      : sample.views.map((view) => ({
          ...view,
          freeShapes: view.freeShapes.map((shape) =>
            shape.kind === 'note' ? { ...shape, text: noteText } : shape,
          ),
        }));
  return { ...sample, packages, views, model: { ...sample.model, elements } };
}

/** The id of the sample's calendar. */
export function calendarOf(project: ProjectSnapshot): string {
  const calendar = project.model.elements.find(
    (element) => element.component === 'clinic.calendar',
  );
  if (!calendar) throw new Error('The sample has no calendar.');
  return calendar.id;
}
