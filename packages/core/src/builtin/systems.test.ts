import { validateFile } from '@visual-anything/schema/validate';
import { describe, expect, it } from 'vitest';
import { definitionsOf } from '../definitions';
import { BUILTIN_PACKAGES, builtinPackage } from './index';
import { SYSTEMS } from './systems';

describe('the built-in Systems package', () => {
  it('is a valid package file', () => {
    expect(validateFile('package', SYSTEMS)).toEqual({ ok: true, value: SYSTEMS });
  });

  it('defines everything the spec lists, each id starting with "systems."', () => {
    expect(SYSTEMS.components.map((component) => component.name)).toEqual([
      'Box',
      'System',
      'Service',
      'Chat channel',
      'AI agent',
      'MCP server',
      'Semantic layer',
      'Database',
      'Object storage',
      'Person',
    ]);
    expect(SYSTEMS.relationTypes.map((relationType) => relationType.name)).toEqual([
      'communicates with',
      'reads from',
      'queries',
      'writes to',
      'loads into',
      'is part of',
    ]);
  });

  it('derives everything up to Essence and "relates to", with no problems', () => {
    const definitions = definitionsOf([SYSTEMS]);
    expect(definitions.problems).toEqual([]);
    for (const { id } of SYSTEMS.components) {
      expect(definitions.component(id)?.lineage.at(-1)).toBe('essence');
    }
    for (const { id } of SYSTEMS.relationTypes) {
      expect(definitions.relationType(id)?.lineage.at(-1)).toBe('relates-to');
    }
    expect(definitions.componentDerives('systems.ai-agent', 'systems.service')).toBe(true);
    expect([...definitions.nestingRelationTypes]).toEqual(['systems.is-part-of']);
  });

  it('is one of the built-in packages', () => {
    expect(BUILTIN_PACKAGES).toContain(SYSTEMS);
    expect(builtinPackage('systems')).toBe(SYSTEMS);
    expect(builtinPackage('clinic')).toBeUndefined();
  });
});
