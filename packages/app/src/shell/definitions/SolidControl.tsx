/**
 * The component editor's Solid section (ADR 0075): which solid a component's shapes show, how they
 * place it (an icon beside the name, the shape's drawing, or a drawing with its parts), the camera it
 * is seen from (azimuth, elevation, zoom and projection, or the solid's own) with a preview that turns
 * and Use this view, and its lighting (studio or flat). Each change sends the appearance's `solid`
 * trait whole, one undoable action; Show no solid sets it to `none`. When the component also shows an
 * image, it says that the image is not drawn.
 */
import { solidsIn, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { AppearanceSolid, Id, SolidCamera } from '@visual-anything/schema';
import { useId } from 'react';
import { storedCamera } from '../../canvas/solids/useThisView';
import { useT } from '../../i18n';
import { readNumber } from '../inspector/attributes';
import { SelectControl, TextControl } from '../inspector/controls';
import { componentSolidAction } from './solidCommands';
import { SolidPreview } from './SolidPreview';

interface SolidControlProps {
  project: ProjectSnapshot;
  component: Id;
  /** The solid the shapes show now, from whichever appearance; none when they show none. */
  shown: AppearanceSolid | undefined;
  /** Whether the component's own appearance says `none`. */
  ownNone: boolean;
  /** Whether the shapes also show an image, which the solid then takes the place of. */
  showsImage: boolean;
  disabled: boolean;
  send: (command: Command) => Promise<boolean>;
  describedBy?: string | undefined;
}

const PLACEMENTS = ['icon', 'drawing', 'parts'] as const;
type Placement = (typeof PLACEMENTS)[number];

function placementOf(value: string): Placement {
  return PLACEMENTS.find((each) => each === value) ?? 'drawing';
}

/** Why a camera's number cannot be committed, in words; none when it can. */
function rangeProblem(least: number, most: number, problem: string) {
  return (text: string): string | undefined => {
    const reading = readNumber(text);
    return reading.ok && reading.value >= least && reading.value <= most ? undefined : problem;
  };
}

export function SolidControl({
  project,
  component,
  shown,
  ownNone,
  showsImage,
  disabled,
  send,
  describedBy,
}: SolidControlProps) {
  const t = useT();
  const solidId = useId();
  const placementId = useId();
  const lightingId = useId();
  const azimuthId = useId();
  const elevationId = useId();
  const zoomId = useId();
  const projectionId = useId();
  const catalog = solidsIn(project);
  const solids = [...catalog.solids.values()];
  const defined = shown ? catalog.solid(shown.solid)?.definition : undefined;
  const camera: SolidCamera | undefined = shown?.camera ?? defined?.camera;
  const set = (solid: AppearanceSolid | 'none') => send(componentSolidAction(component, solid));
  const withCamera = (next: SolidCamera | undefined) => {
    if (!shown) return Promise.resolve(false);
    const rest: AppearanceSolid = {
      solid: shown.solid,
      ...(shown.placement === undefined ? {} : { placement: shown.placement }),
      ...(shown.lighting === undefined ? {} : { lighting: shown.lighting }),
    };
    return set(next === undefined ? rest : { ...rest, camera: storedCamera(next) });
  };
  const cameraNumber = (key: 'azimuth' | 'elevation' | 'zoom') => async (text: string) => {
    const reading = readNumber(text);
    if (!reading.ok || !camera) return;
    await withCamera({ ...camera, [key]: reading.value });
  };

  return (
    <div className="solid-control">
      {solids.length === 0 ? (
        <p className="definition-note">
          {t(
            'The project has no solid yet: import a .glb or .gltf file with Import… in the header.',
          )}
        </p>
      ) : (
        <div className="solid-control-row">
          <label htmlFor={solidId}>{t('Which solid')}</label>
          <SelectControl
            id={solidId}
            value={shown?.solid ?? ''}
            disabled={disabled}
            describedBy={describedBy}
            onCommit={async (value) => {
              if (value === '') return;
              await set({
                solid: value,
                ...(shown?.placement === undefined ? {} : { placement: shown.placement }),
                ...(shown?.lighting === undefined ? {} : { lighting: shown.lighting }),
              });
            }}
          >
            {shown === undefined && <option value="">{t('None')}</option>}
            {shown !== undefined && defined === undefined && (
              <option value={shown.solid}>
                {t('“{id}”, which no package defines', { id: shown.solid })}
              </option>
            )}
            {solids.map(({ definition }) => (
              <option key={definition.id} value={definition.id}>
                {definition.name}
              </option>
            ))}
          </SelectControl>
        </div>
      )}
      {shown && showsImage && (
        <p className="definition-note" role="note">
          {t('Its image is not drawn: a shape that shows a solid draws the solid instead.')}
        </p>
      )}
      {shown && defined && (
        <p className="definition-note">
          {defined.description === undefined || defined.description.trim() === ''
            ? t(
                'The solid “{name}” has no description, which is its text alternative: add one in the Components tab.',
                {
                  name: defined.name,
                },
              )
            : t('Its text alternative: {description}', { description: defined.description })}
        </p>
      )}
      {shown && (
        <>
          <div className="solid-control-row">
            <label htmlFor={placementId}>{t('Placement')}</label>
            <SelectControl
              id={placementId}
              value={shown.placement ?? 'drawing'}
              disabled={disabled}
              onCommit={async (value) => {
                await set({ ...shown, placement: placementOf(value) });
              }}
            >
              <option value="icon">{t('Icon, beside the name')}</option>
              <option value="drawing">{t('Drawing, above its name')}</option>
              <option value="parts">{t('With its parts, which its contents are drawn as')}</option>
            </SelectControl>
          </div>
          <div className="solid-control-row">
            <label htmlFor={lightingId}>{t('Lighting')}</label>
            <SelectControl
              id={lightingId}
              value={shown.lighting ?? 'studio'}
              disabled={disabled}
              onCommit={async (value) => {
                await set({ ...shown, lighting: value === 'flat' ? 'flat' : 'studio' });
              }}
            >
              <option value="studio">{t('Studio, lit as in a room')}</option>
              <option value="flat">{t('Flat, its colors without light')}</option>
            </SelectControl>
          </div>
          {camera && (
            <fieldset className="solid-control-camera">
              <legend>
                {shown.camera === undefined ? t('Camera, the solid’s own') : t('Camera, its own')}
              </legend>
              <label htmlFor={azimuthId}>{t('Azimuth, in degrees')}</label>
              <TextControl
                id={azimuthId}
                value={String(camera.azimuth)}
                inputType="number"
                disabled={disabled}
                problemOf={rangeProblem(-180, 180, t('An azimuth is from −180 to 180 degrees.'))}
                onCommit={cameraNumber('azimuth')}
              />
              <label htmlFor={elevationId}>{t('Elevation, in degrees')}</label>
              <TextControl
                id={elevationId}
                value={String(camera.elevation)}
                inputType="number"
                disabled={disabled}
                problemOf={rangeProblem(-89, 89, t('An elevation is from −89 to 89 degrees.'))}
                onCommit={cameraNumber('elevation')}
              />
              <label htmlFor={zoomId}>{t('Zoom')}</label>
              <TextControl
                id={zoomId}
                value={String(camera.zoom ?? 1)}
                inputType="number"
                disabled={disabled}
                problemOf={rangeProblem(0.25, 16, t('A zoom is from 0.25 to 16.'))}
                onCommit={cameraNumber('zoom')}
              />
              <label htmlFor={projectionId}>{t('Projection')}</label>
              <SelectControl
                id={projectionId}
                value={camera.projection ?? 'perspective'}
                disabled={disabled}
                onCommit={async (value) => {
                  await withCamera({
                    ...camera,
                    projection: value === 'orthographic' ? 'orthographic' : 'perspective',
                  });
                }}
              >
                <option value="perspective">{t('Perspective')}</option>
                <option value="orthographic">{t('Orthographic')}</option>
              </SelectControl>
              {shown.camera !== undefined && (
                <button
                  type="button"
                  className="inspector-action"
                  disabled={disabled}
                  onClick={() => void withCamera(undefined)}
                >
                  {t('Use the solid’s own camera')}
                </button>
              )}
            </fieldset>
          )}
          {defined && camera && (
            <SolidPreview
              hash={defined.hash}
              name={defined.name}
              label={
                defined.description === undefined || defined.description.trim() === ''
                  ? t('The solid “{name}”, which has no description yet', { name: defined.name })
                  : defined.description
              }
              camera={camera}
              lighting={shown.lighting ?? 'studio'}
              {...(disabled ? {} : { onUseView: (seen: SolidCamera) => void withCamera(seen) })}
            />
          )}
        </>
      )}
      {!disabled && !ownNone && (
        <button type="button" className="inspector-action" onClick={() => void set('none')}>
          {t('Show no solid')}
        </button>
      )}
    </div>
  );
}
