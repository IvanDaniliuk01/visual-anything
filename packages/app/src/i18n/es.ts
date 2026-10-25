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
  // Words many screens use.
  Cancel: 'Cancelar',
  Create: 'Crear',
  Delete: 'Eliminar',
  Description: 'Descripción',
  Name: 'Nombre',
  Perspective: 'Perspectiva',
  Rename: 'Cambiar nombre',
  Close: 'Cerrar',
  World: 'Mundo',
  Note: 'Nota',
  Arrow: 'Flecha',
  '{count} elements': { one: '{count} elemento', other: '{count} elementos' },
  '{count} relations': { one: '{count} relación', other: '{count} relaciones' },
  '{count} free shapes': { one: '{count} forma libre', other: '{count} formas libres' },
  '{count} steps': { one: '{count} paso', other: '{count} pasos' },
  '{first} and {last}': '{first} y {last}',

  // The app, while it connects and when it cannot.
  'Connecting to Visual Anything…': 'Conectando con Visual Anything…',
  'Waiting for the local program to send the project.':
    'Esperando a que el programa local envíe el proyecto.',
  'Press o in the terminal where Visual Anything runs to open a new tab, or start Visual Anything again.':
    'Presionar o en la terminal donde se ejecuta Visual Anything para abrir una pestaña nueva, o iniciar Visual Anything de nuevo.',
  'The connection to Visual Anything closed, so what you see may be out of date. Press o in the terminal where Visual Anything runs to open a new tab, or start Visual Anything again.':
    'Se cerró la conexión con Visual Anything, así que lo que se ve puede estar desactualizado. Presionar o en la terminal donde se ejecuta Visual Anything para abrir una pestaña nueva, o iniciar Visual Anything de nuevo.',
  'This tab has no session token': 'Esta pestaña no tiene token de sesión',
  'Visual Anything connects only to a tab it opened, through an address that works once.':
    'Visual Anything solo se conecta con una pestaña que abrió, mediante una dirección que funciona una sola vez.',
  'Visual Anything refused the connection': 'Visual Anything rechazó la conexión',
  'It may not be running, this tab may hold the token of an earlier session, or its address was already used: an address works once, within two minutes.':
    'Puede que no se esté ejecutando, que esta pestaña tenga el token de una sesión anterior o que su dirección ya se haya usado: una dirección funciona una sola vez, dentro de los dos minutos.',
  'Visual Anything sent something this app cannot read':
    'Visual Anything envió algo que esta app no puede leer',
  'The app and the local program may come from different versions. Restart Visual Anything: it opens a new tab.':
    'Puede que la app y el programa local sean de versiones distintas. Reiniciar Visual Anything: abre una pestaña nueva.',
  'Visual Anything could not show this project': 'Visual Anything no pudo mostrar este proyecto',
  'Check the project’s files, then restart Visual Anything and open the address it prints.':
    'Revisar los archivos del proyecto, luego reiniciar Visual Anything y abrir la dirección que muestra.',

  // The live connection's notices.
  'Visual Anything is not connected, so nothing was changed.':
    'Visual Anything no está conectado, así que no se cambió nada.',
  'The connection to Visual Anything closed before it answered.':
    'La conexión con Visual Anything se cerró antes de que respondiera.',
  'This tab’s copy of the project fell out of step with Visual Anything, so it is getting the project again.':
    'La copia del proyecto de esta pestaña se desfasó con Visual Anything, así que está obteniendo el proyecto de nuevo.',
  'Visual Anything sent a change before the project.':
    'Visual Anything envió un cambio antes del proyecto.',
  'Could not undo.': 'No se pudo deshacer.',
  'Could not redo.': 'No se pudo rehacer.',
  'Warning:': 'Advertencia:',
  Dismiss: 'Descartar',

  // The header.
  Project: 'Proyecto',
  View: 'Vista',
  Undo: 'Deshacer',
  Redo: 'Rehacer',
  'Undo: {action}': 'Deshacer: {action}',
  'Redo: {action}': 'Rehacer: {action}',
  'Undo Claude’s action: {action}': 'Deshacer la acción de Claude: {action}',
  'Redo Claude’s action: {action}': 'Rehacer la acción de Claude: {action}',
  'Nothing to undo': 'Nada que deshacer',
  'Nothing to redo': 'Nada que rehacer',
  'Undo history': 'Historial para deshacer',
  'Visual Anything is not connected': 'Visual Anything no está conectado',
  Language: 'Idioma',
  'Match the browser ({language})': 'Usar el idioma del navegador ({language})',
  'Your language applies to this tab only: Visual Anything is not connected.':
    'El idioma se aplica solo a esta pestaña: Visual Anything no está conectado.',
  Theme: 'Tema',
  'Match the system': 'Usar el tema del sistema',
  'Match the system (light now)': 'Usar el tema del sistema (ahora claro)',
  'Match the system (dark now)': 'Usar el tema del sistema (ahora oscuro)',
  Light: 'Claro',
  Dark: 'Oscuro',
  'Your theme applies to this tab only: Visual Anything is not connected.':
    'El tema se aplica solo a esta pestaña: Visual Anything no está conectado.',

  // The shell and the canvas's text alternative.
  Canvas: 'Lienzo',
  'There is no view to draw.': 'No hay ninguna vista para dibujar.',
  '{count} element shapes': {
    one: '{count} forma de elemento',
    other: '{count} formas de elementos',
  },
  '{view}, from the {perspective} perspective: {shapes}, {relations} and {free}.':
    '{view}, desde la perspectiva {perspective}: {shapes}, {relations} y {free}.',

  // The Model tab.
  'World holds no elements yet.': 'Mundo todavía no contiene elementos.',
  Views: 'Vistas',
  Scenarios: 'Escenarios',
  '{count} steps over {view}': {
    one: '{count} paso sobre {view}',
    other: '{count} pasos sobre {view}',
  },
  'This project has no scenarios yet.': 'Este proyecto todavía no tiene escenarios.',

  // The views.
  'This project has no views yet.': 'Este proyecto todavía no tiene vistas.',
  'New view…': 'Nueva vista…',
  'New view': 'Nueva vista',
  'This view is open on the canvas': 'Esta vista está abierta en el lienzo',
  'Open "{name}" on the canvas': 'Abrir "{name}" en el lienzo',
  // A badge: the view is open.
  Open: 'Abierta',
  'Settings of "{name}"': 'Ajustes de "{name}"',
  Settings: 'Ajustes',
  'A view needs a name.': 'Una vista necesita un nombre.',
  'A perspective needs a name, such as Security.':
    'Una perspectiva necesita un nombre, como Seguridad.',
  'What the perspective looks at': 'Lo que mira la perspectiva',
  'Nesting relation types': 'Tipos de relación que anidan',
  'The relation types whose relations put shapes inside containers in this view.':
    'Los tipos de relación cuyas relaciones ubican formas dentro de contenedores en esta vista.',
  'The packages in use define no relation type that nests.':
    'Los paquetes en uso no definen ningún tipo de relación que anide.',
  '{names} play over this view, so it cannot be deleted.': {
    one: '{names} se reproduce sobre esta vista, así que no se puede eliminar.',
    other: '{names} se reproducen sobre esta vista, así que no se puede eliminar.',
  },
  'Delete "{name}"?': '¿Eliminar "{name}"?',
  'Delete "{name}"? Its positions, stacking order and free shapes go with it; the model stays as it is. Undo brings it back.':
    '¿Eliminar "{name}"? Sus posiciones, su orden de apilado y sus formas libres se van con ella; el modelo queda como está. Deshacer la recupera.',
  'Keep it': 'Conservar',
  'Delete view…': 'Eliminar vista…',
  'Give the view a name.': 'La vista necesita un nombre.',
  'Name the perspective it is seen from, such as Security or Ownership.':
    'Nombrar la perspectiva desde la que se ve, como Seguridad o Propiedad.',
  'Security overview': 'Resumen de seguridad',
  Security: 'Seguridad',
  'Every relation type that nests arranges it at first; its settings change that.':
    'Al principio la organizan todos los tipos de relación que anidan; sus ajustes lo cambian.',

  // The outline.
  'There is no view to outline.': 'No hay ninguna vista para mostrar en el esquema.',
  'This view has no shapes yet.': 'Esta vista todavía no tiene formas.',
  Outline: 'Esquema',
  'Outline of {view}': 'Esquema de {view}',
  '{component}, collapsed: {count} inside': '{component}, contraído: {count} dentro',
  'an aggregated relation': 'una relación agregada',
  '{count} relations "{type}" from {from} to {to}, aggregated': {
    one: '{count} relación "{type}" de {from} a {to}, agregada',
    other: '{count} relaciones "{type}" de {from} a {to}, agregadas',
  },

  // What the canvas says about what it selected.
  'in {container} and {others}': 'en {container} y {others}',
  'in {container}': 'en {container}',
  '{count} other containers': { one: '{count} contenedor más', other: '{count} contenedores más' },
  'no relations': 'ninguna relación',
  'A relation that no longer exists.': 'Una relación que ya no existe.',
  ', ending on {end}': ', que termina en {end}',
  ', relation {position} of {count} of {element}': ', relación {position} de {count} de {element}',
  'Nothing is selected.': 'No hay nada seleccionado.',
  '1 element selected.': '1 elemento seleccionado.',
  'Note: {text}': 'Nota: {text}',
  'Arrow.': 'Flecha.',
  '{things} selected.': 'Selección: {things}.',

  // The scenario panel.
  'New scenario': 'Nuevo escenario',
  'New scenario {count}': 'Nuevo escenario {count}',
  'Scenarios of the project': 'Escenarios del proyecto',
  'This project has no scenarios yet. Create one, then click relations on the canvas in the order they happen.':
    'Este proyecto todavía no tiene escenarios. Crear uno y luego hacer clic en las relaciones del lienzo en el orden en que ocurren.',
  'Open a view to create a scenario over it.':
    'Abrir una vista para crear un escenario sobre ella.',
  'Name of the new scenario over “{view}”': 'Nombre del nuevo escenario sobre “{view}”',
  'Create and record': 'Crear y grabar',
  'Renamed to “{name}”.': 'Nombre cambiado a “{name}”.',
  'Deleted “{name}”.': 'Se eliminó “{name}”.',
  'Name of the scenario': 'Nombre del escenario',
  'Delete the scenario?': '¿Eliminar el escenario?',
  'Delete “{name}” and its {count} steps? You can undo it.': {
    one: '¿Eliminar “{name}” y su paso? Se puede deshacer.',
    other: '¿Eliminar “{name}” y sus {count} pasos? Se puede deshacer.',
  },
  'Delete scenario': 'Eliminar escenario',
  'It plays over “{view}”.': 'Se reproduce sobre “{view}”.',
  'Open “{view}”': 'Abrir “{view}”',
  Playback: 'Reproducción',
  Previous: 'Anterior',
  Pause: 'Pausa',
  'Play again': 'Reproducir de nuevo',
  Play: 'Reproducir',
  Next: 'Siguiente',
  Speed: 'Velocidad',
  'Stop recording': 'Detener la grabación',
  Record: 'Grabar',
  'Recording waits until the scenario’s view is open and Visual Anything is connected.':
    'La grabación espera a que la vista del escenario esté abierta y Visual Anything esté conectado.',
  'Click relations on the canvas in the order they happen: each click adds a step after the start. Shift+click adds a relation to that step. From the keyboard, ] and [ select a relation, Enter records it and follows it, and Shift+Enter adds it to the step.':
    'Hacer clic en las relaciones del lienzo en el orden en que ocurren: cada clic agrega un paso después del inicio. Mayús+clic agrega una relación a ese paso. Con el teclado, ] y [ seleccionan una relación, Enter la graba y la sigue, y Mayús+Enter la agrega al paso.',
  'Click relations on the canvas in the order they happen: each click adds a step after step {n}. Shift+click adds a relation to that step. From the keyboard, ] and [ select a relation, Enter records it and follows it, and Shift+Enter adds it to the step.':
    'Hacer clic en las relaciones del lienzo en el orden en que ocurren: cada clic agrega un paso después del paso {n}. Mayús+clic agrega una relación a ese paso. Con el teclado, ] y [ seleccionan una relación, Enter la graba y la sigue, y Mayús+Enter la agrega al paso.',
  'No steps yet': 'Todavía no hay pasos',
  'Step {n} of {total}': 'Paso {n} de {total}',
  'Steps {first}–{last} of {total}': 'Pasos {first}–{last} de {total}',
  'No steps yet. Turn on Record, then click relations on the canvas in order.':
    'Todavía no hay pasos. Activar Grabar y luego hacer clic en las relaciones del lienzo en orden.',
  Steps: 'Pasos',
  '{count} steps inside “{container}”': {
    one: '{count} paso dentro de “{container}”',
    other: '{count} pasos dentro de “{container}”',
  },
  'No description yet': 'Todavía no tiene descripción',

  // Recording, and what it says.
  'Recording: click relations in order. Shift+click adds one to the same step.':
    'Grabando: hacer clic en las relaciones en orden. Mayús+clic agrega una al mismo paso.',
  'That line stands for several relations, so nothing was recorded. Expand the container to record one of them.':
    'Esa línea representa varias relaciones, así que no se grabó nada. Expandir el contenedor para grabar una de ellas.',
  'Step {n} activates only this relation, so it stays in it. To take the step out, delete it.':
    'El paso {n} activa solo esta relación, así que se queda en él. Para quitar el paso, eliminarlo.',
  'Recorded step {n}: {sentence}.': 'Paso {n} grabado: {sentence}.',
  'Added to step {n}, at the same time: {sentence}.':
    'Agregada al paso {n}, al mismo tiempo: {sentence}.',
  'Taken out of step {n}: {sentence}.': 'Sacada del paso {n}: {sentence}.',

  // The step panel.
  'These {count} steps happen inside “{container}”, which is collapsed in this view.': {
    one: 'Este paso ocurre dentro de “{container}”, que está contraído en esta vista.',
    other: 'Estos {count} pasos ocurren dentro de “{container}”, que está contraído en esta vista.',
  },
  'No description yet.': 'Todavía no tiene descripción.',
  'Expanded “{container}”.': 'Se expandió “{container}”.',
  'Expand “{container}”': 'Expandir “{container}”',
  'Show on the canvas': 'Mostrar en el lienzo',
  Relation: 'Relación',
  'Relations, at once': 'Relaciones, a la vez',
  'Taken out of step {n}.': 'Sacada del paso {n}.',
  'Take out': 'Sacar',
  Broken: 'Roto',
  'A relation this step used no longer exists ({relation}).':
    'Una relación que usaba este paso ya no existe ({relation}).',
  'This is a broken step: the relation above was deleted.':
    'Este es un paso roto: se eliminó la relación de arriba.',
  'This is a broken step: {count} of its relations were deleted.':
    'Este es un paso roto: se eliminaron {count} de sus relaciones.',
  'Select the relation that replaces it on the canvas, or take out what is gone.':
    'Seleccionar en el lienzo la relación que la reemplaza, o sacar lo que ya no está.',
  'Select one relation on the canvas first.': 'Primero seleccionar una relación en el lienzo.',
  'Step {n} is fixed.': 'El paso {n} quedó arreglado.',
  'Use the selected relation': 'Usar la relación seleccionada',
  'Take out what is gone': 'Sacar lo que ya no está',
  'Data in (JSON)': 'Datos de entrada (JSON)',
  'Data out (JSON)': 'Datos de salida (JSON)',
  'Step {n} is now step {to}.': 'El paso {n} ahora es el paso {to}.',
  'Move up': 'Subir',
  'Move down': 'Bajar',
  'Step {n} is deleted.': 'Se eliminó el paso {n}.',
  'Delete step': 'Eliminar paso',
  'Enter saves a field; Shift+Enter starts a new line. Leave data blank for none.':
    'Enter guarda un campo; Mayús+Enter empieza una línea nueva. Dejar los datos en blanco para no tener ninguno.',

  // Claude's guidance.
  'Claude’s guidance': 'Guía de Claude',
  'Dismiss Claude’s guidance': 'Descartar la guía de Claude',
  '{first} and {count} more': '{first} y {count} más',
  'Claude highlights {list}.': 'Claude resalta {list}.',
  'Claude focuses on {list}.': 'Claude se enfoca en {list}.',
  '{from} to {to}': '{from} a {to}',

  // Exploring: the perspective switcher, the filters and focus.
  Explore: 'Explorar',
  Exploring: 'Explorando',
  'Show everything': 'Mostrar todo',
  'The open view’s perspective. Choose another view to see the same model from its perspective.':
    'La perspectiva de la vista abierta. Elegir otra vista para ver el mismo modelo desde su perspectiva.',
  'Hide shapes by component, relation type or attribute; nothing moves':
    'Ocultar formas por componente, tipo de relación o atributo; nada se mueve',
  Filters: 'Filtros',
  'Filters ({count})': 'Filtros ({count})',
  'Dim everything the selection does not reach through its relations':
    'Atenuar todo lo que la selección no alcanza a través de sus relaciones',
  Focus: 'Enfocar',
  'Filters hide shapes; nothing moves.': 'Los filtros ocultan formas; nada se mueve.',
  Components: 'Componentes',
  'This view draws no elements.': 'Esta vista no dibuja ningún elemento.',
  'Relation types': 'Tipos de relación',
  'This view draws no relations.': 'Esta vista no dibuja ninguna relación.',
  Attributes: 'Atributos',
  'Show only what meets conditions on its attributes.':
    'Mostrar solo lo que cumple condiciones sobre sus atributos.',
  'Add a condition': 'Agregar una condición',
  'Show all': 'Mostrar todos',
  'Hide all': 'Ocultar todos',
  'an attribute': 'un atributo',
  Of: 'De',
  Elements: 'Elementos',
  Relations: 'Relaciones',
  Attribute: 'Atributo',
  attribute: 'atributo',
  Test: 'Comparación',
  Value: 'Valor',
  value: 'valor',
  is: 'es',
  'is not': 'no es',
  contains: 'contiene',
  'is less than': 'es menor que',
  'is more than': 'es mayor que',
  'has a value': 'tiene un valor',
  'has no value': 'no tiene valor',
  'Remove the condition on {subject}': 'Quitar la condición sobre {subject}',
  Remove: 'Quitar',
  'Name an attribute.': 'Escribir el nombre de un atributo.',
  'Type a value.': 'Escribir un valor.',
  Degrees: 'Grados',
  All: 'Todos',
  Direction: 'Dirección',
  'Both ways': 'En ambos sentidos',
  Outgoing: 'Salientes',
  Incoming: 'Entrantes',
  Isolate: 'Aislar',
  'End focus': 'Terminar el foco',
  'the relation': 'la relación',
  'Go to where it starts: {name}': 'Ir a donde empieza: {name}',
  'Go to where it ends: {name}': 'Ir a donde termina: {name}',
  'Follow the relation': 'Seguir la relación',
  'Follow to': 'Seguir hasta',
  'The filters hide nothing here.': 'Los filtros no ocultan nada aquí.',
  'The filters hide {things}.': 'Los filtros ocultan {things}.',
  'Focus: this view does not draw what is selected.': 'Foco: esta vista no dibuja lo seleccionado.',
  'Focus: select an element or a relation.': 'Foco: seleccionar un elemento o una relación.',
  'Focus on “{name}”': 'Foco en “{name}”',
  'Focus on {things}': 'Foco en {things}',

  // The question before a deletion, or before a change that deletes relations as it goes.
  'a relation': 'una relación',
  'Delete {things}?': '¿Eliminar {things}?',
  '{question}?': '¿{question}?',
  'Put inside': 'Poner dentro',
  Move: 'Mover',
  'This takes away the relation "{name}".': 'Esto quita la relación "{name}".',
  'This takes away the {count} relations that place the shapes where they are:':
    'Esto quita las {count} relaciones que ubican las formas donde están:',
  'These {count} relations end on it, so they go too:': {
    one: 'Esta relación termina en ella, así que también se va:',
    other: 'Estas {count} relaciones terminan en ella, así que también se van:',
  },
  'These {count} relations end on them, so they go too:': {
    one: 'Esta relación termina en ellas, así que también se va:',
    other: 'Estas {count} relaciones terminan en ellas, así que también se van:',
  },
  'These {count} relations end on what you delete, so they go too:': {
    one: 'Esta relación termina en lo que se elimina, así que también se va:',
    other: 'Estas {count} relaciones terminan en lo que se elimina, así que también se van:',
  },
  'These {count} scenario steps use a relation that goes. They become broken steps and are kept, so you can fix them:':
    {
      one: 'Este paso de escenario usa una relación que se va. Se convierte en un paso roto y se conserva, para poder arreglarlo:',
      other:
        'Estos {count} pasos de escenario usan una relación que se va. Se convierten en pasos rotos y se conservan, para poder arreglarlos:',
    },
  '{count} stored positions in views go with the shapes.': {
    one: '{count} posición guardada en vistas se va con las formas.',
    other: '{count} posiciones guardadas en vistas se van con las formas.',
  },
  'You can undo this.': 'Se puede deshacer.',
  '{count} of them have a name, a description or attributes of their own, which go with them.':
    '{count} de ellas tienen un nombre, una descripción o atributos propios, que se van con ellas.',
  'It has a name, a description or attributes of its own, which go with it.':
    'Tiene un nombre, una descripción o atributos propios, que se van con ella.',
  '"{name}" has a name, a description or attributes of its own, which go with it.':
    '"{name}" tiene un nombre, una descripción o atributos propios, que se van con ella.',
  'and {count} more': 'y {count} más',

  // Choosing a container, and the relation type of a new relation.
  'Directly in World': 'Directamente en Mundo',
  'Put "{name}" inside…': 'Poner "{name}" dentro de…',
  'Move "{name}" to…': 'Mover "{name}" a…',
  'Relate {from} to {to}': 'Relacionar {from} con {to}',
  'outside its limits': 'fuera de sus límites',

  // What a drag says it would do.
  '"{name}" sits in {count} containers in this view':
    '"{name}" está en {count} contenedores en esta vista',
  'Lands behind "{name}"': 'Queda detrás de "{name}"',
  '⌥: move only': '⌥: solo mover',
  'Alt: move only': 'Alt: solo mover',
  '"{name}" moves with the shapes dragged': '"{name}" se mueve con las formas arrastradas',
  '"{name}" is part of "{mover}" in the model through "{type}"':
    '"{name}" es parte de "{mover}" en el modelo mediante "{type}"',
  '"{name}" is part of "{mover}" in the model through "{type}", which this view does not show':
    '"{name}" es parte de "{mover}" en el modelo mediante "{type}", que esta vista no muestra',
  'Put inside "{target}"': 'Poner dentro de "{target}"',
  'Put {count} elements inside "{target}"': 'Poner {count} elementos dentro de "{target}"',
  'Move into "{target}"': 'Mover a "{target}"',
  'Move {count} elements into "{target}"': 'Mover {count} elementos a "{target}"',
  'Out of "{from}"': 'Fuera de "{from}"',
  'Out of their containers': 'Fuera de sus contenedores',
  'Take out of "{from}"': 'Sacar de "{from}"',
  'Take {count} elements out of "{from}"': 'Sacar {count} elementos de "{from}"',
  'Take {count} elements out of their containers': 'Sacar {count} elementos de sus contenedores',
  'move only': 'solo mover',
  'Hold still to put inside "{name}"': 'Mantener quieto para poner dentro de "{name}"',
  'Release now: {then}': 'Soltar ahora: {then}',
  'Cannot put inside "{name}"': 'No se puede poner dentro de "{name}"',
  'Moves only': 'Solo se mueve',

  // The stacking order.
  'Bring to front': 'Traer al frente',
  'Bring forward': 'Traer hacia adelante',
  'Send backward': 'Enviar hacia atrás',
  'Send to back': 'Enviar al fondo',
  'Select shapes of elements to change their stacking order. Relations, notes and arrows are always drawn in front of them.':
    'Seleccionar formas de elementos para cambiar su orden de apilado. Las relaciones, las notas y las flechas siempre se dibujan delante de ellas.',
  'The project cannot be changed now.': 'El proyecto no se puede cambiar ahora.',
  'Bring the selection to the front': 'Traer la selección al frente',
  'Bring the selection forward': 'Traer la selección hacia adelante',
  'Send the selection backward': 'Enviar la selección hacia atrás',
  'Send the selection to the back': 'Enviar la selección al fondo',
  'The selection is already in front of everything it overlaps.':
    'La selección ya está delante de todo lo que se le superpone.',
  'The selection is already behind everything it overlaps.':
    'La selección ya está detrás de todo lo que se le superpone.',
  '"{name}" is already in front of everything it overlaps {where}.':
    '"{name}" ya está delante de todo lo que se le superpone {where}.',
  '"{name}" is already behind everything it overlaps {where}.':
    '"{name}" ya está detrás de todo lo que se le superpone {where}.',
  'The selection is now in front.': 'La selección ahora está delante.',
  'The selection is now behind.': 'La selección ahora está detrás.',
  '"{name}" is now in front of "{past}".': '"{name}" ahora está delante de "{past}".',
  'Bring forward, in front of "{past}"': 'Traer hacia adelante, delante de "{past}"',
  '"{name}" is now behind "{past}", which hides it.':
    '"{name}" ahora está detrás de "{past}", que la oculta.',
  '"{name}" is now behind "{past}".': '"{name}" ahora está detrás de "{past}".',
  'Send backward, behind "{past}", which hides it':
    'Enviar hacia atrás, detrás de "{past}", que la oculta',
  'Send backward, behind "{past}"': 'Enviar hacia atrás, detrás de "{past}"',
  '"{name}" is now at the front.': '"{name}" ahora está al frente.',
  'Bring to front, {where}': 'Traer al frente, {where}',
  '"{name}" is now at the back.': '"{name}" ahora está al fondo.',
  '"{name}" hides it.': '"{name}" la oculta.',
  'Send to back, {where}; "{hider}" then hides it':
    'Enviar al fondo, {where}; luego "{hider}" la oculta',
  'Send to back, {where}': 'Enviar al fondo, {where}',
  'directly in World': 'directamente en Mundo',
  'inside "{name}"': 'dentro de "{name}"',
  '"{cover}" is drawn in front of "{holder}", which holds it.':
    '"{cover}" se dibuja delante de "{holder}", que la contiene.',
  'It sits over "{name}" without being inside it; Put inside "{name}" orders it among the shapes there.':
    'Está sobre "{name}" sin estar dentro; Poner dentro de "{name}" la ordena entre las formas de ahí.',

  // The canvas's keyboard help.
  Keyboard: 'Teclado',
  'Arrow keys': 'Flechas',
  'Select the nearest shape in that direction, going into the containers on the way':
    'Seleccionar la forma más cercana en esa dirección, entrando en los contenedores del camino',
  'Alt+Up, Alt+Down': 'Alt+Arriba, Alt+Abajo',
  'Select the container of the selected shape, or the first shape inside it':
    'Seleccionar el contenedor de la forma seleccionada, o la primera forma dentro de ella',
  '] and [, or . and ,': '] y [, o . y ,',
  'Select the next or the previous relation of the selected element':
    'Seleccionar la relación siguiente o la anterior del elemento seleccionado',
  'Go to the far end of the selected relation; on an element or a note, edit its text':
    'Ir al otro extremo de la relación seleccionada; en un elemento o una nota, editar su texto',
  'Rename the selected element, or edit the selected note':
    'Cambiar el nombre del elemento seleccionado, o editar la nota seleccionada',
  'Shift+arrow keys': 'Mayús+flechas',
  'Move the selection a small step': 'Mover la selección un poco',
  'Ctrl+↑ and Ctrl+↓ (⌘ on macOS), or Ctrl+] and Ctrl+[':
    'Ctrl+↑ y Ctrl+↓ (⌘ en macOS), o Ctrl+] y Ctrl+[',
  'Bring the selection forward or send it backward, past the next shape it overlaps; these keys work wherever the focus is, except while typing':
    'Traer la selección hacia adelante o enviarla hacia atrás, más allá de la siguiente forma que se le superpone; estas teclas funcionan dondequiera que esté el foco, salvo mientras se escribe',
  'Ctrl+Shift+↑ and Ctrl+Shift+↓, or Ctrl+} and Ctrl+{ (⌥⌘] and ⌥⌘[ on macOS)':
    'Ctrl+Mayús+↑ y Ctrl+Mayús+↓, o Ctrl+} y Ctrl+{ (⌥⌘] y ⌥⌘[ en macOS)',
  'Bring the selection to the front or send it to the back of its container':
    'Traer la selección al frente o enviarla al fondo de su contenedor',
  'Shift+F10 or the menu key': 'Mayús+F10 o la tecla de menú',
  'Open the selected shape’s menu: stacking order, putting it inside a container or taking it out, adding inside it':
    'Abrir el menú de la forma seleccionada: orden de apilado, ponerla dentro de un contenedor o sacarla, agregar dentro de ella',
  'Alt while dragging (⌥ on macOS)': 'Alt mientras se arrastra (⌥ en macOS)',
  'Move without putting shapes inside a container or taking them out':
    'Mover sin poner formas dentro de un contenedor ni sacarlas',
  'the Delete key': 'Supr',
  'Delete the selection, after showing what goes with it':
    'Eliminar la selección, después de mostrar lo que se va con ella',
  Escape: 'Esc',
  'Clear the selection': 'Quitar la selección',
  'Ctrl+A or ⌘A': 'Ctrl+A o ⌘A',
  'Select everything': 'Seleccionar todo',
  '+, − and 0': '+, − y 0',
  'Zoom in, zoom out, and fit the view': 'Acercar, alejar y ajustar la vista',
  'Alt+− and Alt++': 'Alt+− y Alt++',
  'Collapse or expand the selected containers':
    'Contraer o expandir los contenedores seleccionados',
  'Space and drag': 'Espacio y arrastrar',
  Pan: 'Desplazar la vista',
  'Leave the canvas': 'Salir del lienzo',
  'The arrow keys select shapes, ] and [ (or . and ,) step through the selected element’s relations, and Enter follows a relation, and Shift+F10 opens the selected shape’s menu. Every key is listed under Keyboard, after the canvas.':
    'Las flechas seleccionan formas, ] y [ (o . y ,) recorren las relaciones del elemento seleccionado, Enter sigue una relación y Mayús+F10 abre el menú de la forma seleccionada. Todas las teclas están en Teclado, después del lienzo.',
};

