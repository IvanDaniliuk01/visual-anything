/**
 * How Claude sends a large model: in batches of `add_to_model` calls, each one undoable action, that
 * name one another by ids Claude chooses (ADR 0029's clarification of 2026-10-30). `add_to_model`'s
 * description, the rules every recipe follows and the recipes in brief all say it in these words.
 */
import { MAX_RESULTS } from './queries';

/**
 * The most elements and relations one `add_to_model` call takes, together. It is the most one answer
 * of the read tools lists (`MAX_RESULTS`), since the answer gives the id of every one it adds; and
 * 500 items of a database, a few hundred bytes each, come to a few hundred KiB, far under the 8 MiB
 * of the largest message Claude may send (`CLAUDE_MAX_PAYLOAD`).
 */
export const MAX_ADDITIONS = MAX_RESULTS;

/** How a large model goes in batches, for the descriptions and the recipes. */
export const IN_BATCHES = `A large model, past ${MAX_ADDITIONS} elements and relations, goes in batches: several add_to_model calls of at most ${MAX_ADDITIONS} elements and relations each, each one undoable action, with a label that says which part it holds, such as "Import the audit database (2 of 4): billing tables". Batches name one another by ids you choose, given as id, never by refs, which hold only in their own call. Make the ids a stable scheme of the material's own names, such as t.<schema>.<table> for a table and c.<schema>.<table>.<column> for a column, keeping letters, digits, ".", "_" and "-" and writing any other character as "-", in at most 128 characters. Send each container in an earlier batch than what it holds, or in the same one, and each relation once both its ends were sent, in an earlier batch or the same one: a foreign key can go with its table once the table it references was sent, or all of them in the last batches. A batch refused changes nothing, and the batches done before it stay: fix it and send it again. Importing again, get_item finds what such an id names already.`;
