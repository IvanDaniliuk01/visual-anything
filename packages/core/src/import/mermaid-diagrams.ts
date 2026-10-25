/**
 * Mermaid's C4, ER and class diagrams. C4's macros become elements whose kind is the macro, its
 * boundaries containers and its relationships relations; an ER diagram's entities become tables with
 * their attributes as columns inside them, and its relationships references with their
 * cardinalities; a class diagram's classes become elements whose kind is their annotation, with their
 * members, its namespaces containers and its relationships relations of each UML kind.
 */
import type { Attributes, JsonValue } from '@visual-anything/schema';
import { attributesOf, type PlanBuilder } from './builder';
import type { DiagramReader, MermaidLine } from './mermaid';
import { mermaidText, splitOutsideQuotes, unquote } from './mermaid';
import { C4_ELEMENTS, C4_RELATIONS, ER_KINDS } from './suggest';
import { importedName, oneLine } from './text';

const STYLES = 'Styles are not read: the components’ appearances draw the shapes.';
const LINKS = 'Links and callbacks are never followed.';
const IMAGES = 'Images in imports are left out; a component’s own image shows instead.';
const NOT_READ = 'This line is not read.';

/**
 * The longest line these diagrams read; a longer one is reported. Their lines are read with patterns,
 * which this keeps quick on any line a file can hold.
 */
export const MAX_DIAGRAM_LINE = 16_384;

/** The lines a diagram reads, with each longer one reported instead. */
function readable(builder: PlanBuilder, lines: readonly MermaidLine[]): MermaidLine[] {
  return lines.filter(({ text }) => {
    if (text.length <= MAX_DIAGRAM_LINE) return true;
    builder.report(
      text,
      `This line is longer than ${MAX_DIAGRAM_LINE.toLocaleString('en')} characters, so it is not read.`,
    );
    return false;
  });
}

// ——— C4 ———

/** The positional parameters of each family of C4 macros, after the alias and the label. */
const C4_PARAMETERS = {
  person: ['descr'],
  container: ['techn', 'descr'],
  boundary: ['type'],
  plainBoundary: [],
  node: ['type', 'descr'],
  relation: ['techn', 'descr'],
} as const;

type C4Family = keyof typeof C4_PARAMETERS;

/** The family of a C4 element or boundary macro, by its name. */
function c4Family(macro: string): C4Family | undefined {
  const base = macro.replace(/_Ext$/, '');
  if (/^(Person|System|SystemDb|SystemQueue)$/.test(base)) return 'person';
  if (/^(Container|ContainerDb|ContainerQueue|Component|ComponentDb|ComponentQueue)$/.test(base)) {
    return 'container';
  }
  if (base === 'Boundary') return 'boundary';
  if (/^(Enterprise_Boundary|System_Boundary|Container_Boundary)$/.test(base))
    return 'plainBoundary';
  if (/^(Deployment_Node|Node|Node_L|Node_R)$/.test(base)) return 'node';
  return undefined;
}

/** The C4 macros that only style or arrange, which are reported. */
const C4_STYLES =
  /^(UpdateElementStyle|UpdateRelStyle|UpdateBoundaryStyle|AddElementTag|AddRelTag|AddBoundaryTag|AddPersonTag|AddContainerTag|AddComponentTag|AddNodeTag)$/;

/** A macro's arguments: positional ones in order, and named ones such as `$link`. */
function c4Arguments(text: string): { positional: string[]; named: Map<string, string> } {
  const positional: string[] = [];
  const named = new Map<string, string>();
  for (const part of splitOutsideQuotes(text, ',')) {
    const argument = part.trim();
    const found = /^\$(\w+)\s*=\s*(.*)$/s.exec(argument);
    if (found !== null) named.set(found[1] ?? '', unquote((found[2] ?? '').trim()));
    else positional.push(unquote(argument));
  }
  return { positional, named };
}

