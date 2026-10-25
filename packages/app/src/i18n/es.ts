/**
 * The Spanish catalog (ADR-0038): neutral Latin American Spanish, in the impersonal style of most
 * apps ("Agregar elemento…", "Deshacer"), never addressing the person as "tú" or "vos" where a verb in
 * the infinitive does. Every key is the exact English the code writes; a text with no entry shows in
 * English. The repository is in English: this is the only file that holds Spanish.
 *
 * The domain's terms (CONTEXT.md) are translated the same way everywhere:
 *
 * | English                 | Spanish                          |
 * | ----------------------- | -------------------------------- |
 * | project                 | proyecto                         |
 * | model                   | modelo                           |
 * | World                   | Mundo                            |
 * | element                 | elemento                         |
 * | particularity           | particularidad                   |
 * | relation                | relación                         |
 * | relation type           | tipo de relación                 |
 * | relates to              | se relaciona con                 |
 * | nesting relation type   | tipo de relación que anida       |
 * | nest                    | anidar                           |
 * | container               | contenedor                       |
 * | contents                | contenido                        |
 * | attribute               | atributo                         |
 * | canvas                  | lienzo                           |
 * | shape                   | forma                            |
 * | anchored shape          | forma anclada                    |
 * | free shape              | forma libre                      |
 * | note                    | nota                             |
 * | arrow                   | flecha                           |
 * | pinned shape            | forma fijada                     |
 * | row                     | fila                             |
 * | detail                  | detalle                          |
 * | badge                   | insignia                         |
 * | stacking order          | orden de apilado                 |
 * | outline                 | esquema                          |
 * | aggregated relation     | relación agregada                |
 * | view                    | vista                            |
 * | perspective             | perspectiva                      |
 * | component               | componente                       |
 * | component palette       | paleta de componentes            |
 * | appearance              | apariencia                       |
 * | connection point        | punto de conexión                |
 * | component editor        | editor de componentes            |
 * | Essence                 | Esencia                          |
 * | package                 | paquete                          |
 * | built-in package        | paquete incorporado              |
 * | image                   | imagen                           |
 * | explore                 | explorar                         |
 * | filter                  | filtro, filtrar                  |
 * | focus                   | foco, enfocar                    |
 * | isolate                 | aislar                           |
 * | play                    | reproducir                       |
 * | scenario                | escenario                        |
 * | step                    | paso                             |
 * | aggregated step         | paso agregado                    |
 * | broken step             | paso roto                        |
 * | travelling marker       | marcador en movimiento           |
 * | record                  | grabar                           |
 * | guidance                | guía                             |
 * | caption                 | leyenda                          |
 * | preference              | preferencia                      |
 * | theme                   | tema                             |
 * | launch address          | dirección de inicio              |
 * | undo, redo              | deshacer, rehacer                |
 * | the local program       | el programa local                |
 *
 * Element, relation, view and scenario names are what people wrote and are never translated; they
 * keep their quotes as the English has them.
 */
import type { Catalog } from './translate';

/** The app's own texts, keyed by the exact English given to `t()`. */
export const ui: Catalog = {
  Undo: 'Deshacer',
  Redo: 'Rehacer',
  '{count} steps': { one: '{count} paso', other: '{count} pasos' },
  'Could not undo: {why}': 'No se pudo deshacer: {why}',
  'Could not redo: {why}': 'No se pudo rehacer: {why}',
};

/**
 * Templates of the messages the core and the local program write: the undo history's labels, the
 * reasons a change is refused and the warnings about a project. The braces stand for what the message
 * holds there; see `translateMessage`.
 */
