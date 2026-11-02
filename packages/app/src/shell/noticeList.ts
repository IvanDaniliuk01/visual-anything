import type { Notice } from '../live/connection';

/** A notice that is a heading and the lines of a list under it. */
export interface NoticeList {
  /** The heading, with the colon that ends it: "The project has 29 warnings:". */
  heading: string;
  items: readonly string[];
}

/**
 * The list a warning holds, when it is a burst of warnings from one cause, as the local program writes
 * the warnings of a project as it opens it: a heading that ends with a colon, then one warning a line
 * (A5). A warning of one line, or with one line under its heading, is no list.
 */
export function noticeList(notice: Pick<Notice, 'level' | 'message'>): NoticeList | undefined {
  if (notice.level !== 'warning') return undefined;
  const [first = '', ...rest] = notice.message.split('\n');
  const items = rest.filter((line) => line.trim() !== '');
  if (!first.endsWith(':') || items.length < 2) return undefined;
  return { heading: first, items };
}
