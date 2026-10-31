/**
 * Images: pictures that packages define, cleaned in the core so that nothing in them runs or loads,
 * and read only through their cleaned view.
 */
export type { Cleaned } from './result';
export type { CleanedSvg } from './svg';
export { SVG_ALLOWED, SVG_CAPS, cleanSvg } from './svg';
export type { BitmapFormat, CleanedBitmap, ImageHeader } from './bitmap';
export { BITMAP_CAPS, readBitmap, readImageHeader } from './bitmap';
export { decodeBase64, encodeBase64 } from './base64';
export type { CleanedImage } from './cleaned';
export { cleanedImage, imageText, isClean } from './cleaned';
export type { ImageCatalog } from './catalog';
export {
  IMAGE_CAPS,
  componentImage,
  imageIdOf,
  imageShownBy,
  imageUsers,
  imageWithContent,
  imagesIn,
  imagesOf,
  resolveImage,
} from './catalog';
export { checkImages } from './check';
export type { AnchoredElement, LostPart } from './anchored';
export {
  anchoredElements,
  newUnknownParts,
  partsLostByReplacing,
  unknownPartWarnings,
} from './anchored';
// Anchor parts…, from the inspector and by Claude (ADR 0067, M8b W54).
export type {
  AnchorContent,
  AnchorMatching,
  AnchorPlan,
  AnchorPlanning,
  AnchorRequest,
  DrawingParts,
  PartAnchor,
  PartsToPlan,
  PlannedPart,
  PlannedParts,
} from './anchoring';
export {
  anchoringCommand,
  anchoringLabel,
  drawingPartsOf,
  identifiersOf,
  nameKey,
  partName,
  planAnchoring,
} from './anchoring';
export type { FoundPart, NamedPart, PartsLeftOut } from './parts';
export {
  PART_CAPS,
  findPart,
  geometryOf,
  lostParts,
  namedPart,
  namedPartCount,
  partImageId,
  partPicture,
  partsLeftOut,
  partsOf,
  tooManyPartsProblem,
  unknownPartProblem,
} from './parts';
