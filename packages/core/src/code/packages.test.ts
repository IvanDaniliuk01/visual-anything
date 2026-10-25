import type { PackageFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { TEST_PACKAGE, testProject } from '../test/fixtures';
import { codeHash } from './hash';
import { CODE_LIMITS } from './limits';
import { codePackagesOn, packageCodeOf, packagesWithCode } from './packages';

const GAUGES: PackageFile = {
  id: 'gauges',
  name: 'Gauges',
  components: [{ id: 'gauges.thermometer', name: 'Thermometer', derivesFrom: 'test.service' }],
  relationTypes: [],
  code: ['export function attributes() {', '  return { hot: true };', '}'],
  capabilities: ['time'],
};

function project() {
  const state = testProject();
  state.project.packages.push('gauges');
  state.packages.push(GAUGES);
  state.model.elements.push({ id: 'oven', component: 'gauges.thermometer', name: 'Oven' });
  return state;
}

describe('packageCodeOf', () => {
  it('gives a package code text, its hash and what it declares', () => {
    expect(packageCodeOf(GAUGES)).toEqual({
      package: 'gauges',
      name: 'Gauges',
      text: GAUGES.code?.join('\n'),
      hash: codeHash(GAUGES.code ?? [], ['time']),
      capabilities: ['time'],
      declared: ['time'],
      tooLarge: false,
    });
    expect(packageCodeOf(TEST_PACKAGE)).toBeUndefined();
  });

  it('says when its code is too large to run', () => {
    const lines = Array.from({ length: 40 }, () => 'x'.repeat(CODE_LIMITS.lineLength));
    expect(packageCodeOf({ ...GAUGES, code: lines })?.tooLarge).toBe(true);
  });

  it('keeps the capabilities it can read, sorted, each once', () => {
    const code = packageCodeOf({ ...GAUGES, capabilities: ['time', 'model:read', 'nope'] });
    expect(code?.capabilities).toEqual(['model:read', 'time']);
    // The hash covers what the file declares, read or not, so a change to it asks again.
    expect(code?.hash).toBe(codeHash(GAUGES.code ?? [], ['time', 'model:read', 'nope']));
  });
});

describe('codePackagesOn', () => {
  it('lists the packages with code whose components the element comes from, nearest first', () => {
    const state = project();
    expect(packagesWithCode(state).map((each) => each.package)).toEqual(['gauges']);
    expect(codePackagesOn(state, 'oven')).toEqual(['gauges']);
    // An element of a component it derives from runs none of its code.
    expect(codePackagesOn(state, 'api')).toEqual([]);
    expect(codePackagesOn(state, 'nope')).toEqual([]);
  });
});
