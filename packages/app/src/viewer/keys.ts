/**
 * Where a read-only page keeps the reader's choices in the browser (ADR 0041): the theme and the
 * language, which are all it keeps. They are the page's own, apart from the app's, which the local
 * program keeps (ADR 0032).
 */

/** The theme the reader chose: `light` or `dark`; absent to follow the system. */
export const PAGE_THEME_KEY = 'visual-anything.page.theme';

/** The language the reader chose: `en` or `es`; absent to follow the browser. */
export const PAGE_LANGUAGE_KEY = 'visual-anything.page.language';
