/**
 * The built-in mappings (ADR-0042): for the kinds files use most, the built-in component or relation
 * type that suits them, such as a cylinder becoming a Database. A reader puts them in its plan's kinds
 * as suggestions; the mapping dialog chooses each one at first when the project has it, and the person
 * changes any of them.
 */
import { RELATES_TO_ID, type Id } from '@visual-anything/schema';

/** A suggestion for words a file uses for a kind, such as a class name or a spreadsheet's value. */
interface WordRule {
  /** Matches the kind's words, in lower case, with every run of other characters as one space. */
  words: RegExp;
  suggested: Id;
}

/** Element kinds by the words that name them, the most specific first. */
const ELEMENT_WORDS: readonly WordRule[] = [
  { words: /\b(mcp|mcp server)\b/, suggested: 'systems.mcp-server' },
  { words: /\b(ai agent|agent|llm|assistant|bot|chatbot)\b/, suggested: 'systems.ai-agent' },
  {
    words: /\b(chat|channel|whatsapp|slack|telegram|messenger)\b/,
    suggested: 'systems.chat-channel',
  },
  { words: /\b(semantic layer|metrics layer)\b/, suggested: 'systems.semantic-layer' },
  {
    words: /\b(bucket|buckets|s3|blob|blobs|object storage|object store|files)\b/,
    suggested: 'systems.object-storage',
  },
  {
    words:
      /\b(db|database|databases|datastore|data store|store|storage|sql|postgres|postgresql|mysql|mongo|mongodb|redis|cylinder|cyl)\b/,
    suggested: 'systems.database',
  },
  { words: /\b(table|tables|entity|entities)\b/, suggested: 'data-modeling.table' },
  { words: /\b(column|columns|field|fields)\b/, suggested: 'data-modeling.column' },
  {
    words: /\b(person|people|user|users|actor|actors|customer|customers|human|role)\b/,
    suggested: 'systems.person',
  },
  {
    words: /\b(service|services|api|apis|server|backend|microservice|app|application|worker)\b/,
    suggested: 'systems.service',
  },
  { words: /\b(system|systems|platform|subsystem)\b/, suggested: 'systems.system' },
  { words: /\b(box|component|node|thing|block)\b/, suggested: 'systems.box' },
];

/** Relation kinds by the words that name them, the most specific first. */
const RELATION_WORDS: readonly WordRule[] = [
  { words: /\b(queries|query)\b/, suggested: 'systems.queries' },
  { words: /\b(loads|loads into|imports|etl|ingests)\b/, suggested: 'systems.loads-into' },
  { words: /\b(reads|reads from|read|selects|fetches)\b/, suggested: 'systems.reads-from' },
  {
    words: /\b(writes|writes to|write|stores|saves|updates|inserts)\b/,
    suggested: 'systems.writes-to',
  },
  { words: /\b(references|reference|fk|foreign key)\b/, suggested: 'data-modeling.references' },
  {
    words: /\b(is part of|part of|inside|belongs to|contained in|child of)\b/,
    suggested: 'systems.is-part-of',
  },
  {
    words:
      /\b(calls|call|uses|use|sends|send|communicates|communicates with|requests|talks to|connects|depends on)\b/,
    suggested: 'systems.communicates-with',
  },
  { words: /\b(relates|relates to|related|link|line|association)\b/, suggested: RELATES_TO_ID },
];

/** A kind's words, for matching: lower case, with every run of other characters as one space. */
function wordsOf(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The built-in component that suits the words a file names an element kind with, if any. */
export function componentForWords(text: string): Id | undefined {
  const words = wordsOf(text);
  return ELEMENT_WORDS.find((rule) => rule.words.test(words))?.suggested;
}

/** The built-in relation type that suits the words a file names a relation kind with, if any. */
export function relationTypeForWords(text: string): Id | undefined {
  const words = wordsOf(text);
  return RELATION_WORDS.find((rule) => rule.words.test(words))?.suggested;
}

/** What Mermaid's flowchart shapes and subgraphs suggest. */
export const FLOWCHART_SHAPES: Readonly<Record<string, Id | undefined>> = {
  rectangle: 'systems.box',
  round: 'systems.box',
  stadium: 'systems.box',
  subroutine: 'systems.box',
  cylinder: 'systems.database',
  circle: 'systems.box',
  'double-circle': 'systems.box',
  asymmetric: 'systems.box',
  rhombus: 'systems.box',
  hexagon: 'systems.box',
  parallelogram: 'systems.box',
  'parallelogram-alt': 'systems.box',
  trapezoid: 'systems.box',
  'trapezoid-alt': 'systems.box',
  subgraph: 'systems.system',
};

/** What Mermaid's flowchart edges suggest: directed ones communicate, plain lines only relate. */
export const FLOWCHART_EDGES: Readonly<Record<string, Id>> = {
  arrow: 'systems.communicates-with',
  'thick-arrow': 'systems.communicates-with',
  'dotted-arrow': 'systems.communicates-with',
  both: 'systems.communicates-with',
  circle: 'systems.communicates-with',
  cross: 'systems.communicates-with',
  line: RELATES_TO_ID,
  'thick-line': RELATES_TO_ID,
  'dotted-line': RELATES_TO_ID,
};

/** What C4's element and boundary macros suggest, by the macro's name without `_Ext`. */
export const C4_ELEMENTS: Readonly<Record<string, Id>> = {
  Person: 'systems.person',
  System: 'systems.system',
  SystemDb: 'systems.database',
  SystemQueue: 'systems.service',
  Container: 'systems.service',
  ContainerDb: 'systems.database',
  ContainerQueue: 'systems.service',
  Component: 'systems.box',
  ComponentDb: 'systems.database',
  ComponentQueue: 'systems.box',
  Boundary: 'systems.box',
  Enterprise_Boundary: 'systems.box',
  System_Boundary: 'systems.system',
  Container_Boundary: 'systems.service',
  Deployment_Node: 'systems.box',
  Node: 'systems.box',
  Node_L: 'systems.box',
  Node_R: 'systems.box',
};

/** What C4's relationships suggest. */
export const C4_RELATIONS: Readonly<Record<string, Id>> = {
  Rel: 'systems.communicates-with',
  BiRel: 'systems.communicates-with',
};

/** What an ER diagram's parts suggest: tables, their columns, and references between tables. */
export const ER_KINDS = {
  entity: 'data-modeling.table',
  attribute: 'data-modeling.column',
  relationship: 'data-modeling.references',
} as const;
