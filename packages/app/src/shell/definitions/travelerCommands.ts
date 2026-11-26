/**
 * The actions of a traveler's controls (ADR 0110): the picture a relation type's lines send, at the
 * level the project can change it, or one relation's own. A traveler is replaced whole, so each change
 * of its picture, size, speed or spacing sends the whole traveler; `none` takes an inherited one away
 * and `null` makes it inherited again. A new picture is defined in the same action.
 */
import {
  definitionsIn,
  editableAppearanceOf,
  randomIds,
  type BatchCommand,
  type Command,
  type IdGenerator,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, Traveler } from '@visual-anything/schema';
import { proposedPackageId } from './commands';
import { definePicture, ownPackages, type PictureChoice } from './imageCommands';

/** What a traveler is set to: a traveler, none, or inherited again with `null`. */
export type TravelerChange = Traveler | 'none' | null;

/** The speeds, in the order the controls offer them, and what each is called. */
export const TRAVELER_SPEEDS: readonly { speed: NonNullable<Traveler['speed']>; name: string }[] = [
  { speed: 'slow', name: 'Slow' },
  { speed: 'normal', name: 'Normal' },
  { speed: 'fast', name: 'Fast' },
];

/** The ranges and defaults a traveler takes (ADR 0110). */
export const TRAVELER_SIZE = { min: 8, max: 64, default: 20 } as const;
export const TRAVELER_SPACING = { min: 40, max: 2000, default: 240 } as const;

/** Whether a choice of the speed control is a speed. */
export function isTravelerSpeed(value: string): value is NonNullable<Traveler['speed']> {
  return TRAVELER_SPEEDS.some((each) => each.speed === value);
}

/** The traveler a relation type's appearance stores where the project can change it, if any. */
export function storedRelationTypeTraveler(
  project: ProjectSnapshot,
  id: Id,
): Traveler | 'none' | undefined {
  const stored = editableAppearanceOf(project, 'relation-type', id)?.appearance;
  return stored !== undefined && 'traveler' in stored ? stored.traveler : undefined;
}

/** The command that sets a relation type's traveler where the project can change it. */
export function relationTypeTravelerCommand(relationType: Id, traveler: TravelerChange): Command {
  return { type: 'set-relation-type-appearance', relationType, appearanceTraits: { traveler } };
}

/** The command that sets one relation's own traveler, as a particularity. */
export function relationTravelerCommand(relation: Id, traveler: TravelerChange): Command {
  return { type: 'update-relation', id: relation, changes: { appearanceTraits: { traveler } } };
}

/** A traveler with one of its fields changed, the others kept; a default value is left out. */
export function travelerWith(
  traveler: Traveler,
  changes: Partial<Pick<Traveler, 'size' | 'speed' | 'spacing'>>,
): Traveler {
  const next: Traveler = { ...traveler, ...changes };
  if (next.size === TRAVELER_SIZE.default) delete next.size;
  if (next.speed === 'normal') delete next.speed;
  if (next.spacing === TRAVELER_SPACING.default) delete next.spacing;
  return next;
}

/**
 * Where a new picture of a relation type's traveler goes: the relation type's own package when the
 * project owns it, else the first of the project's own packages, else a new one named after the
 * project, created in the same action.
 */
export function travelerImagePackage(
  project: ProjectSnapshot,
  relationType: Id,
): { package: Id; create?: { id: Id; name: string } } {
  const own = ownPackages(project);
  const defined = definitionsIn(project).relationTypes.get(relationType);
  if (defined && own.includes(defined.package)) return { package: defined.package };
  const first = own[0];
  if (first !== undefined) return { package: first };
  const name = project.project.name;
  const id = proposedPackageId(project, name);
  return { package: id, create: { id, name } };
}

/**
 * The action that gives a traveler a picture: a new one, defined first, or one already in the
 * project. The traveler keeps the size, speed and spacing it had; `set` makes the command that stores
 * it. `undefined` when there is nothing to send.
 */
export function travelerPictureAction(
  project: ProjectSnapshot,
  relationType: Id,
  choice: PictureChoice,
  current: Traveler | undefined,
  set: (traveler: Traveler) => Command,
  label: string,
  generate: IdGenerator = randomIds(),
): Command | undefined {
  const commands: Command[] = [];
  let image: Id | undefined;
  if (choice.kind === 'new') {
    const target = travelerImagePackage(project, relationType);
    if (target.create) commands.push({ type: 'create-package', package: target.create });
    const defined = definePicture(project, target.package, choice.picture, generate);
    image = defined.id;
    commands.push(...defined.commands);
  } else if (choice.kind === 'existing') {
    image = choice.id;
  } else {
    image = current?.image;
  }
  if (image === undefined || (choice.kind !== 'new' && image === current?.image)) return undefined;
  commands.push(set({ ...current, image }));
  if (commands.length === 1) return commands[0];
  const batch: BatchCommand = { type: 'batch', label, commands };
  return batch;
}

/** Whether typed text is a number within a range, as a traveler's size and spacing must be. */
export function withinRange(text: string, range: { min: number; max: number }): boolean {
  const value = Number(text);
  return text.trim() !== '' && Number.isFinite(value) && value >= range.min && value <= range.max;
}
