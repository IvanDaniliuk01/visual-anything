/**
 * The benchmark's phase with text emphasis in every detail (ADR 0082, moved to M3c Stage 2), with
 * `?emphasis`: every component the view draws gains a string attribute that takes emphasis, every
 * element a value of it with bold, italic and code in it, and every detail shows it, through a project
 * appearance. The canvas then draws each detail by its glyph quads (`emphasisLabels.ts`) while the
 * camera pans where details show, at the 10,000-element budget. Expected on the reference laptop:
 * the pan within the frame budget, as the research's prototype measured (6.1 ms a frame on average,
 * 10.7 ms at the 95th percentile, with 220 such shapes on screen); recorded, never held.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { AttributeDefinition } from '@visual-anything/schema';

/** The attribute every detail shows, which takes text emphasis. */
export const EMPHASIS_ATTRIBUTE = 'summary';

const DEFINITION: AttributeDefinition = {
  name: EMPHASIS_ATTRIBUTE,
  type: 'string',
  format: 'emphasis',
  description: 'A short summary, with text emphasis, for the benchmark.',
};

/** A value with bold, italic and code, a little different for each element. */
export function emphasisValue(at: number): string {
  return `reads **orders ${at % 97}** and _writes_ \`status\` ~~twice~~`;
}

/**
 * The project with every element's detail showing a value that takes text emphasis: its components
 * define the attribute, its elements hold a value of it, and a project appearance shows it.
 */
export function withEmphasisDetail(project: ProjectSnapshot): ProjectSnapshot {
  const used = new Set(project.model.elements.map((element) => element.component));
  const appearances = Object.fromEntries(
    [...used].map((id) => [id, { detail: { attributes: [EMPHASIS_ATTRIBUTE] } }]),
  );
  return {
    ...project,
    packages: project.packages.map((file) => ({
      ...file,
      components: file.components.map((component) =>
        used.has(component.id) &&
        !(component.attributes ?? []).some((each) => each.name === EMPHASIS_ATTRIBUTE)
          ? { ...component, attributes: [...(component.attributes ?? []), DEFINITION] }
          : component,
      ),
    })),
    model: {
      ...project.model,
      elements: project.model.elements.map((element, at) => ({
        ...element,
        attributes: { ...element.attributes, [EMPHASIS_ATTRIBUTE]: emphasisValue(at) },
      })),
    },
    project: {
      ...project.project,
      appearances: { ...project.project.appearances, components: appearances },
    },
  };
}
