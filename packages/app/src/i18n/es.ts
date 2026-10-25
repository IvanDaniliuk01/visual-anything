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
 * | canvas unit             | unidad del lienzo                |
 * | grid                    | cuadrícula                       |
 * | ruler                   | regla                            |
 * | snapping, snap          | ajuste, ajustar a la cuadrícula  |
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
  'The grid and the rulers apply to this tab only: Visual Anything is not connected.':
    'La cuadrícula y las reglas se aplican solo a esta pestaña: Visual Anything no está conectado.',
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

  // Export as PNG, in the header.
  'Export…': 'Exportar…',
  'There is no view to export.': 'No hay ninguna vista para exportar.',
  'Export “{view}” as PNG': 'Exportar “{view}” como PNG',
  Show: 'Mostrar',
  'The whole view': 'Toda la vista',
  'Everything the view draws': 'Todo lo que dibuja la vista',
  'What is visible': 'Lo que se ve',
  'As the canvas shows it now': 'Como lo muestra ahora el lienzo',
  Size: 'Tamaño',
  '{width} × {height} pixels': '{width} × {height} píxeles',
  'Too large: {width} × {height} pixels': 'Demasiado grande: {width} × {height} píxeles',
  'Drawn in the theme the canvas shows, without the selection. The browser saves it.':
    'Se dibuja en el tema que muestra el lienzo, sin la selección. La guarda el navegador.',
  'Drawing the image…': 'Dibujando la imagen…',
  'Save PNG': 'Guardar PNG',
  'The canvas is not ready yet. Try again in a moment.':
    'El lienzo todavía no está listo. Volver a intentarlo en un momento.',
  'The view draws nothing yet, so there is no image to save.':
    'La vista todavía no dibuja nada, así que no hay imagen para guardar.',
  'At {width} × {height} pixels this image is too large: the most is {side} pixels a side and {megapixels} megapixels. Choose 1×, or what is visible.':
    'Con {width} × {height} píxeles, esta imagen es demasiado grande: lo máximo son {side} píxeles por lado y {megapixels} megapíxeles. Elegir 1× o lo que se ve.',
  'The image could not be drawn: {why}': 'No se pudo dibujar la imagen: {why}',

  // The model panel's tabs.
  'Outline and model': 'Esquema y modelo',
  Model: 'Modelo',
  History: 'Historial',

  // The history panel.
  'The history shows while Visual Anything is connected.':
    'El historial se muestra mientras Visual Anything está conectado.',
  'Nothing is done yet. What you and Claude change shows here, newest first, and can be undone from here, many actions at once.':
    'Todavía no hay acciones. Los cambios propios y los de Claude aparecen aquí, de la más reciente a la más antigua, y se pueden deshacer desde aquí, varias acciones a la vez.',
  'Actions, newest first': 'Acciones, de la más reciente a la más antigua',
  // A badge: the action is undone, and can be redone.
  Undone: 'Deshecha',
  'Undo to here': 'Deshacer hasta aquí',
  'Redo to here': 'Rehacer hasta aquí',
  // Who did an action: the person, beside Claude.
  You: 'Usted',
  '{action}, by Claude': '{action}, por Claude',
  '{action}, by you': '{action}, por usted',

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

  // The grid, the rulers and snapping (A3).
  '{x}, {y} in {container}': '{x}, {y} en {container}',
  'Grid and rulers': 'Cuadrícula y reglas',
  Grid: 'Cuadrícula',
  'Show the grid (Shift+G)': 'Mostrar la cuadrícula (Mayús+G)',
  'Snap to grid': 'Ajustar a la cuadrícula',
  'Snap shapes to the grid; hold Alt to place freely':
    'Ajustar las formas a la cuadrícula; mantener Alt para ubicarlas libremente',
  'Show the grid to snap shapes to it': 'Mostrar la cuadrícula para ajustar las formas a ella',
  Rulers: 'Reglas',
  'Show the rulers (Shift+R)': 'Mostrar las reglas (Mayús+R)',
  'The grid shows.': 'Se muestra la cuadrícula.',
  'The grid is hidden.': 'Se ocultó la cuadrícula.',
  'The rulers show.': 'Se muestran las reglas.',
  'The rulers are hidden.': 'Se ocultaron las reglas.',

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
  'Move the selection one grid step': 'Mover la selección un paso de la cuadrícula',
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
  'Move without putting shapes inside a container or taking them out, and place them freely, without snapping to the grid':
    'Mover sin poner formas dentro de un contenedor ni sacarlas, y ubicarlas libremente, sin ajustarlas a la cuadrícula',
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
  'Shift+G': 'Mayús+G',
  'Show or hide the grid': 'Mostrar u ocultar la cuadrícula',
  'Shift+R': 'Mayús+R',
  'Show or hide the rulers': 'Mostrar u ocultar las reglas',
  'Space and drag': 'Espacio y arrastrar',
  Pan: 'Desplazar la vista',
  'Leave the canvas': 'Salir del lienzo',
  'The arrow keys select shapes, ] and [ (or . and ,) step through the selected element’s relations, and Enter follows a relation, and Shift+F10 opens the selected shape’s menu. Every key is listed under Keyboard, after the canvas.':
    'Las flechas seleccionan formas, ] y [ (o . y ,) recorren las relaciones del elemento seleccionado, Enter sigue una relación y Mayús+F10 abre el menú de la forma seleccionada. Todas las teclas están en Teclado, después del lienzo.',

  // Routes chosen by hand (ADR 0039): the relation's menu, the inspector, dragging and the keys.
  Route: 'Ruta',
  'Route of {name}': 'Ruta de {name}',
  Style: 'Estilo',
  Orthogonal: 'Ortogonal',
  Straight: 'Recta',
  Curved: 'Curva',
  'Reset route': 'Restablecer la ruta',
  'It is routed automatically': 'Se traza automáticamente',
  'Attach the start automatically': 'Conectar el inicio automáticamente',
  'Attach the end automatically': 'Conectar el final automáticamente',
  'Edit the route…': 'Editar la ruta…',
  Start: 'Inicio',
  End: 'Final',
  'Bend points': 'Puntos de quiebre',
  Automatic: 'Automático',
  'At "{name}"': 'En "{name}"',
  'On the top side': 'En el lado superior',
  'On the right side': 'En el lado derecho',
  'On the bottom side': 'En el lado inferior',
  'On the left side': 'En el lado izquierdo',
  'This view does not draw it as a line of its own.':
    'Esta vista no la dibuja como una línea propia.',
  'Attach automatically': 'Conectar automáticamente',
  'Attach at "{name}"': 'Conectar en "{name}"',
  'Attach to the top side': 'Conectar al lado superior',
  'Attach to the right side': 'Conectar al lado derecho',
  'Attach to the bottom side': 'Conectar al lado inferior',
  'Attach to the left side': 'Conectar al lado izquierdo',
  'Reconnect to "{name}"': 'Reconectar con "{name}"',
  'Cannot reconnect to "{name}"': 'No se puede reconectar con "{name}"',
  'Containment would form a cycle': 'La contención formaría un ciclo',
  'It is the other end of the relation already': 'Ya es el otro extremo de la relación',
  'Alt: no snapping': 'Alt: sin ajuste',
  '⌥: no snapping': '⌥: sin ajuste',
  'A route has at most {limit} bend points.':
    'Una ruta tiene como máximo {limit} puntos de quiebre.',
  'Editing the route of "{name}". Tab and Shift+Tab move between its handles; the arrow keys move the handle; Insert adds a bend point; Delete removes one; A attaches an end automatically; Enter applies; Escape cancels.':
    'Editando la ruta de "{name}". Tab y Mayús+Tab pasan de un control a otro; las flechas mueven el control; Insert agrega un punto de quiebre; Supr quita uno; A conecta un extremo automáticamente; Enter aplica; Esc cancela.',
  'Route editing cancelled; the route is as it was.':
    'Se canceló la edición de la ruta; la ruta quedó como estaba.',
  'Choose a bend point with Tab to remove it.': 'Elegir un punto de quiebre con Tab para quitarlo.',
  'Bend point removed.': 'Se quitó el punto de quiebre.',
  'Choose the start or the end with Tab to attach it automatically.':
    'Elegir el inicio o el final con Tab para conectarlo automáticamente.',
  'Attached automatically.': 'Conectado automáticamente.',
  'Choose a segment or a bend point with Tab to add a bend point there.':
    'Elegir un segmento o un punto de quiebre con Tab para agregar ahí un punto de quiebre.',
  'Bend point added.': 'Se agregó un punto de quiebre.',
  'This end is the middle of another relation, and moves with its line.':
    'Este extremo es el medio de otra relación y se mueve con su línea.',
  'The route did not change.': 'La ruta no cambió.',
  '{end}, {where}': '{end}, {where}',
  'attached automatically': 'conectado automáticamente',
  'at "{name}"': 'en "{name}"',
  'on the top side': 'en el lado superior',
  'on the right side': 'en el lado derecho',
  'on the bottom side': 'en el lado inferior',
  'on the left side': 'en el lado izquierdo',
  'Bend point {position} of {total}': 'Punto de quiebre {position} de {total}',
  'Middle of segment {position}': 'Medio del segmento {position}',
  'Shift+F10 or the menu key, on a relation': 'Mayús+F10 o la tecla de menú, en una relación',
  'Open the relation’s menu: its style, Reset route, and Edit the route…':
    'Abrir el menú de la relación: su estilo, Restablecer la ruta y Editar la ruta…',
  'Alt while dragging an end or a bend point of a route (⌥ on macOS)':
    'Alt mientras se arrastra un extremo o un punto de quiebre de una ruta (⌥ en macOS)',
  'Place it without snapping, at the exact border point or where it is let go':
    'Ubicarlo sin ajuste, en el punto exacto del borde o donde se suelta',
  'Delete, with a bend point chosen': 'Supr, con un punto de quiebre elegido',
  'Remove the bend point from the route; double-clicking it does too':
    'Quitar el punto de quiebre de la ruta; hacer doble clic en él también lo quita',
  'Tab and Shift+Tab, editing a route': 'Tab y Mayús+Tab, al editar una ruta',
  'The next or the previous handle: the start, the bend points and the middles of the segments, the end':
    'El control siguiente o el anterior: el inicio, los puntos de quiebre y los medios de los segmentos, el final',
  'Arrow keys, editing a route': 'Flechas, al editar una ruta',
  'Move the bend point or the segment by 1 unit, with Shift by 8; on an end, move it along the border by 1 unit, round the corners, and with Shift to the next connection point':
    'Mover el punto de quiebre o el segmento 1 unidad, con Mayús 8; en un extremo, moverlo por el borde 1 unidad, doblando las esquinas, y con Mayús al punto de conexión siguiente',
  'Insert or Ctrl+Enter, editing a route': 'Insert o Ctrl+Enter, al editar una ruta',
  'Add a bend point at the middle of the chosen segment, or after the chosen bend point':
    'Agregar un punto de quiebre en el medio del segmento elegido, o después del punto de quiebre elegido',
  'Delete or Backspace, editing a route': 'Supr o Retroceso, al editar una ruta',
  'Remove the chosen bend point': 'Quitar el punto de quiebre elegido',
  'A, editing a route': 'A, al editar una ruta',
  'Attach the chosen end automatically': 'Conectar automáticamente el extremo elegido',
  'Enter, editing a route': 'Enter, al editar una ruta',
  'Apply every change, as one action': 'Aplicar todos los cambios, como una sola acción',
  'Escape, editing a route': 'Esc, al editar una ruta',
  'Cancel, and leave the route as it was': 'Cancelar y dejar la ruta como estaba',
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

  // What the core and the local program write. Phrases first, which the messages hold as parts.
  ' and ': ' y ',
  ' or ': ' o ',
  '"{name}"': '"{name}"',
  'the component "{name}"': 'el componente "{name}"',
  'The component "{name}"': 'El componente "{name}"',
  'the relation type "{name}"': 'el tipo de relación "{name}"',
  'The relation type "{name}"': 'El tipo de relación "{name}"',
  'the package "{name}"': 'el paquete "{name}"',
  'The element "{name}"': 'El elemento "{name}"',
  '1 element': '1 elemento',
  '{n} elements': '{n} elementos',
  '1 relation': '1 relación',
  '{n} relations': '{n} relaciones',
  '1 shape': '1 forma',
  '{n} shapes': '{n} formas',
  '1 container': '1 contenedor',
  '{n} containers': '{n} contenedores',
  '1 free shape': '1 forma libre',
  '{n} free shapes': '{n} formas libres',
  '1 view': '1 vista',
  '{n} views': '{n} vistas',
  '1 limit': '1 límite',
  '{n} limits': '{n} límites',
  '1 badge': '1 insignia',
  '{n} badges': '{n} insignias',
  '1 derived definition': '1 definición derivada',
  '{n} derived definitions': '{n} definiciones derivadas',
  '1 component or element': '1 componente o elemento',
  '{n} components or elements': '{n} componentes o elementos',
  '1 warning': '1 advertencia',
  '{n} warnings': '{n} advertencias',

  // The undo history's labels.
  'Create "{name}"': 'Crear "{name}"',
  'Rename "{old}" to "{new}"': 'Cambiar el nombre de "{old}" a "{new}"',
  'Edit "{name}"': 'Editar "{name}"',
  'Delete "{name}"': 'Eliminar "{name}"',
  'Delete the relation "{name}"': 'Eliminar la relación "{name}"',
  'Delete {things}': 'Eliminar {things}',
  'Add the relation "{name}"': 'Agregar la relación "{name}"',
  'Edit the relation "{name}"': 'Editar la relación "{name}"',
  'Collapse "{name}"': 'Contraer "{name}"',
  'Expand "{name}"': 'Expandir "{name}"',
  'Collapse {n} containers': 'Contraer {n} contenedores',
  'Expand {n} containers': 'Expandir {n} contenedores',
  'Move "{element}" in "{view}"': 'Mover "{element}" en "{view}"',
  'Move {n} elements in "{view}"': 'Mover {n} elementos en "{view}"',
  'Move {n} shapes in "{view}"': 'Mover {n} formas en "{view}"',
  'Put "{element}" inside "{container}"': 'Poner "{element}" dentro de "{container}"',
  'Move "{element}" from "{from}" into "{container}"':
    'Mover "{element}" de "{from}" a "{container}"',
  'Move "{element}" into "{container}"': 'Mover "{element}" a "{container}"',
  'Take "{element}" out of "{from}"': 'Sacar "{element}" de "{from}"',
  'Take "{element}" out of its containers': 'Sacar "{element}" de sus contenedores',
  'Put {n} elements inside "{container}"': 'Poner {n} elementos dentro de "{container}"',
  'Move {n} elements into "{container}"': 'Mover {n} elementos a "{container}"',
  'Take {n} elements out of "{from}"': 'Sacar {n} elementos de "{from}"',
  'Take {n} elements out of their containers': 'Sacar {n} elementos de sus contenedores',
  '{base}, and move {n} other shape': '{base} y mover {n} forma más',
  '{base}, and move {n} other shapes': '{base} y mover {n} formas más',
  'Move {moved} to the end': 'Mover {moved} al final',
  'Move {moved} before "{name}"': 'Mover {moved} antes de "{name}"',
  'Create the package "{name}"': 'Crear el paquete "{name}"',
  'Rename the package "{old}" to "{new}"': 'Cambiar el nombre del paquete "{old}" a "{new}"',
  'Edit the package "{name}"': 'Editar el paquete "{name}"',
  'Define the component "{name}"': 'Definir el componente "{name}"',
  'Redefine the component "{name}"': 'Redefinir el componente "{name}"',
  'Define the relation type "{name}"': 'Definir el tipo de relación "{name}"',
  'Redefine the relation type "{name}"': 'Redefinir el tipo de relación "{name}"',
  'Rename the component "{old}" to "{new}"': 'Cambiar el nombre del componente "{old}" a "{new}"',
  'Edit the component "{name}"': 'Editar el componente "{name}"',
  'Rename the relation type "{old}" to "{new}"':
    'Cambiar el nombre del tipo de relación "{old}" a "{new}"',
  'Edit the relation type "{name}"': 'Editar el tipo de relación "{name}"',
  'Remove the component "{name}"': 'Quitar el componente "{name}"',
  'Remove the relation type "{name}"': 'Quitar el tipo de relación "{name}"',
  'Add the image "{name}"': 'Agregar la imagen "{name}"',
  'Replace the image "{name}"': 'Reemplazar la imagen "{name}"',
  'Remove the image "{name}"': 'Quitar la imagen "{name}"',
  'Change the packages in use': 'Cambiar los paquetes en uso',
  'Edit the project "{name}"': 'Editar el proyecto "{name}"',
  'Create the scenario "{name}"': 'Crear el escenario "{name}"',
  'Edit the scenario "{name}"': 'Editar el escenario "{name}"',
  'Delete the scenario "{name}"': 'Eliminar el escenario "{name}"',
  'Bring "{element}" to the front in "{view}"': 'Traer "{element}" al frente en "{view}"',
  'Send "{element}" to the back in "{view}"': 'Enviar "{element}" al fondo en "{view}"',
  'Bring "{element}" in front of "{other}" in "{view}"':
    'Traer "{element}" delante de "{other}" en "{view}"',
  'Send "{element}" behind "{other}" in "{view}"':
    'Enviar "{element}" detrás de "{other}" en "{view}"',
  'Bring {shapes} to the front in "{view}"': 'Traer {shapes} al frente en "{view}"',
  'Send {shapes} to the back in "{view}"': 'Enviar {shapes} al fondo en "{view}"',
  'Bring {shapes} forward in "{view}"': 'Traer {shapes} hacia adelante en "{view}"',
  'Send {shapes} backward in "{view}"': 'Enviar {shapes} hacia atrás en "{view}"',
  'Change the stacking order of {shapes} in "{view}"':
    'Cambiar el orden de apilado de {shapes} en "{view}"',
  'Create the view "{name}"': 'Crear la vista "{name}"',
  'Edit the view "{name}"': 'Editar la vista "{name}"',
  'Delete the view "{name}"': 'Eliminar la vista "{name}"',
  'Let layout place "{element}" in "{view}"':
    'Dejar que el diseño automático ubique "{element}" en "{view}"',
  'Let layout place {n} shapes in "{view}"':
    'Dejar que el diseño automático ubique {n} formas en "{view}"',
  'Add a note to "{view}"': 'Agregar una nota a "{view}"',
  'Add an arrow to "{view}"': 'Agregar una flecha a "{view}"',
  'Edit a note in "{view}"': 'Editar una nota en "{view}"',
  'Edit an arrow in "{view}"': 'Editar una flecha en "{view}"',
  'Delete 1 free shape from "{view}"': 'Eliminar 1 forma libre de "{view}"',
  'Delete {n} free shapes from "{view}"': 'Eliminar {n} formas libres de "{view}"',
  'Route "{relation}" by hand in "{view}"': 'Trazar "{relation}" a mano en "{view}"',
  'Reset the route of "{relation}" in "{view}"': 'Restablecer la ruta de "{relation}" en "{view}"',
  'Reset 1 route in "{view}"': 'Restablecer 1 ruta en "{view}"',
  'Reset {n} routes in "{view}"': 'Restablecer {n} rutas en "{view}"',
  'Draw "{relation}" curved in "{view}"': 'Dibujar "{relation}" curva en "{view}"',
  'Draw "{relation}" straight in "{view}"': 'Dibujar "{relation}" recta en "{view}"',
  'Draw "{relation}" orthogonal in "{view}"': 'Dibujar "{relation}" ortogonal en "{view}"',
  'Draw {n} relations curved in "{view}"': 'Dibujar {n} relaciones curvas en "{view}"',
  'Draw {n} relations straight in "{view}"': 'Dibujar {n} relaciones rectas en "{view}"',
  'Draw {n} relations orthogonal in "{view}"': 'Dibujar {n} relaciones ortogonales en "{view}"',
  'Reconnect "{relation}" to "{end}"': 'Reconectar "{relation}" con "{end}"',

  // Why a change was refused, and what a change breaks that only warns.
  'There is nothing to undo.': 'No hay nada que deshacer.',
  'There is nothing to redo.': 'No hay nada que rehacer.',
  'That action is undone already, so nothing was undone.':
    'Esa acción ya está deshecha, así que no se deshizo nada.',
  'That action is no longer in the history, so nothing was undone.':
    'Esa acción ya no está en el historial, así que no se deshizo nada.',
  'That action is not undone, so nothing was redone.':
    'Esa acción no está deshecha, así que no se rehízo nada.',
  'That action is no longer in the history, so nothing was redone.':
    'Esa acción ya no está en el historial, así que no se rehízo nada.',
  'There is no element "{id}".': 'No hay ningún elemento "{id}".',
  'There is no relation "{id}".': 'No hay ninguna relación "{id}".',
  'There is no element or relation "{id}" to end on.':
    'No hay ningún elemento ni relación "{id}" en el cual terminar.',
  'There is no view "{id}".': 'No hay ninguna vista "{id}".',
  'There is no scenario "{id}".': 'No hay ningún escenario "{id}".',
  'World cannot be deleted.': 'Mundo no se puede eliminar.',
  'World cannot sit inside anything.': 'Mundo no puede estar dentro de nada.',
  'World has no place in the model’s order.': 'Mundo no tiene lugar en el orden del modelo.',
  'World holds everything and has no place in the model’s order.':
    'Mundo contiene todo y no tiene lugar en el orden del modelo.',
  'World has no shape; it is the canvas itself.': 'Mundo no tiene forma; es el propio lienzo.',
  'World is the canvas itself; it cannot be collapsed.':
    'Mundo es el propio lienzo; no se puede contraer.',
  '"{id}" is not a valid id.': '"{id}" no es un id válido.',
  'The id "{id}" is already taken.': 'El id "{id}" ya está en uso.',
  'An element needs a name.': 'Un elemento necesita un nombre.',
  'A relation needs a name.': 'Una relación necesita un nombre.',
  'A batch needs a name.': 'Un lote necesita un nombre.',
  'A package needs a name.': 'Un paquete necesita un nombre.',
  'A component needs a name.': 'Un componente necesita un nombre.',
  'A relation type needs a name.': 'Un tipo de relación necesita un nombre.',
  'A project needs a name.': 'Un proyecto necesita un nombre.',
  'A scenario needs a name.': 'Un escenario necesita un nombre.',
  'An image needs a name.': 'Una imagen necesita un nombre.',
  'A perspective needs a name.': 'Una perspectiva necesita un nombre.',
  'An attribute needs a name.': 'Un atributo necesita un nombre.',
  'A note needs text.': 'Una nota necesita texto.',
  'A width must be a positive number.': 'Un ancho debe ser un número positivo.',
  'A height must be a positive number.': 'Un alto debe ser un número positivo.',
  'Command {n} of the batch: {why}': 'Comando {n} del lote: {why}',
  'No package in use defines the component "{id}".':
    'Ningún paquete en uso define el componente "{id}".',
  'No package in use defines the relation type "{id}".':
    'Ningún paquete en uso define el tipo de relación "{id}".',
  'No package in use defines the image "{id}".': 'Ningún paquete en uso define la imagen "{id}".',
  'The package "{id}" is built in and cannot be changed.':
    'El paquete "{id}" es incorporado y no se puede cambiar.',
  'The project uses no package "{id}".': 'El proyecto no usa ningún paquete "{id}".',
  'Nothing to delete was given.': 'No se indicó nada para eliminar.',
  'The relation "{name}" cannot end on itself, directly or through the relations that end on it.':
    'La relación "{name}" no puede terminar en sí misma, ni directamente ni a través de las relaciones que terminan en ella.',
  'A nesting relation places one element inside another, but "{name}" is a relation.':
    'Una relación que anida ubica un elemento dentro de otro, pero "{name}" es una relación.',
  'Placing "{from}" inside "{to}" would make containment form a cycle.':
    'Ubicar "{from}" dentro de "{to}" haría que la contención forme un ciclo.',
  'The change would make containment form a cycle.':
    'El cambio haría que la contención forme un ciclo.',
  '"{type}" expects its from end to be {names}, but "{name}" is not.':
    '"{type}" espera que su extremo de origen sea {names}, pero "{name}" no lo es.',
  '"{type}" expects its to end to be {names}, but "{name}" is not.':
    '"{type}" espera que su extremo de destino sea {names}, pero "{name}" no lo es.',
  '"{name}" has {value} for "{attribute}", which is not one of its choices.':
    '"{name}" tiene {value} para "{attribute}", que no es una de sus opciones.',
  '…and {n} more relation breaks limits.': '…y {n} relación más no cumple los límites.',
  '…and {n} more relations break limits.': '…y {n} relaciones más no cumplen los límites.',
  '…and {n} more value is outside their choices.': '…y {n} valor más está fuera de sus opciones.',
  '…and {n} more values are outside their choices.':
    '…y {n} valores más están fuera de sus opciones.',
  'No containers were given to collapse or expand.':
    'No se indicó ningún contenedor para contraer o expandir.',
  '"{name}" is given twice.': '"{name}" se indica dos veces.',
  'No shapes were given.': 'No se indicó ninguna forma.',
  'The relation type "{type}" does not nest.': 'El tipo de relación "{type}" no anida.',
  'The view "{view}" is not arranged by "{type}".':
    'La vista "{view}" no se organiza por "{type}".',
  '"{name}" is given twice from World.': '"{name}" se indica dos veces desde Mundo.',
  '"{name}" is given twice from "{from}".': '"{name}" se indica dos veces desde "{from}".',
  'The position of "{name}" is given twice.': 'La posición de "{name}" se indica dos veces.',
  '"{name}" cannot go inside itself.': '"{name}" no puede ir dentro de sí mismo.',
  'The view "{view}" is arranged by no relation type that nests, so nothing can be put inside anything in it.':
    'La vista "{view}" no se organiza por ningún tipo de relación que anide, así que en ella no se puede poner nada dentro de nada.',
  '"{name}" cannot go inside "{to}", which is inside "{name}" in the model.':
    '"{name}" no puede ir dentro de "{to}", que está dentro de "{name}" en el modelo.',
  '"{name}" cannot go inside "{to}", which is inside "{name}" in the model through "{type}".':
    '"{name}" no puede ir dentro de "{to}", que está dentro de "{name}" en el modelo mediante "{type}".',
  '"{name}" cannot go inside "{to}", which is inside "{name}" in the model through "{type}", which the view "{view}" does not show.':
    '"{name}" no puede ir dentro de "{to}", que está dentro de "{name}" en el modelo mediante "{type}", que la vista "{view}" no muestra.',
  'No elements were given to move.': 'No se indicó ningún elemento para mover.',
  '"{name}" is moved, so the others cannot go before it.':
    '"{name}" se mueve, así que los demás no pueden ir antes.',
  'No moves were given.': 'No se indicó ningún movimiento.',
  '"{name}" is moved twice.': '"{name}" se mueve dos veces.',
  '"{name}" cannot go in front of or behind itself.':
    '"{name}" no puede ir delante ni detrás de sí mismo.',
  '"{element}" does not sit directly in World in the view "{view}".':
    '"{element}" no está directamente en Mundo en la vista "{view}".',
  '"{element}" does not sit inside "{container}" in the view "{view}".':
    '"{element}" no está dentro de "{container}" en la vista "{view}".',
  '"{element}" is a row of "{container}", which places its rows in the model\'s order; a row has no position of its own.':
    '"{element}" es una fila de "{container}", que ubica sus filas en el orden del modelo; una fila no tiene posición propia.',
  'No positions were given.': 'No se indicó ninguna posición.',
  'The view "{view}" stores no position for "{key}".':
    'La vista "{view}" no guarda ninguna posición para "{key}".',
  'The view "{view}" has no free shape "{id}".':
    'La vista "{view}" no tiene ninguna forma libre "{id}".',
  'No free shapes were given.': 'No se indicó ninguna forma libre.',
  'The nesting relation type "{name}" is given twice.':
    'El tipo de relación que anida "{name}" se indica dos veces.',
  'The view "{name}" cannot be deleted: {scenarios} play over it.':
    'La vista "{name}" no se puede eliminar: {scenarios} se reproducen sobre ella.',
  'A package is listed twice.': 'Un paquete figura dos veces.',
  'The project cannot stop using the package "{id}": {n} of its elements, relations or definitions come from it.':
    'El proyecto no puede dejar de usar el paquete "{id}": {n} de sus elementos, relaciones o definiciones vienen de él.',
  'There is no built-in package "{id}" to use.':
    'No hay ningún paquete incorporado "{id}" para usar.',
  'Step {n} activates no relation; a step needs at least one.':
    'El paso {n} no activa ninguna relación; un paso necesita al menos una.',
  'Step {n} lists the same relation twice.': 'El paso {n} incluye la misma relación dos veces.',
  'Step {n} uses "{id}", which is not a relation of the model.':
    'El paso {n} usa "{id}", que no es una relación del modelo.',
  'Step {n} needs a description.': 'El paso {n} necesita una descripción.',

  // Packages, components and relation types.
  'The id "{id}" is the built-in package "{name}"\'s; give the package another one.':
    'El id "{id}" es el del paquete incorporado "{name}"; darle otro al paquete.',
  'The id "{id}" is kept for a package Visual Anything plans to build in; give the package another one.':
    'El id "{id}" está reservado para un paquete que Visual Anything planea incorporar; darle otro al paquete.',
  'A package with the id "{id}" already exists.': 'Ya existe un paquete con el id "{id}".',
  'The package "{package}" already has the component "{id}".':
    'El paquete "{package}" ya tiene el componente "{id}".',
  'The package "{package}" already has the relation type "{id}".':
    'El paquete "{package}" ya tiene el tipo de relación "{id}".',
  'The package "{package}" already defines "{id}".': 'El paquete "{package}" ya define "{id}".',
  'The component "{name}" cannot be removed: {users} use it.':
    'El componente "{name}" no se puede quitar: lo usan {users}.',
  'The relation type "{name}" cannot be removed: {users} use it.':
    'El tipo de relación "{name}" no se puede quitar: lo usan {users}.',
  'A component has no "{key}".': 'Un componente no tiene "{key}".',
  'A relation type has no "{key}".': 'Un tipo de relación no tiene "{key}".',
  'The component "{id}" must start with "{prefix}.", the id of its package.':
    'El componente "{id}" debe empezar con "{prefix}.", el id de su paquete.',
  'The relation type "{id}" must start with "{prefix}.", the id of its package.':
    'El tipo de relación "{id}" debe empezar con "{prefix}.", el id de su paquete.',
  'The component "{id}" cannot derive from itself.':
    'El componente "{id}" no puede derivar de sí mismo.',
  'The relation type "{id}" cannot derive from itself.':
    'El tipo de relación "{id}" no puede derivar de sí mismo.',
  'The component "{id}" derives from "{parent}", which no package in use defines.':
    'El componente "{id}" deriva de "{parent}", que ningún paquete en uso define.',
  'The relation type "{id}" derives from "{parent}", which no package in use defines.':
    'El tipo de relación "{id}" deriva de "{parent}", que ningún paquete en uso define.',
  'The direction of {of} is "directed" or "undirected".':
    'La dirección de {of} es "directed" o "undirected".',
  '{Of} has no "{key}" to change.': '{Of} no tiene "{key}" para cambiar.',
  'Limits are set for the "from" and "to" ends, not "{end}".':
    'Los límites se fijan para los extremos "from" y "to", no "{end}".',
  '{names} cannot stop nesting while {scenarios} nests by it; change the view first.':
    '{names} no puede dejar de anidar mientras {scenarios} anida por él; primero cambiar la vista.',
  '{names} cannot stop nesting while {scenarios} nest by it; change the view first.':
    '{names} no puede dejar de anidar mientras {scenarios} anidan por él; primero cambiar las vistas.',
  'The relation "{id}" would nest, but one of its ends is a relation.':
    'La relación "{id}" anidaría, pero uno de sus extremos es una relación.',
  'The component "{name}" already defines "{to}".': 'El componente "{name}" ya define "{to}".',
  'The relation type "{name}" already defines "{to}".':
    'El tipo de relación "{name}" ya define "{to}".',
  '"{name}" already holds a value for "{to}".': '"{name}" ya tiene un valor para "{to}".',
  'The relation "{name}" already holds a value for "{to}".':
    'La relación "{name}" ya tiene un valor para "{to}".',
  '{names} cannot be removed: the detail of {users} writes it.':
    '{names} no se puede quitar: lo escribe el detalle de {users}.',
  'The component "{id}" is built in; package "{package}" cannot define it.':
    'El componente "{id}" es incorporado; el paquete "{package}" no puede definirlo.',
  'The relation type "{id}" is built in; package "{package}" cannot define it.':
    'El tipo de relación "{id}" es incorporado; el paquete "{package}" no puede definirlo.',
  'The component "{id}" is defined by package "{first}" and again by "{package}".':
    'El componente "{id}" lo define el paquete "{first}" y otra vez "{package}".',
  'The relation type "{id}" is defined by package "{first}" and again by "{package}".':
    'El tipo de relación "{id}" lo define el paquete "{first}" y otra vez "{package}".',
  'The component "{id}" of package "{package}" should start with "{prefix}.".':
    'El componente "{id}" del paquete "{package}" debería empezar con "{prefix}.".',
  'The relation type "{id}" of package "{package}" should start with "{prefix}.".':
    'El tipo de relación "{id}" del paquete "{package}" debería empezar con "{prefix}.".',
  'The components {members} derive from each other in a cycle.':
    'Los componentes {members} derivan unos de otros en un ciclo.',
  'The relation types {members} derive from each other in a cycle.':
    'Los tipos de relación {members} derivan unos de otros en un ciclo.',

  // Appearances and attributes.
  'The fill of {of} must be a color written as #RRGGBB, not {value}.':
    'El relleno de {of} debe ser un color escrito como #RRGGBB, no {value}.',
  'The stroke of {of} must be a color written as #RRGGBB, not {value}.':
    'El borde de {of} debe ser un color escrito como #RRGGBB, no {value}.',
  'The tint of {of} must be a color written as #RRGGBB, not {value}.':
    'El tinte de {of} debe ser un color escrito como #RRGGBB, no {value}.',
  'The width of {of} must be a number above 0 and at most 100,000.':
    'El ancho de {of} debe ser un número mayor que 0 y de 100.000 como máximo.',
  'The height of {of} must be a number above 0 and at most 100,000.':
    'El alto de {of} debe ser un número mayor que 0 y de 100.000 como máximo.',
  'The shape of {of} must be one of {choices}.':
    'La forma de {of} debe ser una de estas: {choices}.',
  'The detail of {of} writes at most 8 attributes.':
    'El detalle de {of} escribe como máximo 8 atributos.',
  'The detail of {of} writes "{name}" twice.': 'El detalle de {of} escribe "{name}" dos veces.',
  'A badge of {of} writes 1 to 4 characters.': 'Una insignia de {of} escribe de 1 a 4 caracteres.',
  'A badge of {of} has no "{key}".': 'Una insignia de {of} no tiene "{key}".',
  'The badge "{text}" of {of} names the attribute it is written for.':
    'La insignia "{text}" de {of} nombra el atributo para el que se escribe.',
  'The badge "{text}" of {of} names a relation type by its id.':
    'La insignia "{text}" de {of} nombra un tipo de relación por su id.',
  'The detail of {of} writes at most 8 badges.':
    'El detalle de {of} escribe como máximo 8 insignias.',
  'The detail of {of} has no "{key}".': 'El detalle de {of} no tiene "{key}".',
  '{Of} has at most 32 connection points.': '{Of} tiene como máximo 32 puntos de conexión.',
  'A connection point of {of} has no "{key}".': 'Un punto de conexión de {of} no tiene "{key}".',
  'A connection point of {of} has a name of 1 to 32 characters.':
    'Un punto de conexión de {of} tiene un nombre de 1 a 32 caracteres.',
  '{Of} has two connection points named "{name}".':
    '{Of} tiene dos puntos de conexión llamados "{name}".',
  'The connection point "{name}" of {of} sits on the top, right, bottom or left side.':
    'El punto de conexión "{name}" de {of} está en el lado superior, derecho, inferior o izquierdo.',
  'The connection point "{name}" of {of} sits at a place from 0 to 1 along its side.':
    'El punto de conexión "{name}" de {of} está en un lugar de 0 a 1 a lo largo de su lado.',
  'The image of {of} must be "none" or an image named by its id.':
    'La imagen de {of} debe ser "none" o una imagen nombrada por su id.',
  'The image of {of} must name an image by its id.':
    'La imagen de {of} debe nombrar una imagen por su id.',
  'The image of {of} is placed as an icon or as a drawing.':
    'La imagen de {of} se ubica como ícono o como dibujo.',
  '{Of} cannot draw its contents as rows as a {shape}: only a rectangle or a rounded rectangle draws rows.':
    '{Of} no puede dibujar su contenido como filas con la forma {shape}: solo un rectángulo o un rectángulo redondeado dibuja filas.',
  'An appearance has no trait "{trait}".': 'Una apariencia no tiene el rasgo "{trait}".',
  'The line width of {of} must be a number above 0.':
    'El grosor de línea de {of} debe ser un número mayor que 0.',
  'The dash of {of} must be "solid", "dashed" or "dotted".':
    'El trazo de {of} debe ser "solid", "dashed" o "dotted".',
  'How a relation is drawn has no trait "{trait}".':
    'La forma de dibujar una relación no tiene el rasgo "{trait}".',
  'An attribute definition has no "{key}".': 'Una definición de atributo no tiene "{key}".',
  'An attribute of {of} needs a name.': 'Un atributo de {of} necesita un nombre.',
  'The attribute "{name}" of {of} is of type "string", "number", "boolean" or "json".':
    'El atributo "{name}" de {of} es de tipo "string", "number", "boolean" o "json".',
  'The default of "{name}" of {of} must be a {type} value.':
    'El valor predeterminado de "{name}" de {of} debe ser un valor {type}.',
  'Only a string attribute has choices; "{name}" of {of} is a {type}.':
    'Solo un atributo string tiene opciones; "{name}" de {of} es {type}.',
  'The choices of "{name}" of {of} are 1 to 64 different texts.':
    'Las opciones de "{name}" de {of} son de 1 a 64 textos distintos.',
  'The default of "{name}" of {of} must be one of its choices.':
    'El valor predeterminado de "{name}" de {of} debe ser una de sus opciones.',
  'Only a number attribute has a unit; "{name}" of {of} is a {type}.':
    'Solo un atributo number tiene unidad; "{name}" de {of} es {type}.',
  'The unit of "{name}" of {of} has 1 to 16 characters.':
    'La unidad de "{name}" de {of} tiene de 1 a 16 caracteres.',
  '{Of} defines the attribute "{name}" twice.': '{Of} define el atributo "{name}" dos veces.',
  'Attribute changes have no "{key}".': 'Los cambios de atributos no tienen "{key}".',
  '{Of} does not define "{name}" itself, so it cannot rename it.':
    '{Of} no define "{name}" por sí mismo, así que no puede cambiarle el nombre.',
  '{Of} already has an attribute "{name}".': '{Of} ya tiene un atributo "{name}".',
  '{Of} does not define "{name}" itself, so it cannot stop defining it.':
    '{Of} no define "{name}" por sí mismo, así que no puede dejar de definirlo.',
  '{Of} does not define "{name}" itself, so it cannot order it.':
    '{Of} no define "{name}" por sí mismo, así que no puede ordenarlo.',
  '"{name}" is ordered twice.': '"{name}" se ordena dos veces.',
  'The {end} limit of {of} is a list of ids, or "any".':
    'El límite {end} de {of} es una lista de ids, o "any".',
  'The {end} limit of {of} names nothing: leave it out to inherit it, or write "any".':
    'El límite {end} de {of} no nombra nada: omitirlo para heredarlo, o escribir "any".',
  'The {end} limit of {of} names "{id}" twice.': 'El límite {end} de {of} nombra "{id}" dos veces.',
  'The {end} limit of {of} names "{id}", which is no component or relation type of a package in use.':
    'El límite {end} de {of} nombra "{id}", que no es ningún componente ni tipo de relación de un paquete en uso.',
  'The detail of {of} writes "{name}", which {of} does not have.':
    'El detalle de {of} escribe "{name}", que {of} no tiene.',
  'The badge "{text}" of {of} is written while "{attribute}" is true, but {of} has no such attribute.':
    'La insignia "{text}" de {of} se escribe mientras "{attribute}" es verdadero, pero {of} no tiene ese atributo.',
  'The badge "{text}" of {of} is written while "{attribute}" is true, but it is not a boolean attribute.':
    'La insignia "{text}" de {of} se escribe mientras "{attribute}" es verdadero, pero no es un atributo booleano.',
  'The badge "{text}" of {of} names the relation type "{type}", which no package in use defines.':
    'La insignia "{text}" de {of} nombra el tipo de relación "{type}", que ningún paquete en uso define.',

  // Images.
  "An image's name has at most {n} characters.":
    'El nombre de una imagen tiene como máximo {n} caracteres.',
  'Where an image comes from is text of at most {n} characters.':
    'El origen de una imagen es un texto de {n} caracteres como máximo.',
  'The image "{id}" must start with "{prefix}.", the id of its package.':
    'La imagen "{id}" debe empezar con "{prefix}.", el id de su paquete.',
  'The package "{name}" already has the image "{id}".':
    'El paquete "{name}" ya tiene la imagen "{id}".',
  'A package holds at most {n} images; "{name}" is full.':
    'Un paquete contiene como máximo {n} imágenes; "{name}" está lleno.',
  'The images of the package "{name}" would hold over 2 MiB; keep fewer or smaller pictures there.':
    'Las imágenes del paquete "{name}" ocuparían más de 2 MiB; conviene tener ahí menos imágenes o más pequeñas.',
  'Cleaning the image "{name}" removed: {removed}.':
    'La limpieza de la imagen "{name}" quitó: {removed}.',
  'The image "{name}" cannot be removed: {users} show it.':
    'La imagen "{name}" no se puede quitar: la muestran {users}.',
  'A bitmap is a PNG, a JPEG or a WebP picture: its format is "png", "jpeg" or "webp".':
    'Un mapa de bits es una imagen PNG, JPEG o WebP: su formato es "png", "jpeg" o "webp".',
  'The bitmap is far over 192 KiB; shrink it before adding it.':
    'El mapa de bits supera por mucho los 192 KiB; achicarlo antes de agregarlo.',
  'The image "{name}" is refused: its data is not base64.':
    'La imagen "{name}" se rechaza: sus datos no están en base64.',
  'The image "{name}" is refused: {why}': 'La imagen "{name}" se rechaza: {why}',
  '{owner} cannot show the image "{id}": no package in use defines it.':
    '{owner} no puede mostrar la imagen "{id}": ningún paquete en uso la define.',
  'The image "{id}" cannot go: {users} still show it.':
    'La imagen "{id}" no se puede quitar: {users} todavía la muestran.',
  '{owner} can show an image by its id, as an icon or a drawing, with a #rrggbb tint, or show "none".':
    '{owner} puede mostrar una imagen por su id, como ícono o como dibujo, con un tinte #rrggbb, o mostrar "none".',
  'The image "{id}" is defined by package "{first}" and again by "{package}".':
    'La imagen "{id}" la define el paquete "{first}" y otra vez "{package}".',
  'The image "{id}" of package "{package}" should start with "{prefix}.".':
    'La imagen "{id}" del paquete "{package}" debería empezar con "{prefix}.".',
  'The image "{name}" ({id}) is not drawn: cleaning refuses it.':
    'La imagen "{name}" ({id}) no se dibuja: la limpieza la rechaza.',
  'The image "{name}" ({id}) holds what cleaning removes. It is shown cleaned; clean it to store it so.':
    'La imagen "{name}" ({id}) contiene lo que la limpieza quita. Se muestra limpia; limpiarla para guardarla así.',
  'The image "{name}" ({id}) holds what cleaning removes: {removed}. It is shown cleaned; clean it to store it so.':
    'La imagen "{name}" ({id}) contiene lo que la limpieza quita: {removed}. Se muestra limpia; limpiarla para guardarla así.',
  'The images of the package "{name}" hold {size}; keep them under 2 MiB, past which they are not drawn.':
    'Las imágenes del paquete "{name}" ocupan {size}; conviene mantenerlas por debajo de 2 MiB, a partir de lo cual no se dibujan.',
  'The images of the package "{name}" hold {size}, over 2 MiB; these are not drawn: {images}.':
    'Las imágenes del paquete "{name}" ocupan {size}, más de 2 MiB; estas no se dibujan: {images}.',
  '{owner} shows the image "{id}", which no package in use defines; it shows none.':
    '{owner} muestra la imagen "{id}", que ningún paquete en uso define; no muestra ninguna.',

  // What the core finds wrong with a project as it opens.
  'This project was saved by a newer Visual Anything, format {n}. Update the program to open it.':
    'Este proyecto se guardó con un Visual Anything más nuevo, formato {n}. Actualizar el programa para abrirlo.',
  'The package "{id}" takes an id Visual Anything keeps for a package it plans to build in; rename it before that package ships.':
    'El paquete "{id}" usa un id que Visual Anything reserva para un paquete que planea incorporar; cambiarle el nombre antes de que ese paquete salga.',
  'The element "{name}" is created from "{component}", which no package in use defines.':
    'El elemento "{name}" se creó a partir de "{component}", que ningún paquete en uso define.',
  'The relation "{id}" is of "{type}", which no package in use defines.':
    'La relación "{id}" es de "{type}", que ningún paquete en uso define.',
  'The relation "{id}" ends on itself.': 'La relación "{id}" termina en sí misma.',
  'The relation "{id}" ends on "{end}", which is no element or relation of the model.':
    'La relación "{id}" termina en "{end}", que no es ningún elemento ni relación del modelo.',
  'The relation "{id}" nests, so both its ends must be elements.':
    'La relación "{id}" anida, así que sus dos extremos deben ser elementos.',
  'Containment forms a cycle: {cycle}.': 'La contención forma un ciclo: {cycle}.',
  'The view "{view}" is arranged by "{id}", which no package in use defines.':
    'La vista "{view}" se organiza por "{id}", que ningún paquete en uso define.',
  'The view "{view}" is arranged by "{type}", which does not nest.':
    'La vista "{view}" se organiza por "{type}", que no anida.',
  'The view "{view}" keeps a position for "{key}", but the model has no element "{missing}"; it is ignored.':
    'La vista "{view}" guarda una posición para "{key}", pero el modelo no tiene ningún elemento "{missing}"; se ignora.',
  'The view "{view}" keeps "{id}" collapsed, which is no element of the model; it is ignored.':
    'La vista "{view}" mantiene contraído "{id}", que no es ningún elemento del modelo; se ignora.',
  'The view "{view}" keeps a stacking order for "{container}", which is no element of the model; it is ignored.':
    'La vista "{view}" guarda un orden de apilado para "{container}", que no es ningún elemento del modelo; se ignora.',
  'The stacking order of "{holder}" in the view "{view}" names "{id}" more than once.':
    'El orden de apilado de "{holder}" en la vista "{view}" nombra "{id}" más de una vez.',
  'The stacking order of "{holder}" in the view "{view}" names "{id}", which is no element of the model; it is ignored.':
    'El orden de apilado de "{holder}" en la vista "{view}" nombra "{id}", que no es ningún elemento del modelo; se ignora.',
  'The scenario "{name}" plays over "{view}", which is no view of the project.':
    'El escenario "{name}" se reproduce sobre "{view}", que no es ninguna vista del proyecto.',
  'The detail of {of} writes "{name}", which it does not have.':
    'El detalle de {of} escribe "{name}", que no tiene.',
  'The badge "{text}" of {of} names "{type}", which no package in use defines.':
    'La insignia "{text}" de {of} nombra "{type}", que ningún paquete en uso define.',
  'The badge "{text}" of {of} is written while "{attribute}" is true, which it does not have.':
    'La insignia "{text}" de {of} se escribe mientras "{attribute}" es verdadero, atributo que no tiene.',
  '{Of} has two connection points named "{name}"; the first is used.':
    '{Of} tiene dos puntos de conexión llamados "{name}"; se usa el primero.',
  '{Of} draws its contents as rows on a {shape}; it is drawn as a rectangle.':
    '{Of} dibuja su contenido como filas sobre la forma {shape}; se dibuja como rectángulo.',
  'The {end} limit of the relation type "{name}" names "{named}", which no package in use defines; it is ignored.':
    'El límite {end} del tipo de relación "{name}" nombra "{named}", que ningún paquete en uso define; se ignora.',
  'More than one element or relation has the id "{key}".':
    'Más de un elemento o relación tiene el id "{key}".',
  'More than one position in the view "{view}" has the id "{key}".':
    'Más de una posición en la vista "{view}" tiene el id "{key}".',
  'More than one free shape in the view "{view}" has the id "{key}".':
    'Más de una forma libre en la vista "{view}" tiene el id "{key}".',
  'More than one step in the scenario "{name}" has the id "{key}".':
    'Más de un paso en el escenario "{name}" tiene el id "{key}".',

  // What the local program says.
  'This program keeps no preferences.': 'Este programa no guarda preferencias.',
  'Your preferences could not be changed: {why}': 'No se pudieron cambiar las preferencias: {why}',
  'Your preference applies until Visual Anything stops: it could not be saved ({reason}).':
    'La preferencia se aplica hasta que Visual Anything se detenga: no se pudo guardar ({reason}).',
  'The command could not be run: {why}': 'No se pudo ejecutar el comando: {why}',
  'The local program failed: {why}': 'El programa local falló: {why}',
  'The project is closed.': 'El proyecto está cerrado.',
  'The project has no file for {key}.': 'El proyecto no tiene ningún archivo para {key}.',
  'The id "{id}" is taken: {holder} holds a package with that id, which the project does not use.':
    'El id "{id}" está en uso: {holder} contiene un paquete con ese id, que el proyecto no usa.',
  'The change would make {path} invalid: {errors}.':
    'El cambio haría que {path} no sea válido: {errors}.',
  'Could not save {path} ({reason}); nothing was changed.':
    'No se pudo guardar {path} ({reason}); no se cambió nada.',
  'Could not save {path} ({reason}), nor put back the files saved before it; the project is reloaded from the files.':
    'No se pudo guardar {path} ({reason}), ni devolver los archivos guardados antes; el proyecto se vuelve a cargar desde los archivos.',
  'Could not put {path} back as it was: {reason}':
    'No se pudo devolver {path} a como estaba: {reason}',
  "Could not check the project's files: {why}":
    'No se pudieron revisar los archivos del proyecto: {why}',
  '{files} changed on disk, so this change was not made; the project is reloaded from the files.':
    'Hubo cambios en el disco en {files}, así que este cambio no se hizo; el proyecto se vuelve a cargar desde los archivos.',
  '{files} changed on disk, but the project is not valid now, so the open project is kept:':
    'Hubo cambios en el disco en {files}, pero el proyecto ahora no es válido, así que se conserva el proyecto abierto:',
  '{files} changed on disk.': 'Hubo cambios en el disco en {files}.',
  'Changes made outside the app will not be reloaded: {folder} cannot be watched ({reason}).':
    'Los cambios hechos fuera de la app no se volverán a cargar: no se puede vigilar {folder} ({reason}).',
  'Could not check the project for warnings: {why}':
    'No se pudo revisar si el proyecto tiene advertencias: {why}',
  'The project has {things}:': 'El proyecto tiene {things}:',
  '{file}: {why}': '{file}: {why}',
  '{file} {path}: {why}': '{file} {path}: {why}',
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