/**
 * Templates of the messages the core and the local program write: the undo history's labels, the
 * reasons a change is refused and the warnings about a project. The braces stand for what the message
 * holds there; see `translateMessage`.
 */
export const messages: Catalog = {
  // What the app keeps in English and shows later: its notices, and its labels in the undo history.
  'Could not undo: {why}': 'No se pudo deshacer: {why}',
  'Could not redo: {why}': 'No se pudo rehacer: {why}',
  'Reloaded the project: {why}': 'Se volvió a cargar el proyecto: {why}',
  'This tab’s copy of the project fell out of step with Visual Anything again: {why}':
    'La copia del proyecto de esta pestaña volvió a desfasarse con Visual Anything: {why}',
  'Could not change your preferences: {why}': 'No se pudieron cambiar las preferencias: {why}',
  'This is not JSON: {detail}': 'Esto no es JSON: {detail}',
  'step {n} of “{scenario}”': 'el paso {n} de “{scenario}”',
  'Record {step}': 'Grabar {step}',
  'Add a relation to {step}': 'Agregar una relación a {step}',
  'Take a relation out of {step}': 'Sacar una relación de {step}',
  'Rename the scenario “{old}” to “{new}”': 'Cambiar el nombre del escenario “{old}” a “{new}”',
  'Change what {step} takes in': 'Cambiar lo que recibe {step}',
  'Change what {step} produces': 'Cambiar lo que produce {step}',
  'Fix {step}': 'Arreglar {step}',
  'Describe {step}': 'Describir {step}',
  'Move {step} up': 'Subir {step}',
  'Move {step} down': 'Bajar {step}',
  'Delete {step}': 'Eliminar {step}',

  // What the core and the local program write.
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
