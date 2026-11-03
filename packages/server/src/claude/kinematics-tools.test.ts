/**
 * Claude's kinematics tools (ADR 0090), the whole way from an MCP client through the bridge to the
 * program, on the robot-arm sample: reading the chain of a robot and of the whole model, with each
 * joint's kind, axis, limits, position and what it carries, and the chain's warnings; setting joints'
 * positions as one undoable action of Claude's, warning past a limit; joints' positions in the view
 * states that get_view_address and the tour tools take; and the tools' descriptions within their
 * length.
 */
import { fileURLToPath } from 'node:url';
import type { ProjectSnapshot } from '@visual-anything/core';
import type { Element } from '@visual-anything/schema';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadProject } from '../project';
import { startToolHarness, type ToolHarness } from './tool-harness';
import { TOOLS } from './tools';

const SAMPLE = fileURLToPath(new URL('../../../../examples/robot-arm', import.meta.url));

let sample: ProjectSnapshot;
let tools: ToolHarness;
let started: ToolHarness | undefined;

beforeAll(async () => {
  const loaded = await loadProject(SAMPLE);
  if (!loaded.ok) throw new Error('The robot-arm sample opens.');
  sample = loaded.project;
}, 30_000);

async function start(project: ProjectSnapshot = sample) {
  tools = await startToolHarness(project);
  started = tools;
}

afterEach(async () => {
  await started?.close();
  started = undefined;
});

type Item = Record<string, unknown> & {
  id: string;
  depth: number;
  hangsFrom: { id: string } | null;
  joint?: Record<string, unknown>;
};
const itemsOf = (answer: Record<string, unknown>) => answer.items as Item[];

/** The sample with its joints' attributes changed. */
function withJoint(id: string, attributes: NonNullable<Element['attributes']>): ProjectSnapshot {
  return {
    ...sample,
    model: {
      ...sample.model,
      elements: sample.model.elements.map((each) =>
        each.id === id ? { ...each, attributes: { ...each.attributes, ...attributes } } : each,
      ),
    },
  };
}

describe('get_kinematics', () => {
  beforeEach(() => start(), 30_000);

  it('reads a robot’s chain from the top, each joint with how it moves and what it carries', async () => {
    const before = tools.session.snapshot;
    const answer = await tools.value('get_kinematics', { robot: 'arm' });
    expect(answer.of).toEqual({ id: 'arm', name: 'Six-axis arm' });
    expect(answer.joints).toBe(6);
    const items = itemsOf(answer);
    expect(
      items.slice(0, 5).map((each) => [each.id, each.depth, each.hangsFrom?.id ?? null]),
    ).toEqual([
      ['base', 0, null],
      ['joint-1', 1, 'base'],
      ['link-1', 2, 'joint-1'],
      ['joint-2', 3, 'link-1'],
      ['link-2', 4, 'joint-2'],
    ]);
    const shoulder = items.find((each) => each.id === 'joint-2');
    expect(shoulder?.joint).toEqual({
      kind: 'revolute',
      axis: '1 0 0',
      unitAxis: { x: 1, y: 0, z: 0 },
      unit: 'degrees',
      limits: { lower: -120, upper: 120 },
      position: 0,
      moves: true,
      carries: [{ id: 'link-2', name: 'Link 2' }],
      carriesInAll: expect.any(Number) as number,
    });
    // Joint 2 carries the rest of the arm: the links, joints, gripper and wrist camera above it.
    expect(shoulder?.joint?.carriesInAll).toBe(11);
    const tool = items.find((each) => each.id === 'joint-6');
    expect(tool?.joint).toMatchObject({ kind: 'continuous', moves: true });
    expect(tool?.joint).not.toHaveProperty('limits');
    // Motors and encoders hang from no joint: they are not in the chain.
    expect(items.map((each) => each.id)).not.toContain('motor-1');
    expect(items.map((each) => each.id)).toEqual(
      expect.arrayContaining(['gripper', 'wrist-camera']),
    );
    expect(answer).not.toHaveProperty('warnings');
    expect(tools.session.snapshot).toBe(before);
  });

  it('reads the whole model when no robot is named, and pages it', async () => {
    const whole = await tools.value('get_kinematics');
    expect(whole.of).toBe('the whole model');
    expect(whole.joints).toBe(6);
    const total = whole.total as number;
    const first = await tools.value('get_kinematics', { limit: 3 });
    expect(itemsOf(first)).toHaveLength(3);
    expect(first).toMatchObject({ more: total - 3, next: 'Call again with offset 3.' });
    const rest = await tools.value('get_kinematics', { offset: 3 });
    expect(itemsOf(rest)).toHaveLength(total - 3);
  });

  it('says what contains no joint, and refuses an element that is not there', async () => {
    const empty = await tools.value('get_kinematics', { robot: 'table' });
    expect(empty).toMatchObject({ total: 0, joints: 0 });
    expect(empty.note).toContain('contains no joint');
    expect(await tools.failure('get_kinematics', { robot: 'ghost' })).toContain(
      'There is no element "ghost"',
    );
  });
});

