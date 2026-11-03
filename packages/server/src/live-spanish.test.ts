/**
 * What the local program says of live values and of what it fetches for package code, in Spanish
 * (ADR 0038): the app reads each through its catalog's templates.
 */
import { packageCodeOf, type ProjectSnapshot } from '@visual-anything/core';
import { untranslatedParts } from '@visual-anything/app/src/i18n/translate';
import type { Capability } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { LiveValues } from './live';
import { PackageFetcher, networkGrantOf, type Resolver } from './live-fetch';
import { testProject } from './test-support';

const inEnglish = (message: string) => untranslatedParts('es', message);

describe('what the program says of live values, in Spanish', () => {
  it('says once that a sender’s values come too fast, and that it holds as many as it keeps', () => {
    const said: string[] = [];
    for (const senderName of ['Claude', 'the command line', 'the code of “Gauges”']) {
      const live = new LiveValues({
        now: () => 0,
        broadcast: () => {},
        notice: (message) => said.push(message),
        err: () => {},
        limit: 1,
      });
      live.set(
        {},
        { kind: 'claude' },
        Array.from({ length: 1001 }, (_, at) => ({
          target: 'api',
          attribute: `a${at}`,
          value: at,
        })),
        { exists: () => true, senderName },
      );
    }
    expect(said).toHaveLength(6);
    expect(said.flatMap(inEnglish)).toEqual([]);
  });

  it('says why package code may not fetch, or could not', async () => {
    const project = withCode(testProject(), ['network:https://status.example.com']);
    const file = project.packages.find((each) => each.id === 'shop');
    const code = file === undefined ? undefined : packageCodeOf(file);
    const said: string[] = [];
    for (const approvals of [[], [{ hash: code?.hash ?? '', package: 'shop', capabilities: [] }]]) {
      const grant = networkGrantOf(
        project,
        { codeApprovals: approvals, codeTurnedOff: [] },
        'shop',
      );
      if (!grant.ok) said.push(grant.problem.message);
    }
    const off = networkGrantOf(project, { codeApprovals: [], codeTurnedOff: ['shop'] }, 'shop');
    if (!off.ok) said.push(off.problem.message);
    const none = networkGrantOf(project, { codeApprovals: [], codeTurnedOff: [] }, 'nothing');
    if (!none.ok) said.push(none.problem.message);
    const pkg = (granted: Capability[]) => ({ id: 'shop', name: 'Shop', granted });
    const addresses = [
      '127.0.0.1',
      '10.0.0.5',
      '169.254.169.254',
      '0.0.0.0',
      '224.0.0.1',
      '192.0.2.1',
    ];
    for (const address of addresses) {
      const resolve: Resolver = () => Promise.resolve([{ address, family: 4 }]);
      const fetched = await new PackageFetcher({ resolve }).fetch(
        pkg(['network:https://status.example.com']),
        'https://status.example.com/latency',
      );
      if (!fetched.ok) said.push(fetched.problem.message);
    }
    for (const host of ['169.254.169.254', '0.0.0.0', '224.0.0.1', '240.0.0.1']) {
      const fetched = await new PackageFetcher().fetch(
        pkg([`network:http://${host}`]),
        `http://${host}/`,
      );
      if (!fetched.ok) said.push(fetched.problem.message);
    }
    const others: [Capability[], string][] = [
      [['network:https://status.example.com'], 'https://other.example.com/'],
      [['network:https://status.example.com'], 'ftp://status.example.com/'],
      [['network:https://status.example.com'], 'https://user:secret@status.example.com/'],
      [['network:https://status.example.com'], 'not an address'],
      [['network:http://status.example.com'], 'http://status.example.com/'],
      [['network:http://93.184.216.34'], 'http://93.184.216.34/'],
    ];
    for (const [granted, url] of others) {
      const fetched = await new PackageFetcher().fetch(pkg(granted), url);
      if (!fetched.ok) said.push(fetched.problem.message);
    }
    const unresolved = await new PackageFetcher({
      resolve: () => Promise.reject(new Error('no')),
    }).fetch(pkg(['network:https://status.example.com']), 'https://status.example.com/');
    if (!unresolved.ok) said.push(unresolved.problem.message);
    const late = await new PackageFetcher({
      resolve: () => new Promise(() => {}),
      limits: { timeoutMs: 50, bytes: 1024 },
    }).fetch(pkg(['network:https://status.example.com']), 'https://status.example.com/');
    if (!late.ok) said.push(late.problem.message);
    expect(said.length).toBeGreaterThan(18);
    expect(said.flatMap(inEnglish)).toEqual([]);
  });
});

function withCode(project: ProjectSnapshot, capabilities: string[]): ProjectSnapshot {
  return {
    ...project,
    packages: project.packages.map((file) =>
      file.id === 'shop'
        ? { ...file, code: ['export function attributes() { return {}; }'], capabilities }
        : file,
    ),
  };
}
