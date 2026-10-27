/**
 * What satori writes, made ready for the core's cleaner (ADR 0068): satori writes a mask for every
 * element it draws, whether anything uses it or not, and the cleaner counts each one against its caps
 * on masks and clip paths (ADR 0027), so a card of twenty elements would be refused. The masks and clip
 * paths nothing refers to are left out first. They draw nothing, so the drawing is the same.
 *
 * This reads only satori's own output, in the regular form satori writes, and the core cleans what it
 * gives as it cleans any picture: nothing here stands between a page and the cleaner.
 */

/** A mask or clip path as satori writes it, with its id; satori never nests one in another. */
const DEFINITION = /<(mask|clipPath) id="([A-Za-z_][\w.-]*)"[^>]*>(?:(?!<\/\1>)[\s\S])*<\/\1>/g;

/** The most passes: each one may leave a definition only a removed one referred to. */
const PASSES = 8;

/** satori's SVG without the masks and clip paths nothing refers to. */
export function withoutUnusedDefinitions(svg: string): string {
  let text = svg;
  for (let pass = 0; pass < PASSES; pass++) {
    const referred = new Set(
      [...text.matchAll(/url\(#([A-Za-z_][\w.-]*)\)/g)].map((each) => each[1]),
    );
    let removed = false;
    text = text.replace(DEFINITION, (whole: string, _kind: string, id: string) => {
      if (referred.has(id)) return whole;
      removed = true;
      return '';
    });
    if (!removed) break;
  }
  return text.replace(/<defs><\/defs>/g, '');
}

/** satori's SVG cut at a height: its size and view box say so, and what lies below is not drawn. */
export function cutAt(svg: string, height: number): string {
  return svg.replace(
    /^<svg width="([\d.]+)" height="([\d.]+)" viewBox="0 0 ([\d.]+) ([\d.]+)"/,
    (whole, width: string, tall: string, boxWidth: string) =>
      Number(tall) <= height
        ? whole
        : `<svg width="${width}" height="${height}" viewBox="0 0 ${boxWidth} ${height}"`,
  );
}
