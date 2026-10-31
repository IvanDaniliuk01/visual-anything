/**
 * The stylesheets take every design value from the theme tokens and the scales (ADR 0033 and its
 * clarification of A4): no color, size, spacing, radius, line width, shadow, type or stacking is
 * written out. A color written in a stylesheet would be the same in both themes, where no contrast
 * test sees it; a size written out drifts from the scale the rest of the app keeps to.
 */
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEMES } from './themes';
import { allRules, stylesheets, withoutComments } from './stylesheets';
import { SOURCE_FOLDER, readSource } from './testing';

/**
 * Lengths a stylesheet may write: what is not a design value but a share of the space around a box,
 * or a count of what it holds.
 *
 * - zero, in any unit, since nothing is measured;
 * - percentages, `fr` and the viewport's units, which share out the room there is;
 * - `ch` and `lh`, which count characters and lines of the text a box holds, such as the four digits
 *   of the zoom readout;
 * - angles and times, which are no sizes; motion has tokens of its own where it fits them.
 *
 * Media and container conditions cannot take a CSS variable, so the widths at which the header gives
 * up its labels are written out there; they are conditions, not declarations, and this test reads only
 * declarations.
 */
const WRITTEN_LENGTH =
  /(?<![\w.#-])-?(?:\d*\.)?\d+(?:px|rem|em|pt|pc|cm|mm|in|q|ex|cap|ic|rlh|vmin|vmax)(?![\w-])/gi;
const ZERO = /^-?(?:0*\.)?0+[a-z]*$/i;

const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi;

/** The named colors of CSS; `transparent` and `currentColor` are not design values and are allowed. */
const NAMED_COLORS =
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue
blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan
darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen
darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey
darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite
forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink
indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral
lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen
lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta
maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue
mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen
paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red
rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue
slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white
whitesmoke yellow yellowgreen`.split(/\s+/);
const NAMED_COLOR = new RegExp(`(?<![\\w-])(?:${NAMED_COLORS.join('|')})(?![\\w-])`, 'gi');

/** Properties whose values are names, where a word such as `tan` is no color. */
const NAMES = new Set([
  'font-family',
  'grid-area',
  'grid-template-areas',
  'animation',
  'animation-name',
  'transition',
  'transition-property',
  'will-change',
  'view-transition-name',
]);

/** Properties whose values are bare numbers on a scale: none may be written out. */
const SCALED_NUMBERS = new Set([
  'z-index',
  'font-weight',
  'line-height',
  'stroke-width',
  'stroke-dasharray',
  'font-size',
]);

/** A value with the names of the variables it reads taken away, their fallbacks kept, and no strings. */
function writtenPart(value: string): string {
  return value
    .replace(/var\(\s*--[\w-]+\s*,?/g, 'var(')
    .replace(/'[^']*'|"[^"]*"/g, "''")
    .replace(/url\([^)]*\)/g, 'url()');
}

interface Finding {
  where: string;
  declaration: string;
  written: string[];
}

function findings(check: (property: string, written: string) => string[]): Finding[] {
  return allRules().flatMap((rule) =>
    rule.declarations.flatMap(({ property, value }) => {
      const written = check(property, writtenPart(value));
      return written.length === 0
        ? []
        : [
            {
              where: `${rule.path}:${rule.line} ${rule.selector}`,
              declaration: `${property}: ${value}`,
              written,
            },
          ];
    }),
  );
}

/** The names of the CSS variables something defines: the tokens, the stylesheets and the app's code. */
function definedVariables(): Set<string> {
  const names = new Set<string>();
  for (const path of [...stylesheets(), 'theme/tokens.css']) {
    for (const [, name = ''] of withoutComments(readSource(path)).matchAll(/(--[\w-]+)\s*:/g)) {
      names.add(name);
    }
  }
  // Variables the app's code writes onto an element, such as a panel's width.
  const code = readdirSync(SOURCE_FOLDER, { recursive: true, encoding: 'utf8' }).filter(
    (path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path),
  );
  for (const path of code) {
    for (const [, name = ''] of readSource(path).matchAll(/['"`](--[\w-]+)['"`]/g)) names.add(name);
  }
  return names;
}

describe('stylesheets', () => {
  it('include the app’s own', () => {
    expect(stylesheets()).toEqual(
      expect.arrayContaining(['styles.css', 'shell/panel.css', 'shell/inspector.css']),
    );
  });

  it('take the tokens first, from the generated file', () => {
    expect(withoutComments(readSource('styles.css')).trimStart()).toMatch(
      /^@import '\.\/theme\/tokens\.css';/,
    );
  });

  it('write out no length: spaces, sizes, radii, lines and type come from the scales', () => {
    expect(
      findings((_, written) =>
        (written.match(WRITTEN_LENGTH) ?? []).filter((length) => !ZERO.test(length)),
      ),
    ).toEqual([]);
  });

  it('write out no color, by its code, its function or its name', () => {
    expect(
      findings((property, written) => [
        ...(written.match(COLOR_LITERAL) ?? []),
        ...(NAMES.has(property) ? [] : (written.match(NAMED_COLOR) ?? [])),
      ]),
    ).toEqual([]);
  });

  it('write out no stacking, weight, line height, stroke or text size as a bare number', () => {
    expect(
      findings((property, written) =>
        SCALED_NUMBERS.has(property)
          ? (written.replace(/\d+(?:\.\d+)?%/g, '').match(/\d+(?:\.\d+)?/g) ?? [])
          : [],
      ),
    ).toEqual([]);
  });

  it('take their shadows from the elevation tokens, or draw an inset mark with the line tokens', () => {
    const shadows = allRules().flatMap((rule) =>
      rule.declarations
        .filter(({ property }) => property === 'box-shadow')
        .map(({ value }) => value),
    );
    expect(shadows.length).toBeGreaterThan(0);
    for (const shadow of shadows) {
      expect(shadow).toMatch(
        /^(?:none|var\(--shadow-\d\)|inset [^,]*var\(--stroke-[\w-]+\)[^,]*)$/,
      );
    }
  });

  it('read only variables something defines, or give a fallback', () => {
    const defined = definedVariables();
    const undefinedVariables = allRules().flatMap((rule) =>
      rule.declarations.flatMap(({ property, value }) =>
        [...value.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)]
          .filter(([, name = '', fallback]) => fallback === undefined && !defined.has(name))
          .map(([, name]) => `${rule.path}:${rule.line} ${property}: ${name}`),
      ),
    );
    expect(undefinedVariables).toEqual([]);
  });

  it('find what they are meant to find', () => {
    const lengths = (text: string) =>
      (writtenPart(text).match(WRITTEN_LENGTH) ?? []).filter((length) => !ZERO.test(length));
    expect(lengths('0.4rem var(--space-50)')).toEqual(['0.4rem']);
    expect(lengths('var(--panel-width, 18rem)')).toEqual(['18rem']);
    expect(lengths('calc(-1 * var(--stroke-thin)) 0 0px 100% 4ch 3lh 1fr 50vw')).toEqual([]);
    expect(lengths('-2px')).toEqual(['-2px']);
    expect('solid white'.match(NAMED_COLOR)).toEqual(['white']);
    expect('var(--surface-raised) transparent currentColor'.match(NAMED_COLOR)).toBeNull();
    expect(writtenPart(`var(--accent)`)).not.toMatch(COLOR_LITERAL);
    expect('#1d4f91'.match(COLOR_LITERAL)).toEqual(['#1d4f91']);
    expect(THEMES.light.shell.colors.accent.toLowerCase()).toBe('#1d4f91');
  });
});
