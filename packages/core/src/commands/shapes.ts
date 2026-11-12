/**
 * The shape of every command (ADR 0104): the fields it takes, which it needs, the kind of value each
 * holds, what each means, and an example. It is the one source of truth for two things: the check
 * that refuses a key a command does not take, a field it needs left out and a value of the wrong kind,
 * before the command changes anything; and what `describe_command` tells Claude. The TypeScript types
 * keep it true: a field the types add, drop or make optional, or whose kind changes, fails to compile
 * here until the table says so too.
 */
import { problem, type Problem } from '../problems';
import type {
  AttributeChanges,
  Command,
  CommandType,
  CreateElementCommand,
  CreatePackageCommand,
  CreateRelationCommand,
  CreateScenarioCommand,
  CreateThreadCommand,
  CreateTourCommand,
  CreateViewCommand,
  DefineExplorableCommand,
  FreeShapeChanges,
  NewComment,
  UpdateComponentCommand,
  UpdateElementCommand,
  UpdateExplorableCommand,
  UpdateOverlayCommand,
  UpdatePackageCommand,
  UpdateProjectCommand,
  UpdateRelationCommand,
  UpdateRelationTypeCommand,
  UpdateScenarioCommand,
  UpdateSolidCommand,
  UpdateTourCommand,
  UpdateViewCommand,
} from './types';

/** The kind of JSON value a field holds: what the check reads before the command does. */
export type FieldKind = 'text' | 'number' | 'boolean' | 'list' | 'object' | 'any';

/** One field of a command, or of an object a command holds. */
export interface FieldShape {
  /** Its type as `describe_command` shows it, in TypeScript's notation with the files' type names. */
  type: string;
  /** The kind of JSON value it holds; `any` for a value of several kinds. */
  kind: FieldKind;
  /** Whether a command must give it. */
  required?: boolean;
  /** Whether it takes `null`, which takes something out. */
  nullable?: boolean;
  /** What it means, in one line. */
  meaning: string;
  /** The kind of each item of the list it holds. */
  items?: Exclude<FieldKind, 'list' | 'any'>;
  /** The keys the object it holds takes, when the core reads a fixed set: any other is refused. */
  fields?: FieldShapes;
}

/** Fields by name, in the order they are described. */
export type FieldShapes = Readonly<Record<string, FieldShape>>;

/** The shape of one command. */
export interface CommandShape {
  /** What the command does, in one line. */
  meaning: string;
  fields: FieldShapes;
  /** A command of this type as Claude would send it. */
  example: Command;
  /**
   * What to say of a key the command does not take, by where it was given (`scope`, or
   * `changes.scope`), when the command that takes it is another.
   */
  hints?: Readonly<Record<string, string>>;
}

// The types that keep the table true -------------------------------------------------------------------

/** The kind of a value of type `V`, as the check reads it. */
type KindOf<V> = [NonNullable<V>] extends [string]
  ? 'text'
  : [NonNullable<V>] extends [number]
    ? 'number'
    : [NonNullable<V>] extends [boolean]
      ? 'boolean'
      : [NonNullable<V>] extends [readonly unknown[]]
        ? 'list'
        : [NonNullable<V>] extends [object]
          ? 'object'
          : 'any';

/** A field `K` of `T`: its kind, whether it is needed and whether it takes `null` follow the type. */
type FieldOf<T, K extends keyof T> = {
  type: string;
  meaning: string;
  fields?: FieldShapes;
  kind: KindOf<T[K]>;
} & (Partial<Pick<T, K>> extends Pick<T, K> ? { required?: false } : { required: true }) &
  (null extends T[K] ? { nullable: true } : { nullable?: false }) &
  ([NonNullable<T[K]>] extends [readonly (infer E)[]] ? { items: KindOf<E> } : { items?: never });

/** Every field of `T`, and no other. */
type FieldsOf<T> = { [K in keyof T]-?: FieldOf<T, K> };

/** The shape of command `C`: every field but its type, and an example that is one. */
interface ShapeOf<C extends Command> extends CommandShape {
  fields: FieldsOf<Omit<C, 'type'>>;
  example: C;
}

type Shapes = { readonly [T in CommandType]: ShapeOf<Extract<Command, { type: T }>> };

/** The fields of an object a command holds, every one of `T` and no other. */
function fields<T>(shapes: FieldsOf<T>): FieldShapes {
  return shapes;
}

// What several commands share ---------------------------------------------------------------------------

const ID_OF = (what: string) =>
  ({ type: 'Id', kind: 'text', required: true, meaning: what }) as const;
const VIEW = ID_OF('The view.');
const DESCRIPTION_CHANGE = {
  type: 'string | null',
  kind: 'text',
  nullable: true,
  meaning: 'Its new description; null takes it out.',
} as const;
const NAME_CHANGE = { type: 'string', kind: 'text', meaning: 'Its new name.' } as const;
const NEW_DESCRIPTION = {
  type: 'string',
  kind: 'text',
  meaning: 'What it is, in a sentence or two.',
} as const;
const OWN_ID = {
  type: 'Id',
  kind: 'text',
  meaning: 'An id of your own, unused in the project; left out, the core makes one from the name.',
} as const;
const CREATE_ONLY = {
  type: 'true',
  kind: 'boolean',
  meaning: 'Refuse with id-taken when the package already has this id, rather than redefine it.',
} as const;
const EXTERNAL_ID_CHANGES = {
  type: 'Record<string, string | null> | null',
  kind: 'object',
  nullable: true,
  meaning:
    'External identifiers by scheme: a text sets one, null takes it out; null for the whole takes all out.',
} as const;
const ATTRIBUTE_CHANGES = {
  type: 'object',
  kind: 'object',
  meaning: 'Changes to the attributes it defines itself, applied as rename, set, remove, order.',
  fields: fields<AttributeChanges>({
    rename: {
      type: '{ from: string; to: string }[]',
      kind: 'list',
      items: 'object',
      meaning: 'Attributes renamed; values held under the old name move to the new one.',
    },
    set: {
      type: 'AttributeDefinition[]',
      kind: 'list',
      items: 'object',
      meaning: 'Attributes it defines: new ones go last, ones it defines are redefined in place.',
    },
    remove: {
      type: 'string[]',
      kind: 'list',
      items: 'text',
      meaning: 'Its own attributes it stops defining; values already held stay.',
    },
    order: {
      type: 'string[]',
      kind: 'list',
      items: 'text',
      meaning: 'Its own attributes in this order; those left out keep their order after them.',
    },
  }),
} as const;
const ELEMENTS_IN_VIEW = {
  type: 'Id[]',
  kind: 'list',
  items: 'text',
  required: true,
  meaning: 'The elements.',
} as const;
const OVERLAY_BEFORE = {
  type: 'Id',
  kind: 'text',
  meaning: 'The overlay it goes before; left out, it goes last.',
} as const;
const COMMENT_AUTHOR = {
  type: 'CommentAuthor',
  kind: 'object',
  meaning: "The person's name as their preferences give it; Claude's comments leave it out.",
} as const;

// The table ---------------------------------------------------------------------------------------------

