/**
 * Solids in the text exports (ADR 0075): Mermaid and Structurizr say they lost them, and the outline
 * in Markdown gives each shape's solid by its description, its text alternative, and lists the
 * solids the view shows with their descriptions, sources and licenses.
 */
import { builtinPackage, type ProjectSnapshot } from '@visual-anything/core';
import type { PackageFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { ARM_ID, armDefinition, withSolids } from '../test/solids';
import { writeMermaid } from './mermaid';
import { writeOutline } from './outline';
import { writeStructurizr } from './structurizr';

const VIEW = 'robot';

/** The robot, with a service of the Systems package that shows the arm as an icon. */
function withService(): ProjectSnapshot {
  const project = withSolids();
  return {
    ...project,
    project: { ...project.project, packages: [...project.project.packages, 'systems'] },
    packages: [...project.packages, builtinPackage('systems') as PackageFile],
    model: {
      ...project.model,
      elements: [
        ...project.model.elements,
        {
          id: 'planner',
          component: 'systems.service',
          name: 'Planner',
          appearance: { solid: { solid: ARM_ID, placement: 'icon' } },
        },
      ],
    },
    views: project.views.map((view) => ({
      ...view,
      positions: [...view.positions, { element: 'planner', x: 1400, y: 0 }],
    })),
  };
}

describe('solids in Mermaid and Structurizr', () => {
  it('Mermaid says it lost them', () => {
    const { lost, text } = writeMermaid(withSolids(), VIEW);
    const said = lost.find((each) => each.includes('solids are left out'));
    expect(said).toMatch(
      /^\d+ shapes’ solids are left out: solids are drawn only in the canvas, the PNG, the SVG, the PDF and the read-only page\.$/,
    );
    expect(text).toContain(`%% Lost: ${said}`);
  });

  it('Structurizr says it lost them', () => {
    const { lost } = writeStructurizr(withService(), VIEW);
    expect(lost).toContain(
      'One shape’s solid is left out: solids are drawn only in the canvas, the PNG, the SVG, the PDF and the read-only page.',
    );
  });

  it('neither says so of a view without solids', () => {
    const project = withSolids();
    const plain: ProjectSnapshot = {
      ...project,
      packages: project.packages.map((pkg) => ({ ...pkg, solids: [] })),
    };
    expect(writeMermaid(plain, VIEW).lost.some((each) => each.includes('solid'))).toBe(false);
  });
});

describe('solids in the outline', () => {
  it('gives each shape’s solid by its description, and lists the solids the view shows', () => {
    const { text } = writeOutline(withSolids(), VIEW);
    expect(text).toContain('**Motor** (Motor), with a solid: A test arm of five parts.');
    expect(text).toContain('## Solids\n\n- **Arm**: A test arm of five parts.\n');
    // Listed once, though several shapes show it.
    expect(text.match(/- \*\*Arm\*\*: /g)).toHaveLength(1);
  });

  it('says so of a solid without a description, and gives its source and license', () => {
    const { text } = writeOutline(
      withSolids(VIEW, [
        { ...armDefinition(), description: '', source: 'Drawn for the tests', license: 'CC0-1.0' },
      ]),
      VIEW,
    );
    expect(text).toContain('**Motor** (Motor), with the solid “Arm”, which has no description');
    expect(text).toContain(
      '- **Arm**: It has no description. Source: Drawn for the tests. License: CC0-1.0.',
    );
  });
});