describe('get_kinematics’ warnings', () => {
  it('points out a position past its limits, drawn at the nearest, and a joint that moves nothing', async () => {
    const far = withJoint('joint-2', { position: 150 });
    await start({
      ...far,
      model: {
        ...far.model,
        elements: far.model.elements.map((each) =>
          each.id === 'joint-4'
            ? { ...each, attributes: { ...each.attributes, kind: 'fixed' } }
            : each,
        ),
      },
    });
    const answer = await tools.value('get_kinematics', { robot: 'arm' });
    const joint = (id: string) => itemsOf(answer).find((each) => each.id === id)?.joint;
    expect(joint('joint-2')).toMatchObject({ position: 150, drawnAt: 120, moves: true });
    expect(joint('joint-4')).toMatchObject({ kind: 'fixed', moves: false, why: 'It is fixed.' });
    expect(answer.warnings).toEqual([
      {
        code: 'joint-out-of-limits',
        message:
          'The position of "Joint 2", 150, is outside its limits, from -120 to 120; it is drawn at the nearest one.',
        elements: ['joint-2'],
      },
    ]);
  });
});

describe('set_joint_positions', () => {
  beforeEach(() => start(), 30_000);

  const position = (id: string) =>
    tools.session.snapshot.model.elements.find((each) => each.id === id)?.attributes?.position;

  it('stores joints’ positions as one undoable action of Claude’s', async () => {
    const answer = await tools.value('set_joint_positions', {
      positions: { 'joint-2': 30, 'joint-3': -45 },
    });
    expect(answer.done).toBe('Set the positions of 2 joints');
    expect(answer).not.toHaveProperty('warnings');
    expect(position('joint-2')).toBe(30);
    expect(position('joint-3')).toBe(-45);
    expect(tools.session.history.undo).toEqual({
      label: 'Set the positions of 2 joints',
      author: 'claude',
    });
    const one = await tools.value('set_joint_positions', { positions: { 'joint-1': 10 } });
    expect(one.done).toBe('Set the position of "Joint 1"');
    // The chain reads them back.
    const chain = await tools.value('get_kinematics', { robot: 'arm' });
    expect(itemsOf(chain).find((each) => each.id === 'joint-2')?.joint).toMatchObject({
      position: 30,
    });
  });

  it('stores a position past its limits, warning that it is drawn at the nearest', async () => {
    const answer = await tools.value('set_joint_positions', { positions: { 'joint-2': 150 } });
    expect(position('joint-2')).toBe(150);
    expect(answer.warnings).toEqual([
      'The position of "Joint 2", 150, is outside its limits, from -120 to 120; it is drawn at 120.',
    ]);
  });

  it('refuses what is not there, what is no joint, and nothing to set, changing nothing', async () => {
    const before = tools.session.snapshot;
    expect(
      await tools.failure('set_joint_positions', { positions: { ghost: 1, 'joint-1': 2 } }),
    ).toContain('There is no element "ghost"');
    expect(await tools.failure('set_joint_positions', { positions: { 'link-1': 2 } })).toContain(
      '"Link 1" is no joint',
    );
    expect(await tools.failure('set_joint_positions', { positions: {} })).toContain(
      'at least one joint',
    );
    expect(tools.session.snapshot).toBe(before);
  });
});

describe('joints’ positions in view states', () => {
  beforeEach(() => start(), 30_000);

  it('are carried by get_view_address, and refused for what is no joint', async () => {
    const address = await tools.value('get_view_address', {
      view: 'workcell',
      space: { joints: { 'joint-2': 30, 'joint-1': -34 } },
    });
    expect(address.fragment).toBe('#view=workcell&space=joints:joint-1=-34,joint-2=30');
    expect(
      await tools.failure('get_view_address', {
        view: 'workcell',
        space: { joints: { 'link-1': 3 } },
      }),
    ).toContain('link-1');
  });

  it('are kept by a tour step', async () => {
    await tools.value('add_tour_step', {
      tour: 'pick-a-part',
      viewState: { view: 'workcell', space: { joints: { 'joint-1': -34, 'joint-2': 28 } } },
      title: 'Reach',
    });
    const tour = tools.session.snapshot.tours.find((each) => each.id === 'pick-a-part');
    expect(tour?.steps.at(-1)?.viewState).toEqual({
      view: 'workcell',
      space: { joints: { 'joint-1': -34, 'joint-2': 28 } },
    });
  });
});

describe('the descriptions', () => {
  it('stay within the length a tool’s description is given', () => {
    for (const name of [
      'get_kinematics',
      'set_joint_positions',
      'get_view_address',
      'open_app',
      'list_solid_parts',
    ]) {
      const found = TOOLS.find((each) => each.name === name);
      expect(found, name).toBeDefined();
      expect(found?.description.length ?? 0, name).toBeLessThanOrEqual(4000);
    }
  });
});
