import {
  applyOperations,
  cleanSvg,
  executeCommand,
  imagesIn,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Element } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../../test/sample';
import {
  componentImageAction,
  elementImageAction,
  elementImagePackage,
  newImageId,
  ownPackages,
  type NewPicture,
} from './imageCommands';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const sample = loadSample();
const fixed = (base: string) => `${base}-abc123`;

function picture(fill = '#25D366'): NewPicture {
  const cleaned = cleanSvg(
    `<svg viewBox="0 0 24 24" ${NS}><circle cx="12" cy="12" r="10" fill="${fill}"/></svg>`,
  );
  if (!cleaned.ok) throw new Error('not clean');
  return {
    ok: true,
    name: 'WhatsApp logo',
    content: { svg: cleaned.value.svg },
    width: 24,
    height: 24,
    removed: [],
  };
}

function run(project: ProjectSnapshot, command: Command | undefined): ProjectSnapshot {
  if (!command) throw new Error('No command.');
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((problem) => problem.message).join(' '));
  // Undoing it gives the project back exactly.
  expect(applyOperations(outcome.state, outcome.inverse).state).toEqual(project);
  return outcome.state;
}

function element(project: ProjectSnapshot, id: string): Element {
  return project.model.elements.find((each) => each.id === id) as Element;
}

describe('giving a component a picture', () => {
  it('defines it in the component’s package, then shows it, as one action', () => {
    const command = componentImageAction(
      sample,
      'clinic.calendar',
      { kind: 'new', picture: picture() },
      { placement: 'drawing' },
      fixed,
    );
    expect(command).toMatchObject({
      type: 'batch',
      label: 'Set the image of "Calendar"',
      commands: [
        {
          type: 'define-image',
          package: 'clinic',
          createOnly: true,
          image: { id: 'clinic.whatsapp-logo-abc123' },
        },
        { type: 'update-component', id: 'clinic.calendar' },
      ],
    });
    const after = run(sample, command);
    const calendar = after.packages
      .find((file) => file.id === 'clinic')
      ?.components.find((each) => each.id === 'clinic.calendar');
    expect(calendar?.appearance?.image).toEqual({
      image: 'clinic.whatsapp-logo-abc123',
      placement: 'drawing',
    });
  });

  it('reuses an image the package holds with the same content', () => {
    const once = run(
      sample,
      componentImageAction(
        sample,
        'clinic.calendar',
        { kind: 'new', picture: picture() },
        {},
        fixed,
      ),
    );
    const again = componentImageAction(
      once,
      'clinic.calendar',
      { kind: 'new', picture: picture() },
      { tint: '#112233' },
      fixed,
    );
    expect(again).toMatchObject({ type: 'update-component' });
    const after = run(once, again);
    expect(imagesIn(after).images.size).toBe(1);
  });

  it('changes how it shows its picture without defining it again', () => {
    const once = run(
      sample,
      componentImageAction(
        sample,
        'clinic.calendar',
        { kind: 'new', picture: picture() },
        {},
        fixed,
      ),
    );
    const placed = componentImageAction(
      once,
      'clinic.calendar',
      { kind: 'same' },
      { placement: 'drawing' },
    );
    expect(placed).toMatchObject({ type: 'update-component' });
    run(once, placed);
  });
});

describe('giving one element a picture of its own', () => {
  it('puts it in the package of its component when the project owns it', () => {
    expect(elementImagePackage(sample, element(sample, 'appointments-db'))).toEqual({
      package: 'clinic',
    });
  });

  it('puts it in the first of the project’s own packages when its component is built in', () => {
    expect(ownPackages(sample)).toEqual(['clinic']);
    const whatsapp = element(sample, 'whatsapp');
    const after = run(
      sample,
      elementImageAction(
        sample,
        whatsapp,
        { kind: 'new', picture: picture() },
        { placement: 'drawing' },
        fixed,
      ),
    );
    expect(element(after, 'whatsapp').appearance?.image).toEqual({
      image: 'clinic.whatsapp-logo-abc123',
      placement: 'drawing',
    });
  });

  it('creates a package named after the project when it has none of its own', () => {
    const bare: ProjectSnapshot = {
      ...sample,
      project: { ...sample.project, name: 'My systems', packages: ['systems'] },
      packages: sample.packages.filter((file) => file.id !== 'clinic'),
      model: {
        ...sample.model,
        elements: sample.model.elements.filter((each) => each.component !== 'clinic.calendar'),
        relations: sample.model.relations.filter((each) => !each.id.includes('db')),
      },
    };
    const whatsapp = element(bare, 'whatsapp');
    const command = elementImageAction(
      bare,
      whatsapp,
      { kind: 'new', picture: picture() },
      {},
      fixed,
    );
    expect(command).toMatchObject({
      type: 'batch',
      commands: [
        { type: 'create-package', package: { id: 'my-systems', name: 'My systems' } },
        { type: 'define-image', package: 'my-systems' },
        { type: 'update-element', id: 'whatsapp' },
      ],
    });
    const after = run(bare, command);
    expect(after.project.packages).toContain('my-systems');
  });

  it('shows a picture already in the project by its id, with nothing defined again', () => {
    const once = run(
      sample,
      componentImageAction(
        sample,
        'clinic.calendar',
        { kind: 'new', picture: picture() },
        {},
        fixed,
      ),
    );
    const command = elementImageAction(
      once,
      element(once, 'whatsapp'),
      { kind: 'existing', id: 'clinic.whatsapp-logo-abc123' },
      { placement: 'icon', tint: '#FF0000' },
    );
    expect(command).toEqual({
      type: 'update-element',
      id: 'whatsapp',
      changes: {
        appearanceTraits: {
          image: { image: 'clinic.whatsapp-logo-abc123', placement: 'icon', tint: '#FF0000' },
        },
      },
    });
    run(once, command);
  });

  it('makes ids that nothing in the project holds, images included', () => {
    const once = run(
      sample,
      componentImageAction(
        sample,
        'clinic.calendar',
        { kind: 'new', picture: picture() },
        {},
        fixed,
      ),
    );
    let attempt = 0;
    const id = newImageId(
      once,
      'clinic',
      'WhatsApp logo',
      (base) => `${base}-${attempt++ === 0 ? 'abc123' : 'def456'}`,
    );
    expect(id).toBe('clinic.whatsapp-logo-def456');
  });
});
