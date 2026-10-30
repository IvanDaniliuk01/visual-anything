/**
 * Faces (ADR 0083): what a component's shapes show inside their body, written in a subset of HTML and
 * CSS, read, compiled, laid out and checked by the core, and drawn by the program.
 */
export { FACE_CAPS, FACE_FONT_SIZES } from './limits';
export type { FacePart, FaceProblem, FaceProblemCode } from './problems';
export { faceMessage, faceProblemOf } from './problems';
export type {
  MarkupAttribute,
  MarkupElement,
  MarkupNode,
  MarkupRead,
  MarkupText,
  Position,
} from './reader';
export { readMarkup } from './reader';
export type { Condition, Reference, Slot, TextTemplate } from './slots';
export { parseCondition, parseSlot, parseTemplate } from './slots';
export type {
  Align,
  Border,
  FaceColor,
  FaceStyle,
  FaceToken,
  Justify,
  Length,
  Track,
} from './style';
export { FACE_TOKENS, isFaceToken, readColor, readStyle } from './style';
export type {
  CompiledFace,
  CompiledMarkup,
  FaceTag,
  NamedAttribute,
  ResolvedFace,
} from './compile';
export { compileFace, faceMessages } from './compile';
export type { FaceInput, FaceInputOptions, FaceValue } from './input';
export { faceInputOf, valueText } from './input';
export type {
  FaceBand,
  FaceBox,
  FaceDrawing,
  FaceImage,
  FaceLayoutOptions,
  FaceRect,
  FaceRegion,
  FaceRun,
} from './layout';
export { faceDrawingText, layOutFace } from './layout';
export type { FacePalette } from './palette';
export { facePalette, readableOn, resolveFaceColor } from './palette';
export { faceContrastProblems } from './contrast';
export { faceAttributeProblems, faceProblems } from './check';
