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

  // This and the next read every source file of the app, which takes seconds on a busy machine.
  it('warns about entries no code uses', { timeout: 30_000 }, () => {
    const used = literalsOf(appSources());
    const unused = Object.keys(ui).filter((key) => !used.has(key));
    if (unused.length > 0) {
      console.warn(`Entries of es.ts that no code of the app uses:\n${unused.join('\n')}`);
    }
    expect(Array.isArray(unused)).toBe(true);
  });

  it('has an entry for every text given to t() as it is written', { timeout: 30_000 }, () => {
    const catalog = { ...ui, ...messages };
    const missing = [...textsGivenToT(appSources())].filter(
      (key) => catalog[key] === undefined && !SAME_IN_SPANISH.has(key),
    );
    expect(missing).toEqual([]);
  });

  it('uses none of the words the glossary avoids for its terms', () => {
    const found = ENTRIES.flatMap(([, key, entry]) => {
      const forms = typeof entry === 'string' ? [entry] : [entry.one, entry.other];
      return forms.flatMap((form) =>
        AVOIDED.filter(
          ({ word, unless }) => word.test(form) && !(unless !== undefined && unless.test(form)),
        ).map(({ word }) => `${key} → ${form} (${word.source})`),
      );
    });
    const named = Object.values(builtins).flatMap((each) => [
      each.name,
      each.description ?? '',
      ...Object.values(each.attributes ?? {}),
    ]);
    const inBuiltins = named.filter((text) =>
      AVOIDED.some(({ word, unless }) => word.test(text) && !(unless?.test(text) ?? false)),
    );
    expect([...found, ...inBuiltins]).toEqual([]);
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

  it('describes every attribute a built-in definition describes, and nothing else', () => {
    const described = BUILTIN_PACKAGES.flatMap((file) =>
      [...file.components, ...file.relationTypes].flatMap((definition) =>
        (definition.attributes ?? [])
          .filter((attribute) => attribute.description !== undefined)
          .map((attribute) => `${definition.id} ${attribute.name}`),
      ),
    );
    const spanish = Object.entries(builtins).flatMap(([id, each]) =>
      Object.keys(each.attributes ?? {}).map((name) => `${id} ${name}`),
    );
    expect(sorted(spanish)).toEqual(sorted(described));
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

  it('finds nothing every object inherits, such as "constructor"', () => {
    expect(translate('es', 'constructor')).toBe('constructor');
    expect(translateMessage('es', 'toString')).toBe('toString');
    expect(untranslatedParts('es', '__proto__')).toEqual(['__proto__']);
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
    expect(es.definition('constructor', 'Constructor')).toBe('Constructor');
    expect(translatorFor('en').definition('systems.service', 'Service')).toBe('Service');
  });

  it('describes a built-in attribute by where it is defined, and people’s own as written', () => {
    const es = translatorFor('es');
    const chain = ['shop.api', 'systems.service', 'systems.box', 'essence'];
    expect(es.attribute(chain, 'owner', 'The team that runs it.')).toBe('El equipo que lo opera.');
    // A redefinition of the project's own keeps its own words.
    expect(es.attribute(chain, 'owner', 'Who is on call.')).toBe('Who is on call.');
    expect(es.attribute(['shop.api'], 'owner', 'The team that runs it.')).toBe(
      'The team that runs it.',
    );
    expect(
      translatorFor('en').attribute(
        chain,
        'technology',
        'What it is built with, such as "Node.js" or "PostgreSQL".',
      ),
    ).toBe('What it is built with, such as "Node.js" or "PostgreSQL".');
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
        'The fill of the component "Service" must be a color written as #RRGGBB, not "red".',
      ),
    ).toBe('El relleno del componente "Service" debe ser un color escrito como #RRGGBB, no "red".');
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

/**
 * The Spanish words for what CONTEXT.md avoids, which the catalog never uses for its terms; `unless`
 * is where the word means something else, as a name a built-in definition has in English too.
 */
const AVOIDED: readonly { word: RegExp; unless?: RegExp }[] = [
  // C4's "Deployment node" and Physical AI's "Node", "Nodo de software", are components' names, and
  // name no element.
  { word: /\bnodos?\b/i, unless: /\bnodos? de (despliegue|software)\b/i },
  { word: /\binstancias?\b/i },
  { word: /\bpropiedad(es)?\b/i },
  // Systems' "Semantic layer" is a component's name, and so are Machine learning's layers, which are
  // layers of a neural network (P1 W62).
  {
    word: /\bcapas?\b/i,
    unless:
      /\bcapa semántica\b|\bred(es)? neuronal(es)?\b|^capa( densa| recurrente| de (convolución|atención|embedding|normalización|agrupación))?$/i,
  },
  { word: /\bv[ií]nculos?\b/i },
  { word: /\baristas?\b/i },
  { word: /\benlaces?\b/i, unless: /\benlace simbólico\b/i },
  { word: /\bajustes\b/i },
  { word: /\btableros?\b/i },
  { word: /\bplantillas?\b/i },
  { word: /\bbibliotecas?\b/i },
  { word: /\bdiagramas?\b/i },
  { word: /\bra[ií]z\b/i },
  { word: /\binstant[áa]neas?\b/i },
  { word: /\bsobrescrit/i },
  // The rest of CONTEXT.md's avoid lists, in the Spanish each would be written in.
  // Model, World, element and particularity.
  { word: /\bgrafos?\b/i },
  { word: /\buniversos?\b/i },
  { word: /\becosistemas?\b/i },
  // A JSON object is "objeto JSON"; "Object storage" and "Data object" are built-in components' names.
  {
    word: /\bobjetos?\b/i,
    unless: /\bobjetos? JSON\b|\balmacenamiento de objetos\b|\bobjetos? de datos\b/i,
  },
  // An entity of XML, "&amp;", is what the SVG and XML readers name.
  { word: /\bentidad(es)?\b/i, unless: /\bentidad "&/i },
  { word: /\bexcepci[oó]n(es)?\b/i },
  // Relations, nesting and containers.
  { word: /\bjerarqu[ií]as?\b/i },
  { word: /\bpadres?\b/i },
  { word: /\bgrupos?\b/i },
  { word: /\bcampos?\b/i },
  // The canvas, shapes and their parts. A spreadsheet is "hoja de cálculo", which imports read.
  { word: /\bhojas?\b/i, unless: /\bhojas? de cálculo\b/i },
  { word: /\bfiguras?\b/i },
  { word: /\bbloquead[oa]s?\b/i },
  { word: /\bmallas?\b/i },
  { word: /\bim[aá]n(es)?\b/i },
  { word: /\bsubt[ií]tulos?\b/i },
  { word: /\bp[ií]ldoras?\b/i },
  { word: /\b[aá]rbol(es)?\b/i },
  { word: /\bhaz\b/i },
  { word: /\bsubconjuntos?\b/i },
  // The palette of components; a stylesheet's class, which an SVG's style rule selects by.
  { word: /\bpaletas?\b/i, unless: /\bpaletas? de componentes\b/i },
  { word: /\bclases?\b/i, unless: /\buna clase o un nombre de elemento\b/i },
  { word: /\bcomplementos?\b/i },
  { word: /\bdiseñador(es)?\b/i },
  { word: /\bpaquetes? predeterminados?\b/i },
  { word: /\bfacetas?\b/i },
  { word: /\blentes?\b/i },
  { word: /\bpunto de anclaje\b/i },
  // Exploring and playing.
  { word: /\bvecindarios?\b/i },
  { word: /\bejemplos?\b/i },
  { word: /\bsimulaci[oó]n(es)?\b/i },
  { word: /\betapas?\b/i },
  { word: /\bhu[eé]rfan[oa]s?\b/i },
  { word: /\bpulsos?\b/i },
  { word: /\bpresentaci[oó]n(es)?\b/i },
  { word: /\bdiapositivas?\b/i },
  { word: /\bconector(es)?\b/i },
  { word: /\bv[eé]rtices?\b/i },
  { word: /\bcodos?\b/i },
  { word: /\bpuntos? de control\b/i },
  { word: /\btransacci[oó]n(es)?\b/i },
  { word: /\bconjuntos? de cambios\b/i },
  { word: /\bl[ií]neas? de tiempo\b/i },
  // Preferences, addresses, what leaves and enters a project.
  { word: /\bperfil(es)?\b/i, unless: /\bperfil de color\b/i },
  { word: /\bconfiguraci[oó]n regional\b/i },
  { word: /\bsitios? est[aá]ticos?\b/i },
  { word: /\bvisor(es)?\b/i },
  { word: /\bsincroniz/i },
  { word: /\bconversi[oó]n(es)?\b/i },
  { word: /\bdemos?\b/i },
  { word: /\bbienvenida\b/i },
  { word: /\basistentes?\b/i },
  { word: /\bdependencias?\b/i },
  // Overlays, identifiers, destinations and live values. "references" is a built-in relation type
  // of Data modeling, an SVG's outside references are what cleaning removes, and "&" starts an XML
  // reference.
  {
    word: /\breferencias?\b/i,
    unless:
      /^referencia$|\breferencias entre columnas\b|\breferencias? externas?\b|\bninguna referencia\./i,
  },
  { word: /\bhiperv[ií]nculos?\b/i },
  { word: /\btelemetr[ií]as?\b/i },
  { word: /\bdatos en vivo\b/i },
  { word: /\bniveles? de zoom\b/i },
  // Explaining, and package code.
  { word: /\bconversaci[oó]n(es)?\b/i },
  { word: /\bdiscusi[oó]n(es)?\b/i },
  { word: /\banotaci[oó]n(es)?\b/i },
  { word: /\bmacros?\b/i },
  { word: /\bmanejador(es)?\b/i },
  { word: /\bf[oó]rmulas?\b/i },
  { word: /\batributos? derivados?\b/i },
  { word: /\bconfianza\b/i },
  { word: /\blistas? blancas?\b/i },
  // M8b W55: free geometry, named parts, drawings with parts, anchored parts and imported drawings
  // (ADR 0066, 0067, 0068). "Contour" alone is "contorno", which is also what an outline is called,
  // and "free shape" is "forma libre", the term for notes and arrows, so neither can be forbidden.
  // "Overlay" is "superposición", a term of its own. A bitmap is "mapa de bits", a shape sent to the
  // back sits "al fondo", and the read-only page is a file "para compartir, incrustar y leer".
  { word: /\bformas? personalizadas?\b/i },
  { word: /\best[eé]nciles?\b|\bestarcidos?\b/i },
  { word: /\bformas? vectoriales?\b/i },
  { word: /\bregi[oó]n(es)?\b/i },
  { word: /\bzonas? activas?\b|\bpuntos? calientes?\b/i },
  { word: /\bsubim[aá]gen(es)?\b/i },
  { word: /\bl[aá]minas?\b|\bplacas?\b/i },
  { word: /\batlas\b/i },
  { word: /\bmapas?\b/i, unless: /\bmapas? de bits\b/i },
  { word: /\bfondos?\b/i, unless: /\b(al|del|desde el) fondo\b/i },
  { word: /\b[aá]reas? mapeadas?\b|\bzonas? mapeadas?\b/i },
  { word: /\bvistas? web\b/i },
  { word: /\bincrust/i, unless: /\bcompartir, incrustar y leer\b/i },
  { word: /\bcomponentes? HTML\b/i },
  { word: /\biframes?\b/i },
  { word: /\bcapturas? de pantalla\b/i },
];

/** Texts given to t() that Spanish writes the same: values and punctuation only. */
const SAME_IN_SPANISH: ReadonlySet<string> = new Set([
  '{name} ({shortcut})',
  'Claude: {caption}',
  '{name}, {component}, {where}, {relations}.',
  '{count} × {component}',
  'Enter',
  'F2',
  'Tab',
]);

/**
 * The keys of the texts the app gives to t() as literals: a string, or the "other" form of a plural
 * written in place.
 */
function textsGivenToT(files: readonly string[]): Set<string> {
  const found = new Set<string>();
  for (const path of files) {
    const text = readFileSync(path, 'utf8');
    const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      // A plural text, wherever it is written: an object of "one" and "other" texts.
      if (ts.isObjectLiteralExpression(node)) {
        const forms = new Map(
          node.properties.flatMap((property) =>
            ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer)
              ? [[property.name.getText(file), property.initializer.text] as const]
              : [],
          ),
        );
        const other = forms.get('other');
        if (forms.size === 2 && forms.has('one') && other !== undefined) found.add(other);
      }
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 't'
      ) {
        const [first] = node.arguments;
        if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) {
          found.add(first.text);
        } else if (first && ts.isObjectLiteralExpression(first)) {
          for (const property of first.properties) {
            if (
              ts.isPropertyAssignment(property) &&
              property.name.getText(file) === 'other' &&
              ts.isStringLiteral(property.initializer)
            ) {
              found.add(property.initializer.text);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return found;
}

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