/** Reads a C4 diagram's macros. */
export const readC4: DiagramReader = (all, makeBuilder) => {
  const builder = makeBuilder();
  const lines = readable(builder, all);
  const open: { key: string; line: number }[] = [];
  let title: string | undefined;
  const pending: {
    from: string;
    to: string;
    statement: string;
    kind: string;
    name: string;
    attributes?: Attributes;
  }[] = [];
  for (const { text, line } of lines) {
    if (text === '}') {
      if (open.pop() === undefined)
        builder.report(text, 'This line ends no boundary, so it is not read.');
      continue;
    }
    const titled = /^title\s+(.*)$/.exec(text);
    if (titled !== null) {
      title = titled[1] ?? '';
      continue;
    }
    const call = /^(\w+)\s*\((.*)\)(\s*\{)?$/s.exec(text);
    if (call === null) {
      if (/^(accTitle|accDescr)\b/.test(text)) continue;
      builder.report(text, NOT_READ);
      continue;
    }
    const macro = call[1] ?? '';
    const { positional, named } = c4Arguments(call[2] ?? '');
    const opens = call[3] !== undefined;
    for (const [name, value] of named) {
      if (name === 'link') builder.report(`$link="${value}"`, LINKS);
      if (name === 'sprite') builder.report(`$sprite="${value}"`, IMAGES);
    }
    if (macro === 'UpdateLayoutConfig') {
      builder.report(
        text,
        'Layout settings are not read: Visual Anything lays the view out itself.',
      );
      continue;
    }
    if (C4_STYLES.test(macro) || /^(SHOW_LEGEND|HIDE_STEREOTYPE|LAYOUT_\w+)$/.test(macro)) {
      builder.report(text, STYLES);
      continue;
    }
    const family = c4Family(macro);
    if (family !== undefined) {
      const [alias, label, ...rest] = positional;
      if (alias === undefined || alias === '') {
        builder.report(text, NOT_READ);
        continue;
      }
      const values: Record<string, string | undefined> = {};
      C4_PARAMETERS[family].forEach((parameter, at) => {
        values[parameter] = rest[at];
      });
      for (const parameter of ['descr', 'techn', 'type']) {
        const value = named.get(parameter);
        if (value !== undefined) values[parameter] = value;
      }
      const suggested = C4_ELEMENTS[macro.replace(/_Ext$/, '')];
      const element = builder.add(
        {
          key: alias,
          sourceId: alias,
          name: builder.name(mermaidText(label ?? alias), alias),
          kind: macro,
        },
        { label: macro, ...(suggested === undefined ? {} : { suggested }) },
      );
      const description = builder.description(
        values.descr === undefined ? undefined : mermaidText(values.descr),
      );
      if (description !== undefined) element.description = description;
      const attributes = attributesOf({
        technology: textOrUndefined(values.techn),
        type: textOrUndefined(values.type),
      });
      if (attributes !== undefined) element.attributes = attributes;
      const inside = open[open.length - 1];
      if (inside !== undefined) builder.contain(alias, inside.key);
      if (opens) open.push({ key: alias, line });
      continue;
    }
    const relation = /^(Rel|BiRel|Rel_(U|Up|D|Down|L|Left|R|Right|Back|Neighbor)|RelIndex)$/.exec(
      macro,
    );
    if (relation !== null) {
      const args = macro === 'RelIndex' ? positional.slice(1) : positional;
      const [from, to, label, techn, descr] = args;
      if (from === undefined || to === undefined) {
        builder.report(text, NOT_READ);
        continue;
      }
      const technology = textOrUndefined(named.get('techn') ?? techn);
      const description = textOrUndefined(named.get('descr') ?? descr);
      const back = macro === 'Rel_Back';
      const attributes = attributesOf({ technology, description });
      pending.push({
        from: back ? to : from,
        to: back ? from : to,
        statement: text,
        kind: macro === 'BiRel' ? 'BiRel' : 'Rel',
        name: label === undefined ? '' : mermaidText(label),
        ...(attributes === undefined ? {} : { attributes }),
      });
      continue;
    }
    builder.report(text, NOT_READ);
  }
  const unclosed = open[0];
  if (unclosed !== undefined) {
    return {
      problems: [`The boundary "${unclosed.key}" that starts on line ${unclosed.line} never ends.`],
    };
  }
  for (const relation of pending) {
    const missing = [relation.from, relation.to].find((key) => builder.element(key) === undefined);
    if (missing !== undefined) {
      builder.report(
        relation.statement,
        `The relationship ends on "${missing}", which the diagram does not define.`,
      );
      continue;
    }
    const name = relation.name === '' ? '' : builder.name(relation.name, '');
    const suggested = C4_RELATIONS[relation.kind];
    builder.relate(
      {
        from: relation.from,
        to: relation.to,
        kind: relation.kind,
        ...(name === '' ? {} : { name }),
        ...(relation.attributes === undefined ? {} : { attributes: relation.attributes }),
      },
      { label: relation.kind, ...(suggested === undefined ? {} : { suggested }) },
    );
  }
  return { builder, ...(title === undefined ? {} : { title }) };
};

/** A value of a macro as plain text, or undefined when it is empty. */
function textOrUndefined(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const text = importedName(mermaidText(value)).text;
  return text === '' ? undefined : text;
}

// ——— ER ———

/** An entity's name: a word with dashes, or quoted; with an alias as `p[Person]`. */
const ENTITY = String.raw`("[^"]+"|[A-Za-z_][\w-]*)(?:\[("[^"]*"|[^\]]*)\])?`;

/** The cardinality symbols of the left and the right of a relationship. */
const LEFT_CARDINALITY: Readonly<Record<string, string>> = {
  '|o': 'zero or one',
  '||': 'exactly one',
  '}o': 'zero or more',
  '}|': 'one or more',
};
const RIGHT_CARDINALITY: Readonly<Record<string, string>> = {
  'o|': 'zero or one',
  '||': 'exactly one',
  'o{': 'zero or more',
  '|{': 'one or more',
};

/** Cardinalities in words, as Mermaid also takes them. */
const WORD_CARDINALITY: Readonly<Record<string, string>> = {
  'one or zero': 'zero or one',
  'zero or one': 'zero or one',
  'one or more': 'one or more',
  'one or many': 'one or more',
  'many(1)': 'one or more',
  '1+': 'one or more',
  'zero or more': 'zero or more',
  'zero or many': 'zero or more',
  'many(0)': 'zero or more',
  '0+': 'zero or more',
  'only one': 'exactly one',
  '1': 'exactly one',
};

const SYMBOL_RELATIONSHIP = new RegExp(
  `^${ENTITY}\\s*(\\|o|\\|\\||\\}o|\\}\\|)(--|\\.\\.)(o\\||\\|\\||o\\{|\\|\\{)\\s*${ENTITY}\\s*:\\s*(.+)$`,
);
const WORD_RELATIONSHIP = new RegExp(
  `^${ENTITY}\\s+(${Object.keys(WORD_CARDINALITY)
    .map((each) => each.replace(/[()+]/g, '\\$&'))
    .join('|')})\\s+(to|optionally to)\\s+(${Object.keys(WORD_CARDINALITY)
    .map((each) => each.replace(/[()+]/g, '\\$&'))
    .join('|')})\\s+${ENTITY}\\s*:\\s*(.+)$`,
);
const ENTITY_BLOCK = new RegExp(`^${ENTITY}\\s*\\{(\\s*\\})?$`);

/** Reads an ER diagram's entities, attributes and relationships. */
export const readErDiagram: DiagramReader = (all, makeBuilder) => {
  const builder = makeBuilder();
  const lines = readable(builder, all);
  let inside: { key: string; line: number } | undefined;
  const entity = (written: string, alias: string | undefined): string => {
    const key = unquote(written);
    const known = builder.element(key);
    const name = alias === undefined ? undefined : mermaidText(alias);
    if (known === undefined) {
      builder.add(
        { key, sourceId: key, name: builder.name(name ?? key, key), kind: 'entity' },
        { label: 'ENTITY { }', suggested: ER_KINDS.entity },
      );
    } else if (name !== undefined && name !== '') {
      known.name = builder.name(name, key);
    }
    return key;
  };
  for (const { text, line } of lines) {
    if (inside !== undefined) {
      if (text === '}') {
        inside = undefined;
        continue;
      }
      readAttribute(builder, inside.key, text);
      continue;
    }
    const block = ENTITY_BLOCK.exec(text);
    if (block !== null) {
      const key = entity(block[1] ?? '', block[2]);
      if (block[3] === undefined) inside = { key, line };
      continue;
    }
    const symbols = SYMBOL_RELATIONSHIP.exec(text);
    if (symbols !== null) {
      const from = entity(symbols[1] ?? '', symbols[2]);
      const to = entity(symbols[6] ?? '', symbols[7]);
      relationship(
        builder,
        from,
        to,
        symbols[4] === '--',
        {
          fromCardinality: LEFT_CARDINALITY[symbols[3] ?? ''],
          toCardinality: RIGHT_CARDINALITY[symbols[5] ?? ''],
        },
        symbols[8] ?? '',
      );
      continue;
    }
    const words = WORD_RELATIONSHIP.exec(text);
    if (words !== null) {
      const from = entity(words[1] ?? '', words[2]);
      const to = entity(words[6] ?? '', words[7]);
      relationship(
        builder,
        from,
        to,
        words[4] === 'to',
        {
          fromCardinality: WORD_CARDINALITY[words[3] ?? ''],
          toCardinality: WORD_CARDINALITY[words[5] ?? ''],
        },
        words[8] ?? '',
      );
      continue;
    }
    if (/^(title|accTitle|accDescr|direction)\b/.test(text)) continue;
    if (/^(style|classDef|class)\s/.test(text)) {
      builder.report(text, STYLES);
      continue;
    }
    builder.report(text, NOT_READ);
  }
  if (inside !== undefined) {
    return {
      problems: [`The entity "${inside.key}" that starts on line ${inside.line} never ends.`],
    };
  }
  return { builder };
};

/** One attribute line of an entity: its type, name, keys and comment. */
function readAttribute(builder: PlanBuilder, entity: string, text: string): void {
  const quoteAt = text.indexOf('"');
  const head = quoteAt < 0 ? text : text.slice(0, quoteAt);
  const comment = quoteAt < 0 ? undefined : /^"([^"]*)"$/.exec(text.slice(quoteAt).trim())?.[1];
  const [type, name, ...keyTokens] = head.trim().split(/[\s,]+/);
  if (
    type === undefined ||
    name === undefined ||
    (quoteAt >= 0 && comment === undefined) ||
    !keyTokens.every((each) => each === 'PK' || each === 'FK' || each === 'UK')
  ) {
    builder.report(
      text,
      'This line is not read: it is not an attribute, written as type and name.',
    );
    return;
  }
  const keys = keyTokens.join(' ');
  const key = `${entity}.${name}`;
  if (builder.element(key) !== undefined) {
    builder.report(text, 'This attribute is listed twice, so it is read once.');
    return;
  }
  const flags = new Set(keys.split(/[\s,]+/).filter((each) => each !== ''));
  const attribute = builder.add(
    { key, sourceId: key, name: builder.name(name, name), kind: 'attribute' },
    { label: 'type name', suggested: ER_KINDS.attribute },
  );
  const attributes = attributesOf({
    type: importedName(type).text,
    primaryKey: flags.has('PK') ? true : undefined,
    foreignKey: flags.has('FK') ? true : undefined,
    unique: flags.has('UK') ? true : undefined,
  });
  if (attributes !== undefined) attribute.attributes = attributes;
  const description = builder.description(comment === undefined ? undefined : oneLine(comment));
  if (description !== undefined) attribute.description = description;
  builder.contain(key, entity);
}