/** The shape of every command, in the order `describe_command` lists them. */
export const COMMAND_SHAPES: Shapes = {
  'create-element': {
    meaning:
      'Creates an element, optionally inside containers and with its shapes placed in views.',
    fields: {
      element: {
        type: 'object',
        kind: 'object',
        required: true,
        meaning: 'The new element.',
        fields: fields<CreateElementCommand['element']>({
          id: OWN_ID,
          component: {
            type: 'Id',
            kind: 'text',
            required: true,
            meaning: 'The component it is created from.',
          },
          name: { type: 'string', kind: 'text', required: true, meaning: 'Its name.' },
          description: NEW_DESCRIPTION,
          attributes: {
            type: 'Attributes',
            kind: 'object',
            meaning: 'Attribute values by attribute name.',
          },
          appearance: {
            type: 'Appearance',
            kind: 'object',
            meaning: 'An appearance of its own; what it leaves out comes from its component.',
          },
          ids: {
            type: 'Record<string, string>',
            kind: 'object',
            meaning: 'What it is in other catalogs, by scheme (ADR 0056).',
          },
          pose: {
            type: 'Pose',
            kind: 'object',
            meaning: 'Where it is in physical space (ADR 0076).',
          },
        }),
      },
      containers: {
        type: '{ container: Id; relationType: Id }[]',
        kind: 'list',
        items: 'object',
        meaning: 'The containers to place it in, each through a nesting relation of that type.',
      },
      positions: {
        type: '{ view: Id; container?: Id; x: number; y: number; width?: number; height?: number; pinned?: boolean }[]',
        kind: 'list',
        items: 'object',
        meaning: 'Where its shapes sit in views.',
      },
      before: {
        type: 'Id',
        kind: 'text',
        meaning: "The element it goes before in the model's order; left out, it goes last.",
      },
      inView: {
        type: 'Id',
        kind: 'text',
        meaning: "The view it is made in: when the view's scope would not show it, it is added.",
      },
    },
    example: {
      type: 'create-element',
      element: { component: 'systems.service', name: 'Orders API' },
      containers: [{ container: 'shop', relationType: 'systems.is-part-of' }],
    },
  },
  'update-element': {
    meaning: 'Changes an element, World included; null takes an optional trait out.',
    fields: {
      id: ID_OF('The element to change.'),
      changes: {
        type: 'object',
        kind: 'object',
        required: true,
        meaning: 'What changes; what it leaves out stays.',
        fields: fields<UpdateElementCommand['changes']>({
          name: NAME_CHANGE,
          description: DESCRIPTION_CHANGE,
          component: { type: 'Id', kind: 'text', meaning: 'The component it is created from.' },
          appearance: {
            type: 'Appearance | null',
            kind: 'object',
            nullable: true,
            meaning: 'Its own appearance, replaced whole; null makes it look like its component.',
          },
          appearanceTraits: {
            type: 'AppearanceChanges',
            kind: 'object',
            meaning:
              'Its own appearance, trait by trait, null taking one out; not with appearance.',
          },
          attributes: { type: 'Attributes', kind: 'object', meaning: 'Attribute values to set.' },
          removeAttributes: {
            type: 'string[]',
            kind: 'list',
            items: 'text',
            meaning: 'Attributes to remove.',
          },
          ids: EXTERNAL_ID_CHANGES,
          pose: {
            type: 'Pose | null',
            kind: 'object',
            nullable: true,
            meaning: 'Where it is in physical space; null takes it out of physical space.',
          },
        }),
      },
    },
    example: {
      type: 'update-element',
      id: 'reminder-service',
      changes: { name: 'Reminders', attributes: { owner: 'Scheduling team' } },
    },
    hints: {
      'changes.id': 'An id never changes.',
      'changes.containers': "An element's containers change with change-container.",
      'changes.positions': 'Where its shapes sit is set with set-positions.',
    },
  },
  delete: {
    meaning: 'Deletes elements and relations, and every relation that ends on anything deleted.',
    fields: {
      elements: { type: 'Id[]', kind: 'list', items: 'text', meaning: 'The elements to delete.' },
      relations: { type: 'Id[]', kind: 'list', items: 'text', meaning: 'The relations to delete.' },
    },
    example: { type: 'delete', elements: ['legacy-api'], relations: ['web-calls-legacy'] },
    hints: { ids: "Give the elements' ids in elements and the relations' in relations." },
  },
  'create-relation': {
    meaning: 'Creates a relation between elements or relations.',
    fields: {
      relation: {
        type: 'object',
        kind: 'object',
        required: true,
        meaning: 'The new relation.',
        fields: fields<CreateRelationCommand['relation']>({
          id: OWN_ID,
          relationType: { type: 'Id', kind: 'text', required: true, meaning: 'Its relation type.' },
          from: {
            type: 'Id',
            kind: 'text',
            required: true,
            meaning: 'The element or relation it starts at.',
          },
          to: {
            type: 'Id',
            kind: 'text',
            required: true,
            meaning: 'The element or relation it ends at.',
          },
          name: { type: 'string', kind: 'text', meaning: 'Its name.' },
          description: NEW_DESCRIPTION,
          attributes: {
            type: 'Attributes',
            kind: 'object',
            meaning: 'Attribute values by attribute name.',
          },
          appearance: {
            type: 'RelationAppearance',
            kind: 'object',
            meaning: 'An appearance of its own; what it leaves out comes from its relation type.',
          },
        }),
      },
    },
    example: {
      type: 'create-relation',
      relation: { relationType: 'systems.communicates-with', from: 'web-app', to: 'orders-api' },
    },
  },
  'update-relation': {
    meaning: 'Changes a relation; null takes an optional trait out.',
    fields: {
      id: ID_OF('The relation to change.'),
      changes: {
        type: 'object',
        kind: 'object',
        required: true,
        meaning: 'What changes; what it leaves out stays.',
        fields: fields<UpdateRelationCommand['changes']>({
          relationType: { type: 'Id', kind: 'text', meaning: 'Its relation type.' },
          from: { type: 'Id', kind: 'text', meaning: 'The element or relation it starts at.' },
          to: { type: 'Id', kind: 'text', meaning: 'The element or relation it ends at.' },
          name: {
            type: 'string | null',
            kind: 'text',
            nullable: true,
            meaning: 'Its new name; null takes it out.',
          },
          description: DESCRIPTION_CHANGE,
          attributes: { type: 'Attributes', kind: 'object', meaning: 'Attribute values to set.' },
          removeAttributes: {
            type: 'string[]',
            kind: 'list',
            items: 'text',
            meaning: 'Attributes to remove.',
          },
          appearance: {
            type: 'RelationAppearance | null',
            kind: 'object',
            nullable: true,
            meaning:
              'Its own appearance, replaced whole; null makes it look like its relation type.',
          },
          appearanceTraits: {
            type: 'RelationAppearanceChanges',
            kind: 'object',
            meaning:
              'Its own appearance, trait by trait, null taking one out; not with appearance.',
          },
        }),
      },
    },
    example: { type: 'update-relation', id: 'web-calls-api', changes: { name: 'HTTPS' } },
    hints: { 'changes.id': 'An id never changes.' },
  },
  'create-package': {
    meaning: "Creates an empty package of the project's own and starts using it.",
    fields: {
      package: {
        type: 'object',
        kind: 'object',
        required: true,
        meaning: 'The new package.',
        fields: fields<CreatePackageCommand['package']>({
          id: {
            type: 'Id',
            kind: 'text',
            required: true,
            meaning: "Its id, which its definitions' ids start with.",
          },
          name: { type: 'string', kind: 'text', required: true, meaning: 'Its name.' },
          description: NEW_DESCRIPTION,
          version: { type: 'string', kind: 'text', meaning: 'Its version.' },
          license: { type: 'string', kind: 'text', meaning: 'Its license, as an SPDX identifier.' },
          attribution: {
            type: 'string',
            kind: 'text',
            meaning: 'Who made it, as its license asks.',
          },
        }),
      },
    },
    example: { type: 'create-package', package: { id: 'audit', name: 'Medical audit' } },
  },
  'define-component': {
    meaning: "Defines a component in one of the project's packages, or redefines one it has.",
    fields: {
      package: ID_OF('The package it goes in.'),
      component: {
        type: 'Component (id optional)',
        kind: 'object',
        required: true,
        meaning: 'The component, with derivesFrom; without an id, the core makes one.',
      },
      createOnly: CREATE_ONLY,
    },
    example: {
      type: 'define-component',
      package: 'audit',
      component: { name: 'Claim', derivesFrom: 'systems.box' },
    },
  },
  'remove-component': {
    meaning: 'Removes a component that no element is created from and no component derives from.',
    fields: { id: ID_OF('The component.') },
    example: { type: 'remove-component', id: 'audit.claim' },
  },
  'define-relation-type': {
    meaning: "Defines a relation type in one of the project's packages, or redefines one it has.",
    fields: {
      package: ID_OF('The package it goes in.'),
      relationType: {
        type: 'RelationType (id optional)',
        kind: 'object',
        required: true,
        meaning: 'The relation type, with derivesFrom; without an id, the core makes one.',
      },
      createOnly: CREATE_ONLY,
    },
    example: {
      type: 'define-relation-type',
      package: 'audit',
      relationType: { name: 'reviews', derivesFrom: 'relates-to', direction: 'directed' },
    },
  },
  'remove-relation-type': {
    meaning: 'Removes a relation type that no relation, relation type or view uses.',
    fields: { id: ID_OF('The relation type.') },
    example: { type: 'remove-relation-type', id: 'audit.reviews' },
  },
  'create-view': {
    meaning: 'Creates a view; without nesting relation types, every one that nests arranges it.',
    fields: {
      view: {
        type: 'object',
        kind: 'object',
        required: true,
        meaning: 'The new view.',
        fields: fields<CreateViewCommand['view']>({
          id: OWN_ID,
          name: { type: 'string', kind: 'text', required: true, meaning: 'Its name.' },
          description: NEW_DESCRIPTION,
          perspective: {
            type: '{ name: string; description?: string }',
            kind: 'object',
            required: true,
            meaning: 'The perspective it shows the model from.',
          },
          nestingRelationTypes: {
            type: 'Id[]',
            kind: 'list',
            items: 'text',
            meaning: 'The relation types that put one shape inside another in it.',
          },
        }),
      },
      folder: {
        type: 'Id',
        kind: 'text',
        meaning: 'The view folder it is filed in, last (ADR 0101).',
      },
    },
    example: {
      type: 'create-view',
      view: { name: 'Claims flow', perspective: { name: 'Data flow' } },
    },
  },
  'update-view': {
    meaning: "Changes a view's name, description, perspective, nesting relation types or drawing.",
    fields: {
      id: ID_OF('The view to change.'),
      changes: {
        type: 'object',
        kind: 'object',
        required: true,
        meaning: 'What changes; what it leaves out stays.',
        fields: fields<UpdateViewCommand['changes']>({
          name: NAME_CHANGE,
          description: DESCRIPTION_CHANGE,
          perspective: {
            type: '{ name: string; description?: string }',
            kind: 'object',
            meaning: 'The perspective it shows the model from.',
          },
          nestingRelationTypes: {
            type: 'Id[]',
            kind: 'list',
            items: 'text',
            meaning: 'The relation types that put one shape inside another in it.',
          },
          routeStyle: {
            type: '"straight" | "curved" | null',
            kind: 'text',
            nullable: true,
            meaning: 'How it draws automatic routes that no appearance styles; null, orthogonal.',
          },
          rows: {
            type: '"all" | "keys" | null',
            kind: 'text',
            nullable: true,
            meaning: 'Which rows shapes that draw rows draw: only key rows with "keys".',
          },
          selectionFadesLines: {
            type: 'boolean | null',
            kind: 'boolean',
            nullable: true,
            meaning: 'Whether selecting fades the lines that do not touch the selection.',
          },
        }),
      },
    },
    example: { type: 'update-view', id: 'system-overview', changes: { routeStyle: 'curved' } },
    hints: {
      'changes.id': 'An id never changes.',
      'changes.scope': "A view's scope is set with set-scope.",
      'changes.relationTypesLeftOut':
        'The relation types a view leaves out are set with set-relation-types-left-out.',
      'changes.overlays': "A view's overlays are set with set-overlays.",
      'changes.drawing': "A view's drawing defaults are set with set-drawing-defaults.",
      'changes.collapsed': 'Containers are collapsed with set-collapsed.',
      'changes.folder': 'Views are filed in folders with organize-views.',
    },
  },
  'delete-view': {
    meaning: 'Deletes a view that no scenario plays over.',
    fields: { id: ID_OF('The view.') },
    example: { type: 'delete-view', id: 'old-overview' },
  },
  'organize-views': {
    meaning: 'Files the views in folders: the whole tree of the view list, replacing the one kept.',
    fields: {
      viewFolders: {
        type: '({ view: Id } | { id?: Id; name: string; entries: (same)[] })[]',
        kind: 'list',
        items: 'object',
        required: true,
        meaning:
          'The view list in order: views, and folders of entries; a folder without an id is new.',
      },
    },
    example: {
      type: 'organize-views',
      viewFolders: [
        { name: 'Audit', entries: [{ view: 'claims-flow' }] },
        { view: 'system-overview' },
      ],
    },
  },
  'set-positions': {
    meaning: 'Sets where anchored shapes sit in a view: moved by hand, pinned; by layout, not.',
    fields: {
      view: VIEW,
      positions: {
        type: '{ element: Id; container?: Id; x: number; y: number; width?: number; height?: number; pinned?: boolean; rotation?: number; flip?: string }[]',
        kind: 'list',
        items: 'object',
        required: true,
        meaning:
          "Each shape's place, relative to its container's shape, or to the canvas in World.",
      },
    },
    example: {
      type: 'set-positions',
      view: 'system-overview',
      positions: [{ element: 'orders-api', container: 'shop', x: 40, y: 60 }],
    },
  },
  'remove-positions': {
    meaning: 'Forgets where anchored shapes sit in a view, so that layout places them again.',
    fields: {
      view: VIEW,
      positions: {
        type: '{ element: Id; container?: Id }[]',
        kind: 'list',
        items: 'object',
        required: true,
        meaning: 'The shapes, by element and the container their shape sits in.',
      },
    },
    example: {
      type: 'remove-positions',
      view: 'system-overview',
      positions: [{ element: 'orders-api' }],
    },
  },
  'create-free-shape': {
    meaning:
      'Adds a free shape to a view: a note, an arrow, a picture, a link card or an explorable.',
    fields: {
      view: VIEW,
      shape: {
        type: 'Note | Arrow | Picture | LinkCard (id optional)',
        kind: 'object',
        required: true,
        meaning:
          'The shape, with its kind: a note has x, y, width, height and text; an arrow from and to; a picture x, y, width, height, media and an optional name, and a video, a picture whose media is an MP4 or a WebM, an optional poster; a link card ("link") x, y, width, height, url, title, and an optional description and picture.',
      },
    },
    example: {
      type: 'create-free-shape',
      view: 'system-overview',
      shape: { kind: 'note', x: 0, y: 400, width: 220, height: 80, text: 'Audited monthly.' },
    },
  },
  'update-free-shape': {
    meaning:
      'Changes a free shape: replaced whole with shape, or part by part with id and changes.',
    fields: {
      view: VIEW,
      shape: {
        type: 'Note | Arrow | Picture | ExplorableShape | LinkCard',
        kind: 'object',
        meaning:
          'The free shape whole, with its id, replacing the one stored; not with id and changes.',
      },
      id: {
        type: 'Id',
        kind: 'text',
        meaning: 'The free shape to change part by part, with changes.',
      },
      changes: {
        type: 'object',
        kind: 'object',
        meaning: 'Its parts to change, merged over the shape stored; its kind and id stay.',
        fields: fields<FreeShapeChanges>({
          x: { type: 'number', kind: 'number', meaning: "A note's or a picture's left edge." },
          y: { type: 'number', kind: 'number', meaning: "A note's or a picture's top edge." },
          width: { type: 'number', kind: 'number', meaning: "A note's or a picture's width." },
          height: { type: 'number', kind: 'number', meaning: "A note's or a picture's height." },
          text: { type: 'string', kind: 'text', meaning: "A note's text." },
          fill: {
            type: 'Color | null',
            kind: 'text',
            nullable: true,
            meaning: "A note's fill, as #RRGGBB; null, the theme's.",
          },
          stroke: {
            type: 'Color | null',
            kind: 'text',
            nullable: true,
            meaning: "A note's or an arrow's stroke, as #RRGGBB; null, the theme's.",
          },
          from: { type: 'Point', kind: 'object', meaning: 'Where an arrow starts: { x, y }.' },
          to: { type: 'Point', kind: 'object', meaning: 'Where an arrow ends: { x, y }.' },
          media: { type: 'MediaRef', kind: 'object', meaning: 'The media file a picture shows.' },
          poster: {
            type: 'MediaRef | null',
            kind: 'object',
            nullable: true,
            meaning: "A video's poster, a PNG, JPEG or WebP media file; null, none.",
          },
          name: {
            type: 'string | null',
            kind: 'text',
            nullable: true,
            meaning:
              'What a picture or an explorable shape is called; null, "Picture", "Video" for a video, or the explorable’s name.',
          },
          explorable: {
            type: 'Id',
            kind: 'text',
            meaning: 'The explorable an explorable shape shows, by its id (ADR 0107).',
          },
          element: {
            type: 'Id | null',
            kind: 'text',
            nullable: true,
            meaning: 'The element whose data an explorable shape reads; null unbinds it.',
          },
          url: {
            type: 'string',
            kind: 'text',
            meaning: "A link card's web address, https: or http: (ADR 0098, stage 3).",
          },
          title: { type: 'string', kind: 'text', meaning: "A link card's title, one line." },
          description: {
            type: 'string | null',
            kind: 'text',
            nullable: true,
            meaning: "A link card's description; null, none.",
          },
          picture: {
            type: 'MediaRef | null',
            kind: 'object',
            nullable: true,
            meaning: "A link card's picture, an image media file; null, none.",
          },
        }),
      },
    },
    example: {
      type: 'update-free-shape',
      view: 'system-overview',
      id: 'note-1',
      changes: { height: 340 },
    },
  },
  'delete-free-shapes': {
    meaning: 'Deletes free shapes from a view.',
    fields: {
      view: VIEW,
      ids: {
        type: 'Id[]',
        kind: 'list',
        items: 'text',
        required: true,
        meaning: 'The free shapes.',
      },
    },
    example: { type: 'delete-free-shapes', view: 'system-overview', ids: ['note-1'] },
  },
  'create-scenario': {
    meaning: 'Creates a scenario over a view.',
    fields: {
      scenario: {
        type: 'object',
        kind: 'object',
        required: true,
        meaning: 'The new scenario.',
        fields: fields<CreateScenarioCommand['scenario']>({
          id: OWN_ID,
          name: { type: 'string', kind: 'text', required: true, meaning: 'Its name.' },
          description: NEW_DESCRIPTION,
          view: { type: 'Id', kind: 'text', required: true, meaning: 'The view it plays over.' },
          steps: {
            type: '{ id?: Id; description: string; relations: Id[]; shows?: Id[]; playing?: Id[] }[]',
            kind: 'list',
            items: 'object',
            required: true,
            meaning:
              'Its steps in order, each over the relations it lights, with the pictures, videos and link cards of its view it shows and the videos it plays (ADR 0098).',
          },
          blocks: {
            type: 'DecisionBlock[]',
            kind: 'list',
            items: 'object',
            meaning: 'Its decisions, over its steps by id (ADR 0078).',
          },
        }),
      },
    },
    example: {
      type: 'create-scenario',
      scenario: {
        name: 'A claim is audited',
        view: 'claims-flow',
        steps: [{ description: 'The clinic sends the claim.', relations: ['clinic-sends-claim'] }],
      },
    },
  },
  'update-scenario': {
    meaning: 'Changes a scenario; steps replaces all of them.',
    fields: {
      id: ID_OF('The scenario to change.'),
      changes: {
        type: 'object',
        kind: 'object',
        required: true,
        meaning: 'What changes; what it leaves out stays.',
        fields: fields<UpdateScenarioCommand['changes']>({
          name: NAME_CHANGE,
          description: DESCRIPTION_CHANGE,
          view: { type: 'Id', kind: 'text', meaning: 'The view it plays over.' },
          steps: {
            type: '{ id?: Id; description: string; relations: Id[]; shows?: Id[]; playing?: Id[] }[]',
            kind: 'list',
            items: 'object',
            meaning: 'Its steps, replacing all of them.',
          },
          blocks: {
            type: 'DecisionBlock[] | null',
            kind: 'list',
            items: 'object',
            nullable: true,
            meaning: 'Its decisions, replacing all of them; null takes them away.',
          },
        }),
      },
    },
    example: {
      type: 'update-scenario',
      id: 'claim-audited',
      changes: { name: 'A claim is audited' },
    },
  },
  'delete-scenario': {
    meaning: 'Deletes a scenario.',
    fields: { id: ID_OF('The scenario.') },
    example: { type: 'delete-scenario', id: 'claim-audited' },
  },
  'update-project': {
    meaning: "Changes the project's name, description or the packages it uses.",
    fields: {
      changes: {
        type: 'object',
        kind: 'object',
        required: true,
        meaning: 'What changes; what it leaves out stays.',
        fields: fields<UpdateProjectCommand['changes']>({
          name: NAME_CHANGE,
          description: DESCRIPTION_CHANGE,
          packages: {
            type: 'Id[]',
            kind: 'list',
            items: 'text',
            meaning: 'The packages it uses, replacing the list.',
          },
        }),
      },
    },
    example: { type: 'update-project', changes: { name: 'Medical audit' } },
  },
  restack: {
    meaning: 'Changes the order in which a view draws shapes that sit together, as one action.',
    fields: {
      view: VIEW,
      moves: {
        type: '{ shape: { element: Id; container?: Id }; to: "front" | "back" | { inFrontOf: Id } | { behind: Id } }[]',
        kind: 'list',
        items: 'object',
        required: true,
        meaning: 'Each move, in order.',
      },
    },
    example: {
      type: 'restack',
      view: 'system-overview',
      moves: [{ shape: { element: 'orders-api', container: 'shop' }, to: 'front' }],
    },
  },
  'change-container': {
    meaning:
      'Puts elements inside a container in a view, or takes them out of theirs, as one action.',
    fields: {
      view: VIEW,
      to: {
        type: 'Id',
        kind: 'text',
        meaning: "The container they go into; left out, or World's id, World.",
      },
      relationType: {
        type: 'Id',
        kind: 'text',
        meaning:
          'The nesting relation type that puts them inside; left out, the one that placed them.',
      },
      shapes: {
        type: '{ element: Id; from?: Id; at?: { x: number; y: number; width?: number; height?: number }; pinned?: boolean }[]',
        kind: 'list',
        items: 'object',
        required: true,
        meaning: 'The shapes that move, each with the container it sits in now.',
      },
    },
    example: {
      type: 'change-container',
      view: 'system-overview',
      to: 'billing',
      shapes: [{ element: 'invoices', from: 'shop' }],
    },
  },
  'duplicate-elements': {
    meaning: 'Makes duplicates of elements in a view, with everything they hold (ADR 0103).',
    fields: {
      view: ID_OF(
        'The view they are duplicated in, whose nesting relation types say what sits where.',
      ),
      elements: {
        type: 'Id[]',
        kind: 'list',
        items: 'text',
        required: true,
        meaning: 'The elements to duplicate.',
      },
      container: {
        type: 'Id',
        kind: 'text',
        meaning: 'The container they land in; left out, World.',
      },
      beside: {
        type: 'boolean',
        kind: 'boolean',
        meaning: 'Whether each lands where its original sits.',
      },
      positions: {
        type: '{ element: Id; container?: Id; x: number; y: number }[]',
        kind: 'list',
        items: 'object',
        meaning: 'Where the shapes of the duplicates go, by the id of the element duplicated.',
      },
      suffix: {
        type: 'string',
        kind: 'text',
        meaning: 'What a duplicate beside its original adds to its name; " (copy)" by default.',
      },
    },
    example: {
      type: 'duplicate-elements',
      view: 'system-overview',
      elements: ['orders-api'],
      beside: true,
    },
  },
  'update-component': {
    meaning: "Changes a component of one of the project's own packages, trait by trait.",
    fields: {
      id: ID_OF('The component to change.'),
      changes: {
        type: 'object',
        kind: 'object',
        required: true,
        meaning: 'What changes; what it leaves out stays.',
        fields: fields<UpdateComponentCommand['changes']>({
          name: NAME_CHANGE,
          description: DESCRIPTION_CHANGE,
          derivesFrom: { type: 'Id', kind: 'text', meaning: 'The component it derives from.' },
          appearance: {
            type: 'AppearanceChanges',
            kind: 'object',
            meaning: 'Its appearance, trait by trait; null takes a trait out.',
          },
          attributes: ATTRIBUTE_CHANGES,
          openAttributes: {
            type: 'boolean | null',
            kind: 'boolean',
            nullable: true,
            meaning:
              'Whether its elements may carry attributes it does not define, on purpose; null inherits it again.',
          },
          ids: EXTERNAL_ID_CHANGES,
        }),
      },
    },
    example: {
      type: 'update-component',
      id: 'audit.claim',
      changes: {
        appearance: { fill: '#FFF4D6' },
        attributes: { set: [{ name: 'amount', type: 'number' }] },
      },
    },
  },
  'update-relation-type': {
    meaning: "Changes a relation type of one of the project's own packages, trait by trait.",
    fields: {
      id: ID_OF('The relation type to change.'),
      changes: {
        type: 'object',
        kind: 'object',
        required: true,
        meaning: 'What changes; what it leaves out stays.',
        fields: fields<UpdateRelationTypeCommand['changes']>({
          name: NAME_CHANGE,
          description: DESCRIPTION_CHANGE,
          derivesFrom: { type: 'Id', kind: 'text', meaning: 'The relation type it derives from.' },
          direction: {
            type: '"directed" | "undirected" | null',
            kind: 'text',
            nullable: true,
            meaning: 'Its direction; null inherits it again.',
          },
          nests: {
            type: 'boolean | null',
            kind: 'boolean',
            nullable: true,
            meaning: 'Whether it puts one element inside another; null inherits it again.',
          },
          appearance: {
            type: 'RelationAppearanceChanges',
            kind: 'object',
            meaning: 'How its relations are drawn, trait by trait; null takes a trait out.',
          },
          attributes: ATTRIBUTE_CHANGES,
          limits: {
            type: 'object',
            kind: 'object',
            meaning: 'The components each end may be, per end.',
            fields: fields<NonNullable<UpdateRelationTypeCommand['changes']['limits']>>({
              from: {
                type: 'Id[] | "any" | null',
                kind: 'any',
                nullable: true,
                meaning: 'What its from end may be: a list or "any"; null inherits it again.',
              },
              to: {
                type: 'Id[] | "any" | null',
                kind: 'any',
                nullable: true,
                meaning: 'What its to end may be: a list or "any"; null inherits it again.',
              },
            }),
          },
          ids: EXTERNAL_ID_CHANGES,
        }),
      },
    },
    example: {
      type: 'update-relation-type',
      id: 'audit.reviews',
      changes: { direction: 'directed' },
    },
  },
  'set-component-appearance': {
    meaning: 'Changes how every element of a component is drawn, built-in components included.',
    fields: {
      component: ID_OF('The component.'),
      appearance: {
        type: 'Appearance | null',
        kind: 'object',
        nullable: true,
        meaning: 'The appearance at that level, replaced whole; null removes it.',
      },
      appearanceTraits: {
        type: 'AppearanceChanges',
        kind: 'object',
        meaning: 'The appearance at that level, trait by trait; not with appearance.',
      },
    },
    example: {
      type: 'set-component-appearance',
      component: 'systems.database',
      appearanceTraits: { fill: '#E8F0FE' },
    },
  },
  'set-relation-type-appearance': {
    meaning: 'Changes how every relation of a relation type is drawn, built-in ones included.',
    fields: {
      relationType: ID_OF('The relation type.'),
      appearance: {
        type: 'RelationAppearance | null',
        kind: 'object',
        nullable: true,
        meaning: 'The appearance at that level, replaced whole; null removes it.',
      },
      appearanceTraits: {
        type: 'RelationAppearanceChanges',
        kind: 'object',
        meaning: 'The appearance at that level, trait by trait; not with appearance.',
      },
    },
    example: {
      type: 'set-relation-type-appearance',
      relationType: 'systems.communicates-with',
      appearanceTraits: { dash: 'dashed' },
    },
  },
  'update-package': {
    meaning: "Changes the properties of one of the project's own packages; null takes one out.",
    fields: {
      id: ID_OF('The package to change.'),
      changes: {
        type: 'object',
        kind: 'object',
        required: true,
        meaning: 'What changes; what it leaves out stays.',
        fields: fields<UpdatePackageCommand['changes']>({
          name: NAME_CHANGE,
          description: DESCRIPTION_CHANGE,
          version: { type: 'string | null', kind: 'text', nullable: true, meaning: 'Its version.' },
          license: {
            type: 'string | null',
            kind: 'text',
            nullable: true,
            meaning: 'Its license, as an SPDX identifier.',
          },
          attribution: {
            type: 'string | null',
            kind: 'text',
            nullable: true,
            meaning: 'Who made it, as its license asks.',
          },
        }),
      },
    },
    example: { type: 'update-package', id: 'audit', changes: { version: '1.1.0' } },
  },
  'add-package': {
    meaning: 'Adds a copy of a package from another project, keeping its ids, and starts using it.',
    fields: {
      package: {
        type: 'PackageFile',
        kind: 'object',
        required: true,
        meaning: 'The package, as its file holds it.',
      },
    },
    example: {
      type: 'add-package',
      package: { id: 'plaza', name: 'Plaza', components: [], relationTypes: [] },
    },
  },
  'replace-package': {
    meaning: "Updates one of the project's own packages to another version of it.",
    fields: {
      package: {
        type: 'PackageFile',
        kind: 'object',
        required: true,
        meaning: 'The package, as its file holds it.',
      },
    },
    example: {
      type: 'replace-package',
      package: { id: 'plaza', name: 'Plaza', components: [], relationTypes: [] },
    },
  },
  'reorder-elements': {
    meaning: "Moves elements in the model's order, which is the order of rows.",
    fields: {
      elements: {
        type: 'Id[]',
        kind: 'list',
        items: 'text',
        required: true,
        meaning: 'The elements to move, in order.',
      },
      before: {
        type: 'Id',
        kind: 'text',
        meaning: 'The element they go before; left out, they go last.',
      },
    },
    example: { type: 'reorder-elements', elements: ['customer-id'], before: 'customer-name' },
  },
  'set-poses': {
    meaning: 'Sets the poses of several elements in physical space as one action (ADR 0076).',
    fields: {
      poses: {
        type: '{ element: Id; pose: Pose | null }[]',
        kind: 'list',
        items: 'object',
        required: true,
        meaning: 'Each pose replaced whole; null takes the element out of physical space.',
      },
    },
    example: {
      type: 'set-poses',
      poses: [{ element: 'arm', pose: { at: { x: 0, y: 0, z: 0.5 } } }],
    },
  },
  'set-collapsed': {
    meaning: 'Collapses containers in a view, or expands them.',
    fields: {
      view: VIEW,
      elements: {
        type: 'Id[]',
        kind: 'list',
        items: 'text',
        required: true,
        meaning: 'The containers.',
      },
      collapsed: {
        type: 'boolean',
        kind: 'boolean',
        required: true,
        meaning: 'Whether they collapse.',
      },
    },
    example: {
      type: 'set-collapsed',
      view: 'system-overview',
      elements: ['shop'],
      collapsed: true,
    },
  },
  'set-scope': {
    meaning: 'Gives a view a scope, the part of the model it shows (ADR 0040), or takes it away.',
    fields: {
      view: VIEW,
      scope: {
        type: 'Scope | null',
        kind: 'object',
        required: true,
        nullable: true,
        meaning: 'Its rules (include, exclude), added and leftOut; null shows the whole model.',
      },
    },
    example: {
      type: 'set-scope',
      view: 'claims-flow',
      scope: { include: [{ kind: 'contents', container: 'audit-system' }] },
    },
  },
  'add-to-view': {
    meaning: "Shows elements in a view whatever its scope's rules say.",
    fields: { view: VIEW, elements: ELEMENTS_IN_VIEW },
    example: { type: 'add-to-view', view: 'claims-flow', elements: ['insurer'] },
  },
  'leave-out-of-view': {
    meaning: 'Leaves elements out of a view, never out of the model.',
    fields: { view: VIEW, elements: ELEMENTS_IN_VIEW },
    example: { type: 'leave-out-of-view', view: 'claims-flow', elements: ['printer'] },
  },
  'set-relation-types-left-out': {
    meaning: 'Sets the relation types whose relations a view does not draw, replacing its list.',
    fields: {
      view: VIEW,
      relationTypes: {
        type: '{ relationType: Id; exactly?: boolean }[]',
        kind: 'list',
        items: 'object',
        required: true,
        meaning: 'The relation types left out; an empty list draws them all again.',
      },
    },
    example: {
      type: 'set-relation-types-left-out',
      view: 'claims-flow',
      relationTypes: [{ relationType: 'systems.reads-from' }],
    },
  },
  'define-image': {
    meaning: "Defines an image in one of the project's own packages, or redefines one it has.",
    fields: {
      package: ID_OF('The package it goes in.'),
      image: {
        type: '{ id?: Id; name: string; source?: string; license?: string } & ({ svg: string } | { format: string; data: string })',
        kind: 'object',
        required: true,
        meaning: 'The image, as SVG text or as a bitmap in base64; the core cleans it.',
      },
      createOnly: CREATE_ONLY,
    },
    example: {
      type: 'define-image',
      package: 'audit',
      image: {
        name: 'Stamp',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>',
      },
    },
  },
  'remove-image': {
    meaning: 'Removes an image that no appearance shows.',
    fields: { id: ID_OF('The image.') },
    example: { type: 'remove-image', id: 'audit.stamp' },
  },
  'define-solid': {
    meaning: 'Defines a solid; only the local program sends it, for a file it cleaned (ADR 0075).',
    fields: {
      package: ID_OF('The package it goes in.'),
      solid: {
        type: 'SolidDefinition',
        kind: 'object',
        required: true,
        meaning: 'The solid as its package holds it.',
      },
      createOnly: CREATE_ONLY,
      fileName: {
        type: 'string',
        kind: 'text',
        meaning: "The file it came from, for the history's name.",
      },
    },
    example: {
      type: 'define-solid',
      package: 'robots',
      solid: {
        id: 'robots.arm',
        name: 'Arm',
        sha256: 'ab'.repeat(32),
        bytes: 1024,
        bounds: { min: [0, 0, 0], max: [1, 1, 1] },
        parts: [],
      } as never,
    },
  },
  'update-solid': {
    meaning:
      'Changes what a solid says about itself: its name, description, source, license and camera.',
    fields: {
      id: ID_OF('The solid to change.'),
      changes: {
        type: 'object',
        kind: 'object',
        required: true,
        meaning: 'What changes; what it leaves out stays.',
        fields: fields<UpdateSolidCommand['changes']>({
          name: NAME_CHANGE,
          description: DESCRIPTION_CHANGE,
          source: {
            type: 'string | null',
            kind: 'text',
            nullable: true,
            meaning: 'Where it came from.',
          },
          license: { type: 'string | null', kind: 'text', nullable: true, meaning: 'Its license.' },
          camera: {
            type: 'SolidCamera',
            kind: 'object',
            meaning: 'Where its shapes look at it from.',
          },
        }),
      },
    },
    example: { type: 'update-solid', id: 'robots.arm', changes: { name: 'Six-axis arm' } },
  },
  'remove-solid': {
    meaning: 'Removes a solid that no appearance shows; its file stays.',
    fields: { id: ID_OF('The solid.') },
    example: { type: 'remove-solid', id: 'robots.arm' },
  },
  // Explorables and script libraries (ADR 0107).
  'define-explorable': {
    meaning: 'Defines an explorable, a page that explains by play, with its text (ADR 0107).',
    fields: {
      package: ID_OF('The package it goes in, one of the project’s own.'),
      explorable: {
        type: 'object',
        kind: 'object',
        required: true,
        meaning: 'The explorable: its name, and what else it says.',
        fields: fields<DefineExplorableCommand['explorable']>({
          id: OWN_ID,
          name: { type: 'string', kind: 'text', required: true, meaning: 'Its name.' },
          description: NEW_DESCRIPTION,
          file: {
            type: 'string',
            kind: 'text',
            meaning:
              'Its file inside explorables/, such as quadratic.html; made from the name when left out.',
          },
          scriptLibraries: {
            type: 'Id[]',
            kind: 'list',
            items: 'text',
            meaning: 'The script libraries of its package it uses, inlined in this order.',
          },
          parameters: {
            type: 'ExplorableParameter[]',
            kind: 'list',
            items: 'object',
            meaning:
              'The values others choose: number, integer, boolean or choice, each with a default.',
          },
        }),
      },
      text: { type: 'string', kind: 'text', required: true, meaning: 'The page, at most 512 KiB.' },
    },
    example: {
      type: 'define-explorable',
      package: 'math',
      explorable: {
        name: 'Quadratic',
        parameters: [{ name: 'a', kind: 'number', min: -5, max: 5, default: 1 }],
      },
      text: '<!doctype html><p>y = ax²</p>',
    },
  },
  'write-explorable': {
    meaning: 'Writes an explorable’s text; undo gives the text before back.',
    fields: {
      id: ID_OF('The explorable.'),
      text: { type: 'string', kind: 'text', required: true, meaning: 'The page, at most 512 KiB.' },
    },
    example: { type: 'write-explorable', id: 'math.quadratic', text: '<!doctype html><p>y</p>' },
  },
  'record-explorable-file': {
    meaning:
      'Records an explorable’s file as changed outside the app; only the local program sends it.',
    fields: {
      id: ID_OF('The explorable.'),
      text: {
        type: 'string',
        kind: 'text',
        required: true,
        meaning: 'The file’s text, whole; the core works out its hash.',
      },
    },
    example: { type: 'record-explorable-file', id: 'math.quadratic', text: '<p>y</p>' },
  },
  'update-explorable': {
    meaning: 'Changes an explorable’s name, description, script libraries or parameters.',
    fields: {
      id: ID_OF('The explorable.'),
      changes: {
        type: 'object',
        kind: 'object',
        required: true,
        meaning: 'What changes; what it leaves out stays.',
        fields: fields<UpdateExplorableCommand['changes']>({
          name: NAME_CHANGE,
          description: DESCRIPTION_CHANGE,
          scriptLibraries: {
            type: 'Id[] | null',
            kind: 'list',
            items: 'text',
            nullable: true,
            meaning: 'The script libraries it uses, in order; null, none.',
          },
          parameters: {
            type: 'ExplorableParameter[] | null',
            kind: 'list',
            items: 'object',
            nullable: true,
            meaning:
              'Its parameters, all of them; null, none. A tour step setting one gone is broken.',
          },
        }),
      },
    },
    example: { type: 'update-explorable', id: 'math.quadratic', changes: { name: 'Parabola' } },
  },
  'remove-explorable': {
    meaning:
      'Removes an explorable nothing shows; tour steps naming it become broken; its file stays.',
    fields: { id: ID_OF('The explorable.') },
    example: { type: 'remove-explorable', id: 'math.quadratic' },
  },
  'define-script-library': {
    meaning: 'Defines a script library; only the local program sends it, for a file it fetched.',
    fields: {
      package: ID_OF('The package it goes in.'),
      library: {
        type: 'ScriptLibraryDefinition',
        kind: 'object',
        required: true,
        meaning: 'The script library as its package holds it.',
      },
    },
    example: {
      type: 'define-script-library',
      package: 'math',
      library: {
        id: 'math.d3',
        npm: 'd3',
        version: '7.9.0',
        tarball: 'https://registry.npmjs.org/d3/-/d3-7.9.0.tgz',
        integrity: `sha512-${'A'.repeat(86)}==`,
        path: 'dist/d3.min.js',
        license: 'ISC',
        global: 'd3',
        hash: 'ab'.repeat(32),
        bytes: 280000,
      },
    },
  },
  'remove-script-library': {
    meaning: 'Removes a script library no explorable uses; its file stays.',
    fields: { id: ID_OF('The script library.') },
    example: { type: 'remove-script-library', id: 'math.d3' },
  },
  'set-route': {
    meaning: 'Routes a relation by hand in a view (ADR 0039).',
    fields: {
      view: VIEW,
      relation: ID_OF('The relation.'),
      from: {
        type: 'EndAttachment | null',
        kind: 'object',
        nullable: true,
        meaning: 'Where the line attaches to its from end; null, automatically.',
      },
      to: {
        type: 'EndAttachment | null',
        kind: 'object',
        nullable: true,
        meaning: 'Where the line attaches to its to end; null, automatically.',
      },
      bendPoints: {
        type: '{ x: number; y: number }[] | null',
        kind: 'list',
        items: 'object',
        nullable: true,
        meaning: 'The points the line passes through, at most 64; null or [] removes them.',
      },
      container: {
        type: 'Id',
        kind: 'text',
        meaning: 'The container whose shape the bend points are relative to; World for the canvas.',
      },
      style: {
        type: '"orthogonal" | "straight" | "curved"',
        kind: 'text',
        meaning: 'How the line runs through its bend points.',
      },
    },
    example: {
      type: 'set-route',
      view: 'system-overview',
      relation: 'web-calls-api',
      bendPoints: [{ x: 300, y: 120 }],
    },
  },
  'reset-route': {
    meaning: 'Routes relations automatically again in a view.',
    fields: {
      view: VIEW,
      relations: {
        type: 'Id[]',
        kind: 'list',
        items: 'text',
        required: true,
        meaning: 'The relations.',
      },
    },
    example: { type: 'reset-route', view: 'system-overview', relations: ['web-calls-api'] },
  },
  'set-package-code': {
    meaning:
      "Writes the code of one of the project's own packages and what it may reach (ADR 0054).",
    fields: {
      package: ID_OF('The package.'),
      code: {
        type: 'string | string[] | null',
        kind: 'any',
        nullable: true,
        meaning: 'One JavaScript module, as text or lines; null removes it.',
      },
      capabilities: {
        type: 'string[] | null',
        kind: 'list',
        items: 'text',
        nullable: true,
        meaning: 'What the code may reach: model:read, time, network:<origin>; null removes them.',
      },
      extensions: {
        type: 'PackageExtensions | null',
        kind: 'object',
        nullable: true,
        meaning: 'Its actions, importers, exporters and panels (ADR 0089); null removes them.',
      },
    },
    example: {
      type: 'set-package-code',
      package: 'audit',
      code: 'export function computed() { return {}; }',
    },
  },
  'create-tour': {
    meaning: 'Creates a tour, with its steps or none yet (ADR 0058).',
    fields: {
      tour: {
        type: 'object',
        kind: 'object',
        required: true,
        meaning: 'The new tour.',
        fields: fields<CreateTourCommand['tour']>({
          id: OWN_ID,
          name: { type: 'string', kind: 'text', required: true, meaning: 'Its name.' },
          description: NEW_DESCRIPTION,
          steps: {
            type: 'TourStep[] (ids optional)',
            kind: 'list',
            items: 'object',
            meaning: 'Its steps in order.',
          },
          captionFace: {
            type: 'CaptionFace',
            kind: 'object',
            meaning: 'The look of its caption cards.',
          },
          emphasis: {
            type: '"halo" | "style"',
            kind: 'text',
            meaning: 'How its steps mark what they mark; left out, with a halo.',
          },
        }),
      },
    },
    example: { type: 'create-tour', tour: { name: 'How a claim is audited' } },
  },
  'update-tour': {
    meaning: 'Changes a tour; steps replaces all of them.',
    fields: {
      id: ID_OF('The tour to change.'),
      changes: {
        type: 'object',
        kind: 'object',
        required: true,
        meaning: 'What changes; what it leaves out stays.',
        fields: fields<UpdateTourCommand['changes']>({
          name: NAME_CHANGE,
          description: DESCRIPTION_CHANGE,
          steps: {
            type: 'TourStep[] (ids optional)',
            kind: 'list',
            items: 'object',
            meaning: 'Its steps, replacing all.',
          },
          captionFace: {
            type: 'CaptionFace | null',
            kind: 'object',
            nullable: true,
            meaning: 'The look of its caption cards; null takes it away.',
          },
          emphasis: {
            type: '"halo" | "style" | null',
            kind: 'text',
            nullable: true,
            meaning: 'How its steps mark what they mark; null, with a halo.',
          },
        }),
      },
    },
    example: { type: 'update-tour', id: 'claim-tour', changes: { emphasis: 'style' } },
  },
  'delete-tour': {
    meaning: 'Deletes a tour.',
    fields: { id: ID_OF('The tour.') },
    example: { type: 'delete-tour', id: 'claim-tour' },
  },
  'set-overlays': {
    meaning: "Replaces a view's overlays, in order (ADR 0055); an empty list takes them away.",
    fields: {
      view: VIEW,
      overlays: {
        type: 'Overlay[] (ids optional)',
        kind: 'list',
        items: 'object',
        required: true,
        meaning: 'The overlays, in order.',
      },
    },
    example: { type: 'set-overlays', view: 'system-overview', overlays: [] },
  },
  'set-drawing-defaults': {
    meaning: 'Sets the drawing defaults of the project, or of one view, whole (ADR 0086).',
    fields: {
      view: { type: 'Id', kind: 'text', meaning: "The view; left out, the project's." },
      drawing: {
        type: 'DrawingDefaults | null',
        kind: 'object',
        required: true,
        nullable: true,
        meaning:
          'The drawing defaults; null goes back to the preset, or for a view to the project.',
      },
    },
    example: { type: 'set-drawing-defaults', drawing: null },
  },
  'add-overlay': {
    meaning: 'Adds an overlay to a view: before another, or after the others.',
    fields: {
      view: VIEW,
      overlay: {
        type: 'Overlay (id optional)',
        kind: 'object',
        required: true,
        meaning: 'The overlay.',
      },
      before: OVERLAY_BEFORE,
    },
    example: {
      type: 'add-overlay',
      view: 'system-overview',
      overlay: {
        of: 'elements',
        attribute: 'status',
        channel: 'fill',
        mapping: { kind: 'discrete', cases: [{ value: 'down', color: '#D93025' }] },
      },
    },
  },
  'update-overlay': {
    meaning: 'Changes one overlay of a view, part by part.',
    fields: {
      view: VIEW,
      overlay: ID_OF('The overlay.'),
      changes: {
        type: 'object',
        kind: 'object',
        required: true,
        meaning: 'What changes; what it leaves out stays.',
        fields: fields<UpdateOverlayCommand['changes']>({
          name: {
            type: 'string | null',
            kind: 'text',
            nullable: true,
            meaning: 'Its name in the legend; null calls it by its attribute.',
          },
          of: {
            type: '"elements" | "relations"',
            kind: 'text',
            meaning: 'What it colors or sizes.',
          },
          attribute: { type: 'string', kind: 'text', meaning: 'The attribute it reads.' },
          channel: {
            type: '"fill" | "stroke" | "size" | "badge" | "opacity"',
            kind: 'text',
            meaning: 'What it sets; a new one takes a mapping that fits it.',
          },
          mapping: {
            type: 'OverlayMapping',
            kind: 'object',
            meaning: 'How values map to the channel.',
          },
          off: {
            type: 'boolean',
            kind: 'boolean',
            meaning: 'Turns it off, kept in the view, or on again.',
          },
        }),
      },
    },
    example: {
      type: 'update-overlay',
      view: 'system-overview',
      overlay: 'status-fill',
      changes: { off: true },
    },
  },
  'remove-overlays': {
    meaning: 'Removes overlays from a view.',
    fields: {
      view: VIEW,
      overlays: {
        type: 'Id[]',
        kind: 'list',
        items: 'text',
        required: true,
        meaning: 'The overlays.',
      },
    },
    example: { type: 'remove-overlays', view: 'system-overview', overlays: ['status-fill'] },
  },
  'move-overlay': {
    meaning: 'Moves an overlay of a view before another, or after the others.',
    fields: { view: VIEW, overlay: ID_OF('The overlay.'), before: OVERLAY_BEFORE },
    example: { type: 'move-overlay', view: 'system-overview', overlay: 'status-fill' },
  },
  'create-thread': {
    meaning:
      'Starts a thread of comments about an element, a relation, a view or a point of a view.',
    fields: {
      thread: {
        type: 'object',
        kind: 'object',
        required: true,
        meaning: 'The new thread.',
        fields: fields<CreateThreadCommand['thread']>({
          id: OWN_ID,
          anchor: {
            type: 'CommentAnchor',
            kind: 'object',
            required: true,
            meaning:
              'What it is about: { kind: "element", element }, a relation, a view or a point.',
          },
          comment: {
            type: 'object',
            kind: 'object',
            required: true,
            meaning: 'Its first comment.',
            fields: fields<NewComment>({
              id: OWN_ID,
              text: {
                type: 'string',
                kind: 'text',
                required: true,
                meaning: 'Plain text; @[id] mentions.',
              },
              author: COMMENT_AUTHOR,
            }),
          },
        }),
      },
    },
    example: {
      type: 'create-thread',
      thread: {
        anchor: { kind: 'element', element: 'orders-api' },
        comment: { text: 'Who owns this service?' },
      },
    },
  },
  'add-comment': {
    meaning: 'Adds a comment to a thread; a resolved thread opens again.',
    fields: {
      thread: ID_OF('The thread.'),
      comment: {
        type: 'object',
        kind: 'object',
        required: true,
        meaning: 'The comment.',
        fields: fields<NewComment>({
          id: OWN_ID,
          text: {
            type: 'string',
            kind: 'text',
            required: true,
            meaning: 'Plain text; @[id] mentions.',
          },
          author: COMMENT_AUTHOR,
        }),
      },
    },
    example: { type: 'add-comment', thread: 'thread-1', comment: { text: 'The Scheduling team.' } },
  },
  'edit-comment': {
    meaning: "Changes the text of one's own comment.",
    fields: {
      thread: ID_OF('The thread.'),
      comment: ID_OF('The comment.'),
      text: { type: 'string', kind: 'text', required: true, meaning: 'Its new text.' },
      author: COMMENT_AUTHOR,
    },
    example: {
      type: 'edit-comment',
      thread: 'thread-1',
      comment: 'comment-2',
      text: 'The Billing team.',
    },
  },
  'resolve-thread': {
    meaning: 'Resolves a thread, or opens it again.',
    fields: {
      thread: ID_OF('The thread.'),
      resolved: {
        type: 'boolean',
        kind: 'boolean',
        required: true,
        meaning: 'Whether it is resolved.',
      },
    },
    example: { type: 'resolve-thread', thread: 'thread-1', resolved: true },
  },
  'delete-thread': {
    meaning: 'Deletes a thread with all its comments.',
    fields: { thread: ID_OF('The thread.') },
    example: { type: 'delete-thread', thread: 'thread-1' },
  },
  'resolve-conflicts': {
    meaning: 'Resolves conflicts a merge left in one file (ADR 0072).',
    fields: {
      file: {
        type: '{ kind: "project" } | { kind: "model" } | { kind: "package" | "view" | "scenario" | "tour" | "comment"; id: Id }',
        kind: 'object',
        required: true,
        meaning: 'The file the conflicts are in.',
      },
      resolutions: {
        type: '{ conflict: Id; take: "kept" | "other" }[]',
        kind: 'list',
        items: 'object',
        required: true,
        meaning: 'Each conflict kept as the file holds it, or its other choice taken.',
      },
    },
    example: {
      type: 'resolve-conflicts',
      file: { kind: 'model' },
      resolutions: [{ conflict: 'conflict-1', take: 'kept' }],
    },
  },
  batch: {
    meaning: 'Several commands done as one action and undone together.',
    fields: {
      label: {
        type: 'string',
        kind: 'text',
        required: true,
        meaning: 'How the history names the action.',
      },
      commands: {
        type: 'Command[]',
        kind: 'list',
        items: 'object',
        required: true,
        meaning: 'The commands, in order.',
      },
    },
    example: {
      type: 'batch',
      label: 'Rename the API',
      commands: [{ type: 'update-element', id: 'api', changes: { name: 'Orders API' } }],
    },
  },
};

