/**
 * Import…'s solid step (ADR 0075): a `.glb` or `.gltf` file goes to the local program, which cleans
 * it; the dialog shows its preview, size in the unit chosen, up axis, counts and the report before
 * anything changes, prepares it again for another unit, up axis or to simplify it, asks for its
 * description, offers the file's copyright as its source, and imports it as one action.
 */
import {
  builtinPackage,
  type BatchCommand,
  type Command,
  type DefineSolidCommand,
  type ProjectSnapshot,
  type SolidImportOptions,
  type SolidPreparedMessage,
} from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../i18n/LanguageProvider';
import type { CommandResult, LiveResult } from '../live/connection';
import { loadSample } from '../test/sample';
import { ImportControl } from './ImportControl';

const HASH = 'a'.repeat(64);

type Prepare = (
  fileName: string,
  bytes: Uint8Array,
  options?: SolidImportOptions,
) => Promise<LiveResult<SolidPreparedMessage>>;

function preparedAnswer(options: SolidImportOptions = {}): LiveResult<SolidPreparedMessage> {
  // A file in millimetres reads a thousand times smaller once the program scales it to meters.
  const scale = options.units === 'mm' ? 0.001 : 1;
  return {
    ok: true,
    answer: {
      type: 'solid/prepared',
      requestId: 'r1',
      hash: HASH,
      bytes: 2048,
      bounds: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 300 * scale, y: 200 * scale, z: 100 * scale },
      },
      counts: { triangles: 1200, vertices: 800, nodes: 3, textures: 1 },
      parts: [{ name: 'base' }, { name: 'elbow', parent: 0 }],
      animations: [{ duration: 2 }],
      report: ['Dropped 1 camera.'],
      source: '© Acme Robotics',
    },
  };
}

function renderControl(
  options: { project?: ProjectSnapshot; prepare?: Prepare; language?: 'en' | 'es' } = {},
) {
  const send = vi.fn<(command: Command) => Promise<CommandResult>>(() =>
    Promise.resolve({ ok: true, created: [], warnings: [] }),
  );
  const prepareSolid = vi.fn<Prepare>(
    options.prepare ?? ((_name, _bytes, asked) => Promise.resolve(preparedAnswer(asked))),
  );
  render(
    <LanguageProvider language={options.language ?? 'en'}>
      <ImportControl
        project={options.project ?? loadSample()}
        viewId="system-overview"
        send={send}
        prepareSolid={prepareSolid}
      />
    </LanguageProvider>,
  );
  return { send, prepareSolid };
}

const dialog = () => screen.getByRole('dialog');

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function chooseSolid(name = 'arm.glb', labels = { import: 'Import…', read: 'Read' }) {
  fireEvent.click(screen.getByRole('button', { name: labels.import }));
  const input = dialog().querySelector('input[type="file"]') as HTMLInputElement;
  expect(input.accept).toContain('.glb');
  const file = new File([new Uint8Array([1, 2, 3, 4])], name, { type: 'model/gltf-binary' });
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.click(within(dialog()).getByRole('button', { name: labels.read }));
  await settle();
}

