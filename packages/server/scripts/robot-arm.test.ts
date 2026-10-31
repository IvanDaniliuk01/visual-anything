/**
 * The robot arm's solid and its sample (M9, ADR 0075): `robot-arm-solid.ts` makes the committed file
 * byte for byte, the cleaner takes it back unchanged, the package's definition is what the core reads
 * from it, and it ships with a source, a license and a description. The sample `examples/robot-arm`
 * opens through the program's loader with nothing to warn about, its file checked as a session checks
 * it, its links, joints, gripper and camera anchored to the solid's parts, and its scenario "Pick a
 * part" plays over its control loop.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  anchoredElements,
  checkProject,
  isBroken,
  isOutside,
  readSolid,
  scenarioTimeline,
  shippingProblems,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { PackageFile } from '@visual-anything/schema';
import { formatFile } from '@visual-anything/schema/format';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadProject } from '../src/project';
import { cleanSolid } from '../src/solids/clean';
import { hashOf, solidFileWarnings } from '../src/solids/files';
import { ROBOT_ARM_SOLID, robotArmDefinition, robotArmFile } from './robot-arm-solid';

const FOLDER = resolve(import.meta.dirname, '../../../examples/robot-arm');

/** The arm's named parts, in the order the core reads them. */
const PARTS = [
  'base',
  ...[1, 2, 3, 4, 5, 6].flatMap((n) => [`joint-${n}`, `link-${n}`]),
  'gripper',
  'camera',
];

function packageFile(): PackageFile {
  return JSON.parse(
    readFileSync(join(FOLDER, 'packages', 'robot-arm.vapackage'), 'utf8'),
  ) as PackageFile;
}

function committed(): { name: string; bytes: Uint8Array } {
  const names = readdirSync(join(FOLDER, 'solids'));
  expect(names).toHaveLength(1);
  const [name] = names as [string];
  return { name, bytes: new Uint8Array(readFileSync(join(FOLDER, 'solids', name))) };
}

describe('the robot arm’s solid', () => {
  it('is made by its script byte for byte, named by its hash', () => {
    const { name, bytes } = committed();
    const made = robotArmFile();
    expect(
      Buffer.compare(Buffer.from(made), Buffer.from(bytes)),
      'The arm changed: run `pnpm --filter @visual-anything/server robot-arm` and commit what it writes.',
    ).toBe(0);
    expect(name).toBe(`${hashOf(bytes)}.glb`);
  });

  it('is a canonical file that the cleaner takes back unchanged', async () => {
    const { bytes } = committed();
    const cleaned = await cleanSolid(bytes);
    if (!cleaned.ok) throw new Error(cleaned.problems.map((each) => each.message).join(' '));
    expect(Buffer.compare(Buffer.from(cleaned.bytes), Buffer.from(bytes))).toBe(0);
    expect(cleaned.report).toEqual([]);
  });

  it('is defined in the sample’s package as the core reads it, with its six links as parts', () => {
    const file = packageFile();
    const definition = robotArmDefinition(committed().bytes);
    expect(file.solids).toEqual([definition]);
    expect(formatFile('package', file)).toBe(
      readFileSync(join(FOLDER, 'packages', 'robot-arm.vapackage'), 'utf8'),
    );
    const read = readSolid(committed().bytes);
    if (!read.ok) throw new Error('The arm is canonical.');
    expect(read.description.parts.map((part) => part.name)).toEqual(PARTS);
    // No part holds another: selecting a link marks that link alone.
    expect(read.description.parts.every((part) => part.parent === undefined)).toBe(true);
    expect(read.description.parts.every((part) => part.point !== undefined)).toBe(true);
    expect(new Set(read.description.parts.map((part) => JSON.stringify(part.point))).size).toBe(
      PARTS.length,
    );
    expect(read.description.animations).toEqual([{ duration: 6 }]);
  });

  it('ships: CC0-1.0, made for Visual Anything, with a description that is its text alternative', () => {
    const file = packageFile();
    expect(shippingProblems(file)).toEqual([]);
    const [solid] = file.solids ?? [];
    expect(solid).toMatchObject({ id: ROBOT_ARM_SOLID, license: 'CC0-1.0' });
    expect(solid?.source).toContain('Visual Anything');
    expect(solid?.description?.length).toBeGreaterThan(40);
  });
});

describe('the robot arm sample', () => {
  let project: ProjectSnapshot;

  beforeAll(async () => {
    const opened = await loadProject(FOLDER);
    if (!opened.ok) throw new Error(JSON.stringify(opened.errors));
    expect(opened.warnings).toEqual([]);
    project = opened.project;
  });

  it('opens with nothing to warn about, its solid’s file there and clean', () => {
    expect(checkProject(project)).toEqual({ errors: [], warnings: [] });
    expect(solidFileWarnings(project, FOLDER)).toEqual([]);
    expect(project.project.packages).toEqual(['physical-ai', 'robot-arm']);
  });

  it('anchors its links, joints, gripper and camera to the solid’s parts, naming the solid', () => {
    const anchored = anchoredElements(project);
    const parts = project.model.elements.flatMap((element) => {
      const part = element.appearance?.part;
      return part && part !== 'none'
        ? [{ element: element.id, part: part.part, solid: part.solid }]
        : [];
    });
    expect(parts.map((each) => each.part).sort()).toEqual([...PARTS].sort());
    for (const each of parts) expect(each.solid, each.element).toBe(ROBOT_ARM_SOLID);
    // Every one of them is anchored to the solid's part, and none to an image's.
    expect(anchored.map((each) => each.part.part).sort()).toEqual([...PARTS].sort());
    for (const each of anchored) expect(each.images, each.element.id).toEqual([]);
    const arm = project.model.elements.find((element) => element.id === 'arm');
    expect(arm?.appearance?.solid).toEqual({ solid: ROBOT_ARM_SOLID, placement: 'parts' });
  });

  it('has a controller, motors, sensors and topics, and a view of its structure and of its control loop', () => {
    const count = (component: string) =>
      project.model.elements.filter((element) => element.component === component).length;
    expect(count('physical-ai.controller')).toBe(1);
    expect(count('physical-ai.motor')).toBe(6);
    expect(count('physical-ai.encoder')).toBe(6);
    expect(count('physical-ai.camera')).toBe(1);
    expect(count('physical-ai.topic')).toBe(3);
    expect(count('physical-ai.link')).toBe(7);
    expect(project.views.map((view) => view.id).sort()).toEqual([
      'control-loop',
      'kinematic-chain',
      'software',
      'structure',
    ]);
  });

  it('plays "Pick a part" over its control loop, every step whole', () => {
    expect(project.scenarios.map((each) => [each.id, each.name, each.view])).toEqual([
      ['pick-a-part', 'Pick a part', 'control-loop'],
    ]);
    const [scenario] = project.scenarios;
    if (!scenario) throw new Error('No scenario.');
    const timeline = scenarioTimeline(project, scenario);
    expect(timeline.entries).toHaveLength(7);
    for (const entry of timeline.entries) {
      expect(isBroken(entry), entry.steps.join()).toBe(false);
      expect(isOutside(entry), entry.steps.join()).toBe(false);
    }
  });
});
