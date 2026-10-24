/**
 * Writes the theme tokens as a static stylesheet, `tokens.css`, which the app loads before its own
 * styles. The light theme is the default; the dark one applies when the system prefers it, unless the
 * page says `data-theme="light"`, and whenever it says `data-theme="dark"`. A static file needs nothing
 * from the page's script and nothing from its content security policy.
 */
import type { ThemeName } from '@visual-anything/core';
import { SCALE, type Scale } from './scale';
import { THEMES, shellColorEntries, type ShellTheme } from './themes';

/** How `tokens.css` is made again after a change to `themes.ts` or `scale.ts`. */
export const GENERATE_COMMAND = 'pnpm exec tsx packages/app/src/theme/generate.ts';

/**
 * Names that styles written before the theme tokens use, kept as aliases for the wave of work that
 * still has them; they go once every branch has merged.
 */
const ALIASES: readonly [string, string][] = [
  ['notice', 'warning'],
  ['notice-soft', 'warning-soft'],
];

/** The CSS variable of a token: `surfaceRaised` is `--surface-raised`. */
export function cssVariable(name: string): string {
  return `--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

/** The declarations of one theme: its color scheme, its colors, its backdrop and its shadows. */
export function themeDeclarations(name: ThemeName, theme: ShellTheme): [string, string][] {
  return [
    ['color-scheme', name],
    ...shellColorEntries(theme.colors).map(([token, color]): [string, string] => [
      cssVariable(token),
      color.toLowerCase(),
    ]),
    ['--backdrop', theme.backdrop],
    ...theme.shadows.map((shadow, index): [string, string] => [`--shadow-${index + 1}`, shadow]),
  ];
}

/** The declarations of the scales, the same in both themes. */
export function scaleDeclarations(scale: Scale): [string, string][] {
  return Object.entries(scale).flatMap(([group, steps]) =>
    Object.entries(steps).map(([step, value]): [string, string] => [`--${group}-${step}`, value]),
  );
}

/** The text of `tokens.css`, formatted as Prettier formats CSS. */
export function themeStyleSheet(
  themes: Readonly<Record<ThemeName, { shell: ShellTheme }>> = THEMES,
  scale: Scale = SCALE,
): string {
  const light = themeDeclarations('light', themes.light.shell);
  const dark = themeDeclarations('dark', themes.dark.shell);
  return [
    `/* Generated from src/theme/themes.ts and scale.ts by \`${GENERATE_COMMAND}\`. Do not edit. */`,
    '',
    rule(':root', light, ''),
    '',
    '@media (prefers-color-scheme: dark) {',
    rule(":root:not([data-theme='light'])", dark, '  '),
    '}',
    '',
    rule(":root[data-theme='dark']", dark, ''),
    '',
    rule(':root', scaleDeclarations(scale), ''),
    '',
    '/* Names kept for styles written before these tokens; they go once every branch has merged. */',
    rule(
      ':root',
      ALIASES.map(([alias, token]) => [`--${alias}`, `var(--${token})`]),
      '',
    ),
    '',
  ].join('\n');
}

function rule(selector: string, declarations: readonly [string, string][], indent: string): string {
  return [
    `${indent}${selector} {`,
    ...declarations.map(([property, value]) => `${indent}  ${property}: ${value};`),
    `${indent}}`,
  ].join('\n');
}
