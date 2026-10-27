/**
 * Imported drawings (ADR 0068): HTML that the local program turns into a cleaned SVG picture, which
 * an element then shows as its drawing. The local program makes the picture; this is the one action
 * that stores it and shows it, the same for the app's Import…, the command line and Claude's
 * `import_drawing`:
 *
 * - the picture goes where an element's own picture goes: the package of the element's component
 *   when the project owns it, else the first of the project's own packages, else a new package named
 *   after the project, made in the same action;
 * - a picture that package already holds is shown by its id, and defined again never;
 * - it is shown by the element asked for, or by a new element named after the file, of the component
 *   asked for (Box by default, whose built-in package the project then starts using), sized to the
 *   drawing's proportions;
 * - all of it is one batch, `Import "pricing.html" as a drawing`, which one undo takes back.
 */
import { builtinPackage } from '../builtin';
import { executeCommand } from '../commands';
import type { BatchCommand, Command } from '../commands/types';
import { randomIds, slug, type IdGenerator } from '../ids';
import { imageWithContent } from '../images/catalog';
import { cleanSvg } from '../images/svg';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn, modelIndexOf } from '../state';
import type { Appearance, Id } from '@visual-anything/schema';
import { DRAWING_LIMITS } from './drawing-limits';
import { mappingChoices } from './mapping';

export { DRAWING_LIMITS } from './drawing-limits';

/** The component a new element that shows a drawing is made from when none is asked for. */
export const DRAWING_COMPONENT = 'systems.box';

/** The file name endings an HTML file has. */
export const DRAWING_EXTENSIONS = ['.html', '.htm'] as const;

/** Whether a file's name says it holds HTML. */
export function isDrawingFile(name: string): boolean {
  const lower = name.toLowerCase();
  return DRAWING_EXTENSIONS.some((ending) => lower.endsWith(ending));
}

/** How the history names the action: `Import "pricing.html" as a drawing`. */
export function drawingLabel(name: string): string {
  return `Import "${name}" as a drawing`;
}

/** The longest name an image has (the schema's cap). */
const MAX_IMAGE_NAME = 200;
/** The longest source an image has (the schema's cap). */
const MAX_IMAGE_SOURCE = 500;

/** The name a drawing's image and new element take: the file's name without its ending. */
export function drawingBaseName(name: string): string {
  const lower = name.toLowerCase();
  const ending = DRAWING_EXTENSIONS.find((each) => lower.endsWith(each));
  const base = (ending === undefined ? name : name.slice(0, -ending.length)).trim();
  return base === '' ? 'Drawing' : base.slice(0, MAX_IMAGE_NAME);
}

/** Canvas units a drawing's picture takes for each CSS pixel, and the narrowest and widest it starts. */
const PICTURE = { scale: 0.5, least: 48, most: 480 } as const;
/** The plate around a drawing's picture, on each side, and the band its name is written in below. */
const PLATE_MARGIN = 4;
const NAME_BAND = 20;

/**
 * The size a new element that shows a drawing of this width and height starts at: the picture at
 * half its CSS pixels, from 48 to 480 units wide, on its plate, above the band its name is written in,
 * as the canvas draws a drawing (ADR 0027).
 */
export function drawingShapeSize(width: number, height: number): { width: number; height: number } {
  const pictureWidth = Math.min(PICTURE.most, Math.max(PICTURE.least, width * PICTURE.scale));
  const pictureHeight = (height * pictureWidth) / width;
  return {
    width: Math.round(pictureWidth + 2 * PLATE_MARGIN),
    height: Math.round(pictureHeight + 2 * PLATE_MARGIN + NAME_BAND),
  };
}

/** Who shows the drawing: an element of the project, or a new one of a component, in a view. */
export type DrawingTarget =
  | { element: Id }
  | {
      /** The new element's component; Box by default. */
      component?: Id;
      /** The view it is made in, whose scope then shows it (ADR 0040). */
      view?: Id;
    };

/** A drawing the local program made, to store and show. */
export interface DrawingImport {
  /** The file's name, which names the action, the image and a new element, and is the image's source. */
  name: string;
  /** The cleaned SVG text the local program made. */
  svg: string;
  /** Who shows it; a new Box by default. */
  target?: DrawingTarget;
}

/** The action that stores and shows a drawing, or why it cannot be done. */
export type PreparedDrawing =
  | {
      ok: true;
      command: BatchCommand;
      /** The image that holds the drawing, defined by the action or already in the package. */
      image: Id;
      /** The element asked for; a new element's id is made when the action runs. */
      element?: Id;
    }
  | { ok: false; problems: string[] };

