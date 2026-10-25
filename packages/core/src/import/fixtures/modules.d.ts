// How the tests import fixtures: as text with `?raw`, and as a data URL with `?inline`, as Vite does.
declare module '*?raw' {
  const text: string;
  export default text;
}

declare module '*?inline' {
  const url: string;
  export default url;
}