export const messages: Catalog = {
  '"{name}"': '"{name}"',
  'the component "{name}"': 'el componente "{name}"',
  'Rename "{old}" to "{new}"': 'Cambiar el nombre de "{old}" a "{new}"',
  'There is nothing to undo.': 'No hay nada que deshacer.',
  'There is nothing to redo.': 'No hay nada que rehacer.',
  'There is no element "{id}".': 'No hay ningún elemento "{id}".',
  'There is no relation "{id}".': 'No hay ninguna relación "{id}".',
  'World cannot be deleted.': 'Mundo no se puede eliminar.',
  'The fill of {of} must be a color written as #rrggbb.':
    'El relleno de {of} debe ser un color escrito como #rrggbb.',
};

/** The built-in packages, components and relation types, by id. */
export const builtins: Readonly<Record<string, { name: string; description?: string }>> = {
  essence: {
    name: 'Esencia',
    description: 'El componente del que derivan, en última instancia, todos los demás.',
  },
  'relates-to': {
    name: 'se relaciona con',
    description: 'El tipo de relación del que derivan, en última instancia, todos los demás.',
  },
  systems: {
    name: 'Sistemas',
    description:
      'Personas, sistemas, servicios y almacenes de datos, y cómo se comunican, leen, escriben y anidan.',
  },
  'systems.box': {
    name: 'Caja',
    description: 'Cualquier parte de un sistema que no tiene un componente más específico.',
  },
  'systems.system': {
    name: 'Sistema',
    description: 'Un conjunto de servicios y almacenes de datos que funcionan juntos.',
  },
  'systems.service': {
    name: 'Servicio',
    description: 'Un programa en ejecución al que otros llaman.',
  },
  'systems.chat-channel': {
    name: 'Canal de chat',
    description:
      'Un servicio a través del cual las personas hablan con un sistema, como WhatsApp o Slack.',
  },
  'systems.ai-agent': {
    name: 'Agente de IA',
    description: 'Un servicio que razona con un modelo de lenguaje y llama a otros servicios.',
  },
  'systems.mcp-server': {
    name: 'Servidor MCP',
    description:
      'Un servicio que da herramientas y datos a los agentes de IA mediante el Model Context Protocol.',
  },
  'systems.semantic-layer': {
    name: 'Capa semántica',
    description:
      'Un servicio que define las métricas del negocio una sola vez y responde consultas en esos términos.',
  },
  'systems.database': {
    name: 'Base de datos',
    description: 'Un almacén de datos estructurados.',
  },
  'systems.object-storage': {
    name: 'Almacenamiento de objetos',
    description: 'Un almacén de archivos y blobs, como los buckets de S3.',
  },
  'systems.person': {
    name: 'Persona',
    description: 'Alguien que usa o administra un sistema.',
  },
  'systems.communicates-with': {
    name: 'se comunica con',
    description: 'Envía solicitudes o mensajes a otro elemento.',
  },
  'systems.reads-from': {
    name: 'lee de',
    description: 'Lee datos que otro elemento almacena.',
  },
  'systems.queries': {
    name: 'consulta',
    description: 'Pide datos a una base de datos o a una capa semántica con una consulta.',
  },
  'systems.writes-to': {
    name: 'escribe en',
    description: 'Cambia datos que otro elemento almacena.',
  },
  'systems.loads-into': {
    name: 'carga en',
    description:
      'Mueve datos en bloque a otro almacén, como lo hace una canalización o una importación.',
  },
  'systems.is-part-of': {
    name: 'es parte de',
    description: 'Ubica un elemento dentro de otro.',
  },
  'data-modeling': {
    name: 'Modelado de datos',
    description: 'Tablas y sus columnas, y las referencias entre columnas.',
  },
  'data-modeling.table': {
    name: 'Tabla',
    description: 'Una tabla de una base de datos. Dibuja sus columnas como sus filas.',
  },
  'data-modeling.column': {
    name: 'Columna',
    description: 'Una columna de una tabla.',
  },
  'data-modeling.is-column-of': {
    name: 'es columna de',
    description: 'Ubica una columna en su tabla.',
  },
  'data-modeling.references': {
    name: 'referencia',
    description:
      'Una clave foránea: los valores de este extremo son valores del otro extremo, por lo general una clave primaria.',
  },
};
