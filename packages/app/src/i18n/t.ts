/**
 * `t()`: the app's texts in the language it reads in. Components call `useT()`, which re-renders them
 * when the language changes; code outside React, such as announcements, calls `t()`, which reads the
 * current language when it is called.
 */
import type { Id } from '@visual-anything/schema';
import { builtins as esBuiltins } from './es';
import { currentLanguage } from './language';
import { translate, translateMessage, type Language, type Text, type Values } from './translate';

/** Translates texts into one language. */
export interface Translator {
  /** A text the app writes, in English, with its values in braces: `t('Open “{name}”', { name })`. */
  (text: Text, values?: Values): string;
  /** The language it translates into. */
  readonly language: Language;
  /**
   * A message the core or the local program wrote, such as an undo label or why a command was
   * refused, through the catalog's templates.
   */
  message(english: string): string;
  /**
   * The name of a component or a relation type: the language's for a built-in one, found by its id,
   * and as written for every other, since people's own names are never translated.
   */
  definition(id: Id, name: string): string;
  /** The description of a built-in component or relation type, as `definition` gives its name. */
  description(id: Id, description: string): string;
}

/** What each language calls the built-in packages and their definitions, by id. */
const BUILTINS: Readonly<
  Record<Language, Readonly<Record<string, { name: string; description?: string }>> | undefined>
> = { en: undefined, es: esBuiltins };

/** What a language calls a built-in package or definition, by an id of its own. */
function builtinIn(language: Language, id: Id): { name: string; description?: string } | undefined {
  const names = BUILTINS[language];
  return names !== undefined && Object.hasOwn(names, id) ? names[id] : undefined;
}

function makeTranslator(language: () => Language): Translator {
  const translator = (text: Text, values?: Values) => translate(language(), text, values);
  return Object.defineProperties(translator, {
    language: { get: language, enumerable: true },
    message: { value: (english: string) => translateMessage(language(), english) },
    definition: {
      value: (id: Id, name: string) => builtinIn(language(), id)?.name ?? name,
    },
    description: {
      value: (id: Id, description: string) => builtinIn(language(), id)?.description ?? description,
    },
  }) as Translator;
}

const translators = new Map<Language, Translator>();

/** The translator into a language; the same one each time, so that it can be a dependency. */
export function translatorFor(language: Language): Translator {
  let translator = translators.get(language);
  if (translator === undefined) {
    translator = makeTranslator(() => language);
    translators.set(language, translator);
  }
  return translator;
}

/** Translates into the current language, as it is when each text is asked for. */
export const t: Translator = makeTranslator(currentLanguage);