function relationship(
  builder: PlanBuilder,
  from: string,
  to: string,
  identifying: boolean,
  cardinalities: Record<string, string | undefined>,
  label: string,
): void {
  const name = builder.name(mermaidText(label), '');
  const kind = identifying ? 'identifying' : 'non-identifying';
  const attributes = attributesOf(cardinalities);
  builder.relate(
    {
      from,
      to,
      kind,
      ...(name === '' || name === '?' ? {} : { name }),
      ...(attributes === undefined ? {} : { attributes }),
    },
    { label: identifying ? '--' : '..', suggested: ER_KINDS.relationship },
  );
}

// ——— Classes ———

/** A class's name: a word with an optional generic, as `Square~Shape~`, or quoted in backticks. */
const CLASS_NAME = String.raw`(\`[^\`]+\`|[\w]+(?:~[^~]*~)?)`;

const CLASS_RELATION = new RegExp(
  `^${CLASS_NAME}\\s*(?:"([^"]*)"\\s*)?(<\\||\\*|o|<)?(--|\\.\\.)(\\|>|\\*|o|>)?\\s*(?:"([^"]*)"\\s*)?${CLASS_NAME}\\s*(?::\\s*(.*))?$`,
);
const CLASS_DECLARATION = new RegExp(
  `^class\\s+${CLASS_NAME}(?:\\s*\\["([^"]*)"\\])?(?::::[\\w-]+)?(\\s*\\{(\\s*\\})?)?$`,
);
const MEMBER_LINE = new RegExp(`^${CLASS_NAME}\\s*:\\s*(.+)$`);
const ANNOTATION_LINE = new RegExp(`^<<([^>]*)>>\\s*${CLASS_NAME}$`);