describe('Import… with a glTF file', () => {
  it('has the program clean it, shows what came of it, and imports it as one action', async () => {
    const { send, prepareSolid } = renderControl();
    await chooseSolid();
    expect(prepareSolid).toHaveBeenCalledTimes(1);
    expect(prepareSolid.mock.calls[0]?.[0]).toBe('arm.glb');
    expect([...(prepareSolid.mock.calls[0]?.[1] ?? [])]).toEqual([1, 2, 3, 4]);
    // Meters and Y up by default, which the program takes as asking for nothing.
    expect(prepareSolid.mock.calls[0]?.[2]).toEqual({});
    const shown = within(dialog());
    expect(shown.getByRole('heading', { name: 'Import “arm.glb” as a solid' })).toBeTruthy();
    expect(shown.getByText('300 × 200 × 100 m')).toBeTruthy();
    expect(
      shown.getByText('1,200 triangles, 800 vertices, 2 named parts, 1 texture, 1 animation'),
    ).toBeTruthy();
    expect(shown.getByText('Dropped 1 camera.')).toBeTruthy();
    expect(shown.getByText('elbow')).toBeTruthy();
    // Where no program draws solids, the preview says so, with the text alternative.
    expect(
      shown.getByRole('img', { name: 'The solid “arm”, which has no description yet' }),
    ).toBeTruthy();
    // The file's copyright is offered as its source.
    expect((shown.getByLabelText('Source') as HTMLInputElement).value).toBe('© Acme Robotics');
    expect(shown.getByText('The file says: © Acme Robotics')).toBeTruthy();
    fireEvent.change(shown.getByLabelText('Description'), {
      target: { value: 'A six-axis arm on a round base.' },
    });
    fireEvent.change(shown.getByLabelText('License'), { target: { value: 'CC0-1.0' } });
    fireEvent.click(shown.getByRole('button', { name: 'Import' }));
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]?.[0] as DefineSolidCommand;
    expect(command.type).toBe('define-solid');
    expect(command.fileName).toBe('arm.glb');
    expect(command.createOnly).toBe(true);
    expect(command.solid).toMatchObject({
      name: 'arm',
      description: 'A six-axis arm on a round base.',
      source: '© Acme Robotics',
      license: 'CC0-1.0',
      hash: HASH,
      bytes: 2048,
      camera: { azimuth: 30, elevation: 20 },
      animations: [{ duration: 2 }],
    });
    expect(command.solid.id.startsWith(`${command.package}.arm-`)).toBe(true);
    expect(builtinPackage(command.package)).toBeUndefined();
    expect(
      within(dialog()).getByRole('heading', { name: 'Imported “arm.glb” as a solid' }),
    ).toBeTruthy();
  });

  it('prepares the file again in the unit and with the up axis chosen', async () => {
    const { prepareSolid } = renderControl();
    await chooseSolid();
    fireEvent.change(within(dialog()).getByLabelText('The file’s unit'), {
      target: { value: 'mm' },
    });
    await settle();
    expect(prepareSolid.mock.calls.at(-1)?.[2]).toEqual({ units: 'mm' });
    // The size in the unit chosen, and in meters.
    expect(within(dialog()).getByText('300 × 200 × 100 mm (0.3 × 0.2 × 0.1 m)')).toBeTruthy();
    fireEvent.change(within(dialog()).getByLabelText('Up axis'), { target: { value: 'z' } });
    await settle();
    expect(prepareSolid.mock.calls.at(-1)?.[2]).toEqual({ units: 'mm', up: 'z' });
  });

  it('offers to simplify a file past the cap on triangles, and prepares it simplified', async () => {
    const { prepareSolid, send } = renderControl({
      prepare: (_name, _bytes, asked) =>
        Promise.resolve(
          asked?.simplify === true
            ? preparedAnswer(asked)
            : {
                ok: false,
                problems: [
                  {
                    code: 'solid-too-large',
                    message:
                      'It draws 2,000,000 triangles, past the 1,000,000 a solid holds: simplify it to fit.',
                  },
                ],
              },
        ),
    });
    await chooseSolid();
    const shown = within(dialog());
    expect(shown.getByRole('alert').textContent).toContain('2,000,000 triangles');
    expect(shown.getByRole('button', { name: 'Import' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
    fireEvent.click(shown.getByRole('button', { name: 'Simplify it to fit' }));
    await settle();
    expect(prepareSolid.mock.calls.at(-1)?.[2]).toEqual({ simplify: true });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Import' }));
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('makes a package of the project’s own in the same action when there is none', async () => {
    const sample = loadSample();
    const project: ProjectSnapshot = {
      ...sample,
      packages: sample.packages.filter((file) => builtinPackage(file.id) !== undefined),
    };
    const { send } = renderControl({ project });
    await chooseSolid('Gripper.gltf');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Import' }));
    await settle();
    const command = send.mock.calls[0]?.[0] as BatchCommand;
    expect(command.type).toBe('batch');
    expect(command.label).toBe('Import "Gripper.gltf" as a solid');
    expect(command.commands.map((each) => each.type)).toEqual(['create-package', 'define-solid']);
  });

  it('refuses a license that is not an SPDX identifier', async () => {
    const { send } = renderControl();
    await chooseSolid();
    fireEvent.change(within(dialog()).getByLabelText('License'), {
      target: { value: 'all rights reserved' },
    });
    expect(within(dialog()).getByRole('alert').textContent).toBe(
      'A license is written by its SPDX identifier, such as CC0-1.0 or CC-BY-4.0.',
    );
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Import' }));
    await settle();
    expect(send).not.toHaveBeenCalled();
  });

  it('reads in Spanish', async () => {
    renderControl({ language: 'es' });
    await chooseSolid('arm.glb', { import: 'Importar…', read: 'Leer' });
    const shown = within(dialog());
    expect(shown.getByRole('heading', { name: 'Importar “arm.glb” como sólido' })).toBeTruthy();
    expect(shown.getByLabelText('La unidad del archivo')).toBeTruthy();
    expect(shown.getByText(/^1200 triángulos, 800 puntos de geometría, 2 partes/)).toBeTruthy();
  });
});
