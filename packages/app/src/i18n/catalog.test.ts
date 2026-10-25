import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { BUILTIN_PACKAGES, ESSENCE, RELATES_TO } from '@visual-anything/core';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { builtins, messages, ui } from './es';
import { t, translatorFor } from './t';
import {
  bracesOf,
  formOf,
  keyOf,
  translate,
  translateMessage,
  untranslatedParts,
  type Entry,
} from './translate';
import { setCurrentLanguage } from './language';

const SOURCE = resolve(import.meta.dirname, '..');

/** Every entry of the Spanish catalog, with the section it is in. */
const ENTRIES: [section: string, key: string, entry: Entry][] = [
  ...Object.entries(ui).map(([key, entry]): [string, string, Entry] => ['ui', key, entry]),
  ...Object.entries(messages).map(([key, entry]): [string, string, Entry] => [
    'messages',
    key,
    entry,
  ]),
];

function sorted(names: readonly string[]): string[] {
  return [...names].sort();
}

describe('the Spanish catalog', () => {
  it('has the same braces in each entry as in its English key', () => {
    const mismatched = ENTRIES.flatMap(([, key, entry]) => {
      const wanted = sorted(bracesOf(key));
      const forms = typeof entry === 'string' ? [entry] : [entry.one, entry.other];
      return forms
        .filter((form) => {
          const found = sorted(bracesOf(form));
          // A "one" form may write the count out in words, as "un paso".
          const allowed = typeof entry !== 'string' && form === entry.one;
          const without = wanted.filter((name) => !(allowed && name === 'count'));
          return found.join() !== wanted.join() && found.join() !== without.join();
        })
        .map((form) => `${key} → ${form}`);
    });
    expect(mismatched).toEqual([]);
  });

  it('has no entry that is empty, or the same as its key in a plural', () => {
    const empty = ENTRIES.filter(([, , entry]) =>
      typeof entry === 'string' ? entry.trim() === '' : !entry.one.trim() || !entry.other.trim(),
    );
    expect(empty).toEqual([]);
  });

  it('holds no key twice, in one section or across them', () => {
    const text = readFileSync(join(import.meta.dirname, 'es.ts'), 'utf8');
    const file = ts.createSourceFile('es.ts', text, ts.ScriptTarget.Latest, true);
    const keys = new Map<string, number>();
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        const section = node.name.text;
        if ((section === 'ui' || section === 'messages') && node.initializer) {
          const literal = ts.isObjectLiteralExpression(node.initializer)
            ? node.initializer
            : undefined;
          for (const property of literal?.properties ?? []) {
            if (!ts.isPropertyAssignment(property)) continue;
            const name = property.name;
            const key =
              ts.isStringLiteral(name) || ts.isIdentifier(name) ? name.text : name.getText(file);
            keys.set(key, (keys.get(key) ?? 0) + 1);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    expect(keys.size).toBe(ENTRIES.length);
    expect([...keys].filter(([, times]) => times > 1).map(([key]) => key)).toEqual([]);
  });

  it('warns about entries no code uses', () => {
    const used = literalsOf(appSources());
    const unused = Object.keys(ui).filter((key) => !used.has(key));
    if (unused.length > 0) {
      console.warn(`Entries of es.ts that no code of the app uses:\n${unused.join('\n')}`);
    }
    expect(Array.isArray(unused)).toBe(true);
  });

  it('names every built-in package, component and relation type, and nothing else', () => {
    const ids = [
      ESSENCE.id,
      RELATES_TO.id,
      ...BUILTIN_PACKAGES.flatMap((file) => [
        file.id,
        ...(file.components ?? []).map((each) => each.id),
        ...(file.relationTypes ?? []).map((each) => each.id),
      ]),
    ];
    expect(sorted(Object.keys(builtins))).toEqual(sorted(ids));
  });
});

describe('t', () => {
  it('gives the English when the language is English', () => {
    expect(translate('en', 'Undo')).toBe('Undo');
    expect(translate('en', 'Open “{name}”', { name: 'Overview' })).toBe('Open “Overview”');
  });

  it('gives the Spanish entry, with its values', () => {
    const [key, entry] = Object.entries(ui).find(([, each]) => typeof each === 'string') ?? [];
    expect(key).toBeDefined();
    expect(translate('es', key as string)).toBe(entry);
  });

  it('shows the English for a text with no entry, never a key or a blank', () => {
    expect(translate('es', 'A text nobody translated, about {name}', { name: 'Ana' })).toBe(
      'A text nobody translated, about Ana',
    );
    expect(
      translate(
        'es',
        { one: '{count} thing nobody translated', other: '{count} things' },
        {
          count: 1,
        },
      ),
    ).toBe('1 thing nobody translated');
  });

  it('leaves a brace with no value as it is', () => {
    expect(translate('en', 'Open “{name}”')).toBe('Open “{name}”');
  });

  it('follows the current language outside React', () => {
    setCurrentLanguage('es');
    expect(t.language).toBe('es');
    expect(t('Undo')).toBe(translate('es', 'Undo'));
    setCurrentLanguage('en');
    expect(t('Undo')).toBe('Undo');
  });

  it('names built-in definitions by id in Spanish, and people’s own as written', () => {
    const es = translatorFor('es');
    expect(es.definition('systems.service', 'Service')).toBe('Servicio');
    expect(es.definition('relates-to', 'relates to')).toBe('se relaciona con');
    expect(es.definition('shop.cart', 'Cart')).toBe('Cart');
    expect(translatorFor('en').definition('systems.service', 'Service')).toBe('Service');
  });
});

describe('plurals', () => {
  it('pick "one" for one and "other" for any other count, in both languages', () => {
    for (const language of ['en', 'es'] as const) {
      expect(formOf(language, 1)).toBe('one');
      expect([0, 2, 5, 21, 1.5].map((count) => formOf(language, count))).toEqual(
        Array(5).fill('other'),
      );
    }
    // Spanish has a "many" form for a million, which takes "other".
    expect(formOf('es', 1_000_000)).toBe('other');
  });

  it('pick the form of the language they are shown in', () => {
    const steps = { one: '{count} step', other: '{count} steps' };
    expect(translate('en', steps, { count: 1 })).toBe('1 step');
    expect(translate('en', steps, { count: 3 })).toBe('3 steps');
    expect(keyOf(steps)).toBe('{count} steps');
    const spanish = ui[keyOf(steps)];
    expect(spanish).toEqual({ one: '{count} paso', other: '{count} pasos' });
    expect(translate('es', steps, { count: 1 })).toBe('1 paso');
    expect(translate('es', steps, { count: 0 })).toBe('0 pasos');
  });
});

describe('translateMessage', () => {
  it('leaves English as it is', () => {
    expect(translateMessage('en', 'Rename "A" to "B"')).toBe('Rename "A" to "B"');
  });

  it('fills a template with the parts people wrote, untranslated', () => {
    expect(translateMessage('es', 'Rename "Undo" to "Billing API"')).toBe(
      'Cambiar el nombre de "Undo" a "Billing API"',
    );
  });

  it('translates the parts that are messages themselves', () => {
    expect(translateMessage('es', 'Could not undo: There is nothing to undo.')).toBe(
      'No se pudo deshacer: No hay nada que deshacer.',
    );
  });

  it('joins "de el" into "del" where a phrase starting "el" follows', () => {
    expect(
      translateMessage(
        'es',
        'The fill of the component "Service" must be a color written as #rrggbb.',
      ),
    ).toBe('El relleno del componente "Service" debe ser un color escrito como #rrggbb.');
  });

  it('translates sentence by sentence and line by line, keeping what no entry knows', () => {
    const message =
      'There is no element "a". Something no entry knows. There is no relation "b".\nWorld cannot be deleted.';
    expect(translateMessage('es', message)).toBe(
      'No hay ningún elemento "a". Something no entry knows. No hay ninguna relación "b".\nMundo no se puede eliminar.',
    );
    expect(untranslatedParts('es', message)).toEqual(['Something no entry knows.']);
  });
});

/** The app's source files that are not tests, nor the catalog. */
function appSources(): string[] {
  const files: string[] = [];
  const walk = (folder: string) => {
    for (const name of readdirSync(folder)) {
      const path = join(folder, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== 'es.ts') {
        files.push(path);
      }
    }
  };
  walk(SOURCE);
  return files.filter((file) => !relative(SOURCE, file).startsWith('test'));
}

/** Every string the files write as a literal, a template's text with its braces included. */
function literalsOf(files: readonly string[]): Set<string> {
  const found = new Set<string>();
  for (const path of files) {
    const text = readFileSync(path, 'utf8');
    const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
        found.add(node.text);
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return found;
}