/** A class's key, without its generic, and the name it shows, with it written in angle brackets. */
function classKey(written: string): { key: string; shown: string } {
  if (written.startsWith('`')) {
    const text = written.slice(1, -1);
    return { key: text, shown: text };
  }
  const generic = /^([\w]+)~([^~]*)~$/.exec(written);
  if (generic !== null) {
    return {
      key: generic[1] ?? written,
      shown: `${generic[1]}<${(generic[2] ?? '').replaceAll('~', '')}>`,
    };
  }
  return { key: written, shown: written };
}

/** The UML kind of a relationship by its ends and line, and whether it points from right to left. */
function classRelationKind(
  left: string | undefined,
  line: string,
  right: string | undefined,
): { kind: string; label: string; reversed: boolean } {
  if (left !== undefined && right !== undefined) {
    const label = `${left}${line}${right}`;
    return { kind: `two-way:${label}`, label, reversed: false };
  }
  const marker = left ?? right;
  const reversed = left === '<|' || left === '<';
  const dashed = line === '..';
  switch (marker) {
    case '<|':
    case '|>':
      return dashed
        ? { kind: 'realization', label: '<|..', reversed }
        : { kind: 'inheritance', label: '<|--', reversed };
    case '*':
      return { kind: 'composition', label: '*--', reversed };
    case 'o':
      return { kind: 'aggregation', label: 'o--', reversed };
    case '<':
    case '>':
      return dashed
        ? { kind: 'dependency', label: '..>', reversed }
        : { kind: 'association', label: '-->', reversed };
    default:
      return dashed
        ? { kind: 'dashed-link', label: '..', reversed }
        : { kind: 'link', label: '--', reversed };
  }
}

