/**
 * The elements drawn as named parts (ADR 0067): each element whose appearance, its own or the one it
 * inherits, names a part, with the images it names that part in. Those are the part's own `image`
 * or, when it names none, the images its containers show with their parts, under every nesting
 * relation type. Opening and every action's answer warn from here with `unknown-part`, and the
 * replace preview lists from here the anchored parts that a new picture would lose.
 */
import type { Element, Id, PartReference } from '@visual-anything/schema';
import { componentOrEssence } from '../definitions';
import type { Problem } from '../problems';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn, modelIndexOf } from '../state';
import { imageShownBy, imagesIn } from './catalog';
import type { CleanedImage } from './cleaned';
import { lostParts, unknownPartProblem } from './parts';

/** An element whose shapes are drawn as a named part. */
export interface AnchoredElement {
  readonly element: Element;
  readonly part: PartReference;
  /** Whether the part comes from its component rather than its own appearance. */
  readonly inherited: boolean;
  /** The images it names its part in: the part's own, or those its containers show with their parts. */
  readonly images: readonly Id[];
}

const anchoredByModel = new WeakMap<
  object,
  { packages: unknown; project: unknown; anchored: readonly AnchoredElement[] }
>();

/** The elements drawn as named parts, in model order; worked out once for each project. */
export function anchoredElements(state: ProjectSnapshot): readonly AnchoredElement[] {
  const kept = anchoredByModel.get(state.model);
  if (kept && kept.packages === state.packages && kept.project === state.project) {
    return kept.anchored;
  }
  const anchored = find(state);
  anchoredByModel.set(state.model, {
    packages: state.packages,
    project: state.project,
    anchored,
  });
  return anchored;
}

function find(state: ProjectSnapshot): readonly AnchoredElement[] {
  const definitions = definitionsIn(state);
  const componentParts = new Map<Id, PartReference | undefined>();
  const componentPart = (id: Id) => {
    if (!componentParts.has(id)) {
      componentParts.set(id, componentOrEssence(definitions, id).appearance.part);
    }
    return componentParts.get(id);
  };
  const elements = [state.model.world, ...state.model.elements];
  // Most projects name no part: telling costs one pass over the components and the elements.
  const anyComponent = [...definitions.components.keys()].some((id) => componentPart(id));
  if (!anyComponent && !elements.some((element) => typeof element.appearance?.part === 'object')) {
    return [];
  }

  const index = modelIndexOf(state);
  const anchored: AnchoredElement[] = [];
  for (const element of elements) {
    const own = element.appearance?.part;
    if (own === 'none') continue;
    const part = own ?? componentPart(element.component);
    if (part === undefined) continue;
    const images =
      part.image === undefined
        ? drawingsAround(state, index.containersOf(element.id))
        : [part.image];
    anchored.push({ element, part, inherited: own === undefined, images });
  }
  return anchored;
}

/** The images that containers show with their parts, each once, in the containers' order. */
function drawingsAround(state: ProjectSnapshot, containers: readonly Id[]): Id[] {
  if (containers.length === 0) return [];
  const definitions = definitionsIn(state);
  const index = modelIndexOf(state);
  const images = new Set<Id>();
  for (const id of containers) {
    const container = index.element(id);
    const shown = container && imageShownBy(container, definitions);
    if (shown?.placement === 'parts') images.add(shown.image);
  }
  return [...images];
}

/**
 * The `unknown-part` warnings of a project: one for each element drawn as a part that an image it
 * names it in does not list. A part a component names in an image of its own warns once, for the
 * component; one found in a container's image warns for each element, since it hangs on where each
 * sits.
 */
export function unknownPartWarnings(state: ProjectSnapshot): Problem[] {
  const anchored = anchoredElements(state);
  if (anchored.length === 0) return [];
  const catalog = imagesIn(state);
  const definitions = definitionsIn(state);
  const warnings: Problem[] = [];
  const said = new Set<string>();
  for (const { element, part, inherited, images } of anchored) {
    for (const image of images) {
      const byComponent = inherited && part.image !== undefined;
      const owner = byComponent
        ? {
            id: element.component,
            label: `The component "${componentOrEssence(definitions, element.component).name}"`,
          }
        : { id: element.id, label: `The element "${element.name}"` };
      const key = `${owner.id}\u0000${image}`;
      if (said.has(key)) continue;
      said.add(key);
      const warning = unknownPartProblem({ part: part.part, image }, catalog, owner);
      if (warning) warnings.push(warning);
    }
  }
  return warnings;
}

/** The `unknown-part` warnings an action brings: those its result has that the project before lacked. */
export function newUnknownParts(before: ProjectSnapshot, after: ProjectSnapshot): Problem[] {
  const now = unknownPartWarnings(after);
  if (now.length === 0) return [];
  const had = new Set(unknownPartWarnings(before).map((each) => each.message));
  return now.filter((each) => !had.has(each.message));
}

/** An anchored part a replacement loses, with the elements drawn as it. */
export interface LostPart {
  readonly part: string;
  readonly elements: readonly { readonly id: Id; readonly name: string }[];
}

/**
 * The anchored parts that replacing an image's picture with `next` would lose, for the replace
 * preview and `replace_image`'s answer (ADR 0067): those the picture now lists and `next` does not,
 * in the order their elements come in the model. With no `next`, as when it would not be drawn,
 * every anchored part the picture lists is lost.
 */
export function partsLostByReplacing(
  state: ProjectSnapshot,
  imageId: Id,
  next: CleanedImage | undefined,
): LostPart[] {
  const anchored = anchoredElements(state).filter((each) => each.images.includes(imageId));
  if (anchored.length === 0) return [];
  const lost = lostParts(
    imagesIn(state).shown(imageId),
    next,
    anchored.map((each) => each.part.part),
  );
  return lost.map((part) => ({
    part,
    elements: anchored
      .filter((each) => each.part.part === part)
      .map(({ element }) => ({ id: element.id, name: element.name })),
  }));
}