// The check ---------------------------------------------------------------------------------------------

/** The shape of a command type, or undefined for a type that is none. */
export function commandShapeOf(type: string): CommandShape | undefined {
  return Object.hasOwn(COMMAND_SHAPES, type) ? COMMAND_SHAPES[type as CommandType] : undefined;
}

/**
 * What is wrong with the shape of a command: each key it does not take, at its level or in an object
 * whose keys the core reads, each field it needs and leaves out, and each value of the wrong kind. A
 * key whose value is `undefined` counts as left out, as JSON leaves it. None for a command whose type
 * is no command's, which the core refuses as such.
 */
export function commandShapeProblems(command: unknown): Problem[] {
  if (typeof command !== 'object' || command === null) return [];
  const type = (command as { type?: unknown }).type;
  if (typeof type !== 'string') return [];
  const shape = commandShapeOf(type);
  if (shape === undefined) return [];
  const problems: Problem[] = [];
  checkObject(type, shape, shape.fields, command as Record<string, unknown>, '', problems);
  return problems;
}

function checkObject(
  type: string,
  shape: CommandShape,
  fields: FieldShapes,
  value: Record<string, unknown>,
  at: string,
  problems: Problem[],
): void {
  for (const [key, held] of Object.entries(value)) {
    if (held === undefined || Object.hasOwn(fields, key) || (at === '' && key === 'type')) continue;
    problems.push(problem('invalid-command', unknownKey(type, shape, fields, key, at)));
  }
  for (const [name, field] of Object.entries(fields)) {
    const held = value[name];
    const path = `${at}${name}`;
    if (held === undefined) {
      if (field.required) problems.push(problem('invalid-command', `${type} needs "${path}".`));
      continue;
    }
    const wrong = wrongKind(type, field, held, path);
    if (wrong !== undefined) {
      problems.push(problem('invalid-command', wrong));
      continue;
    }
    if (field.items !== undefined && Array.isArray(held)) {
      const kind = field.items;
      const wrongAt = held.findIndex((item) => !isOfKind(kind, item));
      if (wrongAt >= 0) {
        const item: unknown = held[wrongAt];
        problems.push(
          problem(
            'invalid-command',
            `${type} takes "${path}[${wrongAt}]" as ${KIND_WORDS[kind][0]}, not ${shown(item)}.`,
          ),
        );
      }
    }
    if (field.fields && isObject(held)) {
      checkObject(type, shape, field.fields, held, `${path}.`, problems);
    }
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The refusal of a key a command does not take, with where it goes when that is known. */
function unknownKey(
  type: string,
  shape: CommandShape,
  fields: FieldShapes,
  key: string,
  at: string,
): string {
  const keys = Object.keys(fields).join(', ');
  const parent = at.slice(0, -1);
  const said =
    at === ''
      ? `${type} does not take "${key}": it takes ${keys}.`
      : `${type} does not take "${at}${key}": "${parent}" takes ${keys}.`;
  // Only the hints the table gives: a key such as "constructor" names nothing of its own.
  const own =
    shape.hints !== undefined && Object.hasOwn(shape.hints, `${at}${key}`)
      ? shape.hints[`${at}${key}`]
      : undefined;
  const hint = own ?? whereItGoes(shape, key, at);
  return hint === undefined ? said : `${said} ${hint}`;
}

/** Where a key given at the wrong level goes: into an object of the command, or beside it. */
function whereItGoes(shape: CommandShape, key: string, at: string): string | undefined {
  if (at === '') {
    const into = Object.entries(shape.fields).find(
      ([, field]) => field.fields !== undefined && Object.hasOwn(field.fields, key),
    );
    return into === undefined ? undefined : `"${key}" goes in "${into[0]}".`;
  }
  return Object.hasOwn(shape.fields, key) && key !== at.slice(0, -1)
    ? `"${key}" goes at the command's level.`
    : undefined;
}

/** What a value of the wrong kind is refused with; undefined when it is of the field's kind. */
function wrongKind(
  type: string,
  field: FieldShape,
  value: unknown,
  path: string,
): string | undefined {
  if (value === null ? field.nullable : isOfKind(field.kind, value)) return undefined;
  // A field of several kinds that takes no null needs a value of one of them.
  if (field.kind === 'any') return `${type} needs "${path}".`;
  const words = KIND_WORDS[field.kind][field.nullable ? 1 : 0];
  return `${type} takes "${path}" as ${words}, not ${shown(value)}.`;
}

/** How a refusal names each kind of value, and the kind or null. */
const KIND_WORDS: Record<Exclude<FieldKind, 'any'>, readonly [string, string]> = {
  text: ['text', 'text or null'],
  number: ['a number', 'a number or null'],
  boolean: ['true or false', 'true, false or null'],
  list: ['a list', 'a list or null'],
  object: ['an object', 'an object or null'],
};

function isOfKind(kind: FieldKind, value: unknown): boolean {
  switch (kind) {
    case 'text':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'list':
      return Array.isArray(value);
    case 'object':
      return isObject(value);
    case 'any':
      return true;
  }
}

/** A value as a refusal shows it: its JSON, cut short. */
function shown(value: unknown): string {
  const json = JSON.stringify(value) ?? String(value);
  return json.length > 40 ? `${json.slice(0, 39)}…` : json;
}

// What describe_command answers -------------------------------------------------------------------------

/** A field as `describe_command` answers it. */
export interface FieldDescription {
  name: string;
  type: string;
  required: boolean;
  meaning: string;
  /** The keys the object it holds takes; any other is refused. */
  fields?: FieldDescription[];
}

/** A command as `describe_command` answers it. */
export interface CommandDescription {
  type: CommandType;
  meaning: string;
  fields: FieldDescription[];
  example: Command;
}

/** Every command type, with what it does, in order. */
export function listCommands(): { type: CommandType; meaning: string }[] {
  return (Object.keys(COMMAND_SHAPES) as CommandType[]).map((type) => ({
    type,
    meaning: COMMAND_SHAPES[type].meaning,
  }));
}

/** A command's fields, which it needs, what each means, and an example; undefined for no command. */
export function describeCommand(type: string): CommandDescription | undefined {
  const shape = commandShapeOf(type);
  if (shape === undefined) return undefined;
  return {
    type: type as CommandType,
    meaning: shape.meaning,
    fields: describeFields(shape.fields),
    example: shape.example,
  };
}

function describeFields(fields: FieldShapes): FieldDescription[] {
  return Object.entries(fields).map(([name, field]) => ({
    name,
    type: field.type,
    required: field.required === true,
    meaning: field.meaning,
    ...(field.fields === undefined ? {} : { fields: describeFields(field.fields) }),
  }));
}
