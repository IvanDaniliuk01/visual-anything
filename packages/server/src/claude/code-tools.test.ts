/**
 * Claude's tools for package code (ADR 0054): writing code is one undoable action of Claude's that
 * runs nothing; running a hook runs only the code the person approved as it is now, by its hash.
 */
import { packageCodeOf, type CodeApproval } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testProject } from '../test-support';
import { startToolHarness, type ToolHarness } from './tool-harness';

let tools: ToolHarness;
let approvals: CodeApproval[];
let turnedOff: string[];

beforeEach(async () => {
  approvals = [];
  turnedOff = [];
  tools = await startToolHarness(testProject(), {
    codeApprovals: () => approvals,
    codeTurnedOff: () => turnedOff,
  });
});

afterEach(async () => {
  await tools.close();
});

const CONVERTER = [
  'export function attributes(element, context) {',
  '  return { label: `${element.name} in ${context.component.name}` };',
  '}',
  'export function check(element) {',
  '  return element.attributes.items > 9 ? ["Too many items."] : [];',
  '}',
].join('\n');

/** The hash of the shop package's code as the program holds it now. */
function shopHash(): string {
  const file = tools.session.snapshot.packages.find((each) => each.id === 'shop');
  const code = file ? packageCodeOf(file) : undefined;
  if (!code) throw new Error('The shop package holds no code.');
  return code.hash;
}

/** What the person does in the app: approve the code as it is now. */
function approveAsPerson(capabilities: string[] = []): void {
  approvals = [{ hash: shopHash(), package: 'shop', capabilities }];
}

describe('write_package_code', () => {
  it('writes the code as one action of Claude’s, which runs nothing until the person approves it', async () => {
    const written = await tools.value('write_package_code', { package: 'shop', code: CONVERTER });
    expect(written.done).toBe('Add code to the package "Shop"');
    expect(written.approval).toMatch(/Claude cannot approve it/);
    const file = tools.session.snapshot.packages.find((each) => each.id === 'shop');
    expect(file?.code?.[0]).toBe('export function attributes(element, context) {');
    expect(tools.session.history.undo?.author).toBe('claude');
    const read = await tools.value('read_package_code', { package: 'shop' });
    expect(read).toMatchObject({ package: 'shop', approved: false, hash: shopHash(), lines: 6 });
  });

  it('strips the types of TypeScript', async () => {
    await tools.value('write_package_code', {
      package: 'shop',
      typescript: true,
      code: 'export function attributes(element: { name: string }): Record<string, string> { return { n: element.name }; }',
    });
    const read = await tools.value('read_package_code', { package: 'shop' });
    expect(String(read.code)).not.toContain(': { name: string }');
    approveAsPerson();
    expect(
      await tools.value('run_package_code', {
        package: 'shop',
        element: 'cart',
        hook: 'attributes',
      }),
    ).toMatchObject({ answer: [{ name: 'n', value: 'Cart' }] });
  });

  it('refuses a built-in package, and capabilities that are not', async () => {
    expect(
      await tools.failure('write_package_code', { package: 'systems', code: CONVERTER }),
    ).toMatch(/built in/);
    expect(
      await tools.failure('write_package_code', {
        package: 'shop',
        code: CONVERTER,
        capabilities: ['files:read'],
      }),
    ).toMatch(/"files:read" is not a capability/);
  });
});

describe('run_package_code', () => {
  beforeEach(async () => {
    await tools.value('write_package_code', { package: 'shop', code: CONVERTER });
  });

  it('runs nothing the person has not approved', async () => {
    expect(
      await tools.failure('run_package_code', {
        package: 'shop',
        element: 'cart',
        hook: 'attributes',
      }),
    ).toMatch(/is not approved, so it does not run/);
    // An approval of other code, of this project or not, approves nothing here.
    approvals = [{ hash: 'f'.repeat(64), package: 'shop', capabilities: [] }];
    expect(
      await tools.failure('run_package_code', { package: 'shop', element: 'cart', hook: 'check' }),
    ).toMatch(/is not approved/);
  });

  it('runs nothing turned off on this computer, approved or not (ADR 0089, M14’s review)', async () => {
    approveAsPerson();
    turnedOff = ['shop'];
    expect(
      await tools.failure('run_package_code', {
        package: 'shop',
        element: 'cart',
        hook: 'attributes',
      }),
    ).toBe(
      'The code of the package "Shop" is turned off on this computer: it runs again once it is turned on in Packages….',
    );
    // Turned on again, it runs under the approval it kept.
    turnedOff = [];
    expect(
      await tools.value('run_package_code', { package: 'shop', element: 'cart', hook: 'check' }),
    ).toMatchObject({ answer: [] });
  });

  it('runs a hook of approved code on an element, and checks its answer as the app does', async () => {
    approveAsPerson();
    expect(
      await tools.value('run_package_code', {
        package: 'shop',
        element: 'cart',
        hook: 'attributes',
      }),
    ).toMatchObject({
      hook: 'attributes',
      element: 'cart',
      answer: [{ name: 'label', value: 'Cart in Cart' }],
    });
    expect(
      await tools.value('run_package_code', { package: 'shop', element: 'cart', hook: 'check' }),
    ).toMatchObject({ answer: [] });
    expect(
      await tools.failure('run_package_code', { package: 'shop', element: 'cart', hook: 'draw' }),
    ).toBe('The code exports no draw; it exports attributes, check.');
  });

  it('asks again once the code changes: the approval was of other code', async () => {
    approveAsPerson();
    await tools.value('write_package_code', {
      package: 'shop',
      code: 'export function attributes() { return { changed: true }; }',
    });
    expect(
      await tools.failure('run_package_code', {
        package: 'shop',
        element: 'cart',
        hook: 'attributes',
      }),
    ).toMatch(/is not approved/);
  });

  it('runs on the elements of the package’s components only', async () => {
    approveAsPerson();
    expect(
      await tools.failure('run_package_code', {
        package: 'shop',
        element: 'api',
        hook: 'attributes',
      }),
    ).toMatch(/does not run on "api"/);
  });

  it('stops code that loops, in Claude’s process, and says so', async () => {
    await tools.value('write_package_code', {
      package: 'shop',
      code: 'export function attributes() { for (;;) {} }',
    });
    approveAsPerson();
    expect(
      await tools.failure('run_package_code', {
        package: 'shop',
        element: 'cart',
        hook: 'attributes',
      }),
    ).toBe('The attributes hook failed: it ran past 50 ms.');
  });

  it('drops an answer the app would drop', async () => {
    await tools.value('write_package_code', {
      package: 'shop',
      code: 'export function attributes() { return JSON.parse(\'{"__proto__": {"x": 1}}\'); }',
    });
    approveAsPerson();
    expect(
      await tools.failure('run_package_code', {
        package: 'shop',
        element: 'cart',
        hook: 'attributes',
      }),
    ).toBe('The attributes hook failed: its answer is dropped: it has the key "__proto__".');
  });
});