/** Prepares the one action that stores a drawing in the project and shows it, checked as it would run. */
export function prepareDrawingImport(
  state: ProjectSnapshot,
  request: DrawingImport,
  generate: IdGenerator = randomIds(),
): PreparedDrawing {
  const target = request.target ?? {};
  const label = drawingLabel(request.name);
  const name = drawingBaseName(request.name);
  const commands: Command[] = [];
  let current = state;
  const step = (command: Command): string[] | undefined => {
    const outcome = executeCommand(current, command, { newId: generate });
    if (!outcome.ok) return outcome.problems.map((each) => each.message);
    current = outcome.state;
    commands.push(command);
    return undefined;
  };

  let component: Id;
  if ('element' in target) {
    const element = modelIndexOf(state).element(target.element);
    if (element === undefined) return refused(`There is no element "${target.element}".`);
    component = element.component;
  } else {
    if (target.view !== undefined && !state.views.some((view) => view.id === target.view)) {
      return refused(`There is no view "${target.view}".`);
    }
    component = target.component ?? DRAWING_COMPONENT;
    const choice = mappingChoices(state).components.find((each) => each.id === component);
    if (choice === undefined) {
      return refused(
        `No component "${component}" is defined by the project or a built-in package.`,
      );
    }
    if (!choice.inUse && choice.package !== undefined) {
      const problems = step({
        type: 'update-project',
        changes: { packages: [...state.project.packages, choice.package] },
      });
      if (problems) return { ok: false, problems };
    }
  }

  // Where an element's own picture goes, as the image picker puts it.
  let packageId = picturePackage(current, component);
  if (packageId === undefined) {
    const made = createPackage(current, generate);
    if (!made.ok) return made;
    commands.push(made.command);
    current = made.state;
    packageId = made.command.package.id;
  }

  const source = request.name.slice(0, MAX_IMAGE_SOURCE);
  // Compared and stored as cleaning gives it, as `define-image` stores every picture.
  const cleaned = cleanSvg(request.svg);
  if (!cleaned.ok) return refused(cleaned.problem.message);
  const { svg } = cleaned.value;
  let image = imageWithContent(current, packageId, { svg })?.definition.id;
  if (image === undefined) {
    // Run once without an id, to learn the one the core makes, then send it with that id.
    const defined = executeCommand(
      current,
      { type: 'define-image', package: packageId, image: { name, source, svg } },
      { newId: generate },
    );
    if (!defined.ok) return { ok: false, problems: defined.problems.map((each) => each.message) };
    image = defined.created[0] as Id;
    commands.push({
      type: 'define-image',
      package: packageId,
      image: { id: image, name, source, svg },
      createOnly: true,
    });
    current = defined.state;
  }

  const shown = { image, placement: 'drawing' as const };
  if ('element' in target) {
    const problems = step({
      type: 'update-element',
      id: target.element,
      changes: { appearanceTraits: { image: shown } },
    });
    if (problems) return { ok: false, problems };
  } else {
    const size = sizeOf(current, image);
    const appearance: Appearance = { image: shown, ...size };
    const problems = step({
      type: 'create-element',
      element: { component, name, appearance },
      ...(target.view === undefined ? {} : { inView: target.view }),
    });
    if (problems) return { ok: false, problems };
  }

  const command: BatchCommand = { type: 'batch', label, commands };
  // The whole action, checked as it will run.
  const checked = executeCommand(state, command, { newId: generate });
  if (!checked.ok) return { ok: false, problems: checked.problems.map((each) => each.message) };
  return {
    ok: true,
    command,
    image,
    ...('element' in target ? { element: target.element } : {}),
  };
}

function refused(message: string): { ok: false; problems: string[] } {
  return { ok: false, problems: [message] };
}

/** The size a new element showing this image starts at, from the cleaned picture's proportions. */
function sizeOf(state: ProjectSnapshot, image: Id): { width: number; height: number } {
  for (const file of state.packages) {
    const found = file.images?.find((each) => each.id === image);
    if (found) return drawingShapeSize(found.width, found.height);
  }
  return drawingShapeSize(DRAWING_LIMITS.width.initial, DRAWING_LIMITS.width.initial / 2);
}

/** The project's own packages, in its order. */
function ownPackages(state: ProjectSnapshot): Id[] {
  return state.packages.filter((file) => !builtinPackage(file.id)).map((file) => file.id);
}

/**
 * The package an element's own picture goes in: its component's when the project owns it, else the
 * first of the project's own; none when the project has no package of its own.
 */
function picturePackage(state: ProjectSnapshot, component: Id): Id | undefined {
  const own = ownPackages(state);
  const defined = definitionsIn(state).components.get(component);
  if (defined && own.includes(defined.package)) return defined.package;
  return own[0];
}

/** A new package of the project's own, named after the project, with the first id the core accepts. */
function createPackage(
  state: ProjectSnapshot,
  generate: IdGenerator,
):
  | {
      ok: true;
      command: Extract<Command, { type: 'create-package' }>;
      state: ProjectSnapshot;
    }
  | { ok: false; problems: string[] } {
  const name = state.project.name.trim() === '' ? 'Drawings' : state.project.name.slice(0, 200);
  const base = slug(name, 'drawings');
  let problems: string[] = [];
  for (let attempt = 1; attempt <= 100; attempt++) {
    const id = attempt === 1 ? base : `${base}-${attempt}`;
    const command = { type: 'create-package' as const, package: { id, name } };
    const outcome = executeCommand(state, command, { newId: generate });
    if (outcome.ok) return { ok: true, command, state: outcome.state };
    problems = outcome.problems.map((each) => each.message);
  }
  return { ok: false, problems };
}