/** Reads a class diagram's classes, members, annotations, namespaces and relationships. */
export const readClassDiagram: DiagramReader = (all, makeBuilder) => {
  const builder = makeBuilder();
  const lines = readable(builder, all);
  const members = new Map<string, string[]>();
  const annotations = new Map<string, string>();
  let body: { key: string; line: number } | undefined;
  let namespace: { key: string; line: number } | undefined;
  const declare = (written: string, label?: string): string => {
    const { key, shown } = classKey(written);
    const known = builder.element(key);
    if (known === undefined) {
      builder.add(
        { key, sourceId: key, name: builder.name(shown, key), kind: 'class' },
        { label: 'class' },
      );
    }
    const element = builder.element(key);
    if (element !== undefined) {
      if (label !== undefined) element.name = builder.name(mermaidText(label), key);
      else if (shown !== key) element.name = builder.name(shown, key);
    }
    return key;
  };
  const member = (key: string, text: string) => {
    const list = members.get(key) ?? [];
    list.push(importedName(text).text);
    members.set(key, list);
  };
  for (const { text, line } of lines) {
    if (body !== undefined) {
      if (text === '}') {
        body = undefined;
        continue;
      }
      const annotation = /^<<([^>]*)>>$/.exec(text);
      if (annotation !== null) annotations.set(body.key, (annotation[1] ?? '').trim());
      else member(body.key, text);
      continue;
    }
    if (text === '}' && namespace !== undefined) {
      namespace = undefined;
      continue;
    }
    const space = /^namespace\s+([\w.-]+)\s*\{\s*$/.exec(text);
    if (space !== null) {
      const key = space[1] ?? '';
      if (builder.element(key) === undefined) {
        builder.add(
          { key, sourceId: key, name: builder.name(key, key), kind: 'namespace' },
          { label: 'namespace' },
        );
      }
      namespace = { key, line };
      continue;
    }
    const declared = CLASS_DECLARATION.exec(text);
    if (declared !== null) {
      const key = declare(declared[1] ?? '', declared[2]);
      if (namespace !== undefined) builder.contain(key, namespace.key);
      if (declared[3] !== undefined && declared[4] === undefined) body = { key, line };
      continue;
    }
    const related = CLASS_RELATION.exec(text);
    if (related !== null) {
      const left = declare(related[1] ?? '');
      const right = declare(related[7] ?? '');
      const { kind, label, reversed } = classRelationKind(
        related[3],
        related[4] ?? '--',
        related[5],
      );
      const [from, to] = reversed ? [right, left] : [left, right];
      const [fromMultiplicity, toMultiplicity] = reversed
        ? [related[6], related[2]]
        : [related[2], related[6]];
      const name = related[8] === undefined ? '' : builder.name(mermaidText(related[8]), '');
      const attributes = attributesOf({
        fromMultiplicity: fromMultiplicity === undefined ? undefined : oneLine(fromMultiplicity),
        toMultiplicity: toMultiplicity === undefined ? undefined : oneLine(toMultiplicity),
      });
      builder.relate(
        {
          from,
          to,
          kind,
          ...(name === '' || name === '?' ? {} : { name }),
          ...(attributes === undefined ? {} : { attributes }),
        },
        { label },
      );
      continue;
    }
    const annotated = ANNOTATION_LINE.exec(text);
    if (annotated !== null) {
      annotations.set(declare(annotated[2] ?? ''), (annotated[1] ?? '').trim());
      continue;
    }
    if (/^note\b/.test(text)) {
      builder.report(text, 'Notes are not read: add notes on the canvas instead.');
      continue;
    }
    if (/^(click|link|callback)\s/.test(text)) {
      builder.report(text, LINKS);
      continue;
    }
    if (/^(style|classDef|cssClass)\s/.test(text)) {
      builder.report(text, STYLES);
      continue;
    }
    if (/^(direction|title|accTitle|accDescr)\b/.test(text)) continue;
    const memberLine = MEMBER_LINE.exec(text);
    if (memberLine !== null) {
      member(declare(memberLine[1] ?? ''), memberLine[2] ?? '');
      continue;
    }
    builder.report(text, NOT_READ);
  }
  if (body !== undefined) {
    return { problems: [`The class "${body.key}" that starts on line ${body.line} never ends.`] };
  }
  if (namespace !== undefined) {
    return {
      problems: [
        `The namespace "${namespace.key}" that starts on line ${namespace.line} never ends.`,
      ],
    };
  }
  for (const [key, annotation] of annotations) {
    const element = builder.element(key);
    if (element === undefined) continue;
    const kind = `annotation:${annotation.toLowerCase()}`;
    builder.setKind(element, kind, { label: `<<${annotation}>>` });
  }
  for (const [key, list] of members) {
    const element = builder.element(key);
    if (element === undefined || list.length === 0) continue;
    element.attributes = { ...element.attributes, members: list as JsonValue[] };
  }
  return { builder };
};
