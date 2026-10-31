/**
 * The robot arm's solid and its sample (M9, ADR 0075): `robot-arm-solid.ts` makes the committed file
 * byte for byte, the cleaner takes it back unchanged, the package's definition is what the core reads
 * from it, and it ships with a source, a license and a description. The sample `examples/robot-arm`
 * opens through the program's loader with nothing to warn about, its file checked as a session checks
 * it, its links, joints and gripper anchored to the solid's parts, and its scenario "Pick a part" plays
 * over its control loop. Since M10 (ADR 0076) it stands in a workcell, with a table, two bins and a
 * camera posed in it, its wrist camera posed on link 6, and a tour plays "Pick a part" with the
 * physical-space panel open.
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
  spaceOf,
  tourStepProblems,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { fileKindOf, type FileContentByKind, type PackageFile } from '@visual-anything/schema';
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

/** The parts an element is anchored to: every one but the camera, which the wrist camera is posed at. */
const ANCHORED = PARTS.filter((part) => part !== 'camera');

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

  it('writes each of its files in the stable key order', () => {
    const files = ['project.vaproject', 'model.vamodel'];
    for (const folder of ['packages', 'views', 'scenarios', 'tours']) {
      files.push(...readdirSync(join(FOLDER, folder)).map((name) => `${folder}/${name}`));
    }
    for (const path of files) {
      const kind = fileKindOf(path);
      if (kind === undefined) throw new Error(`${path} is no project file.`);
      const text = readFileSync(join(FOLDER, path), 'utf8');
      const value = JSON.parse(text) as FileContentByKind[typeof kind];
      expect(formatFile(kind, value), path).toBe(text);
    }
  });

  it('opens with nothing to warn about, its solid’s file there and clean', () => {
    expect(checkProject(project)).toEqual({ errors: [], warnings: [] });
    expect(solidFileWarnings(project, FOLDER)).toEqual([]);
    expect(project.project.packages).toEqual(['physical-ai', 'robot-arm']);
  });

  it('anchors its links, joints and gripper to the solid’s parts, naming the solid', () => {
    const anchored = anchoredElements(project);
    const parts = project.model.elements.flatMap((element) => {
      const part = element.appearance?.part;
      return part && part !== 'none'
        ? [{ element: element.id, part: part.part, solid: part.solid }]
        : [];
    });
    expect(parts.map((each) => each.part).sort()).toEqual([...ANCHORED].sort());
    for (const each of parts) expect(each.solid, each.element).toBe(ROBOT_ARM_SOLID);
    // Every one of them is anchored to the solid's part, and none to an image's.
    expect(anchored.map((each) => each.part.part).sort()).toEqual([...ANCHORED].sort());
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
    expect(count('physical-ai.camera')).toBe(2);
    expect(count('physical-ai.topic')).toBe(3);
    expect(count('physical-ai.link')).toBe(7);
    expect(project.views.map((view) => view.id).sort()).toEqual([
      'control-loop',
      'kinematic-chain',
      'software',
      'structure',
      'workcell',
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

  it('stands in its workcell, everything posed there in physical space under World', () => {
    const space = spaceOf(project);
    const place = (id: string) => {
      const entry = space.entries.get(id);
      if (!entry) throw new Error(`${id} is not in physical space.`);
      const [x, y, z] = entry.matrix.slice(12, 15) as [number, number, number];
      return { how: entry.how, in: entry.in, x, y, z };
    };
    const posed = project.model.elements.filter((element) => element.pose !== undefined);
    expect(posed.map((element) => element.id).sort()).toEqual(
      [
        'arm',
        'bin-a',
        'bin-b',
        'table',
        'workcell',
        'workcell-camera',
        'workpiece',
        'wrist-camera',
      ].sort(),
    );
    // Every pose is used: each element posed is in physical space, posed where its pose says.
    for (const element of posed) {
      expect(place(element.id), element.id).toMatchObject({
        how: 'posed',
        in: element.pose?.in ?? project.model.world.id,
      });
    }
    // In meters, +Y up: the table's top 75 cm up, the arm on it, the bins on it in front, the camera
    // above them and the part in bin A.
    expect(place('workcell')).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(place('table').y).toBeCloseTo(0.75, 9);
    expect(place('arm').y).toBeCloseTo(0.75, 9);
    for (const bin of ['bin-a', 'bin-b']) {
      expect(place(bin).y, bin).toBeCloseTo(0.75, 9);
      expect(place(bin).z, bin).toBeGreaterThan(place('arm').z);
    }
    expect(place('workcell-camera').y).toBeGreaterThan(2);
    expect(place('workpiece')).toMatchObject({ in: 'bin-a' });
    expect(place('workpiece').x).toBeCloseTo(place('bin-a').x, 9);
    // Each anchored part of the arm is in physical space too, through the arm.
    for (const part of ANCHORED) {
      expect(place(part), part).toMatchObject({ how: 'anchored', in: 'arm' });
    }
  });

  it('poses the wrist camera on link 6, where the solid draws the camera, turned to look past the gripper', () => {
    const point = (name: string) =>
      packageFile().solids?.[0]?.parts?.find((part) => part.name === name)?.point;
    const camera = spaceOf(project, undefined, 'arm').entries.get('wrist-camera');
    expect(camera).toMatchObject({ how: 'posed', in: 'link-6' });
    const m = camera?.matrix ?? [];
    expect(m[12]).toBeCloseTo(point('camera')?.x ?? NaN, 9);
    expect(m[13]).toBeCloseTo(point('camera')?.y ?? NaN, 9);
    expect(m[14]).toBeCloseTo(point('camera')?.z ?? NaN, 9);
    // It looks along its -Z, as glTF's cameras do: toward the arm's front (+Z), and down.
    expect(-(m[10] ?? 0)).toBeGreaterThan(0.8);
    expect(-(m[9] ?? 0)).toBeLessThan(-0.4);
    // It is mounted on link 6 by a relation that nests, derived from "is attached to".
    const mounted = project.model.relations.find((each) => each.id === 'camera-on-link-6');
    expect(mounted).toMatchObject({
      relationType: 'robot-arm.is-mounted-on',
      from: 'wrist-camera',
      to: 'link-6',
    });
  });

  it('has a tour that plays "Pick a part" with the physical-space panel open, every step whole', () => {
    expect(project.tours.map((each) => [each.id, each.name])).toEqual([
      ['pick-a-part', 'Pick a part'],
    ]);
    const [tour] = project.tours;
    if (!tour) throw new Error('No tour.');
    for (const step of tour.steps) {
      expect(tourStepProblems(project, step), step.id).toEqual([]);
      // Every step opens the panel, on something in physical space.
      expect(step.viewState.space, step.id).toBeDefined();
      const view = project.views.find((each) => each.id === step.viewState.view);
      const space = spaceOf(project, view, step.viewState.space?.root);
      expect(space.entries.size, step.id).toBeGreaterThan(3);
      for (const id of step.viewState.select ?? []) {
        expect(space.entries.has(id), `${step.id}: ${id}`).toBe(true);
      }
    }
    const playing = tour.steps.filter((step) => step.play?.scenario === 'pick-a-part');
    expect(playing.map((step) => step.viewState.view)).toEqual(['control-loop']);
    // While it plays, the ends of its first step, the wrist camera and the part, are in physical space.
    const loop = project.views.find((each) => each.id === 'control-loop');
    const space = spaceOf(project, loop);
    for (const id of ['wrist-camera', 'workpiece']) expect(space.entries.has(id), id).toBe(true);
  });
});
