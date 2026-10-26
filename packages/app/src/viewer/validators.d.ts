/** The validators the viewer's build generates from the project files' schemas (ADR 0041). */
declare module 'virtual:visual-anything/validators' {
  type StandaloneValidator = import('./validate').StandaloneValidator;
  export const projectFile: StandaloneValidator;
  export const modelFile: StandaloneValidator;
  export const packageFile: StandaloneValidator;
  export const viewFile: StandaloneValidator;
  export const scenarioFile: StandaloneValidator;
  export const tourFile: StandaloneValidator;
  export const commentFile: StandaloneValidator;
}
