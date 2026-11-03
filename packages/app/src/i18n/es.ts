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
 * | alignment guide         | línea de alineación              |
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
 * | collapsed container     | contenedor contraído             |
 * | view                    | vista                            |
 * | perspective             | perspectiva                      |
 * | scope                   | alcance                          |
 * | outside the view        | fuera de la vista                |
 * | component               | componente                       |
 * | component palette       | paleta de componentes            |
 * | appearance              | apariencia                       |
 * | fill, stroke            | relleno, trazo                   |
 * | decision, alternative   | decisión, alternativa            |
 * | an alternative's label  | etiqueta                         |
 * | reveal                  | revelación                       |
 * | Motion, Fades (prefs.)  | Movimiento, Fundidos             |
 * | contour (free geometry) | curva cerrada                    |
 * | imported drawing        | dibujo importado                 |
 * | dash                    | patrón de línea                  |
 * | connection point        | punto de conexión                |
 * | attach (a relation end) | conectar                         |
 * | route                   | ruta                             |
 * | bend point              | punto de quiebre                 |
 * | layout, lay out         | diseño automático, organizar     |
 * | fit (the view)          | encuadrar                        |
 * | component editor        | editor de componentes            |
 * | Essence                 | Esencia                          |
 * | package                 | paquete                          |
 * | built-in package        | paquete incorporado              |
 * | starter package         | paquete inicial                  |
 * | sample project          | proyecto de muestra              |
 * | start screen            | pantalla de inicio               |
 * | shared package          | paquete compartido               |
 * | license, attribution    | licencia, atribución             |
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
 * | caption                 | rótulo                           |
 * | preference              | preferencia                      |
 * | theme                   | tema                             |
 * | launch address          | dirección de inicio              |
 * | view state              | estado de vista                  |
 * | view address            | dirección de vista               |
 * | find, search            | buscar, búsqueda                 |
 * | undo, redo              | deshacer, rehacer                |
 * | action, history         | acción, historial                |
 * | language                | idioma                           |
 * | settings (of a view)    | opciones                         |
 * | the local program       | el programa local                |
 * | read-only page          | página de solo lectura           |
 * | package code            | código del paquete               |
 * | capability              | capacidad                        |
 * | approve, approval       | aprobar, aprobación              |
 * | computed (value)        | calculado                        |
 * | overlay                 | superposición                    |
 * | legend                  | leyenda                          |
 * | level of detail         | nivel de detalle                 |
 * | silhouette              | silueta                          |
 * | opacity, fade           | opacidad, atenuar                |
 * | external identifier     | identificador externo            |
 * | scheme (of identifiers) | catálogo                         |
 * | crosswalk               | tabla de correspondencias        |
 * | destination             | destino                          |
 * | follow (a destination)  | seguir                           |
 * | web address             | dirección web                    |
 * | host (of an address)    | sitio                            |
 * | path (to a project)     | ubicación                        |
 * | element list            | lista de elementos               |
 * | live value              | valor en vivo                    |
 * | fresh, stale (a value)  | vigente, vencido                 |
 * | time range              | rango de tiempo                  |
 * | tour                    | recorrido                        |
 * | full-screen playback    | reproducción a pantalla completa |
 * | speaker notes           | notas del orador                 |
 * | thread                  | hilo                             |
 * | comment                 | comentario                       |
 * | detached (thread)       | desvinculado                     |
 * | resolve, reopen         | resolver, reabrir                |
 * | version                 | versión                          |
 * | comparison              | comparación                      |
 * | change (of a comparison)| cambio                           |
 * | added, removed          | agregado, quitado                |
 * | changed, moved          | cambiado, movido                 |
 * | proposal                | propuesta                        |
 * | physical space          | espacio físico                   |
 * | physical-space panel    | panel del espacio físico         |
 * | pose, to pose           | ubicación, ubicar                |
 * | placement (of an image) | colocación                       |
 * | conflict                | conflicto                        |
 *
 * The words CONTEXT.md avoids are not used for its terms either: no "nodo", "objeto" or "instancia"
 * for an element, "propiedad" or "campo" for an attribute, "capa" for the stacking order, "enlace" or
 * "vínculo" for a relation, nor "ajustes" for options, since "ajuste" is snapping. A JSON object is
 * "objeto JSON" and a file system link "enlace simbólico", which are neither. A sample project is
 * "proyecto de muestra", never "ejemplo"; a legend is "leyenda", never "referencias", which is close to
 * the built-in relation type "referencia" and to what CONTEXT.md avoids for identifiers; so a caption
 * is "rótulo". `catalog.test.ts` lists every avoided word in Spanish, with its narrow exceptions.
 *
 * Element, relation, view and scenario names are what people wrote and are never translated; they
 * keep their quotes as the English has them.
 */
import type { Catalog } from './translate';

/** The app's own texts, keyed by the exact English given to `t()`. */
export const ui: Catalog = {
  // The start screen of a folder that holds no project yet (ADR 0051).
  'Start a project in “{folder}”': 'Empezar un proyecto en “{folder}”',
  'This folder holds no project yet. Start one from a sample, or empty; everything can be changed afterwards.':
    'Esta carpeta todavía no tiene ningún proyecto. Empezar uno a partir de un proyecto de muestra, o vacío; después se puede cambiar todo.',
  'Ways to start': 'Formas de empezar',
  'C4 architecture: internet banking': 'Arquitectura C4: banca por internet',
  'A bank’s internet banking system, from the people who use it down to its components and the servers it runs on, with a scenario of a customer signing in.':
    'El sistema de banca por internet de un banco, desde las personas que lo usan hasta sus componentes y los servidores en los que se ejecuta, con un escenario de un cliente que inicia sesión.',
  'Data science pipeline: churn prediction':
    'Canalización de ciencia de datos: predicción de bajas',
  'The data a subscription business turns into a churn model, and the dashboards it feeds, with a scenario of the nightly run.':
    'Los datos que un negocio de suscripciones convierte en un modelo de bajas, y los paneles de indicadores que alimenta, con un escenario de la ejecución nocturna.',
  // P1 W63: the physical-ai sample.
  'Physical AI: a pick-and-place arm': 'IA física: un brazo que toma y coloca piezas',
  'A six-axis arm drawn as a solid that turns, its links and joints anchored to its parts, with its motors and encoders, its control loop and its software, and a scenario in which it picks a part.':
    'Un brazo de seis ejes dibujado como un sólido que gira, con sus eslabones y articulaciones anclados a sus partes, sus motores y codificadores, su lazo de control y su software, y un escenario en el que toma una pieza.',
  // P1 W64: the sample of Processes and state machines.
  'Processes and state machines: an online order':
    'Procesos y máquinas de estados: un pedido en línea',
  'An online shop’s order, from the customer’s order through a stock check to shipping, and the states it goes through, with a scenario of an order that ships.':
    'El pedido de una tienda en línea, desde que el cliente lo hace, pasando por el control de stock, hasta el envío, y los estados por los que pasa, con un escenario de un pedido que se envía.',
  // P5: the sample of Healthcare.
  'Healthcare: a clinic’s claim': 'Salud: la factura de una clínica',
  'An invented clinic bills an invented insurer for a knee MRI, from the visit through its authorization to payment or denial, with the audit that reviews the claim and the patient’s care plan.':
    'Una clínica inventada le factura a una aseguradora inventada una resonancia de rodilla, desde la consulta, pasando por su autorización, hasta el pago o el rechazo, con la auditoría que revisa la factura y el plan de cuidados de la paciente.',
  // P6: the sample of Finance.
  'Finance: a workshop’s books': 'Finanzas: los libros de un taller',
  'An invented furniture workshop’s books, from an invoice through its payment to the general ledger by double entry, and the small portfolio that holds its reserve, with a scenario that decides how a payment is recorded.':
    'Los libros de un taller de muebles inventado, desde una factura, pasando por su pago, hasta el libro mayor por partida doble, y la pequeña cartera que guarda su reserva, con un escenario que decide cómo se registra un pago.',
  'Start from the sample “{name}”': 'Empezar a partir del proyecto de muestra “{name}”',
  'Start from this sample': 'Empezar a partir de este proyecto de muestra',
  'Starting…': 'Empezando…',
  'An empty project': 'Un proyecto vacío',
  'It uses the built-in Systems package and has one view; the Components tab adds more packages.':
    'Usa el paquete incorporado Sistemas y tiene una vista; la pestaña Componentes agrega más paquetes.',
  'Start an empty project': 'Empezar un proyecto vacío',
  Overview: 'Vista general',

  // A package from another project (ADR 0051), and what a package is shared under (ADR 0047).
  'Add from another project…': 'Agregar de otro proyecto…',
  'Update from another project…': 'Actualizar desde otro proyecto…',
  'Add a package from another project': 'Agregar un paquete de otro proyecto',
  'Update “{name}” from another project': 'Actualizar “{name}” desde otro proyecto',
  'Choose the folder of another project, then one of its packages: it is copied here with its images, keeping its ids, so that it can be updated from there later.':
    'Elegir la carpeta de otro proyecto y luego uno de sus paquetes: se copia aquí con sus imágenes y sus mismos ids, para poder actualizarlo desde allí más adelante.',
  'Choose the folder of the project this package came from: what changed there is listed before anything changes here.':
    'Elegir la carpeta del proyecto del que vino este paquete: lo que cambió allí se lista antes de que cambie nada aquí.',
  'Choose a project folder…': 'Elegir la carpeta de un proyecto…',
  'Reading the folder…': 'Leyendo la carpeta…',
  'A folder with no project file': 'Una carpeta sin archivo de proyecto',
  '{path} could not be read: {why}': 'No se pudo leer {path}: {why}',
  'The file is over 4 MiB.': 'El archivo pesa más de 4 MiB.',
  'The file is not valid JSON.': 'El archivo no es JSON válido.',
  'The file holds no package.': 'El archivo no contiene ningún paquete.',
  'That project has no package of its own.': 'Ese proyecto no tiene ningún paquete propio.',
  'Its packages': 'Sus paquetes',
  'That project has no package “{id}”.': 'Ese proyecto no tiene ningún paquete “{id}”.',
  'Add this package': 'Agregar este paquete',
  'Apply the update': 'Aplicar la actualización',
  Holds: 'Contiene',
  '{components}, {relationTypes} and {images}': '{components}, {relationTypes} y {images}',
  'It needs the built-in packages {names}, which the project starts using with it.':
    'Necesita los paquetes incorporados {names}, que el proyecto empieza a usar con él.',
  Version: 'Versión',
  License: 'Licencia',
  Attribution: 'Atribución',
  'An SPDX identifier, such as CC0-1.0, CC-BY-4.0 or MIT.':
    'Un identificador SPDX, como CC0-1.0, CC-BY-4.0 o MIT.',
  'Nothing differs: the package is the same there.':
    'No hay diferencias: el paquete es el mismo allí.',
  none: 'ninguno',
  'The version there, {there}, is older than this one, {here}.':
    'La versión de allí, {there}, es anterior a esta, {here}.',
  '{before} → {after}': '{before} → {after}',
  'Added: “{name}”': 'Se agrega: “{name}”',
  'Changed: “{name}”': 'Cambia: “{name}”',
  'Removed: “{name}”': 'Se quita: “{name}”',
  'In another order': 'En otro orden',
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
  // A new tab that joins the session of another tab of this browser (ADR 0043).
  'Asking the other tabs of this browser that have the project open to share its session.':
    'Pidiendo a las otras pestañas de este navegador que tienen el proyecto abierto que compartan su sesión.',
  'A new tab joins on its own while another tab of this browser has the project open, and none has it open now.':
    'Una pestaña nueva se une sola mientras otra pestaña de este navegador tiene el proyecto abierto, y ahora ninguna lo tiene abierto.',

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
  System: 'Sistema',
  'Language and theme': 'Idioma y tema',
  '{count} warnings': { one: '{count} advertencia', other: '{count} advertencias' },
  Hide: 'Ocultar',
  Copy: 'Copiar',
  Copied: 'Copiado',
  'Could not copy: the list is selected, to copy it with Ctrl+C or ⌘C.':
    'No se pudo copiar: la lista está seleccionada, para copiarla con Ctrl+C o ⌘C.',
  'Your theme applies to this tab only: Visual Anything is not connected.':
    'El tema se aplica solo a esta pestaña: Visual Anything no está conectado.',
  'Turning package code on or off applies to this tab only: Visual Anything is not connected.':
    'Activar o desactivar el código de un paquete se aplica solo a esta pestaña: Visual Anything no está conectado.',
  'Your approval of package code applies to this tab only: Visual Anything is not connected.':
    'La aprobación del código del paquete se aplica solo a esta pestaña: Visual Anything no está conectado.',
  'Your name for comments applies to this tab only: Visual Anything is not connected.':
    'El nombre para los comentarios se aplica solo a esta pestaña: Visual Anything no está conectado.',
  'Your Motion and Fades apply to this tab only: Visual Anything is not connected.':
    'El movimiento y los fundidos se aplican solo a esta pestaña: Visual Anything no está conectado.',

  // Search and jump: the find field over the canvas.
  'Find in the project': 'Buscar en el proyecto',
  'Names, ids, components, values…': 'Nombres, ids, componentes, valores…',
  'Close find': 'Cerrar la búsqueda',
  'Close find (Escape)': 'Cerrar la búsqueda (Escape)',
  'Up and down move through what was found. Enter goes to it; Alt+Enter lists every view that draws it. Escape closes. {shortcut} finds again.':
    'Arriba y abajo recorren lo encontrado. Enter va a lo elegido; Alt+Enter lista cada vista que lo dibuja. Escape cierra. {shortcut} vuelve a buscar.',
  Found: 'Encontrado',
  'Getting ready to find…': 'Preparando la búsqueda…',
  'Nothing found. Try fewer or other words.':
    'No se encontró nada. Probar con menos palabras, u otras.',
  '{count} found': { one: '{count} encontrado', other: '{count} encontrados' },
  '{shown} of {count} found': '{shown} de {count} encontrados',
  'In {view}': 'En {view}',
  'In {view}, open now': 'En {view}, abierta ahora',
  'In no view': 'En ninguna vista',
  'Open in {view}': 'Abrir en {view}',
  'Relation: {type}': 'Relación: {type}',
  'id {id}': 'id {id}',
  '{attribute}: {value}': '{attribute}: {value}',
  'Drawn in {count} views: {views}.': {
    one: 'Dibujado en {count} vista: {views}.',
    other: 'Dibujado en {count} vistas: {views}.',
  },
  'No view draws {name}.': 'Ninguna vista dibuja {name}.',
  '{name}, {what}, is selected in {view}.': '{name}, {what}, está seleccionado en {view}.',
  '{name}, {what}, is selected in {view}, inside the collapsed {container}.':
    '{name}, {what}, está seleccionado en {view}, dentro del contenedor contraído {container}.',
  '{name}, {what}, is selected in {view}, which does not draw it now.':
    '{name}, {what}, está seleccionado en {view}, que ahora no lo dibuja.',
  'The filters or focus mode hide it.': 'Los filtros o el modo foco lo ocultan.',

  // Copy address, in the header.
  'Copy address': 'Copiar dirección',
  'Copy an address that opens this view where it is: its camera, selection, filters, focus, scenario step and physical-space panel':
    'Copiar una dirección que abre esta vista tal como está: su cámara, selección, filtros, foco, paso del escenario y panel del espacio físico',
  'Address copied.': 'Dirección copiada.',
  'Address copied, without the selection: an address holds at most {max} selected things.':
    'Dirección copiada, sin la selección: una dirección guarda como máximo {max} cosas seleccionadas.',

  // The shell and the canvas's text alternative.
  Canvas: 'Lienzo',
  'There is no view to draw. Make one with New view…, under Views in the Model tab.':
    'No hay ninguna vista para dibujar. Crear una con Nueva vista…, en Vistas, en la pestaña Modelo.',
  '{count} element shapes': {
    one: '{count} forma de elemento',
    other: '{count} formas de elementos',
  },
  '{view}, from the {perspective} perspective: {shapes}, {relations} and {free}.':
    '{view}, desde la perspectiva {perspective}: {shapes}, {relations} y {free}.',

  // Import, in the header (ADR 0042): where the file comes from, its kinds mapped, the report.
  'Import…': 'Importar…',
  Import: 'Importar',
  'Mermaid diagrams (flowcharts, C4, ER and class diagrams), spreadsheets (CSV or TSV), JSON, Structurizr workspaces, LikeC4 models and draw.io files. The file is read here, in this tab, and nothing in it runs.':
    'Mermaid (flowchart, C4, erDiagram y classDiagram), hojas de cálculo (CSV o TSV), JSON, espacios de trabajo de Structurizr, modelos de LikeC4 y archivos de draw.io. El archivo se lee aquí, en esta pestaña, y nada de lo que contiene se ejecuta.',
  'Which files it reads': 'Qué archivos lee',
  'Read from': 'Leer desde',
  'A file': 'Un archivo',
  'Pasted text': 'Texto pegado',
  File: 'Archivo',
  'pasted text': 'texto pegado',
  Text: 'Texto',
  Format: 'Formato',
  'As the file says': 'Según el archivo',
  JSON: 'JSON',
  Mermaid: 'Mermaid',
  Spreadsheet: 'Hoja de cálculo',
  'The file could not be read: {why}': 'No se pudo leer el archivo: {why}',
  Read: 'Leer',
  'Import “{name}”': 'Importar “{name}”',
  'It starts using the built-in packages it maps to: {packages}.':
    'Empieza a usar los paquetes incorporados con los que se corresponde: {packages}.',
  '(no component given)': '(sin componente)',
  '(no relation type given)': '(sin tipo de relación)',
  'What sits inside what goes inside through':
    'Lo que está dentro de otra cosa queda dentro mediante',
  'Choose a relation type that nests': 'Elegir un tipo de relación que anida',
  'Match rows to the project’s elements by':
    'Emparejar las filas con los elementos del proyecto por',
  'Their id, when the file has one': 'Su id, si el archivo lo tiene',
  'Create its view “{name}”': 'Crear su vista “{name}”',
  'Create its {count} views': 'Crear sus {count} vistas',
  '{count} things matched nothing': {
    one: '{count} cosa no coincidió con nada',
    other: '{count} cosas no coincidieron con nada',
  },
  'This import is too large to send from the app: {size} MiB, where the most is {limit} MiB. Import it with visual-anything import instead.':
    'Esta importación es demasiado grande para enviarla desde la app: {size} MiB, y el máximo es {limit} MiB. Importarla con visual-anything import en su lugar.',
  'Importing…': 'Importando…',
  Back: 'Atrás',
  'It creates {elements}, {relations} and {views}.': 'Crea {elements}, {relations} y {views}.',
  '{count} views': { one: '{count} vista', other: '{count} vistas' },
  'It updates {count} elements of the project.': {
    one: 'Actualiza {count} elemento del proyecto.',
    other: 'Actualiza {count} elementos del proyecto.',
  },
  'It updates {count} relations of the project.': {
    one: 'Actualiza {count} relación del proyecto.',
    other: 'Actualiza {count} relaciones del proyecto.',
  },
  'Read as {format}.': 'Leído como {format}.',
  'In the file': 'En el archivo',
  'How many': 'Cuántos',
  '{heading} for {kind}': '{heading} para {kind}',
  'In this project': 'En este proyecto',
  '{package}, not used yet': '{package}, todavía sin usar',
  'Imported “{name}”': 'Se importó “{name}”',
  'It created {elements}, {relations} and {views}.': 'Creó {elements}, {relations} y {views}.',
  'It updated {count} elements.': {
    one: 'Actualizó {count} elemento.',
    other: 'Actualizó {count} elementos.',
  },
  'It updated {count} relations.': {
    one: 'Actualizó {count} relación.',
    other: 'Actualizó {count} relaciones.',
  },
  'One undo takes it all back.': 'Un solo deshacer lo revierte todo.',
  'Open its view': 'Abrir su vista',

  // M8b W56: Import…'s drawing step, for HTML imported as a drawing (ADR 0068).
  'An HTML file or fragment becomes a drawing: a picture of the page that Visual Anything makes without running anything in it or fetching anything it names.':
    'Un archivo o fragmento HTML se convierte en un dibujo: una imagen de la página que Visual Anything hace sin ejecutar nada de lo que contiene ni buscar nada de lo que nombra.',
  'HTML, as a drawing': 'HTML, como dibujo',
  'Import “{name}” as a drawing': 'Importar “{name}” como dibujo',
  'Imported “{name}” as a drawing': 'Se importó “{name}” como dibujo',
  'The drawing is stored in one of the project’s own packages, and its element shows it. One undo takes it all back.':
    'El dibujo se guarda en uno de los paquetes propios del proyecto, y su elemento lo muestra. Un solo deshacer lo revierte todo.',
  'Width in pixels': 'Ancho en píxeles',
  'Shown by': 'Lo muestra',
  'The selected element “{name}”': 'El elemento seleccionado “{name}”',
  'A new element of': 'Un elemento nuevo de',
  'Making the drawing…': 'Haciendo el dibujo…',
  'What making it dropped': 'Lo que se quitó al hacerlo',
  'Nothing: the HTML held only what a drawing keeps.':
    'Nada: el HTML tenía solo lo que un dibujo conserva.',

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

  // The read-only page (ADR 0041): its header, canvas, panels and About.
  'Reading tools': 'Herramientas de lectura',
  Find: 'Buscar',
  'Find (Ctrl+F)': 'Buscar (Ctrl+F)',
  About: 'Acerca de',
  'This project has no view to show. Whoever shared it can add one in Visual Anything and export the page again.':
    'Este proyecto no tiene ninguna vista para mostrar. Quien lo compartió puede agregar una en Visual Anything y volver a exportar la página.',
  '{view} ({perspective})': '{view} ({perspective})',
  'Zoom in (+)': 'Acercar (+)',
  'Zoom out (−)': 'Alejar (−)',
  'Fit the view': 'Encuadrar la vista',
  'Fit the view (0)': 'Encuadrar la vista (0)',
  'This view has no shapes. Choose another view.': 'Esta vista no tiene formas. Elegir otra vista.',
  'Drag or use two fingers to pan; pinch, Ctrl with the wheel, or + and − to zoom; 0 fits the view. Arrow keys go from shape to shape, Alt with ↑ and ↓ to the container and inside it; ] and [ step through relations, Enter follows one; Alt with − and + collapses and expands. Escape clears the selection.':
    'Arrastrar o usar dos dedos para desplazar; pellizcar, Ctrl con la rueda, o + y − para hacer zoom; 0 encuadra la vista. Las flechas van de forma en forma, Alt con ↑ y ↓ al contenedor y a su interior; ] y [ recorren las relaciones, Enter sigue una; Alt con − y + contrae y expande. Escape quita la selección.',
  'This page cannot show its project': 'Esta página no puede mostrar su proyecto',
  'And {count} more problems.': {
    one: 'Y {count} problema más.',
    other: 'Y {count} problemas más.',
  },
  Selected: 'Seleccionado',
  'Selected: {things}': 'Seleccionado: {things}',
  'Clear the selection (Escape)': 'Quitar la selección (Escape)',
  '{from} {relationType} {to}': '{from} {relationType} {to}',
  'Close (Escape)': 'Cerrar (Escape)',
  'Focus on the selection, dimming what it does not reach':
    'Enfocar la selección, atenuando lo que no alcanza',
  Reach: 'Distancia',
  '{count} degrees': { one: '{count} grado', other: '{count} grados' },
  'Every degree': 'Todos los grados',
  'Isolate: hide what it does not reach': 'Aislar: ocultar lo que no alcanza',
  'Scenario “{name}”': 'Escenario “{name}”',
  'Close the scenario': 'Cerrar el escenario',
  '{count} steps inside “{container}”, which this view shows collapsed.': {
    one: '{count} paso dentro de “{container}”, que esta vista muestra contraído.',
    other: '{count} pasos dentro de “{container}”, que esta vista muestra contraído.',
  },
  'A relation of this step is no longer in the model, so this step is broken.':
    'Una relación de este paso ya no está en el modelo, así que este paso está roto.',
  'Hide the data': 'Ocultar los datos',
  'Show the data': 'Mostrar los datos',
  'A read-only page of this project, made with Visual Anything: it shows every view and plays every scenario, changes nothing, and connects nowhere.':
    'Una página de solo lectura de este proyecto, hecha con Visual Anything: muestra todas las vistas y reproduce todos los escenarios, no cambia nada y no se conecta a ningún lado.',
  'Made on {date}.': 'Hecha el {date}.',
  '{views} and {scenarios}.': '{views} y {scenarios}.',
  '{count} scenarios': { one: '{count} escenario', other: '{count} escenarios' },
  Packages: 'Paquetes',
  'built into Visual Anything': 'incorporado en Visual Anything',
  'the project’s own': 'propio del proyecto',
  'version {version}': 'versión {version}',
  'license {license}': 'licencia {license}',
  'Images: {sources}': 'Imágenes: {sources}',
  '{count} relations leave this view: {list}.': {
    one: '{count} relación sale de esta vista: {list}.',
    other: '{count} relaciones salen de esta vista: {list}.',
  },

  // The Export dialog's formats, and the read-only page among them (M6b).
  'Export “{view}”': 'Exportar “{view}”',
  'PNG image': 'Imagen PNG',
  'Read-only page': 'Página de solo lectura',
  'One file to share, embed and read on a phone':
    'Un archivo para compartir, incrustar y leer en un teléfono',
  'It leaves out:': 'Deja fuera:',
  'Its text is part of the picture, so it cannot be selected, searched or read aloud.':
    'Su texto es parte de la imagen, así que no se puede seleccionar, buscar ni leer en voz alta.',
  'Writing the file…': 'Escribiendo el archivo…',
  'The file could not be written: {why}': 'No se pudo escribir el archivo: {why}',
  'Save {format}': 'Guardar {format}',
  'Open at what the canvas shows now': 'Abrir en lo que muestra ahora el lienzo',
  'This view, where the canvas looks, the selection, the filters and focus':
    'Esta vista, adónde mira el lienzo, la selección, los filtros y el foco',
  'Writing the page…': 'Escribiendo la página…',
  'It holds the whole project, every view, scenario and tour, whatever this view shows: share it only with those who may read all of it. It connects nowhere, and the browser saves it.':
    'Contiene todo el proyecto, cada vista, cada escenario y cada recorrido, muestre lo que muestre esta vista: compartirla solo con quien pueda leerlo todo. No se conecta a ningún lado, y la guarda el navegador.',
  'Threads of comments, which name the people who wrote them.':
    'Los hilos de comentarios, que nombran a quienes los escribieron.',
  'The conflicts a git merge left in the files: the page shows what each file keeps, and neither side’s other values.':
    'Los conflictos que dejó un merge de git en los archivos: la página muestra lo que conserva cada archivo, y no los otros valores de ninguno de los dos lados.',
  'Speaker notes: its tours play with their captions and marks, and the notes stay with whoever presents.':
    'Las notas del orador: sus recorridos se reproducen con sus rótulos y sus marcas, y las notas quedan con quien presenta.',
  'Editing, the history and Claude’s guidance: the page only reads.':
    'La edición, el historial y la guía de Claude: la página solo lee.',
  'Layout, which does not run in the page: shapes a view keeps no position for are drawn in a row, as before a layout.':
    'El diseño automático, que no se ejecuta en la página: las formas para las que una vista no guarda posición se dibujan en una fila, como antes de organizar.',
  'Package code, and what it computes and draws: no code of a package runs in a page.':
    'El código de los paquetes, y lo que calcula y dibuja: ningún código de un paquete se ejecuta en una página.',
  'This page is {size}, past {limit}: it may open slowly, and some hosts and mail refuse files this large.':
    'Esta página pesa {size}, más de {limit}: puede abrirse con lentitud, y algunos servidores y correos rechazan archivos tan grandes.',
  'This copy of Visual Anything has no viewer for read-only pages, as when it runs from its sources. Run pnpm build, then start it again.':
    'Esta copia de Visual Anything no puede armar páginas de solo lectura, como cuando se ejecuta desde sus fuentes. Ejecutar pnpm build y volver a iniciarla.',
  'The page could not be written: {why}': 'No se pudo escribir la página: {why}',
  'Save the page': 'Guardar la página',
  'Save the page anyway': 'Guardar la página de todos modos',
  'SVG drawing': 'Dibujo SVG',
  'The view as a drawing that scales, for pages and documents':
    'La vista como un dibujo que se escala, para páginas y documentos',
  'PDF document': 'Documento PDF',
  'The view on one page, to print or attach; made when saved':
    'La vista en una página, para imprimir o adjuntar; se hace al guardarla',
  'Outline in Markdown': 'Esquema en Markdown',
  'The view as text, which is also its long description':
    'La vista como texto, que es también su descripción larga',
  'Mermaid flowchart': 'Flujograma de Mermaid',
  'For GitHub, wikis and other tools that draw Mermaid':
    'Para GitHub, wikis y otras herramientas que dibujan Mermaid',
  'Structurizr DSL': 'DSL de Structurizr',
  'A C4 workspace of the view’s Systems components':
    'Un espacio de trabajo C4 de los componentes de Systems de la vista',
  'Making the file… A large view can take a while.':
    'Haciendo el archivo… Una vista grande puede tardar un rato.',
  'Stop making it': 'Dejar de hacerlo',
  'It could not hold:': 'No pudo contener:',

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
  'World holds no elements yet. Add one with Add an element, on the canvas.':
    'Mundo todavía no contiene elementos. Agregar uno con Agregar un elemento, en el lienzo.',
  Views: 'Vistas',
  Scenarios: 'Escenarios',
  '{count} steps over {view}': {
    one: '{count} paso sobre {view}',
    other: '{count} pasos sobre {view}',
  },
  'This project has no scenarios yet. Make one with New scenario, then click relations on the canvas in the order they happen.':
    'Este proyecto todavía no tiene escenarios. Crear uno con Nuevo escenario, y luego hacer clic en las relaciones del lienzo en el orden en que suceden.',

  // The views.
  'This project has no views yet. Make one with New view…, below.':
    'Este proyecto todavía no tiene vistas. Crear una con Nueva vista…, más abajo.',
  'New view…': 'Nueva vista…',
  'New view': 'Nueva vista',
  'This view is open on the canvas': 'Esta vista está abierta en el lienzo',
  'Open "{name}" on the canvas': 'Abrir "{name}" en el lienzo',
  // A badge: the view is open.
  Open: 'Abierta',
  'Settings of "{name}"': 'Opciones de "{name}"',
  Settings: 'Opciones',
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
    'Nombrar la perspectiva desde la que se ve, como Seguridad o Responsables.',
  'Security overview': 'Resumen de seguridad',
  Security: 'Seguridad',
  'Every relation type that nests arranges it at first; its settings change that.':
    'Al principio la organizan todos los tipos de relación que anidan; sus opciones lo cambian.',

  // The outline.
  'There is no view to outline.': 'No hay ninguna vista para mostrar en el esquema.',
  'There is no view to outline. Make one with New view…, under Views.':
    'No hay ninguna vista para mostrar en el esquema. Crear una con Nueva vista…, en Vistas.',
  'This view has no shapes yet. Add one with Add an element, on the canvas.':
    'Esta vista todavía no tiene formas. Agregar una con Agregar un elemento, en el lienzo.',
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
  '{name}, {component}, row {position} of {count} in {container}, {relations}.':
    '{name}, {component}, fila {position} de {count} en {container}, {relations}.',
  '{name}, {component}, {detail}, row {position} of {count} in {container}, {relations}.':
    '{name}, {component}, {detail}, fila {position} de {count} en {container}, {relations}.',
  '{name}, {component}, {detail}, {where}, {relations}.':
    '{name}, {component}, {detail}, {where}, {relations}.',
  '{count} other containers': { one: '{count} contenedor más', other: '{count} contenedores más' },
  'no relations': 'ninguna relación',
  'A relation that no longer exists.': 'Una relación que ya no existe.',
  ', ending on {end}': ', que termina en {end}',
  ', relation {position} of {count} of {element}': ', relación {position} de {count} de {element}',
  'Nothing is selected.': 'No hay nada seleccionado.',
  'Nothing is selected. Select a shape on the canvas, or an item of the outline, to see it here.':
    'No hay nada seleccionado. Seleccionar una forma en el lienzo, o un elemento del esquema, para verlo aquí.',
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
  'Remove the decisions of “{name}”': 'Quitar las decisiones de “{name}”',
  'Removed the decisions of “{name}”.': 'Se quitaron las decisiones de “{name}”.',
  'Its decisions do not hold together, so it plays every step in order and its steps cannot change: {why}':
    'Sus decisiones no encajan entre sí, así que reproduce todos los pasos en orden y sus pasos no se pueden cambiar: {why}',
  'Remove the decisions': 'Quitar las decisiones',
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

  // M11c: decisions in the app (ADR 0078). Choosing, and what it says.
  '“{label}” plays at “{question}”.': 'En “{question}” se reproduce “{label}”.',
  'Paused before “{question}”. Choose an alternative, then play on.':
    'En pausa antes de “{question}”. Elegir una alternativa y seguir reproduciendo.',
  'Stop at each decision': 'Detenerse en cada decisión',
  // The decision card.
  'Decisions here': 'Decisiones aquí',
  Decision: 'Decisión',
  'Next, a decision': 'A continuación, una decisión',
  'Nothing happens': 'No pasa nada',
  'Ends the scenario': 'Termina el escenario',
  'Press 1 to {count} to choose; the arrow keys go from one to the next.':
    'Pulsar de 1 a {count} para elegir; las flechas van de una a la siguiente.',
  // The steps' list.
  '{count} broken': { one: '{count} roto', other: '{count} rotos' },
  'Hide its steps': 'Ocultar sus pasos',
  'Show its steps': 'Mostrar sus pasos',
  '{step} (in “{label}” at “{question}”)': '{step} (en “{label}” de “{question}”)',
  // Recording alternatives.
  Recording: 'Grabación',
  'Add an alternative here': 'Agregar una alternativa aquí',
  'The step recording follows is in no alternative.':
    'El paso tras el que se graba no está en ninguna alternativa.',
  'End the alternative': 'Terminar la alternativa',
  'Record after the step again': 'Volver a grabar después del paso',
  'Click the relation the alternative “{label}” starts with: it comes after step {n}. Shift+click does the same.':
    'Hacer clic en la relación con la que empieza la alternativa “{label}”: va después del paso {n}. Mayús+clic hace lo mismo.',
  'Click relations on the canvas in the order they happen: the next click adds a step after “{question}”, whichever way it went.':
    'Hacer clic en las relaciones del lienzo en el orden en que ocurren: el próximo clic agrega un paso después de “{question}”, haya ido por donde haya ido.',
  'Click the first relation of “{label}” on the canvas.':
    'Hacer clic en el lienzo en la primera relación de “{label}”.',
  'The next click records after “{question}”.': 'El próximo clic graba después de “{question}”.',
  'Nothing was recorded: {why}': 'No se grabó nada: {why}',
  'Recorded step {n}, the first of “{label}”: {sentence}.':
    'Paso {n} grabado, el primero de “{label}”: {sentence}.',
  Yes: 'Sí',
  No: 'No',
  'Alternative {n}': 'Alternativa {n}',
  'One more alternative for “{question}”, after step {n}.':
    'Una alternativa más para “{question}”, después del paso {n}.',
  'A new decision after step {n}: its first alternative keeps the steps that follow, and recording goes on in the second.':
    'Una decisión nueva después del paso {n}: su primera alternativa conserva los pasos que siguen, y la grabación sigue en la segunda.',
  '“{question}” has 8 alternatives already, as many as a decision holds.':
    '“{question}” ya tiene 8 alternativas, todas las que admite una decisión.',
  Question: 'Pregunta',
  'Is every item in stock?': '¿Están todos los artículos en stock?',
  'Label of the steps that follow': 'Etiqueta de los pasos que siguen',
  'Label of the new alternative': 'Etiqueta de la alternativa nueva',
  'Record the alternative': 'Grabar la alternativa',
  'This step and the ones after it in its alternative follow the decision, whichever way it goes.':
    'Este paso y los que lo siguen en su alternativa pasan a seguir a la decisión, vaya por donde vaya.',
  'Step {n} and the steps after it in its alternative now follow the decision.':
    'El paso {n} y los que lo siguen en su alternativa ahora siguen a la decisión.',
  'Rejoin here': 'Reunir aquí',
  'Enter saves a field; Shift+Enter starts a new line. Leave data blank for none.':
    'Enter guarda lo escrito; Mayús+Enter empieza una línea nueva. Dejar los datos en blanco para no tener ninguno.',

  // Claude's guidance.
  'Claude’s guidance': 'Guía de Claude',
  'Dismiss Claude’s guidance': 'Descartar la guía de Claude',
  '{first} and {count} more': '{first} y {count} más',
  'Claude highlights {list}.': 'Claude resalta {list}.',
  'Claude focuses on {list}.': 'Claude se enfoca en {list}.',
  'Claude highlights nothing this view shows.':
    'Claude no resalta nada de lo que muestra esta vista.',
  'Claude focuses on nothing this view shows.':
    'Claude no se enfoca en nada de lo que muestra esta vista.',
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
  'Also delete its {count} rows': {
    one: 'Eliminar también su fila',
    other: 'Eliminar también sus {count} filas',
  },
  'Also delete their {count} rows': {
    one: 'Eliminar también su fila',
    other: 'Eliminar también sus {count} filas',
  },
  'Also delete {count} more elements it holds:': {
    one: 'Eliminar también {count} elemento más que contiene:',
    other: 'Eliminar también {count} elementos más que contiene:',
  },
  'Also delete {count} more elements they hold:': {
    one: 'Eliminar también {count} elemento más que contienen:',
    other: 'Eliminar también {count} elementos más que contienen:',
  },
  '{name} is also in {container}': '{name} también está en {container}',
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

  // The canvas toolbar's More, which holds what its row has no room for (W26).
  More: 'Más',
  'More of the canvas toolbar': 'Más de la barra de herramientas del lienzo',

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
  // W51: resizing, aligning and distributing shapes on the canvas (ADR 0074). An alignment guide is
  // "línea de alineación", since "guía" is Claude's guidance.
  Align: 'Alinear',
  'Align, distribute or size alike the selected shapes':
    'Alinear, distribuir o igualar el tamaño de las formas seleccionadas',
  'Align left': 'Alinear a la izquierda',
  'Align centers': 'Alinear los centros',
  'Align right': 'Alinear a la derecha',
  'Align top': 'Alinear arriba',
  'Align middles': 'Alinear al medio',
  'Align bottom': 'Alinear abajo',
  'Distribute horizontally': 'Distribuir horizontalmente',
  'Distribute vertically': 'Distribuir verticalmente',
  'Same width': 'Mismo ancho',
  'Same height': 'Mismo alto',
  'Lines up the left edges of the selected shapes on the leftmost one’s. Alt+Shift+←':
    'Alinea los bordes izquierdos de las formas seleccionadas con el de la que está más a la izquierda. Alt+Mayús+←',
  'Lines up the selected shapes’ centers, on a line down the middle of their bounds.':
    'Alinea los centros de las formas seleccionadas sobre una línea vertical, en el medio del espacio que ocupan.',
  'Lines up the right edges of the selected shapes on the rightmost one’s. Alt+Shift+→':
    'Alinea los bordes derechos de las formas seleccionadas con el de la que está más a la derecha. Alt+Mayús+→',
  'Lines up the top edges of the selected shapes on the highest one’s. Alt+Shift+↑':
    'Alinea los bordes superiores de las formas seleccionadas con el de la que está más arriba. Alt+Mayús+↑',
  'Lines up the selected shapes’ middles, on a line across the middle of their bounds.':
    'Alinea los medios de las formas seleccionadas sobre una línea horizontal, en el medio del espacio que ocupan.',
  'Lines up the bottom edges of the selected shapes on the lowest one’s. Alt+Shift+↓':
    'Alinea los bordes inferiores de las formas seleccionadas con el de la que está más abajo. Alt+Mayús+↓',
  'Spaces the selected shapes with equal gaps from left to right; the first and the last stay.':
    'Distribuye las formas seleccionadas con espacios iguales de izquierda a derecha; la primera y la última no se mueven.',
  'Spaces the selected shapes with equal gaps from top to bottom; the first and the last stay.':
    'Distribuye las formas seleccionadas con espacios iguales de arriba abajo; la primera y la última no se mueven.',
  'Gives the selected shapes the width of the widest of them.':
    'Da a las formas seleccionadas el ancho de la más ancha.',
  'Gives the selected shapes the height of the tallest of them.':
    'Da a las formas seleccionadas el alto de la más alta.',
  'Select two or more shapes to align them.': 'Seleccionar dos formas o más para alinearlas.',
  'Select three or more shapes to distribute them.':
    'Seleccionar tres formas o más para distribuirlas.',
  'Select two or more shapes whose size can change.':
    'Seleccionar dos formas o más cuyo tamaño pueda cambiar.',
  'They are aligned already.': 'Ya están alineadas.',
  'They are distributed already.': 'Ya están distribuidas.',
  'They have that size already.': 'Ya tienen ese tamaño.',
  'Alt+Shift+arrow keys (⌥⇧ on macOS)': 'Alt+Mayús+flechas (⌥⇧ en macOS)',
  'Align the selected shapes to that side: left, right, top or bottom':
    'Alinear las formas seleccionadas de ese lado: a la izquierda, a la derecha, arriba o abajo',
  'Shift while resizing': 'Mayús mientras se cambia el tamaño',
  'Keep the shape’s proportions; a shape whose outline keeps them changes them':
    'Mantener las proporciones de la forma; una forma cuyo contorno las mantiene las cambia',
  'Alt while resizing (⌥ on macOS)': 'Alt mientras se cambia el tamaño (⌥ en macOS)',
  'Resize the shape from its middle': 'Cambiar el tamaño de la forma desde su centro',
  'Ctrl while dragging or resizing (⌘ on macOS)':
    'Ctrl mientras se arrastra o se cambia el tamaño (⌘ en macOS)',
  'Turn the alignment guides off, as Alt does while dragging':
    'Desactivar las líneas de alineación, como hace Alt mientras se arrastra',
  'Escape while dragging or resizing': 'Esc mientras se arrastra o se cambia el tamaño',
  'Stop, and leave the shapes as they were': 'Detener, y dejar las formas como estaban',
  // A table's columns, and any shape's rows, in the inspector.
  Columns: 'Columnas',
  Rows: 'Filas',
  // Attribute types, as the inspector names them; project files keep writing them in English.
  string: 'texto',
  number: 'número',
  boolean: 'booleano',
  'This view does not nest by “{type}”, so its {count} columns sit loose.': {
    one: 'Esta vista no anida por “{type}”, así que su columna queda suelta.',
    other: 'Esta vista no anida por “{type}”, así que sus {count} columnas quedan sueltas.',
  },
  'This view does not nest by “{type}”, so its {count} rows sit loose.': {
    one: 'Esta vista no anida por “{type}”, así que su fila queda suelta.',
    other: 'Esta vista no anida por “{type}”, así que sus {count} filas quedan sueltas.',
  },
  'Show them as rows': 'Mostrarlas como filas',
  'The columns show as rows.': 'Las columnas se muestran como filas.',
  'The rows show as rows.': 'Las filas se muestran como filas.',
  'No columns yet.': 'Todavía no hay columnas.',
  'No rows yet.': 'Todavía no hay filas.',
  'Move “{name}” up': 'Subir “{name}”',
  'Move “{name}” down': 'Bajar “{name}”',
  '“{name}” moved up.': '“{name}” subió.',
  '“{name}” moved down.': '“{name}” bajó.',
  Up: 'Subir',
  Down: 'Bajar',
  'Remove “{name}”': 'Quitar “{name}”',
  '“{name}” was removed.': 'Se quitó “{name}”.',
  'Add a column': 'Agregar una columna',
  'Add a row': 'Agregar una fila',
  'Added a row to “{name}”.': 'Se agregó una fila a “{name}”.',
  '“{name}” draws no rows to add a row to.': '“{name}” no dibuja filas a las que agregar una.',
  'Type or paste columns': 'Escribir o pegar columnas',
  'id uuid pk, or a CREATE TABLE statement': 'id uuid pk, o una instrucción CREATE TABLE',
  'Columns to add': 'Columnas que se agregan',
  'Add {count} columns': { one: 'Agregar {count} columna', other: 'Agregar {count} columnas' },
  'Added {count} columns to “{name}”.': {
    one: 'Se agregó {count} columna a “{name}”.',
    other: 'Se agregaron {count} columnas a “{name}”.',
  },
  'Skipped: {text}: {reason}': 'Omitido: {text}: {reason}',
  'Not related: {text}: {reason}': 'Sin relacionar: {text}: {reason}',
  'an index, not a column': 'un índice, no una columna',
  'a check, not a column': 'una verificación, no una columna',
  'not a column': 'no es una columna',
  'a unique key over several columns': 'una clave única de varias columnas',
  'names no column': 'no nombra ninguna columna',
  'a foreign key it cannot read': 'una clave foránea que no se puede leer',
  'could not be read': 'no se pudo leer',
  // A row in the inspector and the outline, and drops onto a shape that draws rows (ADR 0023).
  'Drawn as a row here: a band as wide as its container, with no border of its own, so its shape, stroke and size apply only where a view draws it as a shape.':
    'Se dibuja como fila aquí: una banda tan ancha como su contenedor, sin borde propio, así que su forma, su trazo y su tamaño solo se aplican donde una vista la dibuja como forma.',
  'In "{container}": row {place} of {count}, in the model’s order':
    'En "{container}": fila {place} de {count}, en el orden del modelo',
  'A row moves with its container, and keeps its place among the rows.':
    'Una fila se mueve con su contenedor y mantiene su lugar entre las filas.',
  'Not drawn: inside a row': 'No se dibuja: dentro de una fila',
  'Make it a row of "{target}"': 'Convertirlo en una fila de "{target}"',
  'Make {count} elements rows of "{target}"': 'Convertir {count} elementos en filas de "{target}"',
  'Before "{row}"': 'Antes de "{row}"',
  'As its first row': 'Como su primera fila',
  'After its last row': 'Después de su última fila',
  'Only a {allowed} can be a row of "{target}", through "{type}"':
    'Solo un elemento {allowed} puede ser una fila de "{target}", mediante "{type}"',
  'No relation type that nests can make it a row of "{target}"':
    'Ningún tipo de relación que anida puede convertirlo en una fila de "{target}"',
  'Nothing can be put inside it in this view': 'En esta vista no se puede poner nada dentro',
  '{first} or {last}': '{first} o {last}',

  // The canvas's keyboard help.
  Keyboard: 'Teclado',
  'Arrow keys': 'Flechas',
  'Select the nearest shape in that direction, going into the containers on the way':
    'Seleccionar la forma más cercana en esa dirección, entrando en los contenedores que encuentra',
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
  'Shift+Up, Shift+Down on a row': 'Mayús+Arriba, Mayús+Abajo en una fila',
  'Move the row up or down among the rows of its table, in the model’s order':
    'Subir o bajar la fila entre las filas de su tabla, en el orden del modelo',
  'Ctrl+Enter (⌘Enter on macOS)': 'Ctrl+Enter (⌘Enter en macOS)',
  'On a table, add a row at its end; on a row, add one below it; then edit its name, where Ctrl+Enter adds the next row and Escape stops':
    'En una tabla, agregar una fila al final; en una fila, agregar otra debajo; después editar su nombre, donde Ctrl+Enter agrega la fila siguiente y Esc termina',
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
  'Zoom in, zoom out, and fit the view': 'Acercar, alejar y encuadrar la vista',
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
  'Ctrl+F or ⌘F': 'Ctrl+F o ⌘F',
  'Find names, ids, components and attribute values in the project, and go to what was found':
    'Buscar nombres, ids, componentes y valores de atributos en el proyecto, e ir a lo encontrado',
  'The arrow keys select shapes, ] and [ (or . and ,) step through the selected element’s relations, and Enter follows a relation, and Shift+F10 opens the selected shape’s menu. Every key is listed under Keyboard, in the canvas toolbar.':
    'Las flechas seleccionan formas, ] y [ (o . y ,) recorren las relaciones del elemento seleccionado, Enter sigue una relación y Mayús+F10 abre el menú de la forma seleccionada. Todas las teclas están en Teclado, en la barra de herramientas del lienzo.',

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
  // The side panels' keys, after the canvas's own (M3d).
  'Alt+Shift+M (⌥⇧M on macOS)': 'Alt+Mayús+M (⌥⇧M en macOS)',
  'Collapse the model panel, or open it again; these keys work wherever the focus is, except while typing':
    'Contraer el panel del modelo, o abrirlo de nuevo; estas teclas funcionan dondequiera que esté el foco, salvo mientras se escribe',
  'Alt+Shift+N (⌥⇧N on macOS)': 'Alt+Mayús+N (⌥⇧N en macOS)',
  'Collapse the inspector, or open it again': 'Contraer el inspector, o abrirlo de nuevo',
  'Left and Right arrows, on the edge of a panel':
    'Flechas izquierda y derecha, en el borde de un panel',
  'Move the edge by 16 pixels, making the panel wider or narrower; double-clicking the edge gives back its default width':
    'Mover el borde 16 píxeles, para ensanchar o estrechar el panel; hacer doble clic en el borde le devuelve su ancho predeterminado',
  'Home and End, on the edge of a panel': 'Inicio y Fin, en el borde de un panel',
  'Make the panel as narrow or as wide as it goes: from 200 pixels to half the window':
    'Dejar el panel tan estrecho o tan ancho como puede ser: de 200 píxeles a la mitad de la ventana',
  'Enter, on the edge of a panel': 'Enter, en el borde de un panel',
  'Collapse the panel': 'Contraer el panel',
  // The side panels' edges and strips (M3d).
  'Width of the model panel': 'Ancho del panel del modelo',
  'Width of the inspector': 'Ancho del inspector',
  '{width} pixels': '{width} píxeles',
  'Drag to change the width; double-click for the default width':
    'Arrastrar para cambiar el ancho; hacer doble clic para el ancho predeterminado',
  'Collapse the model panel': 'Contraer el panel del modelo',
  'Collapse the inspector': 'Contraer el inspector',
  'Open the model panel': 'Abrir el panel del modelo',
  'Open the inspector': 'Abrir el inspector',
  'The model panel is collapsed.': 'El panel del modelo está contraído.',
  'The model panel is open.': 'El panel del modelo está abierto.',
  'The inspector is collapsed.': 'El inspector está contraído.',
  'The inspector is open.': 'El inspector está abierto.',
  // M10: the physical-space panel beside the canvas (ADR 0076). The glossary avoids "root" for World,
  // so the panel "muestra" an element; never "3D" alone.
  'Physical space': 'Espacio físico',
  'Open the physical-space panel': 'Abrir el panel del espacio físico',
  'Close the physical-space panel': 'Cerrar el panel del espacio físico',
  'Width of the physical-space panel': 'Ancho del panel del espacio físico',
  'Shows “{name}”': 'Muestra “{name}”',
  'Nothing this view shows is in physical space yet. To put an element there, select it and choose Place in physical space, show a solid on it, or ask Claude to give it a pose.':
    'Nada de lo que muestra esta vista está todavía en el espacio físico. Para poner un elemento allí, seleccionarlo y elegir Ubicar en el espacio físico, mostrar un sólido en él, o pedirle a Claude que lo ubique.',
  'Physical space is drawn while Visual Anything is connected.':
    'El espacio físico se dibuja mientras Visual Anything está conectado.',
  'This browser cannot draw physical space: it has no WebGL.':
    'Este navegador no puede dibujar el espacio físico: no tiene WebGL.',
  'Physical space: {count} elements': {
    one: 'Espacio físico: {count} elemento',
    other: 'Espacio físico: {count} elementos',
  },
  'Alt+Shift+P (⌥⇧P on macOS)': 'Alt+Mayús+P (⌥⇧P en macOS)',
  'Open the physical-space panel beside the canvas, or close it; these keys work wherever the focus is, except while typing':
    'Abrir el panel del espacio físico junto al lienzo, o cerrarlo; estas teclas funcionan dondequiera que esté el foco, salvo mientras se escribe',
  'Left and Right arrows, on the edge of the physical-space panel':
    'Flechas izquierda y derecha, en el borde del panel del espacio físico',
  'Make the panel wider or narrower by 16 pixels; Home and End make it as narrow or as wide as it goes, from 280 pixels to half the window':
    'Ensanchar o estrechar el panel 16 píxeles; Inicio y Fin lo dejan tan estrecho o tan ancho como puede ser, de 280 píxeles a la mitad de la ventana',
  // M10: the panel's interaction and its list (ADR 0076): its camera, its tools, its handles, its
  // list and what it says of where an element is. Posed is "ubicado"; the panel "muestra" its element.
  'Arrow keys, in the physical-space panel': 'Flechas, en el panel del espacio físico',
  'Turn the space as dragging that way does; with Shift, pan it':
    'Girar el espacio como lo hace arrastrar en ese sentido; con Mayús, desplazarlo',
  '+, − and 0, in the physical-space panel': '+, − y 0, en el panel del espacio físico',
  'Zoom in, zoom out, and fit everything the panel shows':
    'Acercar, alejar y encuadrar todo lo que muestra el panel',
  'Enter, in the physical-space panel': 'Enter, en el panel del espacio físico',
  'Frame the selection; in the panel’s list, select the row’s element and frame it':
    'Encuadrar la selección; en la lista del panel, seleccionar el elemento de la fila y encuadrarlo',
  'Drag, Shift+drag and the wheel, in the physical-space panel':
    'Arrastrar, Mayús+arrastrar y la rueda, en el panel del espacio físico',
  'Turn, pan and zoom; with two fingers, pan and pinch to zoom; a double click frames what is there':
    'Girar, desplazar y hacer zoom; con dos dedos, desplazar y pellizcar para hacer zoom; un doble clic encuadra lo que hay allí',
  'M and R, in the physical-space panel': 'M y R, en el panel del espacio físico',
  'Choose whether the handles move or rotate the selected posed elements':
    'Elegir si los controles mueven o rotan los elementos ubicados seleccionados',
  'Alt while dragging a handle (⌥ on macOS)': 'Alt mientras se arrastra un control (⌥ en macOS)',
  'Move or rotate without snapping to 1 cm and 15°': 'Mover o rotar sin ajustarse a 1 cm y 15°',
  'Escape, in the physical-space panel': 'Esc, en el panel del espacio físico',
  'Let a handle’s gesture go, or clear the selection':
    'Soltar el gesto de un control, o vaciar la selección',
  'physical space': 'espacio físico',
  'Arrow keys turn the space, Shift with them pans, + and − zoom, 0 fits everything and Enter frames the selection; M and R choose whether the handles move or rotate.':
    'Las flechas giran el espacio, con Mayús lo desplazan, + y − hacen zoom, 0 encuadra todo y Enter encuadra la selección; M y R eligen si los controles mueven o rotan.',
  'Arrow keys turn the space, Shift with them pans, + and − zoom, 0 fits everything and Enter frames the selection.':
    'Las flechas giran el espacio, con Mayús lo desplazan, + y − hacen zoom, 0 encuadra todo y Enter encuadra la selección.',
  'Nothing this view shows is in physical space.':
    'Nada de lo que muestra esta vista está en el espacio físico.',
  'Its physical-space panel takes {size} of it.':
    'Su panel del espacio físico ocupa {size} de ella.',
  'Physical space tools': 'Herramientas del espacio físico',
  'Fit everything (0)': 'Encuadrar todo (0)',
  Frame: 'Encuadrar la selección',
  'Frame the selection (Enter)': 'Encuadrar la selección (Enter)',
  Rotate: 'Rotar',
  'Move with the handles (M)': 'Mover con los controles (M)',
  'Rotate with the handles (R)': 'Rotar con los controles (R)',
  'The handles move.': 'Los controles mueven.',
  'The handles rotate.': 'Los controles rotan.',
  'Placed {count} elements in physical space.':
    'Se ubicaron {count} elementos en el espacio físico.',
  'Placed “{name}” in physical space, in {container}.':
    'Se ubicó “{name}” en el espacio físico, en {container}.',
  'Placed “{name}” in World, which this panel does not show.':
    'Se ubicó “{name}” en Mundo, que este panel no muestra.',
  'Took {count} elements out of physical space.':
    'Se sacaron {count} elementos del espacio físico.',
  'What the panel shows': 'Lo que muestra el panel',
  shown: 'mostrado',
  posed: 'ubicado',
  anchored: 'anclado',
  'not in this view': 'no está en esta vista',
  '{name}, not in this physical space': '{name}, no está en este espacio físico',
  '{name}, drawn faintly: this view does not show it':
    '{name}, dibujado tenue: esta vista no lo muestra',
  '{name}, which the panel shows': '{name}, que muestra el panel',
  '{name}, anchored to the part “{part}” of {container}':
    '{name}, anclado a la parte “{part}” de {container}',
  '{name}, posed in {container}, at its origin': '{name}, ubicado en {container}, en su origen',
  '{name}, posed in {container}, {distance} from it':
    '{name}, ubicado en {container}, a {distance} de él',
  ', drawn as {container}, which is collapsed': ', dibujado como {container}, que está contraído',
  ', drawn {distance} from its place by the exploded view':
    ', dibujado a {distance} de su lugar por la explosión',
  '{count} elements selected, {inSpace} of them in this physical space.':
    '{count} elementos seleccionados, {inSpace} de ellos en este espacio físico.',
  // M10: the panel's ways of reading and Show World (ADR 0076). The cut is "corte" and the exploded
  // view "explosión", as the core's messages of a view state's panel say them.
  'Ways of reading': 'Formas de leer',
  Cut: 'Corte',
  Off: 'Ninguno',
  'Across {axis}': 'Cruza {axis}',
  'Where the cut crosses {axis}': 'Dónde el corte cruza {axis}',
  'What the cut keeps': 'Qué conserva el corte',
  'Keep below': 'Conservar lo de abajo',
  'Keep above': 'Conservar lo de arriba',
  Explode: 'Explosión',
  'Not exploded': 'Sin explosión',
  'Exploded by {factor}': 'Explosión de {factor}',
  Names: 'Nombres',
  'Relations of the selection': 'Relaciones de la selección',
  'Write the names of the parts nearest the camera':
    'Escribir los nombres de las partes más cercanas a la cámara',
  'Draw the relations of the selection': 'Dibujar las relaciones de la selección',
  // The joints' sliders (ADR 0090).
  Joints: 'Articulaciones',
  '{count} joints': { one: '{count} articulación', other: '{count} articulaciones' },
  'Keep these positions': 'Conservar estas posiciones',
  'Back to stored positions': 'Volver a las posiciones guardadas',
  'Kept the position of “{name}”.': 'Se conservó la posición de “{name}”.',
  'Kept the positions of {count} joints.':
    'Se conservaron las posiciones de {count} articulaciones.',
  'Back to the stored positions.': 'De vuelta en las posiciones guardadas.',
  'Keep the joints’ positions': 'Conservar las posiciones de las articulaciones',
  'Not cut.': 'Sin corte.',
  'Cut across {axis}, keeping what is below.': 'Corte que cruza {axis}, conservando lo de abajo.',
  'Cut across {axis}, keeping what is above.': 'Corte que cruza {axis}, conservando lo de arriba.',
  'Keeping what is below the cut.': 'Se conserva lo que está debajo del corte.',
  'Keeping what is above the cut.': 'Se conserva lo que está encima del corte.',
  'Names on.': 'Nombres activados.',
  'Names off.': 'Nombres desactivados.',
  'Relations of the selection on.': 'Relaciones de la selección activadas.',
  'Relations of the selection off.': 'Relaciones de la selección desactivadas.',
  'Show World': 'Mostrar Mundo',
  'Shows World.': 'Muestra Mundo.',
  // M10: the inspector's Pose section, Show in physical space in the shape's menu, and the outline's
  // mark (ADR 0076). A pose is "ubicación" and posing "ubicar"; an image's or a solid's placement is
  // "colocación", so that the two never read alike.
  Pose: 'Ubicación',
  'Posed in': 'Ubicado en',
  'Posed in “{container}”.': 'Ubicado en “{container}”.',
  'Where it is, from “{container}”': 'Dónde está, desde “{container}”',
  'Rotation, in degrees about X, then Y, then Z':
    'Rotación, en grados alrededor de X, luego de Y, luego de Z',
  'About X': 'Alrededor de X',
  'About Y': 'Alrededor de Y',
  'About Z': 'Alrededor de Z',
  'Place in physical space': 'Ubicar en el espacio físico',
  'Take out of physical space': 'Sacar del espacio físico',
  'Select something on the canvas or here: what is in physical space can be moved, rotated or taken out, and anything else placed.':
    'Seleccionar algo en el lienzo o aquí: lo que está en el espacio físico se puede mover, rotar o sacar, y lo demás, ubicar.',
  'What is selected is drawn as a part of its solid and moves with it: select the element that shows the solid to move or rotate it.':
    'Lo seleccionado se dibuja como parte de su sólido y se mueve con él: seleccionar el elemento que muestra el sólido para moverlo o rotarlo.',
  'What is selected is what the panel shows everything inside; it does not move in it.':
    'Lo seleccionado es aquello dentro de lo cual el panel muestra todo; no se mueve dentro de sí.',
  'Nothing selected can be posed here: select one element in physical space, or one that is not there yet.':
    'Nada de lo seleccionado se puede posar aquí: seleccionar un elemento del espacio físico, o uno que todavía no esté en él.',
  'Pose in World where it was': 'Ubicar en Mundo donde estaba',
  'Not in physical space: it has no pose.': 'No está en el espacio físico: no tiene ubicación.',
  'Physical space is measured from World, which has no pose of its own.':
    'El espacio físico se mide desde Mundo, que no tiene una ubicación propia.',
  'Placed “{name}” at the origin of “{container}”.':
    'Se ubicó “{name}” en el origen de “{container}”.',
  'Took “{name}” out of physical space.': 'Se sacó “{name}” del espacio físico.',
  'Posed “{name}” in World, where it was.': 'Se ubicó “{name}” en Mundo, donde estaba.',
  'Posed “{name}” at the origin of World: where it was is not known.':
    'Se ubicó “{name}” en el origen de Mundo: no se sabe dónde estaba.',
  '“{name}” is posed in “{container}” now, where it was.':
    '“{name}” está ubicado ahora en “{container}”, donde estaba.',
  '“{name}” is posed in “{container}” now.': '“{name}” está ubicado ahora en “{container}”.',
  '“{container}” is in no place under World, so “{name}” shows in physical space when the panel shows “{container}”.':
    '“{container}” no tiene lugar bajo Mundo, así que “{name}” se ve en el espacio físico cuando el panel muestra “{container}”.',
  'Anchored to the part “{part}” of the solid “{solid}”, which “{container}” shows.':
    'Anclado a la parte “{part}” del sólido “{solid}”, que muestra “{container}”.',
  'Where its part is, from “{container}”: x {x}, y {y}, z {z}.':
    'Dónde está su parte, desde “{container}”: x {x}, y {y}, z {z}.',
  'Its place is its solid’s, so it cannot be posed here.':
    'Su lugar es el de su sólido, así que no se puede ubicar aquí.',
  'The pose it has is kept and not used.': 'La ubicación que tiene se conserva y no se usa.',
  'Its pose is measured from “{container}”, which is gone, so it is not in physical space.':
    'Su ubicación se mide desde “{container}”, que ya no existe, así que no está en el espacio físico.',
  'Its pose is measured from “{container}”, which no longer holds it, so it is not in physical space.':
    'Su ubicación se mide desde “{container}”, que ya no lo contiene, así que no está en el espacio físico.',
  'Enter a length, such as 12 cm, 1.5 m or 3 in.':
    'Escribir una longitud, como 12 cm, 1.5 m o 3 in.',
  'Enter a length of at most 1,000 km either way.':
    'Escribir una longitud de 1.000 km como máximo hacia cualquier lado.',
  'Enter an angle in degrees, such as 90 or -45.': 'Escribir un ángulo en grados, como 90 o -45.',
  'Show in physical space': 'Mostrar en el espacio físico',
  'Frames it in the physical-space panel, where it is in World.':
    'Lo encuadra en el panel del espacio físico, donde está en Mundo.',
  'Opens the physical-space panel showing it, with what is posed or anchored in it.':
    'Abre el panel del espacio físico mostrándolo, con lo que está ubicado o anclado en él.',
  // A4: what Show in physical space did, in the read-only page's Details.
  'The physical-space panel shows “{name}”.': 'El panel del espacio físico muestra “{name}”.',
  '“{name}” is framed in the physical-space panel.':
    '“{name}” está encuadrado en el panel del espacio físico.',
  'In physical space': 'En el espacio físico',
  ', in physical space': ', en el espacio físico',
  // M8b W53: an end dragged onto a shape with free geometry or onto an anchored part.
  'Attach at this point of its edge': 'Conectar en este punto de su borde',
  'Attach at this point inside it': 'Conectar en este punto, dentro de la forma',
  'at a place inside it': 'en un lugar dentro de la forma',
  'At a place inside it': 'En un lugar dentro de la forma',
  // The image picker.
  Image: 'Imagen',
  'Choose an image…': 'Elegir una imagen…',
  'Use a picture already in the project': 'Usar una imagen que ya está en el proyecto',
  'Pictures in the project': 'Imágenes del proyecto',
  'Use “{name}”': 'Usar “{name}”',
  Placement: 'Colocación',
  'Icon, beside the name': 'Ícono, junto al nombre',
  'Drawing, in place of the shape': 'Dibujo, en lugar de la forma',
  'As a silhouette': 'Como silueta',
  'Silhouette color': 'Color de la silueta',
  'Cleaning removed nothing from “{name}”.': 'La limpieza no quitó nada de “{name}”.',
  'Cleaning removed from “{name}”: {removed}.': 'La limpieza quitó de “{name}”: {removed}.',
  'It was shrunk to {width} by {height} pixels.': 'Se redujo a {width} por {height} píxeles.',
  'Use the component’s image': 'Usar la imagen del componente',
  'Show no image': 'No mostrar ninguna imagen',

  // The canvas toolbar, and where a new element goes.
  'Add an element': 'Agregar un elemento',
  'Add element…': 'Agregar elemento…',
  'With nothing selected, elements are added directly in World.':
    'Sin nada seleccionado, los elementos se agregan directamente en Mundo.',
  'Add inside "{name}"…': 'Agregar dentro de "{name}"…',
  'Add an element inside "{name}"': 'Agregar un elemento dentro de "{name}"',
  'Adds the element inside "{name}". With nothing selected, elements are added directly in World.':
    'Agrega el elemento dentro de "{name}". Sin nada seleccionado, los elementos se agregan directamente en Mundo.',
  'Adds the element directly in World, beside "{name}". To add inside "{name}" itself, use Add inside "{name}"… in its menu or in the inspector.':
    'Agrega el elemento directamente en Mundo, junto a "{name}". Para agregarlo dentro del propio "{name}", usar Agregar dentro de "{name}"… en su menú o en el inspector.',
  'Adds the element inside "{container}", where "{name}" sits. To add inside "{name}" itself, use Add inside "{name}"… in its menu or in the inspector.':
    'Agrega el elemento dentro de "{container}", donde está "{name}". Para agregarlo dentro del propio "{name}", usar Agregar dentro de "{name}"… en su menú o en el inspector.',
  'Stacking order': 'Orden de apilado',
  'Zoom out': 'Alejar',
  Zoom: 'Zoom',
  'Zoom in': 'Acercar',
  Fit: 'Encuadrar',

  // The canvas itself, and what it says.
  canvas: 'lienzo',
  Selection: 'Selección',
  'Name of {name}': 'Nombre de {name}',
  'Text of the note': 'Texto de la nota',
  'The canvas could not draw this view: {why}': 'El lienzo no pudo dibujar esta vista: {why}',
  '{name} is no longer in this view, so its name was not changed.':
    '{name} ya no está en esta vista, así que no se cambió su nombre.',
  'The note is no longer in this view, so its text was not changed.':
    'La nota ya no está en esta vista, así que no se cambió su texto.',
  'Select an expanded container to collapse it.':
    'Seleccionar un contenedor expandido para contraerlo.',
  'Select a collapsed container to expand it.':
    'Seleccionar un contenedor contraído para expandirlo.',
  'No shape {towards}.': 'No hay ninguna forma {towards}.',
  'to the left': 'a la izquierda',
  'to the right': 'a la derecha',
  above: 'arriba',
  below: 'abajo',
  '{name} sits directly in World.': '{name} está directamente en Mundo.',
  '{name} holds no shapes.': '{name} no contiene formas.',
  '{name} has no relations in this view.': '{name} no tiene relaciones en esta vista.',
  'Collapse "{name}" (Alt+−)': 'Contraer "{name}" (Alt+−)',
  'Expand "{name}" (Alt++)': 'Expandir "{name}" (Alt++)',

  // What the canvas writes on a collapsed container.
  '{count} inside': '{count} dentro',
  '{count} × {component}': '{count} × {component}',

  // The shape menu.
  'Draws none of what it holds; their relations become aggregated relations. Alt+−':
    'No dibuja nada de lo que contiene; sus relaciones pasan a ser relaciones agregadas. Alt+−',
  'Draws again what it holds. Alt++': 'Vuelve a dibujar lo que contiene. Alt++',
  'Put inside…': 'Poner dentro de…',
  'Move to…': 'Mover a…',
  'Under the pointer': 'Bajo el puntero',
  'Select "{name}"': 'Seleccionar "{name}"',

  // Layout, from the toolbar.
  Layout: 'Organizar',
  'Every shape there is pinned, so layout leaves them all.':
    'Todas las formas de ahí están fijadas, así que el diseño automático las deja a todas.',
  'Layout stopped, and nothing moved.': 'El diseño automático se detuvo y nada se movió.',
  'The layout failed: {why}': 'El diseño automático falló: {why}',
  'Layout leaves every shape where it is.': 'El diseño automático deja cada forma donde está.',
  '{action}: {count} shapes moved.': {
    one: '{action}: se movió {count} forma.',
    other: '{action}: se movieron {count} formas.',
  },
  'Stop layout': 'Detener el diseño automático',
  'Stop layout ({percent}%)': 'Detener el diseño automático ({percent} %)',
  'Laying out {count} shapes. Press to stop it; nothing moves then.': {
    one: 'Organizando {count} forma. Presionar para detenerlo; entonces nada se mueve.',
    other: 'Organizando {count} formas. Presionar para detenerlo; entonces nada se mueve.',
  },
  'Laying out {count} shapes: {percent}% done. Press to stop it; nothing moves then.': {
    one: 'Organizando {count} forma: {percent} % hecho. Presionar para detenerlo; entonces nada se mueve.',
    other:
      'Organizando {count} formas: {percent} % hecho. Presionar para detenerlo; entonces nada se mueve.',
  },
  'Layout needs web workers, which this browser does not offer.':
    'El diseño automático necesita web workers, que este navegador no ofrece.',
  'Visual Anything is not connected, so nothing can be laid out.':
    'Visual Anything no está conectado, así que no se puede organizar nada.',
  'Lay out the contents of "{name}": arrange the shapes inside it that are not pinned.':
    'Organizar el contenido de "{name}": acomodar las formas que tiene dentro y que no están fijadas.',
  'Lay out "{name}": arrange every shape that is not pinned.':
    'Organizar "{name}": acomodar todas las formas que no están fijadas.',

  // Why the browser could not draw an image to export.
  'the browser has no canvas to draw it on.': 'el navegador no tiene un lienzo donde dibujarla.',
  'the browser could not make a PNG.': 'el navegador no pudo crear un PNG.',

  // The inspector.
  Inspector: 'Inspector',
  'Edit its text on the canvas.': 'Editar su texto en el lienzo.',
  'A free shape: drawing only, not part of the model.':
    'Una forma libre: solo dibujo, no forma parte del modelo.',
  '{things} are selected.': 'Selección: {things}.',
  'Select only one to see and edit the rest of it.':
    'Seleccionar solo uno para ver y editar el resto.',
  'No view is open. Open one from Views, in the Model tab.':
    'No hay ninguna vista abierta. Abrir una desde Vistas, en la pestaña Modelo.',
  None: 'Ninguno',
  'Element shapes': 'Formas de elementos',
  'Free shapes': 'Formas libres',
  Nothing: 'Nada',
  '(a relation)': '(una relación)',
  Particularity: 'Particularidad',
  'Derives from': 'Deriva de',
  '{shown} of {count} shown.': 'Se muestran {shown} de {count}.',
  'Show all {count} {many}': 'Mostrar todo: {count} {many}',
  containers: 'contenedores',
  relations: 'relaciones',

  // An element, a relation and their relation types in the inspector.
  Component: 'Componente',
  'It derives from no other component.': 'No deriva de ningún otro componente.',
  'Its chain stops before Essence, because a component in it is missing.':
    'Su cadena se corta antes de Esencia, porque falta uno de sus componentes.',
  'No package in use defines the component “{id}”, so it looks like Essence.':
    'Ningún paquete en uso define el componente “{id}”, así que se ve como Esencia.',
  'Derive a component from “{name}”': 'Derivar un componente de “{name}”',
  'Edit “{name}”': 'Editar “{name}”',
  Containers: 'Contenedores',
  'World contains every other element.': 'Mundo contiene todos los demás elementos.',
  'It sits directly in World.': 'Está directamente en Mundo.',
  'No relation ends on it. To relate it, drag the handle beside its shape on the canvas to another shape.':
    'Ninguna relación termina en él. Para relacionarlo, arrastrar el control junto a su forma en el lienzo hasta otra forma.',
  Ends: 'Extremos',
  From: 'Origen',
  To: 'Destino',
  'Relation type': 'Tipo de relación',
  'It derives from no other relation type.': 'No deriva de ningún otro tipo de relación.',
  'Its chain stops before “relates to”, because a relation type in it is missing.':
    'Su cadena se corta antes de “se relaciona con”, porque falta uno de sus tipos de relación.',
  'No package in use defines the relation type “{id}”, so it behaves like “relates to”.':
    'Ningún paquete en uso define el tipo de relación “{id}”, así que se comporta como “se relaciona con”.',
  Warnings: 'Advertencias',
  'Derive a relation type from “{name}”': 'Derivar un tipo de relación de “{name}”',
  'needs two elements': 'necesita dos elementos',
  'World cannot sit inside anything': 'Mundo no puede estar dentro de nada',
  'would make containment form a cycle': 'haría que la contención forme un ciclo',

  // Attributes in the inspector.
  component: 'componente',
  'relation type': 'tipo de relación',
  'Its {definer} defines no attributes. Add one under New attribute, in the {definer} on the Components tab.':
    'Su {definer} no define atributos. Agregar uno en Nuevo atributo, en el {definer}, en la pestaña Componentes.',
  'Not defined by its {definer}.': 'No lo define su {definer}.',
  'No default.': 'Sin valor predeterminado.',
  'Default: {value}.': 'Valor predeterminado: {value}.',
  'Its value is not JSON.': 'Su valor no es JSON.',
  'Its value is not a {type}.': 'Su valor no es de tipo {type}.',
  'its value differs from its {definer}’s': 'su valor difiere del de su {definer}',
  'Use the {definer}’s value': 'Usar el valor del {definer}',
  Clear: 'Vaciar',
  'for {name}': 'para {name}',
  'Give the attribute a name.': 'El atributo necesita un nombre.',
  'It already has an attribute named “{name}”.': 'Ya tiene un atributo llamado “{name}”.',
  'Add an attribute of its own': 'Agregar un atributo propio',
  'Attribute name': 'Nombre del atributo',
  'Attribute type': 'Tipo del atributo',
  'Add attribute': 'Agregar atributo',
  'Enter a JSON value, such as null.': 'Escribir un valor JSON, como null.',
  'Enter a number.': 'Escribir un número.',

  // Appearance in the inspector: shapes, colors, where each comes from and the contrast hints.
  Appearance: 'Apariencia',
  'Only this element': 'Solo este elemento',
  'Only this relation': 'Solo esta relación',
  'Every {name}': 'Cada {name}',
  Change: 'Aplicar a',
  Detail: 'Detalle',
  'Nothing under its name': 'Nada debajo de su nombre',
  Badges: 'Insignias',
  Shape: 'Forma',
  shape: 'forma',
  Fill: 'Relleno',
  Stroke: 'Trazo',
  Rectangle: 'Rectángulo',
  'Rounded rectangle': 'Rectángulo redondeado',
  Ellipse: 'Elipse',
  Cylinder: 'Cilindro',
  Person: 'Persona',
  'Use the inherited value': 'Usar el valor heredado',
  'Use the inherited color': 'Usar el color heredado',
  'Use the inherited shape': 'Usar la forma heredada',
  'Use the theme’s color': 'Usar el color del tema',
  '{action} for {name}': '{action}: {name}',
  'It also sets its own size: {width} by {height}.':
    'También define su propio tamaño: {width} por {height}.',
  'Use the component’s appearance': 'Usar la apariencia del componente',
  'This element has a {what} of its own: a change here takes it back, so that it follows.':
    'Este elemento tiene su propio valor de {what}: un cambio aquí lo quita, para que lo siga.',
  'This relation has a stroke of its own: a change here takes it back, so that it follows.':
    'Esta relación tiene su propio trazo: un cambio aquí lo quita, para que lo siga.',
  'its own': 'propio',
  'the theme’s': 'del tema',
  'set in this project': 'definido en este proyecto',
  'from {name}, set in this project': 'de {name}, definido en este proyecto',
  'built in': 'incorporado',
  'built in, from {name}': 'incorporado, de {name}',
  'from {name}': 'de {name}',
  'Saved in this project.': 'Se guarda en este proyecto.',
  'Saved in this project; the built-in package {name} stays as it is.':
    'Se guarda en este proyecto; el paquete incorporado {name} queda como está.',
  'Saved in the package {name}.': 'Se guarda en el paquete {name}.',
  'Hard to see on the light canvas ({ratio}); lines need 3:1.':
    'Difícil de ver sobre el lienzo claro ({ratio}); las líneas necesitan 3:1.',
  'Hard to see on the dark canvas ({ratio}); lines need 3:1.':
    'Difícil de ver sobre el lienzo oscuro ({ratio}); las líneas necesitan 3:1.',
  'Blends into the light canvas: neither its fill nor its stroke reaches 3:1 on it.':
    'Se confunde con el lienzo claro: ni su relleno ni su trazo llegan a 3:1 sobre él.',
  'Blends into the dark canvas: neither its fill nor its stroke reaches 3:1 on it.':
    'Se confunde con el lienzo oscuro: ni su relleno ni su trazo llegan a 3:1 sobre él.',
  Mixed: 'Varios',
  '{label} color code': 'Código de color: {label}',
  'Recent and project colors for {label}': 'Colores recientes y del proyecto para {label}',
  'Use {color}': 'Usar {color}',
  'Write a color as #RRGGBB, #RGB or rgb(r, g, b), such as #F3F5F8.':
    'Escribir un color en la forma #RRGGBB, #RGB o rgb(r, g, b), como #F3F5F8.',
  'Appearance of {count} shapes': {
    one: 'Apariencia de {count} forma',
    other: 'Apariencia de {count} formas',
  },
  'For the {count} shapes with a fill.': {
    one: 'Para la única forma con relleno.',
    other: 'Para las {count} formas con relleno.',
  },
  'Enter a size above 0, at most 100,000.':
    'Escribir un tamaño mayor que 0, de 100.000 como máximo.',
  'Enter a width above 0.': 'Escribir un grosor mayor que 0.',

  // Where an element sits in the open view, in the inspector.
  'This view puts nothing inside containers: it is arranged by no relation type that nests.':
    'Esta vista no pone nada dentro de contenedores: no la organiza ningún tipo de relación que anide.',
  'In this view': 'En esta vista',
  'Collapsed: its contents are not drawn.': 'Contraído: su contenido no se dibuja.',
  'Collapsed, with {inside}: its contents are not drawn.':
    'Contraído, con {inside}: su contenido no se dibuja.',
  'Expanded: its contents are drawn.': 'Expandido: su contenido se dibuja.',
  Expand: 'Expandir',
  Collapse: 'Contraer',
  'In "{name}"': 'En "{name}"',
  '{where}: {place} of {count}, from the back': '{where}: {place} de {count}, desde el fondo',
  'In front of it: {names}': 'Delante: {names}',
  'Behind it: {names}': 'Detrás: {names}',

  // Columns typed or pasted into a table, that cannot be read or related.
  'no column named “{name}”': 'ninguna columna se llama “{name}”',
  'no table named “{name}”': 'ninguna tabla se llama “{name}”',
  'no column named “{column}” in “{table}”': 'ninguna columna de “{table}” se llama “{column}”',
  'no single primary key column in “{name}”':
    '“{name}” no tiene una única columna de clave primaria',

  // The Components tab.
  'Built-in package': 'Paquete incorporado',
  Package: 'Paquete',
  'Component, derives from {name}': 'Componente, deriva de {name}',
  'Relation type, derives from {name}': 'Tipo de relación, deriva de {name}',
  'In use': 'En uso',
  'The project uses no package yet. Use one from Not in use yet, below, or make one with New package.':
    'El proyecto todavía no usa ningún paquete. Usar uno de Todavía sin usar, más abajo, o crear uno con Nuevo paquete.',
  'Not in use yet': 'Todavía sin usar',
  'The project uses every built-in package.': 'El proyecto usa todos los paquetes incorporados.',
  New: 'Nuevo',
  'New component': 'Nuevo componente',
  'New relation type': 'Nuevo tipo de relación',
  'New package': 'Nuevo paquete',
  'Use the package “{name}”': 'Usar el paquete “{name}”',
  Use: 'Usar',

  // The component editor: what it shows of every component, relation type and package.
  'Back to the selection': 'Volver a la selección',
  'It is built into Visual Anything, so only its appearance can be changed here, for this project. Derive a {noun} from it to have one of the project’s own that you can change in full.':
    'Está incorporado en Visual Anything, así que aquí solo se puede cambiar su apariencia, para este proyecto. Derivar un {noun} de él para tener uno propio del proyecto que se pueda cambiar por completo.',
  'No package in use defines {what} any more.': 'Ningún paquete en uso define ya {what}.',
  'Remove the {noun}': 'Quitar el {noun}',
  'the component “{id}”': 'el componente “{id}”',
  'the relation type “{id}”': 'el tipo de relación “{id}”',
  'the package “{id}”': 'el paquete “{id}”',
  'Built-in component': 'Componente incorporado',
  'Built-in relation type': 'Tipo de relación incorporado',
  Identity: 'Identidad',
  'Built into Visual Anything': 'Incorporado en Visual Anything',
  Id: 'Id',
  'It derives from no other component: every component derives from it.':
    'No deriva de ningún otro componente: todos los componentes derivan de él.',
  'It derives from no other relation type: every relation type derives from it.':
    'No deriva de ningún otro tipo de relación: todos los tipos de relación derivan de él.',

  // A component's appearance, detail and connection points in the component editor.
  '{name}, as its drawing': '{name}, como su dibujo',
  '{name}, as an icon': '{name}, como ícono',
  'While it draws rows, its shapes are a rectangle or a rounded rectangle.':
    'Mientras dibuja filas, sus formas son un rectángulo o un rectángulo redondeado.',
  Width: 'Ancho',
  'Line width': 'Grosor',
  Height: 'Alto',
  'Its height follows its rows.': 'Su alto sigue a sus filas.',
  'Draw what its elements hold as rows': 'Dibujar como filas lo que contienen sus elementos',
  'Write the component’s name': 'Escribir el nombre del componente',
  'Attributes written': 'Atributos escritos',
  'It has no attributes to write yet. Add one under New attribute, in its Attributes section.':
    'Todavía no tiene atributos para escribir. Agregar uno en Nuevo atributo, en su sección Atributos.',
  '(it has no such attribute)': '(no tiene ese atributo)',
  'Write “{name}” earlier': 'Escribir “{name}” antes',
  'Write “{name}” later': 'Escribir “{name}” después',
  'while “{name}” is true': 'mientras “{name}” es verdadero',
  'while it is the from end of “{name}”': 'mientras es el extremo de origen de “{name}”',
  'No badges. A component derived from it can add some.':
    'Sin insignias. Un componente derivado de él puede agregar algunas.',
  'No badges yet. Add one below: its text, and when it is written.':
    'Todavía sin insignias. Agregar una más abajo: su texto, y cuándo se escribe.',
  'Remove the badge “{text}”': 'Quitar la insignia “{text}”',
  'Give the badge a text, such as PK.': 'La insignia necesita un texto, como PK.',
  'New badge': 'Nueva insignia',
  'Badge text': 'Texto de la insignia',
  Written: 'Se escribe',
  'Add the badge': 'Agregar la insignia',
  'Lines, at most': 'Líneas, como máximo',
  'Where its text sits': 'Dónde va su texto',
  'At the top': 'Arriba',
  'In the middle': 'En el medio',
  'At the bottom': 'Abajo',
  'While it draws rows, it writes its name at the top.':
    'Mientras dibuja filas, escribe su nombre arriba.',
  'point {count}': 'punto {count}',
  'Enter a number from 0 to 1.': 'Escribir un número de 0 a 1.',
  'Connection points': 'Puntos de conexión',
  'Where relations attach': 'Dónde se conectan las relaciones',
  'None: relations attach anywhere on the border.':
    'Ninguno: las relaciones se conectan en cualquier lugar del borde.',
  'Add a connection point': 'Agregar un punto de conexión',
  'Attach anywhere on the border': 'Conectar en cualquier lugar del borde',
  Side: 'Lado',
  Top: 'Superior',
  Right: 'Derecho',
  Bottom: 'Inferior',
  Left: 'Izquierdo',
  'Along the side, from 0 to 1': 'A lo largo del lado, de 0 a 1',
  'Remove the connection point “{name}”': 'Quitar el punto de conexión “{name}”',

  // A relation type in the component editor: how its relations behave and are drawn, and its limits.
  'Inherited ({value})': 'Heredado ({value})',
  directed: 'dirigida',
  undirected: 'no dirigida',
  Directed: 'Dirigida',
  Undirected: 'No dirigida',
  Nests: 'Anida',
  'It cannot stop nesting while {views} nest by it.': {
    one: 'No puede dejar de anidar mientras {views} anida por él.',
    other: 'No puede dejar de anidar mientras {views} anidan por él.',
  },
  'Inherited (nests)': 'Heredado (anida)',
  'Inherited (does not nest)': 'Heredado (no anida)',
  'Nests: places its from end inside its to end':
    'Anida: ubica su extremo de origen dentro de su extremo de destino',
  'Does not nest': 'No anida',
  Line: 'Línea',
  Dash: 'Patrón de línea',
  Solid: 'Continua',
  Dashed: 'Discontinua',
  Dotted: 'Punteada',
  Limits: 'Límites',
  'Inherited (any)': 'Heredado (cualquiera)',
  'Inherited ({names})': 'Heredado ({names})',
  'From end': 'Extremo de origen',
  'To end': 'Extremo de destino',
  Any: 'Cualquiera',
  'Only these…': 'Solo estos…',
  'The last one stays: choose Any to lift the limit, or the inherited one.':
    'El último se queda: elegir Cualquiera para quitar el límite, o el heredado.',

  // Attributes in the component editor.
  'It has no attributes. To give it some, derive from it and add them there.':
    'No tiene atributos. Para darle algunos, derivar de él y agregarlos allí.',
  'It has no attributes yet. Add one below, under New attribute.':
    'Todavía no tiene atributos. Agregar uno más abajo, en Nuevo atributo.',
  'An inherited attribute cannot be removed or moved here: redefine it to change it, or derive from a definition nearer the one that defines it.':
    'Un atributo heredado no se puede quitar ni mover aquí: redefinirlo para cambiarlo, o derivar de una definición más cercana a la que lo define.',
  'redefined here': 'redefinido aquí',
  'A redefinition keeps its name.': 'Una redefinición conserva su nombre.',
  Type: 'Tipo',
  'Choices, one per line': 'Opciones, una por línea',
  Unit: 'Unidad',
  'Use the inherited definition of “{name}”': 'Usar la definición heredada de “{name}”',
  'Use the inherited definition': 'Usar la definición heredada',
  Default: 'Valor predeterminado',
  'No default': 'Sin valor predeterminado',
  'Default: {value}': 'Valor predeterminado: {value}',
  'Choices: {choices}': 'Opciones: {choices}',
  'Unit: {unit}': 'Unidad: {unit}',
  'Redefine “{name}” here': 'Redefinir “{name}” aquí',
  'Redefine here': 'Redefinir aquí',
  'It already has the attribute “{name}”.': 'Ya tiene el atributo “{name}”.',
  'New attribute': 'Nuevo atributo',
  'Add the attribute': 'Agregar el atributo',
  'Write true or false.': 'Escribir true o false.',

  // Deriving a definition, and making a package.
  'Derive a component': 'Derivar un componente',
  'Derive a relation type': 'Derivar un tipo de relación',
  'Give the component a name.': 'El componente necesita un nombre.',
  'Give the relation type a name.': 'El tipo de relación necesita un nombre.',
  'Give the new package a name.': 'El paquete nuevo necesita un nombre.',
  'A new package': 'Un paquete nuevo',
  'Name of the new package': 'Nombre del paquete nuevo',
  'Its id': 'Su id',
  'Use it for “{name}”': 'Usarlo para “{name}”',
  'Define the component': 'Definir el componente',
  'Derive the component': 'Derivar el componente',
  'Define the relation type': 'Definir el tipo de relación',
  'Derive the relation type': 'Derivar el tipo de relación',
  'A package needs an id.': 'Un paquete necesita un id.',
  'An id is letters, digits, dots, dashes and underscores, starting with a letter or a digit.':
    'Un id tiene letras, dígitos, puntos, guiones y guiones bajos, y empieza con una letra o un dígito.',
  'The id "{id}" is the built-in package {name}’s. Give the package another one.':
    'El id "{id}" es el del paquete incorporado {name}. Darle otro al paquete.',
  'Visual Anything keeps the id "{id}" for a package it plans to build in. Give the package another one.':
    'Visual Anything reserva el id "{id}" para un paquete que planea incorporar. Darle otro al paquete.',
  'The project already has the package "{id}".': 'El proyecto ya tiene el paquete "{id}".',
  'Something in the project already has the id "{id}".': 'Algo del proyecto ya tiene el id "{id}".',
  'Give the package a name.': 'El paquete necesita un nombre.',
  'Create the package': 'Crear el paquete',

  // A package in the component editor, and what uses a definition.
  'It is built into Visual Anything, so it cannot be changed here.':
    'Está incorporado en Visual Anything, así que no se puede cambiar aquí.',
  'It is built into Visual Anything, so it cannot be changed here. The project does not use it yet.':
    'Está incorporado en Visual Anything, así que no se puede cambiar aquí. El proyecto todavía no lo usa.',
  Images: 'Imágenes',
  Solids: 'Sólidos',
  '{count} images': { one: '{count} imagen', other: '{count} imágenes' },
  'It defines no components yet. Add one with New component, on the Components tab.':
    'Todavía no define componentes. Agregar uno con Nuevo componente, en la pestaña Componentes.',
  'It defines no relation types yet. Add one with New relation type, on the Components tab.':
    'Todavía no define tipos de relación. Agregar uno con Nuevo tipo de relación, en la pestaña Componentes.',
  'Use this package': 'Usar este paquete',
  '{count} components': { one: '{count} componente', other: '{count} componentes' },
  '{count} relation types': { one: '{count} tipo de relación', other: '{count} tipos de relación' },
  'Remove this package': 'Quitar este paquete',
  'Stop using this package': 'Dejar de usar este paquete',
  'Its file goes, with the {defines} it defines; Undo brings them back.':
    'Se va su archivo, con {defines} que define; Deshacer los recupera.',
  'Used by': 'Usado por',
  'Nothing uses it yet. Add an element made from it with Add an element, on the canvas.':
    'Nada lo usa todavía. Agregar un elemento creado a partir de él con Agregar un elemento, en el lienzo.',
  'Nothing uses it yet. Relate two shapes on the canvas, and choose it for the relation.':
    'Nada lo usa todavía. Relacionar dos formas en el lienzo, y elegirlo para la relación.',
  'World is created from it.': 'Mundo se crea a partir de él.',
  '{count} elements are created from it.': {
    one: '{count} elemento se crea a partir de él.',
    other: '{count} elementos se crean a partir de él.',
  },
  'Select it': 'Seleccionarlo',
  'Select them': 'Seleccionarlos',
  '{count} relations are of it.': {
    one: '{count} relación es de este tipo.',
    other: '{count} relaciones son de este tipo.',
  },
  'Components derived from it': 'Componentes derivados de él',
  'Relation types derived from it': 'Tipos de relación derivados de él',
  'Relation types whose limits name it': 'Tipos de relación cuyos límites lo nombran',
  'Components whose badges name it': 'Componentes cuyas insignias lo nombran',
  'The own appearance of {count} elements has a badge that names it.': {
    one: 'La apariencia propia de {count} elemento tiene una insignia que lo nombra.',
    other: 'La apariencia propia de {count} elementos tiene una insignia que lo nombra.',
  },
  'The views {names} nest by it.': {
    one: 'La vista {names} anida por él.',
    other: 'Las vistas {names} anidan por él.',
  },

  // A view's scope on the canvas, in the panels and in search (ADR 0040, M6c).
  '{count} relations leave this view: {list}. The inspector lists them, with Add to this view.': {
    one: '{count} relación sale de esta vista: {list}. El inspector la muestra, con Agregar a esta vista.',
    other:
      '{count} relaciones salen de esta vista: {list}. El inspector las muestra, con Agregar a esta vista.',
  },
  '{count} relations leave this view': {
    one: '{count} relación sale de esta vista',
    other: '{count} relaciones salen de esta vista',
  },
  'Leave "{name}" out of this view': 'Dejar "{name}" fuera de esta vista',
  'Leave {count} elements out of this view': {
    one: 'Dejar {count} elemento fuera de esta vista',
    other: 'Dejar {count} elementos fuera de esta vista',
  },
  'Add to this view the {count} elements they relate to': {
    one: 'Agregar a esta vista el elemento con el que se relacionan',
    other: 'Agregar a esta vista los {count} elementos con los que se relacionan',
  },
  'Deletes nothing: it stays in the model and in the other views.':
    'No elimina nada: sigue en el modelo y en las otras vistas.',
  'Brings in the far ends of the relations that leave this view from it.':
    'Trae los otros extremos de las relaciones que salen de esta vista desde aquí.',
  'Scope of this view': 'Alcance de esta vista',
  'This view shows the whole model.': 'Esta vista muestra todo el modelo.',
  'Leave out of this view': 'Dejar fuera de esta vista',
  'Add to this view': 'Agregar a esta vista',
  '“{view}” leaves it out: its scope does not show it.':
    '“{view}” lo deja fuera: su alcance no lo muestra.',
  'Add “{name}” to this view': 'Agregar “{name}” a esta vista',
  'Add all {count} to this view': 'Agregar los {count} a esta vista',
  'What it shows': 'Qué muestra',
  'The whole model: {count} elements.': {
    one: 'Todo el modelo: {count} elemento.',
    other: 'Todo el modelo: {count} elementos.',
  },
  '{shown} of {total} elements, as its scope gives them.':
    '{shown} de {total} elementos, según su alcance.',
  'Show the whole model': 'Mostrar todo el modelo',
  'Show by a rule…': 'Mostrar según una regla…',
  'Leave out by a rule…': 'Dejar fuera según una regla…',
  'Show by a rule': 'Mostrar según una regla',
  'Leave out by a rule': 'Dejar fuera según una regla',
  'Added by hand': 'Agregados a mano',
  'Stop adding': 'Dejar de agregar',
  'Stop adding “{name}” by hand': 'Dejar de agregar “{name}” a mano',
  'Left out by hand': 'Dejados fuera a mano',
  'Add back': 'Volver a agregar',
  'Add “{name}” back to this view': 'Volver a agregar “{name}” a esta vista',
  // The relation types a view leaves out (ADR 0064).
  'Relation types it leaves out': 'Tipos de relación que deja fuera',
  'It draws the relations of every relation type.':
    'Dibuja las relaciones de todos los tipos de relación.',
  'Draw again': 'Volver a dibujar',
  'Draw the relations of “{name}” again': 'Volver a dibujar las relaciones de “{name}”',
  'Leave out a relation type…': 'Dejar fuera un tipo de relación…',
  'Leave out a relation type': 'Dejar fuera un tipo de relación',
  'Leave out': 'Dejar fuera',
  'Shows the elements that meet one of these rules':
    'Muestra los elementos que cumplen una de estas reglas',
  'Leaves out the elements that meet any of these rules':
    'Deja fuera los elementos que cumplen alguna de estas reglas',
  'Remove the rule {rule}': 'Quitar la regla {rule}',
  'Contents of a container': 'Contenido de un contenedor',
  Container: 'Contenedor',
  '“{name}” only': 'solo “{name}”',
  '“{name}”, and what derives from it': '“{name}”, y lo que deriva de él',
  'the ends of “{name}” only': 'los extremos de “{name}” solamente',
  'the ends of “{name}”, and of what derives from it':
    'los extremos de “{name}”, y de lo que deriva de él',
  '“{name}” and what sits inside it, at every level':
    '“{name}” y lo que está dentro, en todos los niveles',
  '“{name}” and what sits inside it, {count} levels down': {
    one: '“{name}” y lo que está dentro, {count} nivel hacia abajo',
    other: '“{name}” y lo que está dentro, {count} niveles hacia abajo',
  },
  'this view nests nothing': 'esta vista no anida nada',
  'There is nothing of this kind to choose.': 'No hay nada de este tipo para elegir.',
  'How deep is a whole number from 1 to 1000, or nothing for every level.':
    'La profundidad es un número entero de 1 a 1000, o nada para todos los niveles.',
  'Name the attribute the rule tests.': 'Nombrar el atributo que prueba la regla.',
  'Kind of rule': 'Tipo de regla',
  'And what derives from it': 'Y lo que deriva de él',
  'How many levels down (empty: every level)':
    'Cuántos niveles hacia abajo (vacío: todos los niveles)',
  'Add the rule': 'Agregar la regla',
  'Same part of the model': 'La misma parte del modelo',
  'Other parts of the model': 'Otras partes del modelo',
  'Add to this view, “{view}”': 'Agregar a esta vista, “{view}”',
  'Outside the view': 'Fuera de la vista',
  'The scope of “{view}” shows none of this step’s relations, so nothing is marked for it there. It plays all the same.':
    'El alcance de “{view}” no muestra ninguna de las relaciones de este paso, así que allí no se marca nada para él. Se reproduce igual.',
  '“{view}” leaves out the relation types of this step’s relations, so it draws no line for them. It plays all the same.':
    '“{view}” deja fuera los tipos de relación de las relaciones de este paso, así que no dibuja ninguna línea para ellas. Se reproduce igual.',
  'Add its {count} ends to this view': {
    one: 'Agregar su extremo a esta vista',
    other: 'Agregar sus {count} extremos a esta vista',
  },
  // The import dialog's help for Structurizr, LikeC4 and draw.io files (import/diagram-formats.ts).
  'Structurizr workspace': 'Espacio de trabajo de Structurizr',
  'A workspace in JSON. Workspace DSL is not read: export it to JSON first with the Structurizr CLI, as in structurizr-cli export -workspace workspace.dsl -format json.':
    'Un espacio de trabajo en JSON. El DSL de Structurizr no se lee: primero hay que exportarlo a JSON con la CLI de Structurizr, como en structurizr-cli export -workspace workspace.dsl -format json.',
  'LikeC4 model': 'Modelo de LikeC4',
  'The model likec4 export json writes, with the positions of its views.':
    'El modelo que escribe likec4 export json, con las posiciones de sus vistas.',
  'draw.io file': 'Archivo de draw.io',
  'Plain or compressed, or inside a .drawio.svg or .drawio.png picture. Each page becomes a view; stencils and images are left out.':
    'Sin comprimir o comprimido, o dentro de una imagen .drawio.svg o .drawio.png. Cada página se vuelve una vista; los stencils y las imágenes se dejan fuera.',
  // The exports of a view as SVG, PDF and text (M6b): what each writes, and what it could not hold.
  'The view draws nothing.': 'La vista no dibuja nada.',
  'A picture whose SVG could not be read back is left out.':
    'Se omite una imagen cuyo SVG no se pudo volver a leer.',
  'Pictures in {format} are left out: this format cannot hold them.':
    'Se omiten las imágenes en {format}: este formato no puede contenerlas.',
  'Bitmaps shown as silhouettes are drawn in their own colors.':
    'Los mapas de bits que se muestran como silueta se dibujan en sus propios colores.',
  'Its long description, an outline of every shape and relation, is the view exported as Markdown.':
    'Su descripción larga, un esquema de cada forma y relación, es la vista exportada como Markdown.',
  'Its long description, an outline of every shape and relation, is in “{file}”.':
    'Su descripción larga, un esquema de cada forma y relación, está en “{file}”.',
  'Drawn at {percent}% of its size, so that its page stays within 200 inches a side.':
    'Dibujada al {percent} % de su tamaño, para que su página no pase de 200 pulgadas por lado.',
  'The embedded font has no {characters}, which show as empty boxes.':
    'La fuente incluida no tiene {characters}, que se ven como cuadros vacíos.',
  '{count} parts of the drawing could not be drawn in the PDF.': {
    one: 'Una parte del dibujo no se pudo dibujar en el PDF.',
    other: '{count} partes del dibujo no se pudieron dibujar en el PDF.',
  },
  'The long description of the view: an outline of every shape and relation.':
    'La descripción larga de la vista: un esquema de cada forma y relación.',
  'Perspective: {perspective}.': 'Perspectiva: {perspective}.',
  'An outline of the view “{view}” of the project “{project}”: what sits directly in World, what sits inside each container, and the relations drawn from each shape, in the model’s order.':
    'Un esquema de la vista “{view}” del proyecto “{project}”: lo que está directamente en Mundo, lo que está dentro de cada contenedor y las relaciones que se dibujan desde cada forma, en el orden del modelo.',
  '{name}, held by its row and not drawn': '{name}, que contiene su fila y no se dibuja',
  'Shapes and relations': 'Formas y relaciones',
  'The view draws no shape.': 'La vista no dibuja ninguna forma.',
  Notes: 'Notas',
  'What this outline leaves out': 'Lo que este esquema omite',
  '{name} ({component}), collapsed, with {count} inside':
    '{name} ({component}), contraído, con {count} dentro',
  '{way} {count} relations “{type}” with {far}, aggregated': {
    one: '{way} {count} relación “{type}” con {far}, agregada',
    other: '{way} {count} relaciones “{type}” con {far}, agregadas',
  },
  '(no description)': '(sin descripción)',
  'A relation that no longer exists: a broken step.':
    'Una relación que ya no existe: un paso roto.',
  'Takes in': 'Recibe',
  Produces: 'Produce',
  'Where each shape is, its size and its colors: the outline lists what the view shows, not how it draws it.':
    'Dónde está cada forma, su tamaño y sus colores: el esquema enumera lo que la vista muestra, no cómo lo dibuja.',
  'The routes of relations and their bend points.':
    'Las rutas de las relaciones y sus puntos de quiebre.',
  'Pictures.': 'Las imágenes.',
  'Free arrows, which point at places rather than at shapes.':
    'Las flechas libres, que señalan lugares y no formas.',
  'What collapsed containers hold, as the view draws none of it.':
    'Lo que contienen los contenedores contraídos, ya que la vista no dibuja nada de ello.',
  'The view “{view}” of the project “{project}”, from Visual Anything.':
    'La vista “{view}” del proyecto “{project}”, desde Visual Anything.',
  'Lost: {what}': 'Se pierde: {what}',
  'Mermaid lays the chart out itself: positions, sizes, routes and bend points are left out.':
    'Mermaid organiza las formas por su cuenta: se omiten las posiciones, los tamaños, las rutas y los puntos de quiebre.',
  'Details under names, badges among them, are left out.':
    'Se omiten los detalles bajo los nombres, insignias incluidas.',
  '{count} elements sit in more than one container: each is drawn once, in its first one.': {
    one: 'Un elemento está en más de un contenedor: se dibuja una vez, en el primero.',
    other:
      '{count} elementos están en más de un contenedor: cada uno se dibuja una vez, en el primero.',
  },
  '{count} relations that end on relations are left out: Mermaid draws relations between shapes only.':
    {
      one: 'Se omite una relación que termina en una relación: Mermaid dibuja relaciones solo entre formas.',
      other:
        'Se omiten {count} relaciones que terminan en relaciones: Mermaid dibuja relaciones solo entre formas.',
    },
  '{count} shapes drawn as people are drawn as rounded rectangles.': {
    one: 'Una forma dibujada como persona se dibuja como rectángulo redondeado.',
    other: '{count} formas dibujadas como personas se dibujan como rectángulos redondeados.',
  },
  '{count} notes and free arrows are left out.': {
    one: 'Se omite una nota o flecha libre.',
    other: 'Se omiten {count} notas y flechas libres.',
  },
  '{count} pictures are left out.': {
    one: 'Se omite una imagen.',
    other: 'Se omiten {count} imágenes.',
  },
  '{count} elements of other packages than Systems are left out.': {
    one: 'Se omite un elemento de un paquete que no es Sistemas.',
    other: 'Se omiten {count} elementos de paquetes que no son Sistemas.',
  },
  '{count} elements sat deeper than C4 nests: each is a component beside the one that held it.': {
    one: 'Un elemento estaba más adentro de lo que C4 anida: es un componente junto al que lo contenía.',
    other:
      '{count} elementos estaban más adentro de lo que C4 anida: cada uno es un componente junto al que lo contenía.',
  },
  '{count} people and systems sat inside other elements: they are at the top of the model.': {
    one: 'Una persona o un sistema estaba dentro de otro elemento: está en lo más alto del modelo.',
    other:
      '{count} personas y sistemas estaban dentro de otros elementos: están en lo más alto del modelo.',
  },
  '{count} elements sit in more than one container: each is in its first one.': {
    one: 'Un elemento está en más de un contenedor: está en el primero.',
    other: '{count} elementos están en más de un contenedor: cada uno está en el primero.',
  },
  '{count} relations are left out: they end on relations, on elements left out, or on what holds them, which Structurizr does not take.':
    {
      one: 'Se omite una relación: termina en una relación, en un elemento omitido o en lo que la contiene, que Structurizr no admite.',
      other:
        'Se omiten {count} relaciones: terminan en relaciones, en elementos omitidos o en lo que las contiene, que Structurizr no admite.',
    },
  'Structurizr lays the views out itself: positions, sizes, routes and bend points are left out.':
    'Structurizr organiza las vistas por su cuenta: se omiten las posiciones, los tamaños, las rutas y los puntos de quiebre.',
  'The view shows no element of the Systems package.':
    'La vista no muestra ningún elemento del paquete Sistemas.',
  'Pictures are left out.': 'Se omiten las imágenes.',
  'Scenarios are left out.': 'Se omiten los escenarios.',
  'Text emphasis (bold, italic and the rest) is written as plain text.':
    'El énfasis de texto (negrita, cursiva y el resto) se escribe como texto simple.',
  // M8b W58: what the text exports lose beyond boxes, and the outline's contents of anchored parts.
  '{count} shapes drawn by their free geometry are drawn as their kinds.': {
    one: 'Una forma dibujada por su geometría libre se dibuja según su tipo.',
    other: '{count} formas dibujadas por su geometría libre se dibujan según su tipo.',
  },
  '{count} shapes drawn as named parts are drawn as their kinds, without their pictures.': {
    one: 'Una forma dibujada como parte con nombre se dibuja según su tipo, sin su imagen.',
    other:
      '{count} formas dibujadas como partes con nombre se dibujan según su tipo, sin sus imágenes.',
  },
  // M3e F3: what the text exports lose of faces (ADR 0083).
  '{count} shapes’ faces are left out: faces are drawn only in the canvas, the SVG, the PDF and the read-only page.':
    {
      one: 'Se omite la cara de una forma: las caras solo se dibujan en el lienzo, el SVG, el PDF y la página de solo lectura.',
      other:
        'Se omiten las caras de {count} formas: las caras solo se dibujan en el lienzo, el SVG, el PDF y la página de solo lectura.',
    },
  'How faces look: the outline writes what they say, and the canvas, the SVG, the PDF and the read-only page draw them.':
    'Cómo se ven las caras: el esquema escribe lo que dicen, y el lienzo, el SVG, el PDF y la página de solo lectura las dibujan.',
  '{count} relations drawn curved or straight are drawn in {tool}’s own style.': {
    one: 'Una relación dibujada curva o recta se dibuja con el estilo propio de {tool}.',
    other:
      '{count} relaciones dibujadas curvas o rectas se dibujan con el estilo propio de {tool}.',
  },
  '{name}, held by its anchored part and not drawn':
    '{name}, que contiene su parte anclada y no se dibuja',
  'The whole view as the canvas draws it, without the selection, filters, focus or guidance.':
    'Toda la vista como la dibuja el lienzo, sin la selección, los filtros, el foco ni la guía.',
  'The whole view on one page, without the selection, filters, focus or guidance; WebP pictures and the colors of bitmap silhouettes are left out.':
    'Toda la vista en una página, sin la selección, los filtros, el foco ni la guía; se omiten las imágenes WebP y los colores de las siluetas de mapas de bits.',
  'Every shape and relation as text, and the scenarios; no positions, colors or pictures.':
    'Cada forma y relación como texto, y los escenarios; sin posiciones, colores ni imágenes.',
  'Shapes and relations for Mermaid to lay out; no positions, details, notes or pictures.':
    'Formas y relaciones para que Mermaid las organice; sin posiciones, detalles, notas ni imágenes.',
  'The C4 model of the view’s Systems components; no positions, notes, pictures or scenarios.':
    'El modelo C4 de los componentes de Sistemas de la vista; sin posiciones, notas, imágenes ni escenarios.',
  // Package code (ADR 0054): the inspector, the component editor and the approval dialog.
  'Package code': 'Código del paquete',
  'Computed values': 'Valores calculados',
  'Computed by the code of “{name}”, and never saved.':
    'Calculado por el código de “{name}”, y nunca guardado.',
  computed: 'calculado',
  '“{name}” finds:': '“{name}” encuentra:',
  'Review the code of “{name}”…': 'Revisar el código de “{name}”…',
  'The code of “{name}” is over 256 KiB, so it never runs.':
    'El código de “{name}” pasa de 256 KiB, así que nunca se ejecuta.',
  'The code of “{name}” is not approved, so it does not run.':
    'El código de “{name}” no está aprobado, así que no se ejecuta.',
  'Read the whole model, without changing it': 'Leer todo el modelo, sin cambiarlo',
  'Read the clock': 'Leer el reloj',
  'Fetch from {origin}, through Visual Anything':
    'Traer datos de {origin}, a través de Visual Anything',
  'The code of “{name}”': 'El código de “{name}”',
  'The code changed while it was open here: this is the code as it is now, and nothing was approved.':
    'El código cambió mientras estaba abierto aquí: este es el código tal como es ahora, y no se aprobó nada.',
  'It runs in a sandbox, with no access to your files, the page or the network beyond what you grant below. Approve it only if you trust where it comes from.':
    'Se ejecuta aislado, sin acceso a los archivos, a la página ni a la red más allá de lo que se conceda abajo. Aprobarlo solo si se confía en su origen.',
  'It is over 256 KiB, so it never runs, approved or not.':
    'Pasa de 256 KiB, así que nunca se ejecuta, esté aprobado o no.',
  '{count} lines': { one: '{count} línea', other: '{count} líneas' },
  'hash {hash}…': 'resumen {hash}…',
  'Its code': 'Su código',
  'What it may reach beyond its element': 'A qué puede llegar más allá de su elemento',
  'No hook fetches anything yet: fetching waits for live values.':
    'Todavía no trae datos de ningún lado: eso llega con los valores en vivo.',
  'It reaches nothing beyond its element.': 'No llega a nada más allá de su elemento.',
  'Withdraw approval': 'Retirar la aprobación',
  'Keep approved': 'Mantener aprobado',
  'Approve and run': 'Aprobar y ejecutar',
  'not granted': 'no concedida',
  'Approved, and running.': 'Aprobado y en ejecución.',
  'Approved: it runs once the worker starts.':
    'Aprobado: se ejecuta en cuanto arranca el proceso que ejecuta el código.',
  'Review the code…': 'Revisar el código…',
  'Review and approve the code…': 'Revisar y aprobar el código…',
  // Built-in package code (ADR 0089's M14.6 clarification): the program's own, never approved.
  'Built into Visual Anything: it runs as part of the program, without an approval.':
    'Incluido en Visual Anything: se ejecuta como parte del programa, sin aprobación.',
  'Built into Visual Anything: it runs as part of the program once the worker starts.':
    'Incluido en Visual Anything: se ejecuta como parte del programa en cuanto arranca el proceso que ejecuta el código.',
  'Built into Visual Anything: its code runs as part of the program.':
    'Incluido en Visual Anything: su código se ejecuta como parte del programa.',
  'Built into Visual Anything: its code runs as part of the program once the worker starts.':
    'Incluido en Visual Anything: su código se ejecuta como parte del programa en cuanto arranca el proceso que ejecuta el código.',
  'Show the code…': 'Ver el código…',
  'It is built into Visual Anything and runs as part of the program, in the same sandbox as any package’s code, without an approval. You can turn it off on this computer in Packages….':
    'Está incluido en Visual Anything y se ejecuta como parte del programa, aislado como el código de cualquier paquete, sin aprobación. Se puede desactivar en esta computadora desde Paquetes….',
  'The package “{name}” holds code that is not approved, so it does not run. Review it from one of its elements in the inspector, or from the package in the Components tab.':
    'El paquete “{name}” tiene código que no está aprobado, así que no se ejecuta. Revisarlo desde uno de sus elementos en el inspector, o desde el paquete en la pestaña Componentes.',

  // Packages… (ADR 0089): the project's packages, their code, and adding or updating one from a file.
  'Packages…': 'Paquetes…',
  'What each package adds to the project, and its code. Package code runs only once you approve it, and you can turn it off on this computer.':
    'Lo que cada paquete agrega al proyecto, y su código. El código de un paquete se ejecuta solo después de aprobarlo, y se puede desactivar en esta computadora.',
  'This project uses no package yet. Add one from a package file or a folder below.':
    'Este proyecto todavía no usa ningún paquete. Agregar uno desde un archivo de paquete o una carpeta, aquí abajo.',
  'Packages of the project': 'Paquetes del proyecto',
  'The project’s own': 'Propio del proyecto',
  'Version {version}': 'Versión {version}',
  '{components} and {relationTypes}': '{components} y {relationTypes}',
  Actions: 'Acciones',
  Importers: 'Importadores',
  Exporters: 'Exportadores',
  Panels: 'Paneles',
  'What its code may reach': 'A qué puede llegar su código',
  'No code.': 'Sin código.',
  'Turned off on this computer: its code does not run.':
    'Desactivado en esta computadora: su código no se ejecuta.',
  'Its code waits for approval, so it does not run.':
    'Su código espera una aprobación, así que no se ejecuta.',
  'Run its code on this computer': 'Ejecutar su código en esta computadora',
  'Add or update from a file': 'Agregar o actualizar desde un archivo',
  'Choose a package file, or a folder that holds some. A package with the id of one of the project’s own updates it, after showing what changes; any other is added. Nothing it holds runs until you approve its code.':
    'Elegir un archivo de paquete, o una carpeta que tenga alguno. Un paquete con el id de uno propio del proyecto lo actualiza, después de mostrar qué cambia; cualquier otro se agrega. Nada de lo que contiene se ejecuta hasta que se apruebe su código.',
  'Choose a package file…': 'Elegir un archivo de paquete…',
  'Choose a folder…': 'Elegir una carpeta…',
  'Reading the file…': 'Leyendo el archivo…',
  'The file {name} is over 2 MiB.': 'El archivo {name} pasa de 2 MiB.',
  '{name} cannot be added:': '{name} no se puede agregar:',
  'The folder {name} holds no package file, at its top or in its packages folder.':
    'La carpeta {name} no tiene ningún archivo de paquete, ni en su primer nivel ni en su carpeta packages.',
  'Package files in {name}': 'Archivos de paquete en {name}',
  'Add “{name}”': 'Agregar “{name}”',
  'Update “{name}”': 'Actualizar “{name}”',
  'Added “{name}”.': 'Se agregó “{name}”.',
  'Updated “{name}”.': 'Se actualizó “{name}”.',
  'It holds code, which runs only once you approve it, after reading it.':
    'Contiene código, que se ejecuta solo después de leerlo y aprobarlo.',
  'It adds code, which runs only once you approve it.':
    'Agrega código, que se ejecuta solo después de aprobarlo.',
  'Its code is removed.': 'Se quita su código.',
  'Its code stays the same, and so does its approval.':
    'Su código no cambia, y su aprobación tampoco.',
  'Its code stays the same.': 'Su código no cambia.',
  'Its code changed, so it asks for your approval again before it runs.':
    'Su código cambió, así que vuelve a pedir aprobación antes de ejecutarse.',
  'What its code may reach changed, so it asks for your approval again before it runs.':
    'Cambió a qué puede llegar su código, así que vuelve a pedir aprobación antes de ejecutarse.',
  'What its code adds to the app changed, so it asks for your approval again before it runs.':
    'Cambió lo que su código agrega a la aplicación, así que vuelve a pedir aprobación antes de ejecutarse.',
  // A package's solids from another project (ADR 0089's M14.6 clarification).
  'Copying its solids’ files…': 'Copiando los archivos de sus sólidos…',
  'The files of {count} of its solids are copied into this project’s solids folder, each checked by Visual Anything first.':
    {
      one: 'El archivo de {count} de sus sólidos se copia en la carpeta solids de este proyecto, revisado antes por Visual Anything.',
      other:
        'Los archivos de {count} de sus sólidos se copian en la carpeta solids de este proyecto, cada uno revisado antes por Visual Anything.',
    },
  'That folder holds no file for {count} of its solids: they draw their placeholders until their files are in this project’s solids folder.':
    {
      one: 'Esa carpeta no tiene el archivo de {count} de sus sólidos: se dibuja su marcador hasta que su archivo esté en la carpeta solids de este proyecto.',
      other:
        'Esa carpeta no tiene los archivos de {count} de sus sólidos: se dibujan sus marcadores hasta que sus archivos estén en la carpeta solids de este proyecto.',
    },
  'The file’s version, {there}, is older than this one, {here}.':
    'La versión del archivo, {there}, es anterior a esta, {here}.',
  'Its components, relation types and images stay as they are.':
    'Sus componentes, tipos de relación e imágenes quedan como están.',

  // M14.3 (ADR 0089): packages' actions in the menus, their importers and exporters, and the review
  // of the changes an action or an importer proposes.
  'From packages': 'De paquetes',
  'From the package “{name}”: its changes wait for your review.':
    'Del paquete “{name}”: sus cambios esperan una revisión.',
  'Run its actions': 'Ejecutar sus acciones',
  'Its changes wait for your review before anything changes.':
    'Sus cambios esperan una revisión antes de que algo cambie.',
  'Run “{label}”': 'Ejecutar “{label}”',
  'Running “{label}”, of the package “{name}”…': 'Ejecutando “{label}”, del paquete “{name}”…',
  '“{label}”, from the package “{name}”': '“{label}”, del paquete “{name}”',
  'Decide about the changes of the package “{name}”':
    'Decidir sobre los cambios del paquete “{name}”',
  'The package “{name}” proposes: {label}': 'El paquete “{name}” propone: {label}',
  'Nothing changes until you accept. Accepting makes its {count} commands one action of yours, which Undo takes back whole.':
    {
      one: 'Nada cambia hasta aceptarlo. Al aceptar, su único comando pasa a ser una acción propia, que Deshacer revierte entera.',
      other:
        'Nada cambia hasta aceptarlos. Al aceptar, sus {count} comandos pasan a ser una sola acción propia, que Deshacer revierte entera.',
    },
  Decline: 'Rechazar',
  'The changes could not apply: the notice says why. Decline them, or try again.':
    'Los cambios no se pudieron aplicar: el aviso dice por qué. Rechazarlos, o volver a intentarlo.',
  'Another package’s action or importer is still running, so “{label}” did not start.':
    'Todavía se está ejecutando la acción o el importador de otro paquete, así que “{label}” no empezó.',
  '“{label}”, of the package “{name}”, proposes no changes.':
    '“{label}”, del paquete “{name}”, no propone ningún cambio.',
  'The changes “{label}”, of the package “{name}”, proposes cannot apply: {why}':
    'Los cambios que propone “{label}”, del paquete “{name}”, no se pueden aplicar: {why}',
  '{label} ({extensions}), from the package “{name}”':
    '{label} ({extensions}), del paquete “{name}”',
  'Packages read files too: their code reads the file, and what it would change opens for you to accept or decline.':
    'Los paquetes también leen archivos: su código lee el archivo, y lo que cambiaría se abre para aceptarlo o rechazarlo.',
  'Reading with “{label}”, of the package “{name}”…':
    'Leyendo con “{label}”, del paquete “{name}”…',
  'Written by the package “{name}”, as a {extension} file':
    'Lo escribe el paquete “{name}”, como un archivo {extension}',
  'What the file holds is what the package’s code writes: Visual Anything does not check it.':
    'Lo que contiene el archivo es lo que escribe el código del paquete: Visual Anything no lo revisa.',

  // M14.4 (ADR 0089): packages' panels in the inspector, drawn from what their code answers.
  'from the package “{name}”': 'del paquete “{name}”',
  'Asking the package’s code…': 'Consultando el código del paquete…',
  'The package shows nothing here for this element.':
    'El paquete no muestra nada aquí para este elemento.',
  'Show again': 'Mostrar de nuevo',
  'No rows.': 'Sin filas.',
  'From {low} to {high}': 'De {low} a {high}',
  'Bar chart of {series}, over {count} labels. {range}.': {
    one: 'Gráfico de barras de {series}, en {count} etiqueta. {range}.',
    other: 'Gráfico de barras de {series}, en {count} etiquetas. {range}.',
  },
  'Line chart of {series}, over {count} labels. {range}.': {
    one: 'Gráfico de líneas de {series}, en {count} etiqueta. {range}.',
    other: 'Gráfico de líneas de {series}, en {count} etiquetas. {range}.',
  },
  '{series}, {label}: {value}': '{series}, {label}: {value}',

  // Tours (ADR 0058): the tours panel and full-screen playback.
  'These {count} tour steps name what goes. They are kept, flagged, and play without it:': {
    one: 'Este paso de recorrido nombra algo que se elimina. Se conserva, marcado, y se reproduce sin eso:',
    other:
      'Estos {count} pasos de recorrido nombran algo que se elimina. Se conservan, marcados, y se reproducen sin eso:',
  },
  Tours: 'Recorridos',
  'Tours of the project': 'Recorridos del proyecto',
  'New tour': 'Nuevo recorrido',
  'New tour {count}': 'Nuevo recorrido {count}',
  'New tour from the canvas': 'Nuevo recorrido desde el lienzo',
  'This project has no tours yet. A tour walks someone through it, one view state at a time: start one from what the canvas shows now.':
    'Este proyecto todavía no tiene recorridos. Un recorrido guía a alguien por el proyecto, un estado de vista a la vez: empezar uno a partir de lo que muestra ahora el lienzo.',
  'Created “{name}”.': 'Se creó “{name}”.',
  '{count} name what is gone': {
    one: '{count} nombra algo que ya no está',
    other: '{count} nombran algo que ya no está',
  },
  'Play “{name}” full screen': 'Reproducir “{name}” a pantalla completa',
  'Play full screen from step {n}': 'Reproducir a pantalla completa desde el paso {n}',
  'All tours': 'Todos los recorridos',
  'Name of the tour': 'Nombre del recorrido',
  'Steps of “{name}”': 'Pasos de “{name}”',
  'This tour has no steps yet. Add one: it takes the canvas as it is now.':
    'Este recorrido todavía no tiene pasos. Agregar uno: toma el lienzo tal como está ahora.',
  'Add step': 'Agregar paso',
  'Added step {n}, showing the canvas as it is now.':
    'Se agregó el paso {n}, que muestra el lienzo tal como está ahora.',
  'Delete the tour?': '¿Eliminar el recorrido?',
  'Delete “{name}”?': '¿Eliminar “{name}”?',
  Keep: 'Conservar',
  'Delete tour': 'Eliminar recorrido',
  Step: 'Paso',
  'Step {n}': 'Paso {n}',
  'Moved step {n} to {to}.': 'Se movió el paso {n} al lugar {to}.',
  'Duplicated step {n}.': 'Se duplicó el paso {n}.',
  'Deleted step {n}.': 'Se eliminó el paso {n}.',
  'This step names what the project no longer holds, and plays without it:':
    'Este paso nombra algo que el proyecto ya no tiene, y se reproduce sin eso:',
  'This step names what the project no longer holds, and plays without it.':
    'Este paso nombra algo que el proyecto ya no tiene, y se reproduce sin eso.',
  'This step’s view no longer exists, so the canvas stays where it is.':
    'La vista de este paso ya no existe, así que el lienzo se queda donde está.',
  // M11c: what the tour's check says, under each step (ADR 0077).
  'Read on a screen of {width} by {height} pixels: nothing to look at.':
    'Leído en una pantalla de {width} por {height} píxeles: nada que revisar.',
  'Read on a screen of {width} by {height} pixels: {count} things to look at, under their steps.': {
    one: 'Leído en una pantalla de {width} por {height} píxeles: {count} cosa que revisar, bajo su paso.',
    other:
      'Leído en una pantalla de {width} por {height} píxeles: {count} cosas que revisar, bajo sus pasos.',
  },
  'What to look at in step {n}': 'Qué revisar en el paso {n}',
  'Step {n} cuts from step {m} with a cross-fade, into another view.':
    'El paso {n} corta desde el paso {m} con un fundido, hacia otra vista.',
  // M11d: tours that explain (ADR 0084), in the Tours panel and on the stage.
  'Step {n} glides the {count} shapes it shares with step {m} into another view.': {
    one: 'El paso {n} desliza hacia otra vista la {count} forma que comparte con el paso {m}.',
    other: 'El paso {n} desliza hacia otra vista las {count} formas que comparte con el paso {m}.',
  },
  'Step {n} cuts from step {m} with a cross-fade, as it asks to.':
    'El paso {n} corta desde el paso {m} con un fundido, como pide.',
  'Step {n} cuts from step {m} with a cross-fade, into another view: they share fewer than {least} shapes.':
    'El paso {n} corta desde el paso {m} con un fundido, hacia otra vista: comparten menos de {least} formas.',
  'The caption points at': 'El rótulo apunta a',
  'Step {n} points at nothing.': 'El paso {n} no apunta a nada.',
  'Step {n} points at “{name}”.': 'El paso {n} apunta a “{name}”.',
  'Always cut, never glide its shapes': 'Cortar siempre, sin deslizar sus formas',
  'Step {n} always cuts.': 'El paso {n} corta siempre.',
  'Step {n} glides its shapes when it can.': 'El paso {n} desliza sus formas cuando puede.',
  'Pulses along {names}.': 'Envía un pulso por {names}.',
  'No pulse.': 'Sin pulso.',
  'Pulse along the selected relations': 'Pulso por las relaciones seleccionadas',
  'Step {n} pulses along the selected relations.':
    'El paso {n} envía un pulso por las relaciones seleccionadas.',
  'How many times it runs': 'Cuántas veces corre',
  'Step {n} pulses {count} times.': {
    one: 'El paso {n} envía el pulso una vez.',
    other: 'El paso {n} envía el pulso {count} veces.',
  },
  Once: 'Una vez',
  Twice: 'Dos veces',
  'Three times': 'Tres veces',
  'No pulse': 'Sin pulso',
  'Step {n} sends no pulse.': 'El paso {n} no envía ningún pulso.',
  'The selected relations do not join into a chain: the marker must run each from where the one before left it.':
    'Las relaciones seleccionadas no forman una cadena: el marcador debe recorrer cada una desde donde lo dejó la anterior.',
  'It explains something off the canvas.': 'Explica algo que está fuera del lienzo.',
  'Pointing at “{name}”.': 'Apunta a “{name}”.',
  'Pointing at the note “{text}”.': 'Apunta a la nota “{text}”.',
  'Pointing at an arrow.': 'Apunta a una flecha.',
  'A pulse follows the chain: {names}.': 'Un pulso sigue la cadena: {names}.',
  Title: 'Título',
  Caption: 'Rótulo',
  'Markdown: **bold**, *italic*, `code`, lists, headings and links; a blank line starts a paragraph.':
    'Markdown: **negrita**, *cursiva*, `código`, listas, títulos y direcciones web; una línea en blanco empieza un párrafo.',
  'Changed the title of step {n}.': 'Se cambió el título del paso {n}.',
  'Changed the caption of step {n}.': 'Se cambió el rótulo del paso {n}.',
  'Speaker notes': 'Notas del orador',
  // M3d: text emphasis (ADR 0082), in the fields that edit a text and the attribute editor.
  'As it is drawn': 'Como se dibuja',
  'Takes text emphasis': 'Admite énfasis de texto',
  'Its values may be written with **bold**, *italic*, `code` and the rest; leave it off for identifiers and code.':
    'Sus valores pueden escribirse con **negrita**, *cursiva*, `código` y el resto; dejarlo desactivado para identificadores y código.',
  'Changed the speaker notes of step {n}.': 'Se cambiaron las notas del orador del paso {n}.',
  'Mark the selection': 'Marcar la selección',
  'Clear marks': 'Quitar las marcas',
  'Step {n} marks the selection.': 'El paso {n} marca la selección.',
  'Step {n} marks nothing.': 'El paso {n} no marca nada.',
  'Take the canvas': 'Tomar el lienzo',
  'Step {n} shows the canvas as it is now.': 'El paso {n} muestra el lienzo tal como está ahora.',
  Duplicate: 'Duplicar',
  'a place on the canvas': 'un lugar del lienzo',
  '{count} selected': { one: '{count} seleccionado', other: '{count} seleccionados' },
  filters: 'filtros',
  focus: 'foco',
  'a scenario': 'un escenario',
  'the physical-space panel': 'el panel del espacio físico',
  'Shows “{view}”': 'Muestra “{view}”',
  'Shows “{view}”: {parts}': 'Muestra “{view}”: {parts}',
  'Marks nothing.': 'No marca nada.',
  'Marks {names}.': 'Marca {names}.',
  'Marks {names} and {count} more.': 'Marca {names} y {count} más.',
  tour: 'recorrido',
  Tour: 'Recorrido',
  'Tour “{name}”': 'Recorrido “{name}”',
  'Progress through the tour': 'Avance del recorrido',
  'Previous step': 'Paso anterior',
  'Next step': 'Paso siguiente',
  'Speaker notes in a second window': 'Notas del orador en una segunda ventana',
  'End the tour': 'Terminar el recorrido',
  'End the tour (Escape)': 'Terminar el recorrido (Escape)',
  'Speaker notes: {name}': 'Notas del orador: {name}',
  'This step has no speaker notes.': 'Este paso no tiene notas del orador.',
  'Next: {title}': 'Siguiente: {title}',
  'The browser did not open the speaker notes window. Allow pop-up windows for this page, then try again.':
    'El navegador no abrió la ventana de las notas del orador. Permitir ventanas emergentes para esta página y volver a intentarlo.',
  // The stage of a tour that moves (ADR 0077).
  'The steps of the tour (I)': 'Los pasos del recorrido (I)',
  'The steps of the tour': 'Los pasos del recorrido',
  'Pause advancing': 'Pausar el avance',
  'Resume advancing': 'Reanudar el avance',
  'Pause advancing by itself': 'Pausar el avance automático',
  'Resume advancing by itself': 'Reanudar el avance automático',
  'Back to the step': 'Volver al paso',
  'Back to the step’s camera (B)': 'Volver a la cámara del paso (B)',
  'Plays “{name}”': 'Reproduce “{name}”',
  Resume: 'Reanudar',
  'Pause the scenario (P)': 'Pausar el escenario (P)',
  'Resume the scenario (P)': 'Reanudar el escenario (P)',
  'Play the scenario’s steps again (R)': 'Reproducir de nuevo los pasos del escenario (R)',
  'Step {n} of {total}: {title}': 'Paso {n} de {total}: {title}',
  'Paused on step {n} of {total} of “{name}”.': 'En pausa en el paso {n} de {total} de “{name}”.',
  'Paused on step {n} of {total} of “{name}”: {description}':
    'En pausa en el paso {n} de {total} de “{name}”: {description}',
  // How tours and scenarios move: the Motion and Fades preferences (ADR 0077).
  'How tours and scenarios move': 'Cómo se mueven los recorridos y los escenarios',
  Motion: 'Movimiento',
  'As the system says': 'Según el sistema',
  'As the system says (reduced now)': 'Según el sistema (ahora reducido)',
  'As the system says (full now)': 'Según el sistema (ahora completo)',
  Reduced: 'Reducido',
  Full: 'Completo',
  Fades: 'Fundidos',
  'Reduced motion cuts every camera move and keeps travelling markers still. Fades cross-fade where the camera cuts, and fade each step’s marks and caption.':
    'El movimiento reducido corta cada movimiento de la cámara y deja quietos los marcadores que recorren las relaciones. Los fundidos funden la imagen donde la cámara corta, y hacen aparecer y desaparecer gradualmente las marcas y el texto de cada paso.',
  // The legend of a view's overlays, on the canvas and below an image (ADR 0055).
  Legend: 'Leyenda',
  'Fill by {attribute}': 'Relleno según {attribute}',
  'Stroke by {attribute}': 'Trazo según {attribute}',
  'Size by {attribute}': 'Tamaño según {attribute}',
  'Badge by {attribute}': 'Insignia según {attribute}',
  'Opacity by {attribute}': 'Opacidad según {attribute}',
  'Line color by {attribute}': 'Color de línea según {attribute}',
  'Line color and dash by relation type': 'Color y trazo de línea según el tipo de relación',
  'Line dash by relation type, and its color when pointed at or selected':
    'Trazo de línea según el tipo de relación, y su color al señalarla o seleccionarla',
  'Line width by {attribute}': 'Grosor según {attribute}',
  'Label by {attribute}': 'Etiqueta según {attribute}',
  'Line opacity by {attribute}': 'Opacidad de línea según {attribute}',
  'Any other value': 'Cualquier otro valor',
  'The value itself': 'El valor mismo',
  // The view's overlays in the inspector.
  Overlays: 'Superposiciones',
  'No overlay changes how this view’s shapes look by their attributes. Add one with Add an overlay.':
    'Ninguna superposición cambia cómo se ven las formas de esta vista según sus atributos. Agregar una con Agregar una superposición.',
  'Where two overlays set the same thing, the one higher in the list wins.':
    'Cuando dos superposiciones definen lo mismo, gana la que está más arriba en la lista.',
  'Add an overlay': 'Agregar una superposición',
  'New overlay': 'Nueva superposición',
  'Edit the overlay': 'Editar la superposición',
  'Add the overlay': 'Agregar la superposición',
  'Save the overlay': 'Guardar la superposición',
  Edit: 'Editar',
  'Name in the legend': 'Nombre en la leyenda',
  'Reads the attributes of': 'Lee los atributos de',
  'What it changes': 'Qué cambia',
  Maps: 'Asigna',
  'Value by value': 'Valor por valor',
  'Along a range of numbers': 'A lo largo de un rango de números',
  Values: 'Valores',
  Stops: 'Paradas',
  At: 'En',
  Color: 'Color',
  Factor: 'Factor',
  Badge: 'Insignia',
  Opacity: 'Opacidad',
  Label: 'Etiqueta',
  'Line color': 'Color de línea',
  'Label in the legend': 'Etiqueta en la leyenda',
  'Add a value': 'Agregar un valor',
  'Add a stop': 'Agregar una parada',
  'Add each value it has': 'Agregar cada valor que tiene',
  // What Mermaid and Structurizr lose of a view with overlays: they draw no legend (ADR 0055).
  'The legend of the view’s overlays, whose colors it draws: the outline in Markdown, the SVG and the PDF carry it.':
    'La leyenda de las superposiciones de la vista, cuyos colores dibuja: el esquema en Markdown, el SVG y el PDF la incluyen.',
  // A component's levels of detail in the component editor (ADR 0055).
  'Levels of detail': 'Niveles de detalle',
  'From each level’s zoom up, its shapes show what the level lists; below the first, a silhouette. A level is left only 10% below its zoom, so nothing flickers.':
    'Desde el zoom de cada nivel hacia arriba, sus formas muestran lo que el nivel indica; debajo del primero, una silueta. Un nivel se deja solo un 10 % por debajo de su zoom, así que nada parpadea.',
  'What its shapes show as you zoom': 'Lo que muestran sus formas al hacer zoom',
  'None: its shapes follow the canvas’s defaults, names from 45% and details from 90%.':
    'Ninguno: sus formas siguen los valores predeterminados del lienzo, nombres desde el 45 % y detalles desde el 90 %.',
  'Add a level': 'Agregar un nivel',
  'Follow the canvas’s defaults': 'Seguir los valores predeterminados del lienzo',
  'Level from {zoom}': 'Nivel desde {zoom}',
  'From a zoom of (%)': 'Desde un zoom de (%)',
  'A silhouette only': 'Solo una silueta',
  'Contents or rows': 'Contenido o filas',
  // A face (ADR 0083) is «cara» in Spanish.
  Face: 'Cara',
  'Its face shows': 'Su cara muestra',
  'Its own markup': 'Su propio marcado',
  'The variant "{id}"': 'La variante "{id}"',
  // The Face section (ADR 0083, M3e F4).
  'What its shapes show inside their body, written in a subset of HTML and CSS and filled from each element’s name and attributes. Nothing in it runs or is fetched.':
    'Lo que muestran sus formas dentro de su cuerpo, escrito en una parte de HTML y CSS y completado con el nombre y los atributos de cada elemento. Nada en ella se ejecuta ni se descarga.',
  'Its face': 'Su cara',
  'Use the component’s face': 'Usar la cara del componente',
  'None: its shapes show their name and detail.':
    'Ninguna: sus formas muestran su nombre y su detalle.',
  'None: its shapes show no face, whatever is inherited.':
    'Ninguna: sus formas no muestran ninguna cara, herede lo que herede.',
  'A face, with no variants.': 'Una cara, sin variantes.',
  'A face, with {count} variants.': {
    one: 'Una cara, con {count} variante.',
    other: 'Una cara, con {count} variantes.',
  },
  'Markup of': 'Marcado de',
  'The face itself': 'La cara misma',
  'Markup, in a subset of HTML': 'Marcado, en una parte de HTML',
  'Markup of the variant "{id}"': 'Marcado de la variante "{id}"',
  'Style, in a subset of CSS': 'Estilo, en una parte de CSS',
  'New variant’s id': 'Id de la nueva variante',
  'Add a variant': 'Agregar una variante',
  'Remove the variant "{id}"': 'Quitar la variante "{id}"',
  'An id is lowercase letters, digits and "-", a letter first.':
    'Un id son letras minúsculas, dígitos y "-", con una letra primero.',
  'The face has a variant with this id already.': 'La cara ya tiene una variante con este id.',
  'Its height': 'Su altura',
  'The shape’s, cut where the face overflows': 'La de la forma, cortada donde la cara se desborda',
  'As tall as the face': 'Tan alta como la cara',
  'Collapsed, it shows': 'Contraída, muestra',
  'The face without its contents': 'La cara sin su contenido',
  'Fix these before it can be applied:': 'Corregir esto antes de poder aplicarla:',
  'It can be applied; it warns about:': 'Se puede aplicar; advierte sobre:',
  Preview: 'Vista previa',
  'Preview with': 'Vista previa con',
  'A stand-in named “{name}”': 'Un sustituto llamado “{name}”',
  Showing: 'Mostrando',
  'As a collapsed container': 'Como contenedor contraído',
  '{width} by {height}': '{width} por {height}',
  'The preview shows once the face has no errors.':
    'La vista previa aparece cuando la cara no tiene errores.',
  'No markup to preview. Write the face’s markup above to see it here.':
    'No hay marcado para previsualizar. Escribir el marcado de la cara arriba para verlo aquí.',
  'Preview of its face: {text}': 'Vista previa de su cara: {text}',
  'Cut where it overflows': 'Cortada donde se desborda',
  Apply: 'Aplicar',
  'Discard the changes': 'Descartar los cambios',
  'Start from a face that writes its name and detail':
    'Empezar con una cara que escribe su nombre y su detalle',
  'Show no face': 'No mostrar ninguna cara',
  'Remove the level from {zoom}': 'Quitar el nivel desde {zoom}',
  'Enter a zoom from 0% to 800%.': 'Escribir un zoom de 0 % a 800 %.',
  'Expand a collapsed container from a zoom of (%)':
    'Expandir un contenedor contraído desde un zoom de (%)',
  'Zooming into a collapsed container of it shows it expanded from this zoom, and collapses it again below 90% of it; nothing about it is saved. Empty, it stays collapsed.':
    'Al acercarse a un contenedor contraído de este componente, se muestra expandido desde este zoom, y se contrae de nuevo por debajo del 90 % de él; nada de esto se guarda. Vacío, queda contraído.',
  'Enter a zoom above 0%, at most 800%.': 'Escribir un zoom mayor que 0 %, de 800 % como máximo.',

  // External identifiers, destinations and the element list (M8, ADR 0056).
  destination: 'destino',
  Add: 'Agregar',
  'the view “{view}”': 'la vista “{view}”',
  'the project in “{folder}”': 'el proyecto de “{folder}”',
  'the view {view} of the project in “{folder}”': 'la vista {view} del proyecto de “{folder}”',
  'a page of {host}': 'una página de {host}',
  'the view {view}, which the project does not have': 'la vista {view}, que el proyecto no tiene',
  'nothing, since this is not a destination': 'nada, porque esto no es un destino',
  'This is not a destination, so it opens nothing.': 'Esto no es un destino, así que no abre nada.',
  'This destination opens the view {view}, which the project does not have.':
    'Este destino abre la vista {view}, que el proyecto no tiene.',
  'This web address does not open: the browser reads it otherwise.':
    'Esta dirección web no se abre: el navegador la lee de otra manera.',
  'Another project opens only while Visual Anything is connected.':
    'Otro proyecto solo se abre mientras Visual Anything está conectado.',
  '“{name}” opens in a new tab.': '“{name}” se abre en una pestaña nueva.',
  'The project in “{folder}” does not open: {why}': 'El proyecto de “{folder}” no se abre: {why}',
  'Open a page of {host}?': '¿Abrir una página de {host}?',
  'It opens in a new tab, which cannot reach this one. Its whole address:':
    'Se abre en una pestaña nueva, que no puede llegar a esta. Su dirección completa:',
  'Open the project in “{folder}”?': '¿Abrir el proyecto de “{folder}”?',
  'Its folder is {path}, from this project’s folder. It opens in a tab of its own, through the Visual Anything that runs on it, which starts if none does.':
    'Su carpeta es {path}, desde la carpeta de este proyecto. Se abre en una pestaña propia, a través del Visual Anything que corre sobre él, que se inicia si no hay ninguno.',
  'It opens at its view {view}.': 'Se abre en su vista {view}.',
  'Open the page': 'Abrir la página',
  'Open the project': 'Abrir el proyecto',
  Destinations: 'Destinos',
  'Opens {what}': 'Abre {what}',
  'Follow “{name}”, which opens {what}': 'Seguir “{name}”, que abre {what}',
  Follow: 'Seguir',
  'Follow “{name}”': 'Seguir “{name}”',
  'Double-click, or press Alt+Enter, to open {opens}':
    'Hacer doble clic, o presionar Alt+Enter, para abrir {opens}',
  'Its menu lists its {count} destinations.': 'Su menú lista sus {count} destinos.',
  'Alt+Enter': 'Alt+Enter',
  'Follow the selected element’s destination, as double-clicking the mark in its bottom left corner does':
    'Seguir el destino del elemento seleccionado, como lo hace un doble clic en la marca de su esquina inferior izquierda',
  'An identifier has 1 to {n} characters, without line breaks.':
    'Un identificador tiene de 1 a {n} caracteres, sin saltos de línea.',
  'External identifiers': 'Identificadores externos',
  'None yet. Add what it is in another catalog, such as uberon: UBERON:0002135.':
    'Ninguno todavía. Agregar lo que es en otro catálogo, como uberon: UBERON:0002135.',
  'A scheme is a short lowercase name, such as uberon, fma or wikidata.':
    'Un catálogo es un nombre corto en minúsculas, como uberon, fma o wikidata.',
  'It has a {scheme} identifier already; change that one.':
    'Ya tiene un identificador de {scheme}; cambiar ese.',
  'Add an external identifier': 'Agregar un identificador externo',
  Scheme: 'Catálogo',
  Identifier: 'Identificador',
  'A view of this project': 'Una vista de este proyecto',
  'Another project': 'Otro proyecto',
  'A web address': 'Una dirección web',
  'Folder, from this project’s folder': 'Carpeta, desde la carpeta de este proyecto',
  'View id there, if any': 'Id de la vista allí, si hay',
  'Web address, starting with https://': 'Dirección web, que empiece con https://',
  'Choose a view': 'Elegir una vista',
  '{view}, which the project does not have': '{view}, que el proyecto no tiene',
  'It opens the whole view.': 'Abre la vista completa.',
  'It selects {count} elements there.': {
    one: 'Allí selecciona {count} elemento.',
    other: 'Allí selecciona {count} elementos.',
  },
  'Focus on the selection': 'Enfocar en la selección',
  'Open the whole view': 'Abrir la vista completa',
  'This is not a destination: {why}': 'Esto no es un destino: {why}',
  '{scheme} identifier {identifier}': 'identificador de {scheme} {identifier}',
  'Element list': 'Lista de elementos',
  'List the elements with their attributes, to read and edit them as a table':
    'Listar los elementos con sus atributos, para leerlos y editarlos como una tabla',
  'Close the element list': 'Cerrar la lista de elementos',
  List: 'Listar',
  'What this view shows': 'Lo que muestra esta vista',
  'Only this component': 'Solo este componente',
  Filter: 'Filtrar',
  'Filter in': 'Filtrar en',
  'Any column': 'Cualquier columna',
  '{shown} of {count} elements': {
    one: '{shown} de {count} elemento',
    other: '{shown} de {count} elementos',
  },
  'Sort by {column}': 'Ordenar por {column}',
  identifier: 'identificador',
  'In the model’s order again.': 'De nuevo en el orden del modelo.',
  'Sorted by {column}, ascending.': 'Ordenado por {column}, de menor a mayor.',
  'Sorted by {column}, descending.': 'Ordenado por {column}, de mayor a menor.',
  'Nothing is listed here. Choose another component, or add elements on the canvas.':
    'Aquí no hay nada en la lista. Elegir otro componente, o agregar elementos en el lienzo.',
  'No element matches “{filter}”. Change the filter, or clear it.':
    'Ningún elemento coincide con “{filter}”. Cambiar el filtro, o borrarlo.',
  'The component is changed in the inspector.': 'El componente se cambia en el inspector.',
  '“{name}”, {column}: {why}': '“{name}”, {column}: {why}',
  'This cell holds no destination to follow.': 'Esta celda no tiene ningún destino que seguir.',
  'A paste sets at most {n} cells at once.': 'Un pegado cambia como máximo {n} celdas a la vez.',
  'Nothing here could be pasted.': 'Aquí no se pudo pegar nada.',
  'Pasted {count} cells.': { one: 'Se pegó {count} celda.', other: 'Se pegaron {count} celdas.' },
  // Live values (ADR 0057): the inspector's section, and how the canvas says a value's age.
  'Live values': 'Valores en vivo',
  'They come from outside while the project is open, and are never saved.':
    'Llegan desde afuera mientras el proyecto está abierto, y nunca se guardan.',
  'A live value from {sender}, never saved.': 'Un valor en vivo de {sender}, nunca guardado.',
  live: 'en vivo',
  'live, stale': 'en vivo, vencido',
  'From {sender}, {age}.': 'De {sender}, {age}.',
  'From {sender}, {age}: older than it stays fresh.':
    'De {sender}, {age}: pasó el tiempo durante el que se mantiene vigente.',
  'Stored: {value}': 'Guardado: {value}',
  'The stored value is this one already.': 'El valor guardado ya es este.',
  'Keep as attribute': 'Conservar como atributo',
  Claude: 'Claude',
  'the command line': 'la línea de comandos',
  'the code of “{name}”': 'el código de “{name}”',
  'just now': 'recién',
  '{count} seconds ago': { one: 'hace {count} segundo', other: 'hace {count} segundos' },
  '{count} minutes ago': { one: 'hace {count} minuto', other: 'hace {count} minutos' },
  '{count} hours ago': { one: 'hace {count} hora', other: 'hace {count} horas' },
  '{count} days ago': { one: 'hace {count} día', other: 'hace {count} días' },
  '{count} s': '{count} s',
  '{count} min': '{count} min',
  '{count} h': '{count} h',
  '{count} d': '{count} d',
  // Time ranges (R43): the filter panel's choice and the strip's sliders and playback.
  'Time range': 'Rango de tiempo',
  'No attribute here holds dates, times or numbers to show a range of. Give one a date, time or number type in its component, on the Components tab.':
    'Ningún atributo de aquí tiene fechas, horas o números de los que mostrar un rango. Darle a uno el tipo fecha, hora o número en su componente, en la pestaña Componentes.',
  'Show only what a date, time or number attribute puts in a range, and play it.':
    'Mostrar solo lo que un atributo de fecha, hora o número pone dentro de un rango, y reproducirlo.',
  'Range on': 'Rango sobre',
  'No time range': 'Sin rango de tiempo',
  Until: 'Hasta',
  'No end: one point each': 'Sin fin: un punto cada uno',
  '{attribute} from {from} to {to}': '{attribute} desde {from} hasta {to}',
  'Range from': 'Rango desde',
  'Range to': 'Rango hasta',
  '{count} have no {attribute} and stay shown.': {
    one: '{count} no tiene {attribute} y sigue a la vista.',
    other: '{count} no tienen {attribute} y siguen a la vista.',
  },

  // Threads of comments (ADR 0059): the comments tab, a thread whole, and the pins on the canvas.
  Comments: 'Comentarios',
  '“{id}”, deleted': '“{id}”, eliminado',
  'The view “{id}”, deleted': 'La vista “{id}”, eliminada',
  'The view “{name}”': 'La vista “{name}”',
  'A point of the view “{id}”, deleted': 'Un punto de la vista “{id}”, eliminada',
  'A point of “{name}”': 'Un punto de “{name}”',
  'Select “{name}”': 'Seleccionar “{name}”',
  'Plain text: a blank line starts a paragraph, “- ” a list. Ctrl+Enter sends it.':
    'Texto simple: una línea en blanco empieza un párrafo, “- ” una lista. Ctrl+Enter lo envía.',
  'Mention the selection': 'Mencionar la selección',
  'Give your name.': 'Indicar el nombre.',
  'A name holds at most 200 characters.': 'Un nombre tiene como máximo 200 caracteres.',
  'That is not an email address.': 'Esa no es una dirección de correo electrónico.',
  'Your comments are signed with your name, kept on this computer for every project.':
    'Los comentarios se firman con el nombre, que se guarda en esta computadora para todos los proyectos.',
  'Your name': 'Nombre',
  'Email (optional)': 'Correo electrónico (opcional)',
  'Sign my comments': 'Firmar los comentarios',
  'Signed as {name}': 'Comentarios firmados como {name}',
  'Change the name': 'Cambiar el nombre',
  'Give your name above to comment.': 'Indicar el nombre arriba para comentar.',
  'Thread: {about}': 'Hilo: {about}',
  'Claude (AI)': 'Claude (IA)',
  'This change to the tour was not made: with its steps, the tour takes more than the {limit} MiB one change from the app carries. Delete some of its steps, or put them in another tour.':
    'Este cambio al recorrido no se hizo: con sus pasos, el recorrido ocupa más de los {limit} MiB que lleva un cambio desde la app. Eliminar algunos de sus pasos, o ponerlos en otro recorrido.',
  'All threads': 'Todos los hilos',
  'Select what the thread is about': 'Seleccionar aquello sobre lo que trata el hilo',
  Resolved: 'Resuelto',
  'What this thread is about was deleted. The thread is kept: undoing the deletion brings it back.':
    'Aquello sobre lo que trata este hilo se eliminó. El hilo se conserva: deshacer la eliminación lo recupera.',
  'Edit your comment': 'Editar el comentario',
  Save: 'Guardar',
  Reply: 'Responder',
  'Reply and reopen': 'Responder y reabrir',
  Resolve: 'Resolver',
  Reopen: 'Reabrir',
  'Delete thread…': 'Eliminar el hilo…',
  'Delete the thread?': '¿Eliminar el hilo?',
  'Delete this thread and its {count} comments? You can undo it.': {
    one: '¿Eliminar este hilo y su {count} comentario? Se puede deshacer.',
    other: '¿Eliminar este hilo y sus {count} comentarios? Se puede deshacer.',
  },
  'Delete thread': 'Eliminar el hilo',
  '(edited {time})': '(editado {time})',
  'New thread': 'Hilo nuevo',
  'Select one element or one relation first.': 'Seleccionar primero un elemento o una relación.',
  'Comment on the selection': 'Comentar la selección',
  'Comment on this view': 'Comentar esta vista',
  'Comment on a point…': 'Comentar un punto…',
  'Click on the canvas where the comment goes, or press Enter for its middle. Escape gives up.':
    'Hacer clic en el lienzo donde va el comentario, o pulsar Enter para ubicarlo en el centro. Escape cancela.',
  'New thread: {about}': 'Hilo nuevo: {about}',
  'Your comment': 'Comentario',
  Comment: 'Comentar',
  'Which threads show': 'Qué hilos se muestran',
  Where: 'Dónde',
  'This view': 'Esta vista',
  'All views': 'Todas las vistas',
  State: 'Estado',
  'Open threads': 'Hilos abiertos',
  'Resolved threads': 'Hilos resueltos',
  'Open and resolved': 'Abiertos y resueltos',
  Author: 'Autor',
  Everyone: 'Todos',
  'Only the threads on: {about}': 'Solo los hilos sobre: {about}',
  'Show every thread': 'Mostrar todos los hilos',
  'Detached threads': 'Hilos desvinculados',
  Detached: 'Desvinculados',
  'What these threads are about was deleted. They are kept: resolve or delete them, or undo the deletion.':
    'Aquello sobre lo que tratan estos hilos se eliminó. Se conservan: resolverlos o eliminarlos, o deshacer la eliminación.',
  '{count} comments': { one: '{count} comentario', other: '{count} comentarios' },
  'last by {name}, {time}': 'el último de {name}, {time}',
  'No comments yet. Select an element or a relation and comment on it, or comment on this view.':
    'Todavía no hay comentarios. Seleccionar un elemento o una relación y comentarlo, o comentar esta vista.',
  'No comments yet.': 'Todavía no hay comentarios.',
  'No open threads here. Show resolved ones, or every view’s.':
    'No hay hilos abiertos aquí. Mostrar los resueltos, o los de todas las vistas.',
  'No threads match. Show every view’s, or everyone’s.':
    'Ningún hilo coincide. Mostrar los de todas las vistas, o los de todos.',
  '{count} resolved threads: {about}': {
    one: '{count} hilo resuelto: {about}',
    other: '{count} hilos resueltos: {about}',
  },
  '{count} threads: {about}': { one: '{count} hilo: {about}', other: '{count} hilos: {about}' },
  'Place the comment: click where it goes, or press Enter for the middle of the canvas. Escape gives up.':
    'Ubicar el comentario: hacer clic donde va, o pulsar Enter para ubicarlo en el centro del lienzo. Escape cancela.',
  // M8b W54: the parts of a drawing with parts, Anchor parts… and Replace the picture… (ADR 0067).
  Parts: 'Partes',
  parts: 'partes',
  'Its picture, “{image}”, has {count} named parts.': {
    one: 'Su imagen, “{image}”, tiene {count} parte con nombre.',
    other: 'Su imagen, “{image}”, tiene {count} partes con nombre.',
  },
  '{count} of them are drawn as contents.': {
    one: '{count} de ellas se dibuja como un contenido.',
    other: '{count} de ellas se dibujan como contenidos.',
  },
  'drawn as it': 'se dibuja como ella',
  'Nothing is drawn as it.': 'Nada se dibuja como ella.',
  '“{name}” names the part “{part}”, which “{other}” is drawn as already, so it sits below the picture.':
    '“{name}” nombra la parte “{part}”, como la que ya se dibuja “{other}”, así que se ubica debajo de la imagen.',
  'Anchor parts…': 'Anclar partes…',
  'Anchor the parts of “{name}”': 'Anclar las partes de “{name}”',
  'Match each part': 'Hacer coincidir cada parte',
  'By name, to a content named alike': 'Por nombre, con un contenido de nombre parecido',
  'By id, to the element with that id': 'Por id, con el elemento que tiene ese id',
  'By an external identifier, read in a scheme':
    'Por un identificador externo, leído en un catálogo',
  'A part’s id is read as an identifier as it is, or with its first “_” as “:”; the crosswalks of the project’s packages translate it when contents use another scheme.':
    'El id de una parte se lee como identificador tal cual, o con su primer “_” como “:”; las tablas de correspondencias de los paquetes del proyecto lo traducen cuando los contenidos usan otro catálogo.',
  'Create an element for each part that matches nothing, named after the part':
    'Crear un elemento por cada parte que no coincide con nada, con el nombre de la parte',
  '{count} parts are matched to contents:': {
    one: '{count} parte coincide con un contenido:',
    other: '{count} partes coinciden con contenidos:',
  },
  '{count} parts get an element of their own:': {
    one: '{count} parte recibe un elemento propio:',
    other: '{count} partes reciben un elemento propio:',
  },
  '{count} parts match nothing.': {
    one: '{count} parte no coincide con nada.',
    other: '{count} partes no coinciden con nada.',
  },
  '{count} parts are drawn as contents already, and keep them.': {
    one: '{count} parte ya se dibuja como un contenido, y lo conserva.',
    other: '{count} partes ya se dibujan como contenidos, y los conservan.',
  },
  'Anchor {count} parts': { one: 'Anclar {count} parte', other: 'Anclar {count} partes' },
  '…and {count} more.': { one: '…y {count} más.', other: '…y {count} más.' },
  '“{part}” → “{name}”': '“{part}” → “{name}”',
  '“{part}” → a new “{name}”': '“{part}” → un nuevo “{name}”',
  'Nothing would be anchored.': 'No se anclaría nada.',
  'Replace the picture…': 'Reemplazar la imagen…',
  'Replace the picture of “{name}”': 'Reemplazar la imagen de “{name}”',
  'Replace the picture of “{name}”?': '¿Reemplazar la imagen de “{name}”?',
  'The new picture lacks {count} parts that elements are drawn as. Until a picture has them again, their elements are drawn as ordinary shapes; undoing brings them back:':
    {
      one: 'A la nueva imagen le falta {count} parte como la que se dibuja un elemento. Hasta que una imagen vuelva a tenerla, su elemento se dibuja como una forma común; deshacer la recupera:',
      other:
        'A la nueva imagen le faltan {count} partes como las que se dibujan elementos. Hasta que una imagen vuelva a tenerlas, sus elementos se dibujan como formas comunes; deshacer las recupera:',
    },
  '“{part}”, drawn as {elements}': '“{part}”, como la que se dibuja {elements}',
  Replace: 'Reemplazar',
  // W43, from the review of L1: the name a picture takes when its file gives none, written in the
  // language read in as every name the app gives (ADR 0038).
  Picture: 'Imagen',
  // M8b W55: the editors. The component editor's Shape section, with free geometry and the part
  // shapes are drawn as; the image placement With its parts; the Route of a relation type and of a
  // relation, a view's Lines, and the Style control's Automatic (ADR 0066, 0067, 0069, 0039).
  'Free geometry': 'Geometría libre',
  'Drawn as a part': 'Dibujada como una parte',
  'While it draws rows, its shapes ignore free geometry.':
    'Mientras dibuja filas, sus formas no usan la geometría libre.',
  'Drawn as a named part, its shapes are the part itself: in a drawing with parts, in the part’s place; elsewhere, with the part’s outline and picture.':
    'Dibujadas como una parte con nombre, sus formas son la parte misma: en un dibujo con partes, en el lugar de la parte; en otro lugar, con el contorno y la imagen de la parte.',
  'Its free geometry or the part it is drawn as takes the place of this kind.':
    'Su geometría libre, o la parte como la que se dibuja, ocupa el lugar de este tipo.',
  'None: its shapes are drawn as their kind, whatever is inherited.':
    'Ninguna: sus formas se dibujan según su tipo, herede lo que herede.',
  'None: its shapes are drawn as their kind.': 'Ninguna: sus formas se dibujan según su tipo.',
  '{count} contours in a box of {width} by {height}': {
    one: '{count} curva cerrada en una caja de {width} por {height}',
    other: '{count} curvas cerradas en una caja de {width} por {height}',
  },
  'At {width} by {height}, its outline leaves no room for a name inside: names are written under the shape.':
    'A {width} por {height}, su contorno no deja lugar para un nombre adentro: los nombres se escriben debajo de la forma.',
  'Preview of its free geometry, {width} by {height}':
    'Vista previa de su geometría libre, {width} por {height}',
  'Path data': 'Datos de trazado',
  'SVG path data': 'Datos de trazado SVG',
  'Box width': 'Ancho de la caja',
  'Box height': 'Alto de la caja',
  'Fits the path': 'Se ajusta al trazado',
  'Use this path data': 'Usar estos datos de trazado',
  'Take the outline of an SVG file…': 'Tomar el contorno de un archivo SVG…',
  'Copy the outline of a named part…': 'Copiar el contorno de una parte con nombre…',
  'Copy the outline of a named part': 'Copiar el contorno de una parte con nombre',
  'Draw its kind instead': 'Dibujar su tipo en su lugar',
  'This picture has no named parts. Give its parts ids in the SVG, then replace the picture with it.':
    'Esta imagen no tiene partes con nombre. Darles un id a sus partes en el SVG y después reemplazar la imagen con él.',
  'Named part': 'Parte con nombre',
  'Choose a part…': 'Elegir una parte…',
  'A copy of its outline stays as it is when the picture changes; to draw the shapes as the part itself, choose it under Drawn as a part.':
    'Una copia de su contorno queda como está cuando la imagen cambia; para dibujar las formas como la parte misma, elegirla en Dibujada como una parte.',
  'Copy its outline': 'Copiar su contorno',
  'Keep proportions': 'Mantener proporciones',
  'Label area': 'Zona de la etiqueta',
  'Label area’s x': 'x de la zona de la etiqueta',
  'Label area’s y': 'y de la zona de la etiqueta',
  'Label area’s width': 'Ancho de la zona de la etiqueta',
  'Label area’s height': 'Alto de la zona de la etiqueta',
  'Worked out: the largest rectangle around a point well inside the outline, in the box’s units.':
    'Calculada: el rectángulo más grande alrededor de un punto bien adentro del contorno, en las unidades de la caja.',
  'Its own, in the box’s units.': 'Propia, en las unidades de la caja.',
  'Work the label area out': 'Calcular la zona de la etiqueta',
  'None: drawn as its own shape, whatever is inherited.':
    'Ninguna: se dibuja como su propia forma, herede lo que herede.',
  'None: drawn as its own shape.': 'Ninguna: se dibuja como su propia forma.',
  'The part “{part}” of the picture its container shows with its parts':
    'La parte “{part}” de la imagen que su contenedor muestra con sus partes',
  'The part “{part}” of “{picture}”': 'La parte “{part}” de “{picture}”',
  '“{picture}” has no part “{part}”, so it is drawn as an ordinary shape.':
    '“{picture}” no tiene ninguna parte “{part}”, así que se dibuja como una forma común.',
  'The one its container shows with its parts': 'La que su contenedor muestra con sus partes',
  'A part is named by its id in its picture: a letter or _ first, then letters, digits, _, . or -, 64 at most.':
    'Una parte se nombra por su id en su imagen: primero una letra o _, luego letras, dígitos, _, . o -, 64 como máximo.',
  'Draw it as its own shape': 'Dibujarla como su propia forma',
  'Use the component’s part': 'Usar la parte del componente',
  '{name}, with its parts': '{name}, con sus partes',
  'With its parts, which its contents are drawn as':
    'Con sus partes, como las que se dibujan sus contenidos',
  'Automatic routes': 'Rutas automáticas',
  'Automatic route': 'Ruta automática',
  'How its relations’ lines run wherever they are routed automatically. Routes chosen by hand in a view keep their own style.':
    'Cómo van las líneas de sus relaciones dondequiera que se tracen automáticamente. Las rutas elegidas a mano en una vista mantienen su propio estilo.',
  'Inherited: as each view draws its lines': 'Heredado: como cada vista dibuja sus líneas',
  orthogonal: 'ortogonal',
  straight: 'recta',
  curved: 'curva',
  'Automatic: {style}': 'Automático: {style}',
  'This relation has an automatic route of its own: a change here takes it back, so that it follows.':
    'Esta relación tiene su propia ruta automática: un cambio aquí la quita, para que la siga.',
  'Routes chosen by hand in a view keep their own style.':
    'Las rutas elegidas a mano en una vista mantienen su propio estilo.',
  Lines: 'Líneas',
  'How the view draws the automatic routes of relations whose relation type or own appearance sets no style. Routes chosen by hand keep their own.':
    'Cómo dibuja la vista las rutas automáticas de las relaciones cuyo tipo de relación o apariencia propia no fija ningún estilo. Las rutas elegidas a mano mantienen el suyo.',
  // P1 W62: the start screen's words for the Machine learning sample (ADR 0079).
  'Machine learning: churn classifier': 'Aprendizaje automático: clasificador de bajas',
  'A Transformer that reads each customer’s last 90 events to tell who will cancel, beside the pipeline that feeds it, with a scenario of its forward pass.':
    'Un Transformer que lee los últimos 90 eventos de cada cliente para saber quién va a cancelar, junto a la canalización que lo alimenta, con un escenario de su paso hacia adelante.',

  // M11b: a comparison on the canvas, in the Changes tab and in its exports (ADR 0070).
  Changes: 'Cambios',
  Before: 'Antes',
  After: 'Después',
  Comparison: 'Comparación',
  Added: 'Agregado',
  Removed: 'Quitado',
  Changed: 'Cambiado',
  Moved: 'Movido',
  '{count} added': { one: '{count} agregado', other: '{count} agregados' },
  '{count} removed': { one: '{count} quitado', other: '{count} quitados' },
  '{count} changed': { one: '{count} cambiado', other: '{count} cambiados' },
  '{count} moved': { one: '{count} movido', other: '{count} movidos' },
  'This drawing marks no change.': 'Este dibujo no marca ningún cambio.',
  '{status}: {what}.': '{status}: {what}.',
  'Change {place} of {count}. {sentence}': 'Cambio {place} de {count}. {sentence}',
  'This view changed: {what}': 'Esta vista cambió: {what}',
  Drawing: 'Dibujo',
  'Drawing defaults': 'Valores de dibujo',
  'Fade what is unchanged': 'Atenuar lo que no cambió',
  'Previous change ([)': 'Cambio anterior ([)',
  'Next change (])': 'Cambio siguiente (])',
  'End the comparison (Escape)': 'Terminar la comparación (Escape)',
  'End comparison': 'Terminar la comparación',
  'Legend of the comparison': 'Leyenda de la comparación',
  'A count on a collapsed container says how many changes it hides: {count} in all.': {
    one: 'Un número sobre un contenedor contraído dice cuántos cambios oculta: {count} en total.',
    other: 'Un número sobre un contenedor contraído dice cuántos cambios oculta: {count} en total.',
  },
  'Before: the older version, which cannot show what was added.':
    'Antes: la versión anterior, que no puede mostrar lo que se agregó.',
  'After: the newer version, which cannot show what was removed.':
    'Después: la versión más reciente, que no puede mostrar lo que se quitó.',
  'Comparison: the newer version, with what was removed faint at its older place, and a dashed outline where each moved shape was.':
    'Comparación: la versión más reciente, con lo que se quitó atenuado en su lugar anterior, y un contorno de trazos donde estaba cada forma movida.',
  '{title}: {drawing}': '{title}: {drawing}',
  '{title}: “{view}”, {drawing}. {counts}.': '{title}: “{view}”, {drawing}. {counts}.',
  'Changes to {project}': 'Cambios en {project}',
  'Older version: {version}': 'Versión anterior: {version}',
  'Newer version: {version}': 'Versión más reciente: {version}',
  'Counts: {counts}': 'Cantidades: {counts}',
  'No changes.': 'No hay cambios.',
  'No changes: both sides are the same. To compare with another version, choose Compare with… in the header.':
    'No hay cambios: ambos lados son iguales. Para comparar con otra versión, elegir Comparar con… en el encabezado.',
  'The rest of the project': 'El resto del proyecto',
  'View “{view}”': 'Vista “{view}”',
  Drawings: 'Dibujos',
  'And {count} more changes, which this summary does not list.': {
    one: 'Y {count} cambio más, que este resumen no enumera.',
    other: 'Y {count} cambios más, que este resumen no enumera.',
  },
  unnamed: 'sin nombre',
  '{kind}: {count}': '{kind}: {count}',
  'Ticked.': 'Marcado.',
  'Not ticked.': 'Sin marcar.',
  'Changes by state': 'Cambios por estado',
  'Which changes to list': 'Qué cambios enumerar',
  'Only the open view': 'Solo la vista abierta',
  'No change matches the filters. Change the filters above, or clear them.':
    'Ningún cambio coincide con los filtros. Cambiar los filtros de arriba, o quitarlos.',
  'Nothing is being compared. To see what changed since a version, choose Compare with… in the header.':
    'No se está comparando nada. Para ver qué cambió desde una versión, elegir Comparar con… en el encabezado.',
  'The project': 'El proyecto',
  'The order of elements': 'El orden de los elementos',
  'Shapes’ places': 'Lugares de las formas',
  'Stacking orders': 'Órdenes de apilado',
  Routes: 'Rutas',
  'Tour steps': 'Pasos de recorridos',
  Threads: 'Hilos',
  '{element} in “{view}”': '{element} en “{view}”',
  'A free shape in “{view}”': 'Una forma libre en “{view}”',
  'What sits in {container}, in “{view}”': 'Lo que está en {container}, en “{view}”',
  'The route of {relation}, in “{view}”': 'La ruta de {relation}, en “{view}”',
  Pinned: 'Fijada',
  'Attribute “{name}”': 'Atributo “{name}”',
  'Appearance: {trait}': 'Apariencia: {trait}',
  'Step “{name}”': 'Paso “{name}”',
  'A comment': 'Un comentario',
  '{what}: {before} → {after}': '{what}: {before} → {after}',
  '{what} is not drawn in any view.': '{what} no se dibuja en ninguna vista.',
  'Showing {what}.': 'Se muestra {what}.',

  // M11b: Compare with… in the header, its dialog, and the comparison's exports (ADR 0070, ADR 0071).
  // Git's own words, HEAD, commit and tag, stay as git writes them, as the program's messages keep
  // "commit"; a tag is never "etiqueta", which is an alternative's label.
  'Compare with…': 'Comparar con…',
  'Comparing…': 'Comparando…',
  Compare: 'Comparar',
  'Compare the project now with another version of it':
    'Comparar el proyecto actual con otra versión de él',
  'Compare the project now with another version of it: the open view is drawn before, after and as the comparison, read-only, with the Changes list. Nothing is written.':
    'Comparar el proyecto actual con otra versión de él: la vista abierta se dibuja antes, después y como comparación, de solo lectura, con la lista de Cambios. No se escribe nada.',
  'Find a version': 'Buscar una versión',
  'Branch, tag, commit, subject or author': 'Rama, tag, commit, asunto o autor',
  Versions: 'Versiones',
  'No version holds “{text}”. Type other words, or clear the box to list them all.':
    'Ninguna versión contiene “{text}”. Escribir otras palabras, o vaciar el cuadro para verlas todas.',
  '{count} more versions are not listed here: type to find them.': {
    one: '{count} versión más no se lista aquí: escribir para encontrarla.',
    other: '{count} versiones más no se listan aquí: escribir para encontrarlas.',
  },
  'Reading {version} to compare it with the project now…':
    'Leyendo {version}, para comparar con el proyecto actual…',
  'Listing the versions…': 'Listando las versiones…',
  'The versions could not be listed: {why}': 'No se pudieron listar las versiones: {why}',
  'Could not compare with {version}: {why}': 'No se pudo comparar con {version}: {why}',
  'List again': 'Listar de nuevo',
  'As Visual Anything opened it, or last read it from disk; it needs no git.':
    'Como Visual Anything lo abrió, o lo leyó del disco por última vez; no necesita git.',
  '{author}, {time}': '{author}, {time}',
  'As opened': 'Tal como se abrió',
  HEAD: 'HEAD',
  Branch: 'Rama',
  'Remote branch': 'Rama remota',
  Tag: 'Tag',
  Commit: 'Commit',
  'The project as opened': 'El proyecto tal como se abrió',
  'the project as opened': 'el proyecto tal como se abrió',
  'The project now': 'El proyecto actual',
  'commit {short}': 'el commit {short}',
  'HEAD ({short})': 'HEAD ({short})',
  '{name} ({short})': '{name} ({short})',
  'Compared with {version}': 'Comparado con {version}',
  '{drawing}, as SVG': '{drawing}, como SVG',
  '{drawing}, as PDF': '{drawing}, como PDF',
  'The older version’s view, with what was removed, changed and moved marked':
    'La vista de la versión anterior, con lo que se quitó, cambió y movió marcado',
  'The view now, with what was added, changed and moved marked':
    'La vista actual, con lo que se agregó, cambió y movió marcado',
  'The view now, with every change marked and what was removed drawn faintly':
    'La vista actual, con cada cambio marcado y lo que se quitó dibujado atenuado',
  'Summary of the changes, in Markdown': 'Resumen de los cambios, en Markdown',
  'Both versions, the counts and every change with what differs, for a pull request':
    'Las dos versiones, las cantidades y cada cambio con lo que difiere, para un pull request',
  'The drawings, which are saved one by one; the summary does not link them.':
    'Los dibujos, que se guardan uno por uno; el resumen no los incluye.',
  // How a view's layout reads: curves drawn with rounded corners, and pinned shapes in the way of
  // Layout (ADR 0080).
  'How it reads': 'Cómo se lee',
  'Drawn with rounded corners: {count} lines are too many to follow as curves':
    'Dibujadas con esquinas redondeadas: {count} líneas son demasiadas para seguirlas como curvas',
  'Drawn with rounded corners: {count} curves would cross other shapes': {
    one: 'Dibujada con esquinas redondeadas: 1 curva cruzaría otras formas',
    other: 'Dibujadas con esquinas redondeadas: {count} curvas cruzarían otras formas',
  },
  '{count} pinned shapes are in the way of Layout, outlined on the canvas:': {
    one: '1 forma fijada estorba al diseño automático, marcada en el lienzo:',
    other: '{count} formas fijadas estorban al diseño automático, marcadas en el lienzo:',
  },
  '"{name}" keeps Layout from placing what it holds':
    '"{name}" impide que el diseño automático ubique lo que contiene',
  '"{name}" stays over "{other}"': '"{name}" queda encima de "{other}"',
  '…and {count} more': { one: '…y {count} más', other: '…y {count} más' },
  'Unpin them': { one: 'Desfijarla', other: 'Desfijarlas' },
  'Unpinned {count} shapes: Layout can place them now.': {
    one: 'Se desfijó 1 forma: el diseño automático ya puede ubicarla.',
    other: 'Se desfijaron {count} formas: el diseño automático ya puede ubicarlas.',
  },
  // How a view reads many lines: its tables' key rows, and the selection's lines (ADR 0080, section 5).
  'Every row': 'Todas las filas',
  'Key rows only': 'Solo las filas clave',
  'Key rows are those part of a primary key and those a relation ends on; a table’s header counts the rest.':
    'Las filas clave son las que forman parte de una clave primaria y aquellas en las que termina una relación; la cabecera de cada tabla cuenta las demás.',
  'Fade the other lines when selecting': 'Atenuar las demás líneas al seleccionar',
  'In a view of more than 40 lines, selecting keeps the lines that touch the selection and draws the others faintly.':
    'En una vista de más de 40 líneas, seleccionar deja como están las líneas que tocan la selección y dibuja atenuadas las demás.',
  '{count} more': '{count} más',

  // M11b: reviewing Claude's proposal (ADR 0073): the header, the history panel's toggle of Review
  // Claude's changes, and the decision above the proposal's changes in the Changes tab. A tick is
  // «marca», ticking «marcar».
  'Claude proposes {count} changes': {
    one: 'Claude propone {count} cambio',
    other: 'Claude propone {count} cambios',
  },
  'Review Claude’s proposal': 'Revisar la propuesta de Claude',
  'Reviewing Claude’s proposal': 'Revisando la propuesta de Claude',
  '{proposes}: review them before they apply.': '{proposes}: revisarlos antes de que se apliquen.',
  'Review Claude’s changes': 'Revisar los cambios de Claude',
  'Claude’s changes wait for you to accept them, change by change.':
    'Los cambios de Claude esperan a que se acepten, cambio por cambio.',
  'Claude’s changes apply at once, and you can undo them.':
    'Los cambios de Claude se aplican enseguida y se pueden deshacer.',
  Review: 'Revisar',
  'Claude’s proposal': 'Propuesta de Claude',
  'Changed by you too': 'También cambiado por usted',
  'Decide about Claude’s proposal': 'Decidir sobre la propuesta de Claude',
  'What Claude did: {labels}': 'Lo que hizo Claude: {labels}',
  Accept: 'Aceptar',
  'Accept the ticked changes ({ticked} of {total})':
    'Aceptar los cambios marcados ({ticked} de {total})',
  Refuse: 'Rechazar',
  'You changed this too: it starts unticked, so that your edit stays unless you take Claude’s.':
    'Esto también se cambió aquí: empieza sin marcar, para que la edición propia se mantenga salvo que se tome la de Claude.',
  'It needs: {changes}.': 'Necesita: {changes}.',
  'Needed by: {changes}.': 'Lo necesitan: {changes}.',
  '{what} ({status})': '{what} ({status})',
  'Also ticked, since it needs them: {changes}.':
    'También se marcó, porque los necesita: {changes}.',
  'Also unticked, since they need it: {changes}.':
    'También se desmarcó, porque lo necesitan: {changes}.',

  // M11b: the conflicts a merge left, in the Changes tab (ADR 0072). A merge is «unión», as in the
  // warning; ours and theirs are the two sides git merged.
  'Conflicts from a merge': 'Conflictos de una unión',
  '{count} conflicts': { one: '{count} conflicto', other: '{count} conflictos' },
  'The project file': 'El archivo del proyecto',
  'Package “{name}”': 'Paquete “{name}”',
  'View “{name}”': 'Vista “{name}”',
  'Thread “{name}”': 'Hilo “{name}”',
  'The place of “{name}”': 'El lugar de “{name}”',
  'The free shape “{id}”': 'La forma libre “{id}”',
  'The stacking order inside “{name}”': 'El orden de apilado dentro de “{name}”',
  'The route of “{name}”': 'La ruta de “{name}”',
  'The step “{id}”': 'El paso “{id}”',
  'The tour step “{id}”': 'El paso del recorrido “{id}”',
  'The comment “{id}”': 'El comentario “{id}”',
  'Both sides changed it, differently.': 'Los dos lados lo cambiaron, de forma distinta.',
  'One side removed it, and the other changed it.': 'Un lado lo quitó y el otro lo cambió.',
  'Both sides added it, differently.': 'Los dos lados lo agregaron, de forma distinta.',
  'One side removed it, but what the other side added or changed needs it.':
    'Un lado lo quitó, pero lo necesita lo que el otro lado agregó o cambió.',
  'With what the other side added, it would close a containment cycle.':
    'Con lo que agregó el otro lado, cerraría un ciclo de contención.',
  'Both sides put this list in a different order.':
    'Los dos lados pusieron esta lista en un orden distinto.',
  'our side': 'nuestro lado',
  'their side': 'el otro lado',
  'Kept, from {side}': 'Lo que se conserva, de {side}',
  'The other choice, from {side}': 'La otra opción, de {side}',
  'Nothing: it is removed.': 'Nada: está quitado.',
  'Taking it removes this.': 'Tomarla quita esto.',
  'Keep all': 'Conservar todo',
  'Take the other for all': 'Tomar la otra en todo',
  'Take the other': 'Tomar la otra',
  'The other choice cannot be taken now: {why}': 'La otra opción no se puede tomar ahora: {why}',
  '{what}: what is kept, and the other choice': '{what}: lo que se conserva y la otra opción',
  '{file} holds no conflict now: its file can be added with git add.':
    '{file} ya no tiene ningún conflicto: su archivo se puede agregar con git add.',
  // Solids on the canvas, and turning them (ADR 0075).
  'the front': 'adelante',
  'the front left': 'adelante a la izquierda',
  'the left': 'la izquierda',
  'the back left': 'atrás a la izquierda',
  'the back': 'atrás',
  'the back right': 'atrás a la derecha',
  'the right': 'la derecha',
  'the front right': 'adelante a la derecha',
  '{name}, seen from {side}, above': '{name}, visto desde {side}, desde arriba',
  '{name}, seen from {side}, below': '{name}, visto desde {side}, desde abajo',
  '{name}, seen from {side}': '{name}, visto desde {side}',
  'Drag or use the arrow keys to turn it, + and − to zoom, 0 to go back, and Escape to stop.':
    'Arrastrar o usar las flechas para girarlo, + y − para acercar o alejar, 0 para volver y Esc para terminar.',
  'Stopped turning {name}.': 'Se terminó de girar {name}.',
  'Kept this view of {name}.': 'Se guardó esta vista de {name}.',
  Turn: 'Girar',
  'Turns its solid live, by the pointer or the arrow keys. T':
    'Gira su sólido en vivo, con el puntero o las flechas. T',
  'Stop turning': 'Terminar de girar',
  'Use this view': 'Usar esta vista',
  'Keeps where its solid is seen from, in its appearance.':
    'Guarda desde dónde se ve su sólido, en su apariencia.',
  // M9: the editors of solids, Import…'s solid step, and the files no package names (ADR 0075).
  'A glTF file, .glb or .gltf, becomes a solid: Visual Anything cleans it of anything that runs or names anything outside it, and keeps it in the project’s solids/ folder.':
    'Un archivo glTF, .glb o .gltf, se vuelve un sólido: Visual Anything lo limpia de todo lo que se ejecuta o nombra algo fuera de él, y lo guarda en la carpeta solids/ del proyecto.',
  'The file’s unit': 'La unidad del archivo',
  Meters: 'Metros',
  Centimeters: 'Centímetros',
  Millimeters: 'Milímetros',
  Inches: 'Pulgadas',
  'Up axis': 'Eje hacia arriba',
  'Y, as glTF has it': 'Y, como lo tiene glTF',
  'Z, as robotics and CAD tools often have it':
    'Z, como suelen tenerlo las herramientas de robótica y CAD',
  'Simplify it to fit': 'Simplificarlo para que entre',
  'Simplifying keeps each node’s own geometry, with fewer triangles.':
    'Simplificar conserva la geometría propia de cada nodo glTF, con menos triángulos.',
  'What cleaning dropped or changed': 'Lo que la limpieza quitó o cambió',
  'Nothing: the file held only what a solid keeps.':
    'Nada: el archivo tenía solo lo que guarda un sólido.',
  'A license is written by its SPDX identifier, such as CC0-1.0 or CC-BY-4.0.':
    'Una licencia se escribe con su identificador SPDX, como CC0-1.0 o CC-BY-4.0.',
  'Imported “{name}” as a solid': 'Se importó “{name}” como sólido',
  'The solid is stored in one of the project’s own packages, and its file in the project’s solids/ folder. A component’s Solid section shows it. One undo takes it back.':
    'El sólido se guarda en uno de los paquetes propios del proyecto, y su archivo en la carpeta solids/ del proyecto. La sección Sólido de un componente lo muestra. Deshacer una vez lo quita.',
  'Import “{name}” as a solid': 'Importar “{name}” como sólido',
  'The solid “{name}”, which has no description yet':
    'El sólido “{name}”, que todavía no tiene descripción',
  'Its description is its text alternative, which the outline, the inspector and screen readers give with its shapes: say what it shows, such as “a six-axis arm on a round base”.':
    'Su descripción es su texto alternativo, que el esquema, el inspector y los lectores de pantalla dan con sus formas: decir lo que muestra, como “un brazo de seis ejes sobre una base redonda”.',
  Source: 'Origen',
  'The file says: {copyright}': 'El archivo dice: {copyright}',
  'Cleaning the file…': 'Limpiando el archivo…',
  'Its named parts': 'Sus partes con nombre',
  '{count} named parts': { one: '{count} parte con nombre', other: '{count} partes con nombre' },
  '{count} animations': { one: '{count} animación', other: '{count} animaciones' },
  '{count} textures': { one: '{count} textura', other: '{count} texturas' },
  '{x} × {y} × {z} {unit}': '{x} × {y} × {z} {unit}',
  '({x} × {y} × {z} m)': '({x} × {y} × {z} m)',
  '{count} triangles': '{count} triángulos',
  '{count} vertices': '{count} puntos de geometría',
  'The project has no solid yet: import a .glb or .gltf file with Import… in the header.':
    'El proyecto todavía no tiene sólidos: importar un archivo .glb o .gltf con Importar… en el encabezado.',
  '“{id}”, which no package defines': '“{id}”, que ningún paquete define',
  'Its image is not drawn: a shape that shows a solid draws the solid instead.':
    'Su imagen no se dibuja: una forma que muestra un sólido dibuja el sólido en su lugar.',
  'The solid “{name}” has no description, which is its text alternative: add one in the Components tab.':
    'El sólido “{name}” no tiene descripción, que es su texto alternativo: agregar una en la pestaña Componentes.',
  'Its text alternative: {description}': 'Su texto alternativo: {description}',
  'Drawing, above its name': 'Dibujo, encima de su nombre',
  Lighting: 'Iluminación',
  'Studio, lit as in a room': 'Estudio, iluminado como en una sala',
  'Flat, its colors without light': 'Plana, sus colores sin luz',
  'Camera, the solid’s own': 'Cámara, la del sólido',
  'Camera, its own': 'Cámara, la suya propia',
  'Azimuth, in degrees': 'Acimut, en grados',
  'An azimuth is from −180 to 180 degrees.': 'Un acimut va de −180 a 180 grados.',
  'Elevation, in degrees': 'Elevación, en grados',
  'An elevation is from −89 to 89 degrees.': 'Una elevación va de −89 a 89 grados.',
  'A zoom is from 0.25 to 16.': 'Un acercamiento va de 0,25 a 16.',
  Projection: 'Proyección',
  Orthographic: 'Ortográfica',
  'Use the solid’s own camera': 'Usar la cámara del sólido',
  'Show no solid': 'No mostrar ningún sólido',
  solid: 'sólido',
  'No preview here: the solid is drawn where Visual Anything draws solids.':
    'Aquí no hay vista previa: el sólido se dibuja donde Visual Anything dibuja sólidos.',
  'Drag or use the arrow keys to turn it, + and − to zoom, and 0 to go back.':
    'Arrastrar o usar las flechas para girarlo, + y − para acercar o alejar, y 0 para volver.',
  'Its solid, “{solid}”, has {count} named parts.': {
    one: 'Su sólido, “{solid}”, tiene {count} parte con nombre.',
    other: 'Su sólido, “{solid}”, tiene {count} partes con nombre.',
  },
  'drawn with its parts': 'dibujado con sus partes',
  'as an icon': 'como ícono',
  'as its drawing': 'como su dibujo',
  '“{name}”, {placement}.': '“{name}”, {placement}.',
  'The solid has no description, so its shapes have no text alternative: add one in the Components tab.':
    'El sólido no tiene descripción, así que sus formas no tienen texto alternativo: agregar una en la pestaña Componentes.',
  '{name}, with a solid: {description}': '{name}, con un sólido: {description}',
  'It shows the solid “{id}”, which no package defines, so its image is drawn if it has one.':
    'Muestra el sólido “{id}”, que ningún paquete define, así que se dibuja su imagen si tiene una.',
  'Its solid turns on the canvas now.': 'Su sólido gira ahora en el lienzo.',
  'It is seen from this view already.': 'Ya se ve desde esta vista.',
  'It cannot be removed while {count} things show it: {names}.': {
    one: 'No se puede quitar mientras {count} cosa lo muestra: {names}.',
    other: 'No se puede quitar mientras {count} cosas lo muestran: {names}.',
  },
  'The project’s solids/ folder holds {count} files that no package names. They stay until you remove them.':
    {
      one: 'La carpeta solids/ del proyecto tiene {count} archivo que ningún paquete nombra. Queda hasta que se quite.',
      other:
        'La carpeta solids/ del proyecto tiene {count} archivos que ningún paquete nombra. Quedan hasta que se quiten.',
    },
  'The new file lacks {count} parts that elements are drawn as. Until a solid has them again, their elements are drawn as ordinary shapes; undoing brings them back:':
    {
      one: 'Al archivo nuevo le falta {count} parte como la que se dibuja un elemento. Hasta que un sólido la tenga de nuevo, su elemento se dibuja como una forma común; deshacer la recupera:',
      other:
        'Al archivo nuevo le faltan {count} partes como las que se dibujan elementos. Hasta que un sólido las tenga de nuevo, sus elementos se dibujan como formas comunes; deshacer las recupera:',
    },
  'No description, so its shapes have no text alternative.':
    'Sin descripción, así que sus formas no tienen texto alternativo.',
  'Source: {source}': 'Origen: {source}',
  'not said': 'no se dice',
  'License: {license}': 'Licencia: {license}',
  'Change…': 'Cambiar…',
  'Replace…': 'Reemplazar…',
  'Replace the file of “{name}”': 'Reemplazar el archivo de “{name}”',
  'A solid needs a name.': 'Un sólido necesita un nombre.',
  'Description, its text alternative': 'Descripción, su texto alternativo',
  'Licenses that ship with Visual Anything: {licenses}.':
    'Licencias de lo que viene con Visual Anything: {licenses}.',
  'Replace the solid “{name}” with “{file}”?': '¿Reemplazar el sólido “{name}” por “{file}”?',
  'Every part an element is drawn as is in the new file too.':
    'Cada parte como la que se dibuja un elemento está también en el archivo nuevo.',
  'Files no package names': 'Archivos que ningún paquete nombra',
  'Looking in the project’s solids/ folder…': 'Buscando en la carpeta solids/ del proyecto…',
  'Every file in the project’s solids/ folder is named by a package.':
    'Un paquete nombra cada archivo de la carpeta solids/ del proyecto.',
  'Remove “solids/{hash}.glb”': 'Quitar “solids/{hash}.glb”',
  'Remove all {count} files': 'Quitar los {count} archivos',
  'Remove the file “solids/{hash}.glb”?': '¿Quitar el archivo “solids/{hash}.glb”?',
  'Remove {count} files from the project’s solids/ folder?':
    '¿Quitar {count} archivos de la carpeta solids/ del proyecto?',
  'No package names it now, but a version of the project, a branch, or an action you undid may. This cannot be undone: once removed, the file is gone from the folder.':
    'Ningún paquete lo nombra ahora, pero puede hacerlo una versión del proyecto, una rama o una acción deshecha. Esto no se puede deshacer: una vez quitado, el archivo ya no está en la carpeta.',
  'Its solid': 'Su sólido',
  'Which solid': 'Qué sólido',
  // M9: solids in the exports and the read-only page (ADR 0075).
  '{count} solids could not be drawn, and are drawn as their placeholders.': {
    one: 'Un sólido no se pudo dibujar y se dibuja como su marcador.',
    other: '{count} sólidos no se pudieron dibujar y se dibujan como sus marcadores.',
  },
  'Solids are drawn as placeholders, their outline, name and a mark: only the app draws their pictures.':
    'Los sólidos se dibujan como marcadores, con su contorno, su nombre y una marca: solo la aplicación dibuja sus imágenes.',
  '{count} shapes’ solids are left out: solids are drawn only in the canvas, the PNG, the SVG, the PDF and the read-only page.':
    {
      one: 'Se omite el sólido de una forma: los sólidos solo se dibujan en el lienzo, el PNG, el SVG, el PDF y la página de solo lectura.',
      other:
        'Se omiten los sólidos de {count} formas: los sólidos solo se dibujan en el lienzo, el PNG, el SVG, el PDF y la página de solo lectura.',
    },
  ', with a solid: {description}': ', con un sólido: {description}',
  ', with the solid “{solid}”, which has no description':
    ', con el sólido “{solid}”, que no tiene descripción',
  'It has no description.': 'No tiene descripción.',
  'Source: {source}.': 'Origen: {source}.',
  'License: {license}.': 'Licencia: {license}.',
  'Turn them in the page': 'Girarlos en la página',
  'It holds their files and what draws them, so the page is larger':
    'Guarda sus archivos y lo que los dibuja, así que la página es más grande',
  'Only their pictures': 'Solo sus imágenes',
  'A smaller page: they show as drawn here, and cannot be turned':
    'Una página más chica: se ven como se dibujan aquí, y no se pueden girar',
  'Its solids take {size} of it.': 'Sus sólidos ocupan {size} de ella.',
  '{count} solids could not be had, and the page draws them as their placeholders.': {
    one: 'No se pudo obtener un sólido, y la página lo dibuja como su marcador.',
    other: 'No se pudieron obtener {count} sólidos, y la página los dibuja como sus marcadores.',
  },
  // M12: the inspector's Simulation section, its stops and its marks (ADR 0085). A simulation run
  // is a "corrida", a tick a "tic", a parameter a "parámetro", a seed a "semilla", a simulated value
  // a "valor simulado" and a simulation limit a "límite".
  Simulation: 'Simulación',
  'Open it to choose its parameters and play it tick by tick. Nothing it works out is saved.':
    'Ábrala para elegir sus parámetros y reproducirla tic a tic. Nada de lo que calcula se guarda.',
  'Open the simulation': 'Abrir la simulación',
  'Close the simulation': 'Cerrar la simulación',
  Parameters: 'Parámetros',
  '{name}, as a slider': '{name}, con un control deslizante',
  Seed: 'Semilla',
  'New seed': 'Nueva semilla',
  'The same seed and parameters always play the same ticks.':
    'La misma semilla y los mismos parámetros siempre dan los mismos tics.',
  'A seed is a whole number from 0 to {max}.': 'Una semilla es un número entero de 0 a {max}.',
  'Back a tick': 'Un tic atrás',
  'Forward a tick': 'Un tic adelante',
  'Run from here': 'Correr desde aquí',
  Reset: 'Reiniciar',
  'As fast as it goes': 'Lo más rápido posible',
  '{count} ticks a second': { one: '{count} tic por segundo', other: '{count} tics por segundo' },
  'Tick {tick} of {last}': 'Tic {tick} de {last}',
  'Tick {tick} of {last}, at {time}': 'Tic {tick} de {last}, a los {time}',
  'tick {tick}': 'tic {tick}',
  'tick {tick}, at {time}': 'tic {tick}, a los {time}',
  'Working out the ticks up to tick {tick}…': 'Calculando los tics hasta el tic {tick}…',
  'Simulated values': 'Valores simulados',
  'none at this tick': 'ninguno en este tic',
  true: 'verdadero',
  false: 'falso',
  'Simulated by the code of “{name}”, and never saved.':
    'Simulado por el código de “{name}”, y nunca se guarda.',
  'Shown on the canvas in place of the attribute “{name}”.':
    'Se muestra en el lienzo en lugar del atributo “{name}”.',
  'Limits: from {min} to {max}': 'Límites: de {min} a {max}',
  'Limit: at least {min}': 'Límite: al menos {min}',
  'Limit: at most {max}': 'Límite: como máximo {max}',
  'One of: {choices}': 'Uno de: {choices}',
  'Chart of “{name}”: the tick shown': 'Gráfico de “{name}”: el tic que se muestra',
  'From {low} to {high} over the ticks held': 'De {low} a {high} en los tics que guarda',
  'It ended by itself at tick {tick}.': 'Terminó por sí misma en el tic {tick}.',
  'It ended by itself at tick {tick}: {message}':
    'Terminó por sí misma en el tic {tick}: {message}',
  'It played its {count} ticks.': {
    one: 'Reprodujo su único tic.',
    other: 'Reprodujo sus {count} tics.',
  },
  'At tick {tick}, “{value}” went below its lowest limit, {limitValue}: it was {got}. The ticks before it are kept.':
    'En el tic {tick}, “{value}” bajó de su límite inferior, {limitValue}: valía {got}. Se conservan los tics anteriores.',
  'At tick {tick}, “{value}” went above its highest limit, {limitValue}: it was {got}. The ticks before it are kept.':
    'En el tic {tick}, “{value}” pasó su límite superior, {limitValue}: valía {got}. Se conservan los tics anteriores.',
  'At tick {tick}, “{value}” was “{got}”, which is not one of its choices. The ticks before it are kept.':
    'En el tic {tick}, “{value}” valía “{got}”, que no es una de sus opciones. Se conservan los tics anteriores.',
  'At tick {tick}, “{value}” was not a finite number. The ticks before it are kept.':
    'En el tic {tick}, “{value}” no era un número finito. Se conservan los tics anteriores.',
  'At tick {tick}, the code failed: {message}': 'En el tic {tick}, el código falló: {message}',
  'At tick {tick}, the code was stopped: it ran past its time.':
    'En el tic {tick}, se detuvo el código: superó su tiempo.',
  'At tick {tick}, the code was stopped: it took more memory than it may.':
    'En el tic {tick}, se detuvo el código: usó más memoria de la que puede.',
  'At tick {tick}, the code’s answer was refused: {reason}':
    'En el tic {tick}, se rechazó la respuesta del código: {reason}',
  'What it keeps for going back is full, so it stopped before tick {tick}. Run from here plays on from an earlier tick.':
    'Lo que guarda para volver atrás está lleno, así que se detuvo antes del tic {tick}. Correr desde aquí sigue desde un tic anterior.',
  'The model changed, so it stopped before tick {tick}. Reset plays it again from the model as it is now.':
    'El modelo cambió, así que se detuvo antes del tic {tick}. Reiniciar la vuelve a reproducir desde el modelo tal como está ahora.',
  'Its component simulates nothing now.': 'Su componente ya no simula nada.',
  'The package “{name}” declares this simulation, but its code exports no simulate hook.':
    'El paquete “{name}” declara esta simulación, pero su código no exporta simulate.',
  'The code of “{name}” is not approved, so it cannot simulate. Review it to approve it.':
    'El código de “{name}” no está aprobado, así que no puede simular. Revíselo para aprobarlo.',
  'The code of “{name}” is turned off after it failed too many times in a row. Review it to run it again.':
    'El código de “{name}” está apagado porque falló demasiadas veces seguidas. Revíselo para que vuelva a funcionar.',
  'This tab runs as many simulations as it may at once. Close one, then press Reset to run this one.':
    'Esta pestaña ya corre tantas simulaciones a la vez como puede. Cierre una y luego pulse Reiniciar para correr esta.',
  'The simulation of “{name}” stopped. {reason}': 'La simulación de “{name}” se detuvo. {reason}',
  // A5.4: the Drawing panel, which edits the drawing defaults of the project or of a view (ADR 0086).
  'How the canvas, the read-only page and the exports draw what no appearance sets. Each change is one action you can undo.':
    'Cómo el lienzo, la página de solo lectura y las exportaciones dibujan lo que ninguna apariencia define. Cada cambio es una acción que se puede deshacer.',
  'Change for': 'Cambiar para',
  'This project': 'Este proyecto',
  'This view only': 'Solo esta vista',
  'Open a view to change it for that view alone.':
    'Abra una vista para cambiarlo solo para esa vista.',
  'Reset every value of the project': 'Restablecer todos los valores del proyecto',
  'Reset every value of this view': 'Restablecer todos los valores de esta vista',
  '“{view}” has a preset of its own, so the project’s values do not reach it.':
    '“{view}” tiene un predefinido propio, así que los valores del proyecto no la alcanzan.',
  'The project sets nothing of its own: it draws with {preset} as built in. Change any value below.':
    'El proyecto no define nada propio: dibuja con {preset} tal como viene incorporado. Cambie cualquier valor más abajo.',
  'A value the project sets shows “From the project”; reset it to go back to the preset’s.':
    'Un valor que define el proyecto dice “Del proyecto”; restablézcalo para volver al del predefinido.',
  'This view sets nothing of its own: it draws as the project does. A value changed here applies to this view alone.':
    'Esta vista no define nada propio: dibuja como el proyecto. Un valor cambiado aquí se aplica solo a esta vista.',
  'A value this view sets shows “This view’s”; reset it to go back to the project’s.':
    'Un valor que define esta vista dice “De esta vista”; restablézcalo para volver al del proyecto.',
  'This view’s': 'De esta vista',
  'From the project': 'Del proyecto',
  'From {preset}': 'De {preset}',
  Preset: 'Predefinido',
  'As the project ({preset})': 'Como el proyecto ({preset})',
  'A view with a preset of its own starts from it, without the project’s values.':
    'Una vista con un predefinido propio parte de él, sin los valores del proyecto.',
  'Reset every value of {group}': 'Restablecer todos los valores de {group}',
  'From {least} to {most}.': 'De {least} a {most}.',
  '“{view}” sets its own.': '“{view}” define el suyo.',
  'A number from {least} to {most}.': 'Un número de {least} a {most}.',
  'Reset “{value}”': 'Restablecer “{value}”',
  // The presets, groups, values and choices of drawing defaults (shell/drawing/drawingNames.ts).
  Clean: 'Limpio',
  Dense: 'Denso',
  Expressive: 'Expresivo',
  'High contrast': 'Alto contraste',
  'Thin neutral lines, quiet containers with a name tab, collapsed containers that count what they hold, and a dot grid.':
    'Líneas finas y neutras, contenedores discretos con una pestaña con su nombre, contenedores contraídos que cuentan lo que contienen y una cuadrícula de puntos.',
  'Smaller text and tighter room, rows shown sooner, and lines colored by their type.':
    'Texto más pequeño y menos espacio, filas que se muestran antes y líneas coloreadas según su tipo.',
  'Rounder and bolder: larger corners and names, soft shadows, lines colored by type.':
    'Más redondeado y marcado: esquinas y nombres más grandes, sombras suaves y líneas coloreadas según su tipo.',
  'Thicker lines and borders, and stronger text.':
    'Líneas y bordes más gruesos, y un texto más marcado.',
  Shapes: 'Formas',
  'Aggregated relations': 'Relaciones agregadas',
  'Reading by zoom': 'Lectura según el zoom',
  'In canvas units.': 'En unidades del lienzo.',
  'A scale of the canvas: 1 is 100 %.': 'Una escala del lienzo: 1 es el 100 %.',
  Arrowheads: 'Puntas de flecha',
  'Arrowhead size': 'Tamaño de las puntas de flecha',
  'Times the preset’s size.': 'Veces el tamaño del predefinido.',
  'Rounding of line corners': 'Redondeo de las esquinas de las líneas',
  'Gap between parallel lines': 'Separación entre líneas paralelas',
  'Fade the other lines while pointing at a shape or a line':
    'Atenuar las demás líneas al señalar una forma o una línea',
  'Border width': 'Grosor del borde',
  'Rounding of corners': 'Redondeo de las esquinas',
  Shadow: 'Sombra',
  Font: 'Fuente',
  'Size of names': 'Tamaño de los nombres',
  'Weight of names': 'Grosor de la letra de los nombres',
  'Size of details': 'Tamaño de los detalles',
  'Size of rows': 'Tamaño de las filas',
  'Size of container names': 'Tamaño de los nombres de los contenedores',
  'Size of relation names': 'Tamaño de los nombres de las relaciones',
  'Size of notes': 'Tamaño de las notas',
  'Line spacing': 'Interlineado',
  'Times the text’s size.': 'Veces el tamaño del texto.',
  'Room around text in a shape': 'Espacio alrededor del texto en una forma',
  'Containers are drawn': 'Los contenedores se dibujan',
  'Room around their contents': 'Espacio alrededor de su contenido',
  'A collapsed container shows': 'Un contenedor contraído muestra',
  'How many it stands for': 'Cuántas representa',
  'Thicker the more relations it stands for': 'Más gruesa cuantas más relaciones representa',
  'Names show from': 'Los nombres se muestran desde',
  'Details show from': 'Los detalles se muestran desde',
  'Rows show from': 'Las filas se muestran desde',
  'Relation names show from': 'Los nombres de las relaciones se muestran desde',
  'Size of names far out': 'Tamaño de los nombres de lejos',
  'In screen pixels.': 'En píxeles de la pantalla.',
  'Grid drawn as': 'La cuadrícula se dibuja con',
  Filled: 'Rellena',
  'No arrowhead': 'Sin punta',
  'By relation type': 'Según el tipo de relación',
  'Neutral, the type’s when pointed at': 'Neutro, el del tipo al señalarla',
  'No shadow': 'Sin sombra',
  Soft: 'Suave',
  Roboto: 'Roboto',
  'The system’s font': 'La fuente del sistema',
  Regular: 'Normal',
  Medium: 'Media',
  Bold: 'Negrita',
  'As their kind': 'Según su tipo de forma',
  'As regions, with a name tab': 'Como regiones, con una pestaña con su nombre',
  'A stack': 'Una pila',
  'How many it holds': 'Cuántos contiene',
  'A stack, and how many it holds': 'Una pila, y cuántos contiene',
  'A number beside the line': 'Un número junto a la línea',
  'A number in a rounded box on the line': 'Un número en un recuadro redondeado sobre la línea',
  Dots: 'Puntos',
  // Stored colors adapted on the dark canvas (ADR 0087).
  Colors: 'Colores',
  'The project’s own colors on the dark canvas':
    'Los colores propios del proyecto en el lienzo oscuro',
  'Adapted keeps each color’s hue and turns its lightness, so pale fills draw dark. The light canvas and the project’s files keep the colors as picked.':
    'Adaptados conserva el tono de cada color e invierte su luminosidad, así los rellenos pálidos se dibujan oscuros. El lienzo claro y los archivos del proyecto conservan los colores tal como se eligieron.',
  'As picked': 'Tal como se eligieron',
  'Adapted to the dark canvas': 'Adaptados al lienzo oscuro',
  'Drawn {color} on the dark canvas': 'Se dibuja {color} en el lienzo oscuro',
  // A6.2: the format panel's Text tab (ADR 0088).
  'Roboto Mono': 'Roboto Mono',
  'Text size': 'Tamaño del texto',
  Weight: 'Grosor de la letra',
  Italics: 'Cursiva',
  Upright: 'Recta',
  Italic: 'Cursiva',
  Underline: 'Subrayado',
  'Not underlined': 'Sin subrayar',
  Underlined: 'Subrayado',
  Alignment: 'Alineación',
  'Aligned left': 'Alineado a la izquierda',
  Centered: 'Centrado',
  'Aligned right': 'Alineado a la derecha',
  'Where its name is written': 'Dónde se escribe su nombre',
  'Inside the shape': 'Dentro de la forma',
  'In a tag above': 'En una etiqueta arriba',
  'In a tag below': 'En una etiqueta abajo',
  'In a tag at the left': 'En una etiqueta a la izquierda',
  'In a tag at the right': 'En una etiqueta a la derecha',
  'Text color': 'Color del texto',
  'Text background': 'Relleno detrás del texto',
  'Text border': 'Borde del texto',
  'Long names': 'Nombres largos',
  'Wrapped onto more lines': 'En varias líneas',
  'On one line, cut with “…”': 'En una línea, cortados con “…”',
  'Text padding': 'Margen interno del texto',
  'reads on its fill': 'se lee sobre su relleno',
  'Roboto Mono is written upright in one weight: bold and italics apply to the other fonts.':
    'Roboto Mono se escribe recta y en un solo peso: la negrita y la cursiva se aplican a las otras fuentes.',
  'Containers, tables and rows write their names as always; a container takes only the text color.':
    'Los contenedores, las tablas y las filas escriben sus nombres como siempre; un contenedor toma solo el color del texto.',
  'Its text reads poorly on its fill on the light canvas ({ratio}); text needs 4.5:1.':
    'Su texto se lee mal sobre su relleno en el lienzo claro ({ratio}); el texto necesita 4,5:1.',
  'Its text reads poorly on its fill on the dark canvas ({ratio}); text needs 4.5:1.':
    'Su texto se lee mal sobre su relleno en el lienzo oscuro ({ratio}); el texto necesita 4,5:1.',
  'Its text reads poorly on its background on the light canvas ({ratio}); text needs 4.5:1.':
    'Su texto se lee mal sobre el relleno detrás de él en el lienzo claro ({ratio}); el texto necesita 4,5:1.',
  'Its text reads poorly on its background on the dark canvas ({ratio}); text needs 4.5:1.':
    'Su texto se lee mal sobre el relleno detrás de él en el lienzo oscuro ({ratio}); el texto necesita 4,5:1.',
  // A6.1: the format panel and its Style tab (ADR 0088).
  Arrange: 'Disposición',
  Gradient: 'Degradado',
  'Gradient color': 'Color del degradado',
  'No gradient': 'Sin degradado',
  'Top to bottom': 'De arriba hacia abajo',
  'Left to right': 'De izquierda a derecha',
  'Border dash': 'Patrón del borde',
  'Corner radius': 'Radio de las esquinas',
  'Opacity (%)': 'Opacidad (%)',
  'Soft shadow': 'Sombra suave',
  'Line dash': 'Patrón de la línea',
  'Line opacity (%)': 'Opacidad de la línea (%)',
  'Write a number from {least} to {most}.': 'Escribir un número de {least} a {most}.',
  'from the drawing defaults': 'de los valores de dibujo',
  'Set as the project’s default': 'Definir como predeterminado del proyecto',
  'Its gradient, border, corner radius, opacity, shadow and text become the project’s default once it sets one of them itself.':
    'Su degradado, borde, radio de las esquinas, opacidad, sombra y texto pasan a ser los predeterminados del proyecto una vez que define alguno de ellos.',
  'Gives every shape the gradient, border, corner radius, opacity, shadow and parts of its text this one sets itself, wherever its component sets none.':
    'Da a cada forma el degradado, el borde, el radio de las esquinas, la opacidad, la sombra y las partes de su texto que define esta, donde su componente no define ninguno.',
  'Its stroke, width, dash, opacity and route become the project’s default once it sets one of them itself.':
    'Su trazo, grosor, patrón, opacidad y recorrido pasan a ser los predeterminados del proyecto una vez que define alguno de ellos.',
  'Gives every line the stroke, width, dash, opacity and route this one sets itself, wherever its relation type sets none.':
    'Da a cada línea el trazo, el grosor, el patrón, la opacidad y el recorrido que define esta, donde su tipo de relación no define ninguno.',
  'This relation has a {what} of its own: a change here takes it back, so that it follows.':
    'Esta relación tiene {what} propio: un cambio aquí lo quita, para que lo siga.',
  'For the {count} elements selected.': {
    one: 'Para el elemento seleccionado.',
    other: 'Para los {count} elementos seleccionados.',
  },
  'Align and size': 'Alinear y ajustar el tamaño',
  'Swatches for {label}': 'Muestras para {label}',
  'Use {name}, {color}': 'Usar {name}, {color}',
  Red: 'Rojo',
  Orange: 'Naranja',
  Amber: 'Ámbar',
  Green: 'Verde',
  Teal: 'Verde azulado',
  Cyan: 'Cian',
  Blue: 'Azul',
  Purple: 'Púrpura',
  Magenta: 'Magenta',
  Pink: 'Rosa',
  Gray: 'Gris',
  Brown: 'Marrón',
  'Its border hardly shows on the light canvas: it reaches 3:1 neither on the canvas ({canvas}) nor on its fill ({fill}).':
    'Su borde apenas se ve en el lienzo claro: no llega a 3:1 ni sobre el lienzo ({canvas}) ni sobre su relleno ({fill}).',
  'Its border hardly shows on the dark canvas: it reaches 3:1 neither on the canvas ({canvas}) nor on its fill ({fill}).':
    'Su borde apenas se ve en el lienzo oscuro: no llega a 3:1 ni sobre el lienzo ({canvas}) ni sobre su relleno ({fill}).',
  'Blends into the light canvas: it draws no border, and its fill does not reach 3:1 on it.':
    'Se confunde con el lienzo claro: no dibuja borde, y su relleno no llega a 3:1 sobre él.',
  'Blends into the dark canvas: it draws no border, and its fill does not reach 3:1 on it.':
    'Se confunde con el lienzo oscuro: no dibuja borde, y su relleno no llega a 3:1 sobre él.',
  // The Arrange tab (A6.3).
  'Size and place': 'Tamaño y posición',
  'From the left': 'Desde la izquierda',
  'From the top': 'Desde arriba',
  'Turn and mirror': 'Girar y reflejar',
  'Turn (degrees)': 'Giro (grados)',
  'Turn 90°': 'Girar 90°',
  'Mirror horizontally': 'Reflejar horizontalmente',
  'Mirror vertically': 'Reflejar verticalmente',
  'Some are pinned: layout leaves those where they are.':
    'Algunas están fijadas: la organización las deja donde están.',
  'Pinned: layout leaves it where it is.': 'Fijada: la organización la deja donde está.',
  'Not pinned: layout may move it.': 'Sin fijar: la organización puede moverla.',
  'A row is never turned or mirrored.': 'Una fila nunca se gira ni se refleja.',
  'A container drawn as a region is never turned or mirrored.':
    'Un contenedor dibujado como región nunca se gira ni se refleja.',
  'A container is never turned or mirrored: what it holds is laid out in its own axes.':
    'Un contenedor nunca se gira ni se refleja: lo que contiene se organiza en sus propios ejes.',
  'A shape that draws rows is never turned or mirrored.':
    'Una forma que dibuja filas nunca se gira ni se refleja.',
  'An anchored part lies in its part’s place, and is never turned or mirrored.':
    'Una parte anclada está en el lugar de su parte, y nunca se gira ni se refleja.',
  'Nothing selected is drawn in this view.': 'Nada de lo seleccionado se dibuja en esta vista.',
  // Copy and paste appearance (A6.4).
  'Copy appearance': 'Copiar apariencia',
  'Paste appearance': 'Pegar apariencia',
  'Copy every Style and Text trait of this item':
    'Copiar cada rasgo de Estilo y de Texto de este elemento',
  'Paste the appearance of "{name}" onto the selection':
    'Pegar la apariencia de "{name}" en la selección',
  'Copied the appearance.': 'Se copió la apariencia.',
  'Copied the appearance of "{name}".': 'Se copió la apariencia de "{name}".',
  'Select one element or one relation to copy its appearance.':
    'Seleccione un elemento o una relación para copiar su apariencia.',
  'Copy the appearance of an element or a relation first.':
    'Copie primero la apariencia de un elemento o de una relación.',
  'Select the elements or relations to paste the appearance onto.':
    'Seleccione los elementos o las relaciones en los que pegar la apariencia.',
  'Ctrl+Alt+C and Ctrl+Alt+V (⌥⌘C and ⌥⌘V on macOS)':
    'Ctrl+Alt+C y Ctrl+Alt+V (⌥⌘C y ⌥⌘V en macOS)',
  'Copy the appearance of the selected element or relation, and paste it onto the selection':
    'Copiar la apariencia del elemento o la relación seleccionados, y pegarla en la selección',
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
  // How Claude's proposal closed, as every tab says it (ADR 0073).
  'Claude’s proposal was accepted in another tab.':
    'La propuesta de Claude se aceptó en otra pestaña.',
  'Accepted Claude’s changes.': 'Se aceptaron los cambios de Claude.',
  'Accepted {accepted} of Claude’s {total} changes.':
    'Se aceptaron {accepted} de los {total} cambios de Claude.',
  'Refused Claude’s proposal: nothing of it was applied.':
    'Se rechazó la propuesta de Claude: no se aplicó nada de ella.',
  'Claude’s proposal was refused in another tab.':
    'La propuesta de Claude se rechazó en otra pestaña.',
  'Claude withdrew its proposal: nothing of it was applied.':
    'Claude retiró su propuesta: no se aplicó nada de ella.',
  'Claude’s proposal closed by itself: what changed left nothing in it to review.':
    'La propuesta de Claude se cerró sola: lo que cambió no dejó nada en ella para revisar.',
  'Claude’s proposal was dropped: nothing of it was applied.':
    'La propuesta de Claude se descartó: no se aplicó nada de ella.',
  'Visual Anything sent a proposal before the project.':
    'Visual Anything envió una propuesta antes que el proyecto.',
  'This tab’s copy of the project fell out of step with Visual Anything again: {why}':
    'La copia del proyecto de esta pestaña volvió a desfasarse con Visual Anything: {why}',
  'Could not change your preferences: {why}': 'No se pudieron cambiar las preferencias: {why}',
  'Could not compare with the version Claude named: {why}':
    'No se pudo comparar con la versión que nombró Claude: {why}',
  'Visual Anything sent the comparison without the version to draw.':
    'Visual Anything envió la comparación sin la versión que se dibuja.',
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
  // M11c: recording decisions (ADR 0078).
  'Add the alternative “{label}” after {step}':
    'Agregar la alternativa “{label}” después de {step}',
  'Add the decision “{question}” after {step}':
    'Agregar la decisión “{question}” después de {step}',
  'Rejoin at {step}': 'Reunir en {step}',

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
  'the project appearance of "{name}"': 'la apariencia que el proyecto le da a "{name}"',
  'The project appearance of "{name}"': 'La apariencia que el proyecto le da a "{name}"',
  '1 element': '1 elemento',
  '{n} elements': '{n} elementos',
  '1 relation': '1 relación',
  '{n} relations': '{n} relaciones',
  '1 shape': '1 forma',
  '{n} shapes': '{n} formas',
  '1 position': '1 posición',
  '{n} positions': '{n} posiciones',
  '{positions} in "{view}" left out: rows take their place from their table.':
    '{positions} en "{view}" quedaron fuera: las filas toman su lugar de su tabla.',
  'The bend points of a relation in "{view}" left out: it puts one thing inside another.':
    'Los puntos de quiebre de una relación en "{view}" quedaron fuera: pone una cosa dentro de otra.',
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
  // Unpinning the pinned shapes in the way of Layout, from the view's inspector (ADR 0080).
  'Unpin "{name}"': 'Desfijar "{name}"',
  'Unpin {n} shapes': 'Desfijar {n} formas',
  // What a view shows, its scope (ADR 0040).
  'Set what "{view}" shows': 'Definir qué muestra "{view}"',
  'Show the whole model in "{view}"': 'Mostrar todo el modelo en "{view}"',
  'Add "{name}" to "{view}"': 'Agregar "{name}" a "{view}"',
  'Add {n} elements to "{view}"': 'Agregar {n} elementos a "{view}"',
  'Leave "{name}" out of "{view}"': 'Dejar "{name}" fuera de "{view}"',
  'Leave {n} elements out of "{view}"': 'Dejar {n} elementos fuera de "{view}"',
  // The relation types a view leaves out (ADR 0064).
  'Leave the relations of "{name}" out of "{view}"':
    'Dejar las relaciones de "{name}" fuera de "{view}"',
  'Draw the relations of "{name}" in "{view}" again':
    'Volver a dibujar las relaciones de "{name}" en "{view}"',
  'Leave the relations of {n} relation types out of "{view}"':
    'Dejar las relaciones de {n} tipos de relación fuera de "{view}"',
  'Change which relation types "{view}" leaves out':
    'Cambiar qué tipos de relación deja fuera "{view}"',
  'Draw every relation type in "{view}"': 'Dibujar todos los tipos de relación en "{view}"',
  'The relation types a view leaves out must be a list.':
    'Los tipos de relación que una vista deja fuera deben ser una lista.',
  'A view leaves out at most {n} relation types.':
    'Una vista deja fuera como máximo {n} tipos de relación.',
  'A relation type a view leaves out is an object.':
    'Un tipo de relación que una vista deja fuera es un objeto JSON.',
  'A relation type a view leaves out holds relationType and exactly, not "{key}".':
    'Un tipo de relación que una vista deja fuera tiene relationType y exactly, no "{key}".',
  'Whether it leaves out exactly that relation type is true or false.':
    'Si deja fuera exactamente ese tipo de relación es true o false.',
  'The view "{view}" nests by "{type}", whose relations draw containment rather than lines, so it cannot leave them out.':
    'La vista "{view}" anida por "{type}", cuyas relaciones dibujan contención y no líneas, así que no puede dejarlas fuera.',
  'The relation type "{name}" is given twice.': 'El tipo de relación "{name}" se indica dos veces.',
  'The view "{view}" leaves out "{type}", so it cannot nest by it: draw its relations in the view again first.':
    'La vista "{view}" deja fuera "{type}", así que no puede anidar por él: primero vuelve a dibujar sus relaciones en la vista.',
  'A scope is an object, or null to show the whole model.':
    'Un alcance es un objeto JSON, o null para mostrar todo el modelo.',
  'A scope holds include, exclude, added and leftOut, not "{key}".':
    'Un alcance tiene include, exclude, added y leftOut, no "{key}".',
  "A scope's {part} holds at most {n} rules.":
    'El {part} de un alcance tiene como máximo {n} reglas.',
  "A scope's {part} must be a list.": 'El {part} de un alcance debe ser una lista.',
  'A rule of a scope is an object with a kind.':
    'Una regla de un alcance es un objeto JSON con un kind.',
  'Whether a rule takes exactly its own kind is true or false.':
    'Si una regla toma exactamente su propio tipo es verdadero o falso.',
  'How deep a rule reaches is a whole number from 1 to {n}.':
    'La profundidad de una regla es un número entero de 1 a {n}.',
  'A rule on an attribute names the attribute.': 'Una regla sobre un atributo nombra el atributo.',
  'A rule on an attribute tests it with one of: {tests}.':
    'Una regla sobre un atributo lo prueba con uno de: {tests}.',
  'A rule on an attribute that compares it gives the value to compare with.':
    'Una regla sobre un atributo que lo compara da el valor con el que comparar.',
  'A rule of a scope takes a component, a relation type, a container’s contents or a condition on an attribute.':
    'Una regla de un alcance toma un componente, un tipo de relación, el contenido de un contenedor o una condición sobre un atributo.',
  '"{name}" is both added to the view and left out of it.':
    '"{name}" está a la vez agregado a la vista y fuera de ella.',
  'No elements were given to add to the view.':
    'No se dio ningún elemento para agregar a la vista.',
  'No elements were given to leave out of the view.':
    'No se dio ningún elemento para dejar fuera de la vista.',
  'No elements were given.': 'No se dio ningún elemento.',
  'World is the canvas itself; every view shows it.':
    'Mundo es el propio lienzo; toda vista lo muestra.',
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
  // W51: resizing, aligning and distributing shapes on the canvas (ADR 0074), as the history names it.
  'Resize "{name}"': 'Cambiar el tamaño de "{name}"',
  'Resize a note': 'Cambiar el tamaño de una nota',
  'Align {n} shapes to the left': 'Alinear {n} formas a la izquierda',
  'Align the centers of {n} shapes': 'Alinear los centros de {n} formas',
  'Align {n} shapes to the right': 'Alinear {n} formas a la derecha',
  'Align {n} shapes to the top': 'Alinear {n} formas arriba',
  'Align the middles of {n} shapes': 'Alinear al medio {n} formas',
  'Align {n} shapes to the bottom': 'Alinear {n} formas abajo',
  'Distribute {n} shapes horizontally': 'Distribuir {n} formas horizontalmente',
  'Distribute {n} shapes vertically': 'Distribuir {n} formas verticalmente',
  'Give {n} shapes the same width': 'Dar el mismo ancho a {n} formas',
  'Give {n} shapes the same height': 'Dar el mismo alto a {n} formas',
  'Create the package "{name}"': 'Crear el paquete "{name}"',
  'Rename the package "{old}" to "{new}"': 'Cambiar el nombre del paquete "{old}" a "{new}"',
  'Edit the package "{name}"': 'Editar el paquete "{name}"',
  'Add the package "{name}"': 'Agregar el paquete "{name}"',
  'Update the package "{name}"': 'Actualizar el paquete "{name}"',
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
  'Set the image of "{name}"': 'Definir la imagen de "{name}"',
  // Why the image picker cannot use a file.
  'The file is too large to be a picture the project can hold.':
    'El archivo es demasiado grande para ser una imagen del proyecto.',
  'An SVG picture holds at most 512 KiB of text.':
    'Una imagen SVG tiene como máximo 512 KiB de texto.',
  'This file is not a picture the app reads: choose an SVG, PNG, JPEG, WebP, GIF or AVIF file.':
    'Este archivo no es una imagen que la app pueda leer: elegir un archivo SVG, PNG, JPEG, WebP, GIF o AVIF.',
  'The picture is too large: it is refused before it is opened, at most 16,384 pixels a side and 64 megapixels.':
    'La imagen es demasiado grande: se rechaza antes de abrirla; como máximo 16.384 píxeles por lado y 64 megapíxeles.',
  'The browser could not open this picture.': 'El navegador no pudo abrir esta imagen.',
  'The picture is still over 192 KiB at 512 pixels a side: choose a smaller or simpler one.':
    'La imagen sigue superando los 192 KiB a 512 píxeles por lado: elegir una más chica o más simple.',
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
  'Add 1 column to "{name}"': 'Agregar 1 columna a "{name}"',
  'Add {n} columns to "{name}"': 'Agregar {n} columnas a "{name}"',
  'Add a row to "{name}"': 'Agregar una fila a "{name}"',
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

  // The labels of what the canvas does, and what it says once it is done.
  'Delete the selection': 'Eliminar la selección',
  'Collapsed "{name}".': 'Se contrajo "{name}".',
  'Expanded "{name}".': 'Se expandió "{name}".',
  'Collapsed {n} containers.': 'Se contrajeron {n} contenedores.',
  'Expanded {n} containers.': 'Se expandieron {n} contenedores.',
  'Lay out': 'Organizar',
  'Lay out "{view}"': 'Organizar "{view}"',
  'Lay out the contents of "{name}"': 'Organizar el contenido de "{name}"',
  'Lay out "{element}" in "{view}"': 'Organizar "{element}" en "{view}"',
  'Lay out {n} new shapes in "{view}"': 'Organizar {n} formas nuevas en "{view}"',
  'Lay out what expanded in "{view}"': 'Organizar lo que se expandió en "{view}"',

  // The labels of what the inspector changes.
  'Change the appearance of {of}': 'Cambiar la apariencia de {of}',
  'Change the appearance of {n} shapes': 'Cambiar la apariencia de {n} formas',
  'Change the style of {n} shapes': 'Cambiar el estilo de {n} formas',
  'Change the style of {n} lines': 'Cambiar el estilo de {n} líneas',
  // A6.2: the Text tab's changes of several shapes (ADR 0088).
  'Change the text of {n} shapes': 'Cambiar el texto de {n} formas',

  // The labels of what the component editor and the Components tab change.
  'Use the package "{name}"': 'Usar el paquete "{name}"',
  'Derive the component "{name}"': 'Derivar el componente "{name}"',
  'Derive the relation type "{name}"': 'Derivar el tipo de relación "{name}"',
  'Stop using the package "{name}"': 'Dejar de usar el paquete "{name}"',

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
  'A width must be at most 10,000,000.': 'Un ancho debe ser de 10.000.000 como máximo.',
  'A height must be at most 10,000,000.': 'Un alto debe ser de 10.000.000 como máximo.',
  'x must be from -10,000,000 to 10,000,000.': 'x debe estar entre -10.000.000 y 10.000.000.',
  'y must be from -10,000,000 to 10,000,000.': 'y debe estar entre -10.000.000 y 10.000.000.',
  'The x of a bend point must be from -10,000,000 to 10,000,000.':
    'La x de un punto de quiebre debe estar entre -10.000.000 y 10.000.000.',
  'The y of a bend point must be from -10,000,000 to 10,000,000.':
    'La y de un punto de quiebre debe estar entre -10.000.000 y 10.000.000.',
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
  'A package is listed twice.': 'Un paquete aparece dos veces.',
  'The project cannot stop using the package "{id}": {n} of its elements, relations or definitions come from it.':
    'El proyecto no puede dejar de usar el paquete "{id}": {n} de sus elementos, relaciones o definiciones vienen de él.',
  'There is no built-in package "{id}" to use.':
    'No hay ningún paquete incorporado "{id}" para usar.',
  'Step {n} activates no relation; a step needs at least one.':
    'El paso {n} no activa ninguna relación; un paso necesita al menos una.',
  'Step {n} lists the same relation twice.': 'El paso {n} incluye la misma relación dos veces.',
  // M11c seam 2: decisions in scenarios (ADR 0078).
  'A scenario holds at most 64 decisions.': 'Un escenario tiene como máximo 64 decisiones.',
  'The id "{id}" is used twice in the scenario.': 'El id "{id}" se usa dos veces en el escenario.',
  'The decision "{question}" has 2 to 8 alternatives.':
    'La decisión "{question}" tiene de 2 a 8 alternativas.',
  'The alternative "{label}" lists "{id}", which is not a step of the scenario.':
    'La alternativa "{label}" incluye "{id}", que no es un paso del escenario.',
  'The steps of the alternative "{label}" do not follow one another.':
    'Los pasos de la alternativa "{label}" no van uno detrás de otro.',
  'The alternatives of the decision "{question}" do not follow one another.':
    'Las alternativas de la decisión "{question}" no van una detrás de otra.',
  'The decision "{question}" needs an alternative with steps.':
    'La decisión "{question}" necesita una alternativa con pasos.',
  'The decision "{question}" names a default that is none of its alternatives.':
    'La decisión "{question}" nombra como predeterminada una alternativa que no es suya.',
  'The decisions "{a}" and "{b}" cross: one must sit inside an alternative of the other, or stand apart.':
    'Las decisiones "{a}" y "{b}" se cruzan: una tiene que estar dentro de una alternativa de la otra, o aparte.',
  'Decisions sit at most three deep.': 'Las decisiones se anidan como máximo en tres niveles.',
  'Every alternative of the decision "{question}" ends the scenario, so the steps after it can never play.':
    'Todas las alternativas de la decisión "{question}" terminan el escenario, así que los pasos que siguen nunca se reproducen.',
  'A decision has an id, the kind "decision", a question, its alternatives and maybe a default; an alternative has an id, a label, its steps and maybe ends.':
    'Una decisión tiene un id, el tipo "decision", una pregunta, sus alternativas y quizás una predeterminada; una alternativa tiene un id, una etiqueta, sus pasos y quizás ends.',
  'The decisions of the scenario "{name}" do not hold together: {why} It plays every step in order.':
    'Las decisiones del escenario "{name}" no encajan: {why} Se reproducen todos sus pasos en orden.',
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

  // Packages shared between projects (ADR 0051).
  'The package "{name}" cannot be added: this project already has a package with the id "{id}".':
    'El paquete "{name}" no se puede agregar: este proyecto ya tiene un paquete con el id "{id}".',
  'The package "{name}" cannot be added: this project already uses these ids of it: {ids}.':
    'El paquete "{name}" no se puede agregar: este proyecto ya usa estos ids suyos: {ids}.',
  'The package "{name}" cannot be updated: this project already uses these ids of it: {ids}.':
    'El paquete "{name}" no se puede actualizar: este proyecto ya usa estos ids suyos: {ids}.',
  'The package "{name}" cannot be added: these ids of it do not start with "{id}.", the id of the package: {ids}.':
    'El paquete "{name}" no se puede agregar: estos ids suyos no empiezan con "{id}.", el id del paquete: {ids}.',
  'The package "{name}" cannot be updated: these ids of it do not start with "{id}.", the id of the package: {ids}.':
    'El paquete "{name}" no se puede actualizar: estos ids suyos no empiezan con "{id}.", el id del paquete: {ids}.',
  'The package "{name}" cannot be added: it uses these ids more than once: {ids}.':
    'El paquete "{name}" no se puede agregar: usa estos ids más de una vez: {ids}.',
  'The package "{name}" cannot be updated: it uses these ids more than once: {ids}.':
    'El paquete "{name}" no se puede actualizar: usa estos ids más de una vez: {ids}.',
  'The package "{name}" needs what no package in use, and no built-in package, defines; add the packages that define it first: {ids}.':
    'El paquete "{name}" necesita lo que no define ningún paquete en uso ni ningún paquete incorporado; agregar primero los paquetes que lo definen: {ids}.',
  'The update of "{name}" removes the component "{component}", which is still used here by {users}; change or delete what uses it first.':
    'La actualización de "{name}" quita el componente "{component}", que aquí todavía usan {users}; primero cambiar o eliminar lo que lo usa.',
  'The update of "{name}" removes the relation type "{type}", which is still used here by {users}; change or delete what uses it first.':
    'La actualización de "{name}" quita el tipo de relación "{type}", que aquí todavía usan {users}; primero cambiar o eliminar lo que lo usa.',
  'add-package needs the package, as its file holds it.':
    'add-package necesita el paquete, tal como lo guarda su archivo.',
  'replace-package needs the package, as its file holds it.':
    'replace-package necesita el paquete, tal como lo guarda su archivo.',
  'A package holds a list of components and one of relation types.':
    'Un paquete tiene una lista de componentes y otra de tipos de relación.',
  'A package’s images are a list.': 'Las imágenes de un paquete son una lista.',
  // M14.3: a shared package keeps its solids, crosswalks and code, checked as they are written.
  'A package’s solids are a list.': 'Los sólidos de un paquete son una lista.',
  'A package’s crosswalks are a list of tables, each mapping identifiers of one scheme to those of another.':
    'Las tablas de correspondencias de un paquete son una lista de tablas, cada una de las cuales hace corresponder identificadores de un esquema con los de otro.',
  'Each definition and image of a package is an object.':
    'Cada definición e imagen de un paquete es un objeto JSON.',
  'An image is of the kind "svg" or "bitmap".': 'Una imagen es del tipo "svg" o "bitmap".',
  'An image has no "{key}".': 'Una imagen no tiene "{key}".',
  'A package has no "{key}".': 'Un paquete no tiene "{key}".',
  'A package’s version is a semantic version, such as 1.2.0.':
    'La versión de un paquete es una versión semántica, como 1.2.0.',
  'A package’s license is an SPDX license identifier, such as CC0-1.0 or MIT.':
    'La licencia de un paquete es un identificador de licencia SPDX, como CC0-1.0 o MIT.',
  'A package’s attribution is text of 1 to 2,000 characters.':
    'La atribución de un paquete es un texto de 1 a 2000 caracteres.',
  'An image’s license is an SPDX license identifier, such as CC0-1.0 or MIT.':
    'La licencia de una imagen es un identificador de licencia SPDX, como CC0-1.0 o MIT.',
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
  'The component "{id}" is defined by package "{earlier}" and again by "{package}".':
    'El componente "{id}" lo define el paquete "{earlier}" y otra vez "{package}".',
  'The relation type "{id}" is defined by package "{earlier}" and again by "{package}".':
    'El tipo de relación "{id}" lo define el paquete "{earlier}" y otra vez "{package}".',
  'The component "{id}" of package "{package}" should start with "{prefix}.".':
    'El componente "{id}" del paquete "{package}" debería empezar con "{prefix}.".',
  'The relation type "{id}" of package "{package}" should start with "{prefix}.".':
    'El tipo de relación "{id}" del paquete "{package}" debería empezar con "{prefix}.".',
  // Kinematics (ADR 0090).
  '{members} are attached to each other in a cycle, so their joints move none of them.':
    '{members} están unidos entre sí en un ciclo, así que sus articulaciones no mueven a ninguno.',
  'The position of "{name}", {value}, is outside its limits, from {lower} to {upper}; it is drawn at the nearest one.':
    'La posición de "{name}", {value}, está fuera de sus límites, de {lower} a {upper}; se dibuja en el más cercano.',
  'The components {members} derive from each other in a cycle.':
    'Los componentes {members} derivan unos de otros en un ciclo.',
  'The relation types {members} derive from each other in a cycle.':
    'Los tipos de relación {members} derivan unos de otros en un ciclo.',

  // Appearances and attributes.
  'The fill of {of} must be a color written as #RRGGBB, not {value}.':
    'El relleno de {of} debe ser un color escrito como #RRGGBB, no {value}.',
  'The stroke of {of} must be a color written as #RRGGBB, not {value}.':
    'El trazo de {of} debe ser un color escrito como #RRGGBB, no {value}.',
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
  'The detail of {of} takes 1 to 6 lines.': 'El detalle de {of} ocupa de 1 a 6 líneas.',
  'The text of {of} is placed at the "top", in the "middle" or at the "bottom".':
    'El texto de {of} se ubica arriba ("top"), en el medio ("middle") o abajo ("bottom").',
  // The format panel's traits (ADR 0088).
  'The border width of {of} is a number from {min} to {max}.':
    'El grosor del borde de {of} es un número de {min} a {max}.',
  'The corner radius of {of} is a number from {min} to {max}.':
    'El radio de las esquinas de {of} es un número de {min} a {max}.',
  'The opacity of {of} is a number from {min} to {max}.':
    'La opacidad de {of} es un número de {min} a {max}.',
  'The text size of {of} is a number from {min} to {max}.':
    'El tamaño del texto de {of} es un número de {min} a {max}.',
  'The text padding of {of} is a number from {min} to {max}.':
    'El margen interno del texto de {of} es un número de {min} a {max}.',
  'The border of {of} is "solid", "dashed" or "dotted".':
    'El borde de {of} es "solid", "dashed" o "dotted".',
  'The shadow of {of} is "none" or "soft".': 'La sombra de {of} es "none" o "soft".',
  'The gradient of {of} must be "none" or a color and a direction.':
    'El degradado de {of} debe ser "none" o un color y una dirección.',
  'The gradient of {of} has no "{key}".': 'El degradado de {of} no tiene "{key}".',
  'The gradient of {of} runs "down" or to the "right".':
    'El degradado de {of} va hacia abajo ("down") o hacia la derecha ("right").',
  'The gradient of {of} must be a color written as #RRGGBB, not {value}.':
    'El degradado de {of} debe ser un color escrito como #RRGGBB, no {value}.',
  'The text color of {of} must be a color written as #RRGGBB, not {value}.':
    'El color del texto de {of} debe ser un color escrito como #RRGGBB, no {value}.',
  'The text background of {of} must be a color written as #RRGGBB, not {value}.':
    'El relleno detrás del texto de {of} debe ser un color escrito como #RRGGBB, no {value}.',
  'The text border of {of} must be a color written as #RRGGBB, not {value}.':
    'El borde del texto de {of} debe ser un color escrito como #RRGGBB, no {value}.',
  'The text of {of} must be an object.': 'El texto de {of} debe ser un objeto JSON.',
  'The changes to the text of {of} must be an object.':
    'Los cambios al texto de {of} deben ser un objeto JSON.',
  'The text of {of} has no "{key}".': 'El texto de {of} no tiene "{key}".',
  'The text of {of} is written in "roboto", "system" or "mono".':
    'El texto de {of} se escribe en "roboto", "system" o "mono".',
  'Whether {of} writes its name in bold is true or false.':
    'Si {of} escribe su nombre en negrita es verdadero o falso.',
  'Whether {of} writes its name in italics is true or false.':
    'Si {of} escribe su nombre en cursiva es verdadero o falso.',
  'Whether {of} underlines its name is true or false.':
    'Si {of} subraya su nombre es verdadero o falso.',
  'Whether {of} wraps its name is true or false.':
    'Si {of} parte su nombre en varias líneas es verdadero o falso.',
  'The text of {of} is aligned "left", "center" or "right".':
    'El texto de {of} se alinea a la izquierda ("left"), al centro ("center") o a la derecha ("right").',
  'The text of {of} is written "inside", "above", "below", to the "left" or to the "right".':
    'El texto de {of} se escribe dentro ("inside"), arriba ("above"), abajo ("below"), a la izquierda ("left") o a la derecha ("right").',
  'A rotation is a number of degrees from -3,600 to 3,600.':
    'Una rotación es un número de grados de -3.600 a 3.600.',
  'A shape is flipped "horizontal", "vertical", "both" or "none".':
    'Una forma se voltea en "horizontal", "vertical", "both" o "none".',
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
  '{Of} cannot draw its contents as rows as a {shape}: only a rectangle or a rounded rectangle draws rows.':
    '{Of} no puede dibujar su contenido como filas con la forma {shape}: solo un rectángulo o un rectángulo redondeado dibuja filas.',
  'An appearance has no trait "{trait}".': 'Una apariencia no tiene el rasgo "{trait}".',
  'The line width of {of} must be a number above 0.':
    'El grosor de línea de {of} debe ser un número mayor que 0.',
  'The dash of {of} must be "solid", "dashed" or "dotted".':
    'El patrón de línea de {of} debe ser "solid", "dashed" o "dotted".',
  'How a relation is drawn has no trait "{trait}".':
    'La forma de dibujar una relación no tiene el rasgo "{trait}".',
  'An attribute definition has no "{key}".': 'Una definición de atributo no tiene "{key}".',
  'An attribute of {of} needs a name.': 'Un atributo de {of} necesita un nombre.',
  'The attribute "{name}" of {of} is of type "string", "number", "boolean", "json" or "destination".':
    'El atributo "{name}" de {of} es de tipo "string", "number", "boolean", "json" o "destination".',
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
  'The values of "{name}" of {of} are written "plain" or with "emphasis".':
    'Los valores de "{name}" de {of} se escriben simples ("plain") o con énfasis ("emphasis").',
  'Only a string attribute takes text emphasis; "{name}" of {of} is a {type}.':
    'Solo un atributo string admite énfasis de texto; "{name}" de {of} es {type}.',
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
  '{owner} can show an image by its id, as an icon, a drawing or with its parts, with a #rrggbb tint, or show "none".':
    '{owner} puede mostrar una imagen por su id, como ícono, como dibujo o con sus partes, con un tinte #rrggbb, o mostrar "none".',
  'The image "{id}" is defined by package "{earlier}" and again by "{package}".':
    'La imagen "{id}" la define el paquete "{earlier}" y otra vez "{package}".',
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
  'The scope of the view "{view}" names "{id}", which is no element of the model; it is ignored.':
    'El alcance de la vista "{view}" nombra "{id}", que no es ningún elemento del modelo; se ignora.',
  'A rule of the scope of the view "{view}" names the component "{id}", which no package in use defines; it takes nothing.':
    'Una regla del alcance de la vista "{view}" nombra el componente "{id}", que ningún paquete en uso define; no toma nada.',
  'A rule of the scope of the view "{view}" names the relation type "{id}", which no package in use defines; it takes nothing.':
    'Una regla del alcance de la vista "{view}" nombra el tipo de relación "{id}", que ningún paquete en uso define; no toma nada.',
  'A rule of the scope of the view "{view}" names the container "{id}", which is no element of the model; it takes nothing.':
    'Una regla del alcance de la vista "{view}" nombra el contenedor "{id}", que no es ningún elemento del modelo; no toma nada.',
  'The view "{view}" leaves out the relation type "{id}", which no package in use defines.':
    'La vista "{view}" deja fuera el tipo de relación "{id}", que ningún paquete en uso define.',
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

  // Tours (ADR 0058): the history's labels, the refusals of their commands and what a step names
  // that the project no longer holds.
  'Create the tour "{name}"': 'Crear el recorrido "{name}"',
  'Edit the tour "{name}"': 'Editar el recorrido "{name}"',
  'Delete the tour "{name}"': 'Eliminar el recorrido "{name}"',
  'Add a step to the tour "{name}"': 'Agregar un paso al recorrido "{name}"',
  'Delete a step of the tour "{name}"': 'Eliminar un paso del recorrido "{name}"',
  'Reorder the steps of the tour "{name}"': 'Reordenar los pasos del recorrido "{name}"',
  'There is no tour "{id}".': 'No hay ningún recorrido "{id}".',
  'A tour needs a name.': 'Un recorrido necesita un nombre.',
  'A tour is an object with a name.': 'Un recorrido es un objeto JSON con un nombre.',
  'The changes to a tour are an object.': 'Los cambios de un recorrido son un objeto JSON.',
  "A tour's name holds at most {limit} characters.":
    'El nombre de un recorrido tiene como máximo {limit} caracteres.',
  'A description is text.': 'Una descripción es texto.',
  "A tour's description holds at most {limit} characters.":
    'La descripción de un recorrido tiene como máximo {limit} caracteres.',
  'A tour holds at most {limit} steps.': 'Un recorrido tiene como máximo {limit} pasos.',
  'Step {n} of the tour is not a step.': 'El paso {n} del recorrido no es un paso.',
  'Step {n} of the tour takes the id "{id}", which an earlier step has.':
    'El paso {n} del recorrido usa el id "{id}", que ya tiene un paso anterior.',
  'Step {n} of the tour: {why}': 'Paso {n} del recorrido: {why}',
  'A view state is an object.': 'Un estado de vista es un objeto JSON.',
  'Step {n} of the tour needs a caption with a title.':
    'El paso {n} del recorrido necesita un rótulo con un título.',
  'A caption holds a title, a text, a place and the mark it points at, nothing else.':
    'Un rótulo tiene un título, un texto, un lugar y la marca a la que apunta, nada más.',
  // M11d: a caption that points, a step that always cuts, and a pulse (ADR 0084).
  'A caption points at one of its step\'s marks by its id, and "{id}" is not one.':
    'Un rótulo apunta a una de las marcas de su paso por su id, y "{id}" no es un id.',
  'The caption points at "{id}", which is no element, relation, note or arrow of its view.':
    'El rótulo apunta a "{id}", que no es ningún elemento, relación, nota ni flecha de su vista.',
  'A step\'s transition is "cut", to always cut, or "glide", to glide when it can.':
    'La transición de un paso es "cut", para cortar siempre, o "glide", para deslizarse cuando puede.',
  'Step {n} of the tour sends a pulse: an object with its relations.':
    'El paso {n} del recorrido envía un pulso: un objeto JSON con sus relaciones.',
  'A pulse holds its relations and how many times it runs, nothing else.':
    'Un pulso tiene sus relaciones y cuántas veces corre, nada más.',
  'Step {n} of the tour sends a pulse along one relation at least.':
    'El paso {n} del recorrido envía un pulso por al menos una relación.',
  'A pulse runs along at most {limit} relations.':
    'Un pulso corre por como máximo {limit} relaciones.',
  'The pulse of step {n} of the tour runs along "{id}" twice.':
    'El pulso del paso {n} del recorrido corre por "{id}" dos veces.',
  'A pulse runs 1 to 3 times.': 'Un pulso corre de 1 a 3 veces.',
  'Relation {r} of the pulse, "{id}", is not a relation the project holds.':
    'La relación {r} del pulso, "{id}", no es una relación que el proyecto tenga.',
  'The pulse runs along "{name}", which the view "{view}" does not draw as a line.':
    'El pulso corre por "{name}", que la vista "{view}" no dibuja como una línea.',
  'The pulse is not a chain: relation {r}, "{name}", does not start where relation {before}, "{other}", leaves the marker.':
    'El pulso no es una cadena: la relación {r}, "{name}", no empieza donde termina el recorrido por la relación {before}, "{other}".',
  'A caption sits in a corner, top-left, top-right, bottom-left or bottom-right, or where it reads best, auto.':
    'Un rótulo va en una esquina, top-left, top-right, bottom-left o bottom-right, o donde mejor se lee, auto.',
  'Step {n} of the tour reveals a list of marks.':
    'El paso {n} del recorrido revela una lista de marcas.',
  'A step brings in at most {limit} reveals.': 'Un paso trae como máximo {limit} revelaciones.',
  'Reveal {r} of step {n} of the tour is an object with its marks.':
    'La revelación {r} del paso {n} del recorrido es un objeto JSON con sus marcas.',
  'A reveal holds its marks and a text, nothing else.':
    'Una revelación tiene sus marcas y un texto, nada más.',
  'Reveal {r} of step {n} of the tour marks a list of ids.':
    'La revelación {r} del paso {n} del recorrido marca una lista de ids.',
  'Reveal {r} of step {n} of the tour marks "{id}" twice.':
    'La revelación {r} del paso {n} del recorrido marca "{id}" dos veces.',
  'Reveal {r} of step {n} of the tour marks nothing: a reveal marks one element or relation at least.':
    'La revelación {r} del paso {n} del recorrido no marca nada: una revelación marca al menos un elemento o una relación.',
  "A reveal's text is text.": 'El texto de una revelación es texto.',
  'Reveal {r} of step {n} of the tour marks "{id}", which the step marks already.':
    'La revelación {r} del paso {n} del recorrido marca "{id}", que el paso ya marca.',
  "A reveal's text holds at most {limit} characters.":
    'El texto de una revelación tiene como máximo {limit} caracteres.',
  "A step marks at most {limit} elements and relations, its reveals' included.":
    'Un paso marca como máximo {limit} elementos y relaciones, contando sus revelaciones.',
  'Dimming the rest is true or false.': 'Atenuar el resto es true o false.',
  'Step {n} of the tour moves on after its scenario, but plays none.':
    'El paso {n} del recorrido avanza al terminar su escenario, pero no reproduce ninguno.',
  'A step moves on by itself after 500 to 600,000 milliseconds, or after the scenario it plays.':
    'Un paso avanza solo después de 500 a 600.000 milisegundos, o al terminar el escenario que reproduce.',
  'Step {n} names what the project no longer holds, and plays without it: {why}':
    'El paso {n} nombra lo que el proyecto ya no tiene, y se reproduce sin eso: {why}',
  'Step {n} cuts from step {m}: its camera is too far, or too much zoomed, to glide to.':
    'El paso {n} corta desde el paso {m}: su cámara está demasiado lejos, o con demasiado zoom, para deslizarse hasta ella.',
  'Step {n} shows the same view state as step {m}: it could be a reveal of that step.':
    'El paso {n} muestra el mismo estado de vista que el paso {m}: podría ser una revelación de ese paso.',
  'Step {n} marks what its camera does not show: {names}.':
    'El paso {n} marca lo que su cámara no muestra: {names}.',
  'Step {n} marks what its filters hide: {names}.':
    'El paso {n} marca lo que sus filtros ocultan: {names}.',
  'Step {n}\'s caption points at "{name}", which is not one of the step\'s marks: no leader line shows.':
    'El rótulo del paso {n} apunta a "{name}", que no es una de las marcas del paso: no se muestra ninguna línea guía.',
  "Step {n}'s pulse does not play: {why}": 'El pulso del paso {n} no se reproduce: {why}',
  'Step {n} shares {count} shapes with step {m}, more than the {limit} that glide: it cuts with a cross-fade.':
    'El paso {n} comparte {count} formas con el paso {m}, más que las {limit} que se deslizan: corta con un fundido.',
  'Step {n} moves on after {after}, but its text takes {reading} to read: it waits until then.':
    'El paso {n} avanza después de {after}, pero su texto se lee en {reading}: espera hasta entonces.',
  'Step {n} plays {count} steps of the scenario "{name}": a range of more than {limit} is hard to follow in one step.':
    'El paso {n} reproduce {count} pasos del escenario "{name}": un tramo de más de {limit} cuesta seguirlo en un solo paso.',
  'Reveal {r} of the step marks elements, relations, notes and arrows of its view, and "{id}" is none of them.':
    'La revelación {r} del paso marca elementos, relaciones, notas y flechas de su vista, y "{id}" no es ninguno de ellos.',
  "A caption's title holds at most {limit} characters.":
    'El título de un rótulo tiene como máximo {limit} caracteres.',
  "A caption's text is text.": 'El texto de un rótulo es texto.',
  "A caption's text holds at most {limit} characters.":
    'El texto de un rótulo tiene como máximo {limit} caracteres.',
  'Speaker notes are text.': 'Las notas del orador son texto.',
  'Speaker notes hold at most {limit} characters.':
    'Las notas del orador tienen como máximo {limit} caracteres.',
  'The tour would hold more than 1,000,000 characters of text, in its name, description, captions and speaker notes: put the rest of its steps in another tour.':
    'El recorrido tendría más de 1.000.000 de caracteres de texto, entre su nombre, su descripción, sus rótulos y sus notas del orador: poner el resto de sus pasos en otro recorrido.',
  'Step {n} of the tour marks a list of ids.': 'El paso {n} del recorrido marca una lista de ids.',
  'A step marks at most {limit} elements and relations.':
    'Un paso marca como máximo {limit} elementos y relaciones.',
  'Step {n} of the tour marks "{id}" twice.': 'El paso {n} del recorrido marca "{id}" dos veces.',
  'Step {n} of the tour plays a scenario: an object with its id.':
    'El paso {n} del recorrido reproduce un escenario: un objeto JSON con su id.',
  'A step plays a scenario, from a step to a step, with the alternatives it chooses, nothing else.':
    'Un paso reproduce un escenario, desde un paso hasta otro, con las alternativas que elige, nada más.',
  // M11c: tours' steps that play a given alternative (ADR 0078).
  'Step {n} of the tour chooses alternatives as a map from the id of each decision to the id of an alternative.':
    'El paso {n} del recorrido elige alternativas asociando el id de cada decisión al id de una alternativa.',
  'A step chooses at most {limit} alternatives.': 'Un paso elige como máximo {limit} alternativas.',
  'A step marks elements, relations, notes and arrows of its view, and "{id}" is none of them.':
    'Un paso marca elementos, relaciones, notas y flechas de su vista, y "{id}" no es ninguno de ellos.',
  'The step "{from}" comes after "{to}" in the scenario "{name}".':
    'El paso "{from}" viene después de "{to}" en el escenario "{name}".',
  'More than one tour has the id "{key}".': 'Más de un recorrido tiene el id "{key}".',
  'More than one step in the tour "{name}" has the id "{key}".':
    'Más de un paso en el recorrido "{name}" tiene el id "{key}".',

  // What the local program says.
  'No project is open here yet: choose how to start one first.':
    'Todavía no hay ningún proyecto abierto aquí: primero elegir cómo empezar uno.',
  'The project here is being started already.': 'El proyecto de aquí ya se está empezando.',
  'There is no sample "{id}" to start from.':
    'No hay ningún proyecto de muestra "{id}" del que partir.',
  '{folder} already holds files, or is no folder; a new project starts in an empty folder.':
    '{folder} ya tiene archivos, o no es una carpeta; un proyecto nuevo empieza en una carpeta vacía.',
  'The new project could not be written in {folder}: {reason}':
    'No se pudo escribir el proyecto nuevo en {folder}: {reason}',
  'The new project could not be opened: {why}': 'No se pudo abrir el proyecto nuevo: {why}',
  'The new project could not be started: {reason}':
    'No se pudo empezar el proyecto nuevo: {reason}',
  'A project is open here already.': 'Ya hay un proyecto abierto aquí.',
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
  '{path} would hold more than {size}, the most a thread may hold in its file, so this change was not made: start another thread.':
    '{path} ocuparía más de {size}, lo máximo que un hilo puede ocupar en su archivo, así que este cambio no se hizo: empezar otro hilo.',
  '{path} would hold more than {size}, the most a tour may hold in its file, so this change was not made: put the rest of its steps in another tour.':
    '{path} ocuparía más de {size}, lo máximo que un recorrido puede ocupar en su archivo, así que este cambio no se hizo: poner el resto de sus pasos en otro recorrido.',
  '{path} would hold more than {size}, the most a file of its kind may hold, so this change was not made.':
    '{path} ocuparía más de {size}, lo máximo que puede ocupar un archivo de su tipo, así que este cambio no se hizo.',
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

  // The view state an address holds, and what the app says when it cannot open it.
  'This address’s view state could not be read: {why}':
    'No se pudo leer el estado de vista de esta dirección: {why}',
  'Part of this address could not be shown: {why}':
    'Parte de esta dirección no se pudo mostrar: {why}',
  'Could not copy the address, so here it is to copy by hand: {address}':
    'No se pudo copiar la dirección; aquí está para copiarla a mano: {address}',
  'The address is too long to hold a view state.':
    'La dirección es demasiado larga para guardar un estado de vista.',
  'The address is not well formed.': 'La dirección no está bien formada.',
  'The address holds "{key}" twice.': 'La dirección tiene "{key}" dos veces.',
  'The address holds "{key}", which a view state does not have.':
    'La dirección tiene "{key}", que un estado de vista no tiene.',
  'The address holds "{key}" with no value.': 'La dirección tiene "{key}" sin valor.',
  'A view state names its view: view=<id>.': 'Un estado de vista nombra su vista: view=<id>.',
  '"{text}" is not an id.': '"{text}" no es un id.',
  '"{id}" is named twice in {part}.': '"{id}" se nombra dos veces en {part}.',
  'A view state names at most {max} ids in {part}.':
    'Un estado de vista nombra como máximo {max} ids en {part}.',
  'The camera is three numbers: x,y,zoom.': 'La cámara son tres números: x,y,zoom.',
  'The camera zooms from {min} to {max}.': 'La cámara hace zoom de {min} a {max}.',
  'The camera looks at most {distance} canvas units from the origin.':
    'La cámara mira como máximo a {distance} unidades del lienzo del origen.',
  'A step needs its scenario: scenario=<id>.': 'Un paso necesita su escenario: scenario=<id>.',
  'The filters hold "{clause}" twice.': 'Los filtros tienen "{clause}" dos veces.',
  'A condition is where:<of>,<attribute>,<test>, then its value if it takes one.':
    'Una condición es where:<of>,<attribute>,<test>, y luego su valor si lleva uno.',
  'Filters hold at most {max} conditions.': 'Los filtros tienen como máximo {max} condiciones.',
  'A condition is on elements or on relations, not "{side}".':
    'Una condición es sobre elementos o sobre relaciones, no "{side}".',
  'A condition names an attribute.': 'Una condición nombra un atributo.',
  'A condition tests with one of: {tests}.': 'Una condición prueba con uno de: {tests}.',
  'A condition that tests with "{test}" needs a value.':
    'Una condición que prueba con "{test}" necesita un valor.',
  'A condition that tests with "{test}" takes no value.':
    'Una condición que prueba con "{test}" no lleva valor.',
  "A condition's attribute and value hold at most {max} characters.":
    'El atributo y el valor de una condición tienen como máximo {max} caracteres.',
  "A condition's attribute and value are text without broken characters.":
    'El atributo y el valor de una condición son texto sin caracteres rotos.',
  'Focus reaches 1 to {max} degrees, or all.': 'El foco alcanza de 1 a {max} grados, o todos.',
  'Focus goes one of these ways: {ways}; not "{direction}".':
    'El foco va en una de estas direcciones: {ways}; no "{direction}".',
  'Focus is degrees,direction, then isolate or nothing.':
    'El foco es grados,dirección, y luego isolate o nada.',
  'Focus starts from:<ids>, not "{clause}".': 'El foco empieza con from:<ids>, no "{clause}".',
  'The focus holds "from" twice.': 'El foco tiene "from" dos veces.',
  'The project has no view "{view}".': 'El proyecto no tiene la vista "{view}".',
  'Nothing in the view "{view}" has the id "{id}".':
    'Nada en la vista "{view}" tiene el id "{id}".',
  'Focus starts from elements and relations, and "{id}" is neither.':
    'El foco empieza en elementos y relaciones, y "{id}" no es ninguna de las dos cosas.',
  'The project has no scenario "{scenario}".': 'El proyecto no tiene el escenario "{scenario}".',
  'The scenario "{name}" plays over the view "{view}", not "{other}".':
    'El escenario "{name}" se reproduce sobre la vista "{view}", no sobre "{other}".',
  'The scenario "{name}" has no step "{id}".': 'El escenario "{name}" no tiene el paso "{id}".',
  // M11c: the alternatives a view state, an address or a tour's step chooses (ADR 0078).
  'Choices need their scenario: scenario=<id>.':
    'Las alternativas elegidas necesitan su escenario: scenario=<id>.',
  'Choices are <decision>:<alternative>, separated by commas.':
    'Las alternativas elegidas son <decisión>:<alternativa>, separadas por comas.',
  'The choices name the decision "{id}" twice.':
    'Las alternativas elegidas nombran la decisión "{id}" dos veces.',
  'A view state chooses at most {max} alternatives.':
    'Un estado de vista elige como máximo {max} alternativas.',
  'A view state that chooses nothing leaves choices out.':
    'Un estado de vista que no elige nada deja fuera choices.',
  'Choices map the id of each decision to the id of an alternative.':
    'Las alternativas elegidas asocian el id de cada decisión al id de una alternativa.',
  'The scenario "{name}" has no decision "{id}".':
    'El escenario "{name}" no tiene la decisión "{id}".',
  'The decision "{question}" has no alternative "{id}".':
    'La decisión "{question}" no tiene la alternativa "{id}".',
  'With the alternatives it chooses, the scenario "{name}" does not play the step "{id}".':
    'Con las alternativas que elige, el escenario "{name}" no reproduce el paso "{id}".',

  // What cleaning removed from an image, kind by kind, as the core counts it.
  '1 processing instruction': '1 instrucción de procesamiento',
  '{n} processing instructions': '{n} instrucciones de procesamiento',
  '1 @ rule': '1 regla @',
  '{n} @ rules': '{n} reglas @',
  '1 style rule that selects by more than a class or an element name':
    '1 regla de estilo que selecciona por algo más que una clase o un nombre de elemento',
  '{n} style rules that select by more than a class or an element name':
    '{n} reglas de estilo que seleccionan por algo más que una clase o un nombre de elemento',
  '1 {element} element': '1 elemento {element}',
  '{n} {element} elements': '{n} elementos {element}',
  '1 {element} element unwrapped, its contents kept':
    '1 elemento {element} desenvuelto, con su contenido conservado',
  '{n} {element} elements unwrapped, their contents kept':
    '{n} elementos {element} desenvueltos, con su contenido conservado',
  '1 text element (turn text into paths to keep it)':
    '1 elemento de texto (convertir el texto en trazados para conservarlo)',
  '{n} text elements (turn text into paths to keep it)':
    '{n} elementos de texto (convertir el texto en trazados para conservarlo)',
  '1 attribute of another namespace': '1 atributo de otro espacio de nombres',
  '{n} attributes of other namespaces': '{n} atributos de otros espacios de nombres',
  '1 event handler attribute': '1 atributo de manejo de eventos',
  '{n} event handler attributes': '{n} atributos de manejo de eventos',
  '1 other attribute': '1 otro atributo',
  '{n} other attributes': '{n} otros atributos',
  '1 style declaration that is not paint': '1 declaración de estilo que no es de pintura',
  '{n} style declarations that are not paint': '{n} declaraciones de estilo que no son de pintura',
  '1 outside reference': '1 referencia externa',
  '{n} outside references': '{n} referencias externas',
  '1 id that is not allowed': '1 id no permitido',
  '{n} ids that are not allowed': '{n} ids no permitidos',
  '1 repeated id': '1 id repetido',
  '{n} repeated ids': '{n} ids repetidos',
  '1 value that is not allowed': '1 valor no permitido',
  '{n} values that are not allowed': '{n} valores no permitidos',
  '1 stroke dash pattern finer than the picture can show':
    '1 patrón de guiones más fino de lo que la imagen puede mostrar',
  '{n} stroke dash patterns finer than the picture can show':
    '{n} patrones de guiones más finos de lo que la imagen puede mostrar',
  '1 stroke width wider than the picture': '1 grosor de trazo más ancho que la imagen',
  '{n} stroke widths wider than the picture': '{n} grosores de trazo más anchos que la imagen',
  '1 {chunk} chunk': '1 bloque {chunk}',
  '{n} {chunk} chunks': '{n} bloques {chunk}',
  '1 byte after the end': '1 byte después del final',
  '{n} bytes after the end': '{n} bytes después del final',
  '1 EXIF or XMP segment': '1 segmento EXIF o XMP',
  '{n} EXIF or XMP segments': '{n} segmentos EXIF o XMP',
  '1 colour profile segment': '1 segmento de perfil de color',
  '{n} colour profile segments': '{n} segmentos de perfil de color',
  '1 comment': '1 comentario',
  '{n} comments': '{n} comentarios',
  '1 other segment': '1 otro segmento',
  '{n} other segments': '{n} otros segmentos',
  '1 {segment} segment': '1 segmento {segment}',
  '{n} {segment} segments': '{n} segmentos {segment}',
  '1 more kind of thing': '1 tipo de cosa más',
  '{n} more kinds of thing': '{n} tipos de cosas más',

  // Why the browser could not draw or read a picture, and why layout failed.
  'This browser draws no 2D canvas.': 'Este navegador no dibuja lienzos 2D.',
  'This browser encodes no picture.': 'Este navegador no codifica imágenes.',
  'The layout worker failed: {why}.': 'El proceso de diseño automático falló: {why}.',
  'The layout was stopped.': 'Se detuvo el diseño automático.',

  // What is wrong with a project file, as the schema reads it, value by value.
  'Not valid JSON: {reason}': 'No es JSON válido: {reason}',
  'must have the key "{key}"': 'debe tener la clave "{key}"',
  'must not have the key "{key}"': 'no debe tener la clave "{key}"',
  'must be {n}': 'debe ser {n}',
  'must be "{value}"': 'debe ser "{value}"',
  'must be {kinds}': 'debe ser {kinds}',
  'a string': 'un texto',
  'a number': 'un número',
  'an integer': 'un número entero',
  'true or false': 'verdadero o falso',
  'an object': 'un objeto JSON',
  'an array': 'una lista',
  null: 'null',
  'must be one of {values}': 'debe ser uno de estos: {values}',
  'must match the pattern {pattern}': 'debe coincidir con el patrón {pattern}',
  'must be an id: 1 to 128 letters, digits, ".", "_" or "-", starting with a letter or digit':
    'debe ser un id: de 1 a 128 letras, dígitos, ".", "_" o "-", que empiece con una letra o un dígito',
  'must be a color written as #RRGGBB': 'debe ser un color escrito como #RRGGBB',
  'must be a semantic version, such as 1.2.0': 'debe ser una versión semántica, como 1.2.0',
  'must be an SPDX license identifier, such as CC0-1.0 or MIT':
    'debe ser un identificador de licencia SPDX, como CC0-1.0 o MIT',
  // What the schema says of a comment's time and author (ADR 0059).
  'must be a time in UTC as ISO 8601 writes it, such as 2026-10-25T14:03:00.000Z':
    'debe ser una hora en UTC tal como la escribe ISO 8601, como 2026-10-25T14:03:00.000Z',
  'must be an email address, such as ana@example.com':
    'debe ser una dirección de correo electrónico, como ana@example.com',
  'must not be empty': 'no debe estar vacío',
  'must have at least {n} characters': 'debe tener al menos {n} caracteres',
  'must have at least 1 item': 'debe tener al menos 1 entrada',
  'must have at least {n} items': 'debe tener al menos {n} entradas',
  'must have at most 1 item': 'debe tener como máximo 1 entrada',
  'must have at most {n} items': 'debe tener como máximo {n} entradas',
  'must have at most 1 character': 'debe tener como máximo 1 carácter',
  'must have at most {n} characters': 'debe tener como máximo {n} caracteres',
  'must have at least {n} keys': 'debe tener al menos {n} claves',
  'must have ids as its keys, and "{key}" is not one':
    'debe tener ids como claves, y "{key}" no lo es',
  'must not have duplicate items (items {first} and {last} are the same)':
    'no debe tener entradas repetidas (las entradas {first} y {last} son iguales)',
  'must be less than {n}': 'debe ser menor que {n}',
  'must be at most {n}': 'debe ser como máximo {n}',
  'must be greater than {n}': 'debe ser mayor que {n}',
  'must be at least {n}': 'debe ser al menos {n}',
  'does not satisfy "{keyword}"': 'no cumple "{keyword}"',

  // What keeps the files of a project folder from opening, as the local program reads them.
  'The file is not valid UTF-8.': 'El archivo no es UTF-8 válido.',
  'There is no such file.': 'No existe ese archivo.',
  'The file could not be read: {reason}': 'No se pudo leer el archivo: {reason}',
  'The file is a link; Visual Anything opens only regular files inside the project folder.':
    'El archivo es un enlace simbólico; Visual Anything solo abre archivos comunes dentro de la carpeta del proyecto.',
  'The file is not a regular file; Visual Anything opens only regular files inside the project folder.':
    'El archivo no es un archivo común; Visual Anything solo abre archivos comunes dentro de la carpeta del proyecto.',
  'The file lies outside the project folder; Visual Anything opens only regular files inside the project folder.':
    'El archivo está fuera de la carpeta del proyecto; Visual Anything solo abre archivos comunes dentro de la carpeta del proyecto.',
  'The file changed while it was being opened; Visual Anything opens only regular files inside the project folder.':
    'El archivo cambió mientras se abría; Visual Anything solo abre archivos comunes dentro de la carpeta del proyecto.',
  'The file holds more than {size}, the most a file of this kind may hold.':
    'El archivo ocupa más de {size}, lo máximo que puede ocupar un archivo de este tipo.',
  'The folder has no {extension} file; a project has exactly one.':
    'La carpeta no tiene ningún archivo {extension}; un proyecto tiene exactamente uno.',
  'The folder has {n} {extension} files ({files}); a project has exactly one.':
    'La carpeta tiene {n} archivos {extension} ({files}); un proyecto tiene exactamente uno.',
  'The folder {folder} does not exist.': 'La carpeta {folder} no existe.',
  '{folder} is not a folder.': '{folder} no es una carpeta.',
  'The folder {folder} could not be read: {reason}':
    'No se pudo leer la carpeta {folder}: {reason}',
  'The folder {folder}/ could not be read: {reason}':
    'No se pudo leer la carpeta {folder}/: {reason}',
  '{folder} is not a folder; {extension} files go in {folder}/.':
    '{folder} no es una carpeta; los archivos {extension} van en {folder}/.',
  '{folder} is a link; Visual Anything opens only real folders and regular files inside the project folder.':
    '{folder} es un enlace simbólico; Visual Anything solo abre carpetas reales y archivos comunes dentro de la carpeta del proyecto.',
  'The package id "{id}" is already used by {file}.': 'El id de paquete "{id}" ya lo usa {file}.',
  'The view id "{id}" is already used by {file}.': 'El id de vista "{id}" ya lo usa {file}.',
  'The scenario id "{id}" is already used by {file}.':
    'El id de escenario "{id}" ya lo usa {file}.',
  // Tours and threads of comments in their folders (ADR 0058, ADR 0059).
  'The tour id "{id}" is already used by {file}.': 'El id de recorrido "{id}" ya lo usa {file}.',
  'The thread id "{id}" is already used by {file}.': 'El id de hilo "{id}" ya lo usa {file}.',
  // What keeps a read-only page from opening its project (ADR 0041).
  'This page’s data is not a project.': 'Los datos de esta página no son un proyecto.',
  'This page’s data is not valid JSON: {why}': 'Los datos de esta página no son JSON válido: {why}',
  'This page was made by a newer Visual Anything, format {format}. Make it again with this version, or open it with a newer one.':
    'Esta página la hizo un Visual Anything más nuevo, formato {format}. Volver a hacerla con esta versión, o abrirla con una más nueva.',
  'The project file, {pointer}: {why}': 'El archivo del proyecto, {pointer}: {why}',
  'The model, {pointer}: {why}': 'El modelo, {pointer}: {why}',
  'Package {n}, {pointer}: {why}': 'Paquete {n}, {pointer}: {why}',
  'View {n}, {pointer}: {why}': 'Vista {n}, {pointer}: {why}',
  'Scenario {n}, {pointer}: {why}': 'Escenario {n}, {pointer}: {why}',
  'Tour {n}, {pointer}: {why}': 'Recorrido {n}, {pointer}: {why}',
  'The package id "{id}" is used twice.': 'El id de paquete "{id}" se usa dos veces.',
  'The view id "{id}" is used twice.': 'El id de vista "{id}" se usa dos veces.',
  'The scenario id "{id}" is used twice.': 'El id de escenario "{id}" se usa dos veces.',
  'The tour id "{id}" is used twice.': 'El id de recorrido "{id}" se usa dos veces.',
  'The page holds a package with the id "{id}", which Visual Anything keeps for its built-in {name} package.':
    'La página tiene un paquete con el id "{id}", que Visual Anything reserva para su paquete incorporado {name}.',
  'The package "{id}" is listed, but neither this page nor the built-in packages hold it.':
    'El paquete "{id}" está en la lista, pero ni esta página ni los paquetes incorporados lo tienen.',
  '{file} takes the id "{id}", which Visual Anything keeps for its built-in {name} package. Give it another id: {how}':
    '{file} usa el id "{id}", que Visual Anything reserva para su paquete incorporado {name}. Darle otro id: {how}',
  '{file} takes the id "{id}", which Visual Anything keeps for a built-in package to come. Rename it before that package ships: {how}':
    '{file} usa el id "{id}", que Visual Anything reserva para un paquete incorporado que vendrá. Cambiarlo antes de que ese paquete salga: {how}',
  'change "id" in this file, the start of every component and relation type id in it, and every reference to them, and rename the file to match.':
    'cambiar "id" en este archivo, el comienzo de cada id de componente y de tipo de relación que tiene, y cada lugar que los nombra, y cambiar el nombre del archivo para que coincida.',
  'The package "{id}" is listed, but neither packages/ nor the built-in packages hold it.':
    'El paquete "{id}" aparece en la lista, pero no está ni en packages/ ni entre los paquetes incorporados.',

  // More phrases the core builds, which its messages hold as parts.
  'the relation "{name}"': 'la relación "{name}"',
  'a note in "{view}"': 'una nota en "{view}"',
  'A note in "{view}"': 'Una nota en "{view}"',
  'an arrow in "{view}"': 'una flecha en "{view}"',
  'An arrow in "{view}"': 'Una flecha en "{view}"',
  'World has no shape to attach to': 'Mundo no tiene forma a la que conectarse',
  'that end is a relation, whose line it meets in the middle':
    'ese extremo es una relación, cuya línea encuentra en el medio',
  '"{name}" sits inside a row and has no shape of its own':
    '"{name}" está dentro de una fila y no tiene forma propia',
  '"{name}" has no shape in this view': '"{name}" no tiene forma en esta vista',
  'there is no "{end}"': 'no hay ningún "{end}"',

  // Why the core refuses a command that is not as commands are written.
  'A command is an object with a type.': 'Un comando es un objeto JSON con un tipo.',
  'A batch needs at least one command.': 'Un lote necesita al menos un comando.',
  '"{type}" is not a command.': '"{type}" no es un comando.',
  '{key} must be a list.': '{key} debe ser una lista.',
  '"{key}" must be a list.': '"{key}" debe ser una lista.',
  'Bend points must be a list.': 'Los puntos de quiebre deben ser una lista.',
  'The relations of a step must be a list.': 'Las relaciones de un paso deben ser una lista.',
  'x must be a number.': 'x debe ser un número.',
  'y must be a number.': 'y debe ser un número.',
  'The x of a bend point must be a number.': 'La x de un punto de quiebre debe ser un número.',
  'The y of a bend point must be a number.': 'La y de un punto de quiebre debe ser un número.',
  'Where an end attaches along its side must be a number.':
    'El lugar donde un extremo se conecta a lo largo de su lado debe ser un número.',
  'Whether the containers are collapsed is true or false.':
    'Si los contenedores están contraídos es verdadero o falso.',
  'Whether "{name}" is pinned is true or false.': 'Si "{name}" está fijada es verdadero o falso.',
  'Whether {of} nests is true or false.': 'Si {of} anida es verdadero o falso.',
  'Whether {of} writes its component’s name is true or false.':
    'Si {of} escribe el nombre de su componente es verdadero o falso.',
  'Whether {of} draws its contents as rows is true or false.':
    'Si {of} dibuja su contenido como filas es verdadero o falso.',
  'A package’s description is text.': 'La descripción de un paquete es texto.',
  'A component must be an object.': 'Un componente debe ser un objeto JSON.',
  'A relation type must be an object.': 'Un tipo de relación debe ser un objeto JSON.',
  'A component names what it derives from by its id.':
    'Un componente nombra aquello de lo que deriva por su id.',
  'A relation type names what it derives from by its id.':
    'Un tipo de relación nombra aquello de lo que deriva por su id.',
  'The description of {of} is text.': 'La descripción de {of} es texto.',
  'The changes to {of} must be an object.': 'Los cambios de {of} deben ser un objeto JSON.',
  'The changes to the limits of {of} must be an object.':
    'Los cambios de los límites de {of} deben ser un objeto JSON.',
  'Give {of} either a whole "appearance" or "appearanceTraits" to change, not both.':
    'Dar a {of} una "appearance" entera o unos "appearanceTraits" para cambiar, no ambas cosas.',
  'Give {of} either a whole "appearance" or "appearanceTraits" to change, not neither.':
    'Dar a {of} una "appearance" entera o unos "appearanceTraits" para cambiar, alguna de las dos.',
  'An element’s appearance is replaced whole or changed trait by trait, not both at once.':
    'La apariencia de un elemento se reemplaza entera o se cambia rasgo por rasgo, no ambas cosas a la vez.',
  'A relation’s appearance is replaced whole or changed trait by trait, not both at once.':
    'La apariencia de una relación se reemplaza entera o se cambia rasgo por rasgo, no ambas cosas a la vez.',
  'define-image needs the image to define.': 'define-image necesita la imagen que define.',
  'An image is SVG text, or a bitmap’s format and base64 data, and not both.':
    'Una imagen es texto SVG, o el formato y los datos en base64 de un mapa de bits, y no ambas cosas.',
  'An SVG image is given as text.': 'Una imagen SVG se da como texto.',
  'A bitmap is given as its bytes in base64.': 'Un mapa de bits se da como sus bytes en base64.',
  'A container is given only with bend points relative to it.':
    'Un contenedor se da solo con puntos de quiebre relativos a él.',
  'A route has at most {limit} bend points, and {n} were given.':
    'Una ruta tiene como máximo {limit} puntos de quiebre, y se dieron {n}.',
  'A route is orthogonal, straight or curved, not {style}.':
    'Una ruta es ortogonal, recta o curva, no {style}.',
  'No relations were given to route again.': 'No se indicó ninguna relación para volver a trazar.',
  'A relation is given by its id.': 'Una relación se da por su id.',
  'An attachment is a connection point, a place on the border or a place inside the shape.':
    'Una conexión es un punto de conexión, un lugar del borde o un lugar dentro de la forma.',
  'Where an end attaches inside its shape goes from 0 to 1 across and down, not {x} and {y}.':
    'El lugar donde un extremo se conecta dentro de su forma va de 0 a 1 a lo ancho y a lo alto, no {x} y {y}.',
  'A side is top, right, bottom or left, not {side}.':
    'Un lado es top, right, bottom o left, no {side}.',
  'Where an end attaches along its side goes from 0 to 1, not {at}.':
    'El lugar donde un extremo se conecta a lo largo de su lado va de 0 a 1, no {at}.',
  'A connection point is given by its name.': 'Un punto de conexión se da por su nombre.',
  'A move goes to "front", "back", { inFrontOf } or { behind }.':
    'Un movimiento va a "front", "back", { inFrontOf } o { behind }.',
  'A free shape is a note or an arrow.': 'Una forma libre es una nota o una flecha.',
  'A rename gives the attribute "from" and its new name "to".':
    'Un cambio de nombre da el atributo "from" y su nombre nuevo "to".',
  'The attributes the detail of {of} writes must be a list.':
    'Los atributos que escribe el detalle de {of} deben ser una lista.',
  'The detail of {of} names attributes by their names.':
    'El detalle de {of} nombra los atributos por sus nombres.',
  'A badge of {of} must be an object.': 'Una insignia de {of} debe ser un objeto JSON.',
  'A badge of {of} is written "when" an "attribute" is true or at a "from-end".':
    'Una insignia de {of} se escribe "when" un "attribute" es verdadero o en un "from-end".',
  'The badges of {of} must be a list.': 'Las insignias de {of} deben ser una lista.',
  'The detail of {of} must be an object.': 'El detalle de {of} debe ser un objeto JSON.',
  'The connection points of {of} must be a list.':
    'Los puntos de conexión de {of} deben ser una lista.',
  'A connection point of {of} must be an object.':
    'Un punto de conexión de {of} debe ser un objeto JSON.',
  'The image of {of} holds only its image, its placement and its tint.':
    'La imagen de {of} tiene solo su imagen, su ubicación y su tinte.',
  'The appearance of {of} must be an object.': 'La apariencia de {of} debe ser un objeto JSON.',
  'The appearance of {of} has no trait "{trait}".':
    'La apariencia de {of} no tiene el rasgo "{trait}".',
  'The changes to the appearance of {of} must be an object.':
    'Los cambios de la apariencia de {of} deben ser un objeto JSON.',
  'The changes to the detail of {of} must be an object.':
    'Los cambios del detalle de {of} deben ser un objeto JSON.',
  'How {of} is drawn has no trait "{trait}".':
    'La forma de dibujar {of} no tiene el rasgo "{trait}".',
  'An attribute of {of} must be an object.': 'Un atributo de {of} debe ser un objeto JSON.',
  'The description of "{name}" of {of} must be text.':
    'La descripción de "{name}" de {of} debe ser texto.',
  'The attributes of {of} must be a list.': 'Los atributos de {of} deben ser una lista.',
  'The attribute changes of {of} must be an object.':
    'Los cambios de atributos de {of} deben ser un objeto JSON.',
  'The limits of {of} must be an object.': 'Los límites de {of} deben ser un objeto JSON.',
  'An arrow has no fill; give {of} a stroke instead.':
    'Una flecha no tiene relleno; dar a {of} un trazo en su lugar.',

  // Why the core refuses a route or an attachment drawn by hand, and what it ignores in one.
  'The view "{view}" draws "{name}" as containment, not as a line, so it has no route to choose.':
    'La vista "{view}" dibuja "{name}" como contención, no como una línea, así que no tiene ruta para elegir.',
  '"{container}" does not hold both ends of "{name}" in the view "{view}", so its bend points cannot be relative to it.':
    '"{container}" no contiene los dos extremos de "{name}" en la vista "{view}", así que sus puntos de quiebre no pueden ser relativos a él.',
  'The line cannot attach by hand at the start of "{name}": {why}.':
    'La línea no se puede conectar a mano en el inicio de "{name}": {why}.',
  'The line cannot attach by hand at the end of "{name}": {why}.':
    'La línea no se puede conectar a mano en el final de "{name}": {why}.',
  '"{name}" is drawn as a row, or draws its contents as rows: lines attach beside it, on its left or right side.':
    '"{name}" se dibuja como fila, o dibuja su contenido como filas: las líneas se conectan a su lado, en su lado izquierdo o derecho.',
  '"{name}" has no connection point named "{point}".':
    '"{name}" no tiene ningún punto de conexión llamado "{point}".',
  'The view "{view}" keeps a route for "{id}", which is no relation of the model; it is ignored.':
    'La vista "{view}" guarda una ruta para "{id}", que no es ninguna relación del modelo; se ignora.',
  'The view "{view}" attaches the start of "{name}" by hand, but that end is World, which has no shape; it attaches automatically.':
    'La vista "{view}" conecta a mano el inicio de "{name}", pero ese extremo es Mundo, que no tiene forma; se conecta automáticamente.',
  'The view "{view}" attaches the end of "{name}" by hand, but that end is World, which has no shape; it attaches automatically.':
    'La vista "{view}" conecta a mano el final de "{name}", pero ese extremo es Mundo, que no tiene forma; se conecta automáticamente.',
  'The view "{view}" attaches the start of "{name}" by hand, but that end is a relation, whose line it meets in the middle; it attaches automatically.':
    'La vista "{view}" conecta a mano el inicio de "{name}", pero ese extremo es una relación, cuya línea encuentra en el medio; se conecta automáticamente.',
  'The view "{view}" attaches the end of "{name}" by hand, but that end is a relation, whose line it meets in the middle; it attaches automatically.':
    'La vista "{view}" conecta a mano el final de "{name}", pero ese extremo es una relación, cuya línea encuentra en el medio; se conecta automáticamente.',
  'The view "{view}" attaches the start of "{name}" at the connection point "{point}", which "{holder}" does not have; it attaches automatically.':
    'La vista "{view}" conecta el inicio de "{name}" en el punto de conexión "{point}", que "{holder}" no tiene; se conecta automáticamente.',
  'The view "{view}" attaches the end of "{name}" at the connection point "{point}", which "{holder}" does not have; it attaches automatically.':
    'La vista "{view}" conecta el final de "{name}" en el punto de conexión "{point}", que "{holder}" no tiene; se conecta automáticamente.',
  'The view "{view}" keeps the bend points of "{name}" relative to "{container}", which is no element of the model; they are ignored.':
    'La vista "{view}" guarda los puntos de quiebre de "{name}" relativos a "{container}", que no es ningún elemento del modelo; se ignoran.',

  // Why the core cannot read a picture.
  'A bitmap is bytes.': 'Un mapa de bits son bytes.',
  'The bytes are not a PNG, JPEG or WebP picture.':
    'Los bytes no son una imagen PNG, JPEG ni WebP.',
  'The picture is a {actual} file, not a {format} file.':
    'La imagen es un archivo {actual}, no un archivo {format}.',
  'The picture has no size.': 'La imagen no tiene tamaño.',
  'The PNG picture is cut short.': 'La imagen PNG está cortada.',
  'The PNG picture is damaged.': 'La imagen PNG está dañada.',
  'The PNG picture has no header.': 'La imagen PNG no tiene encabezado.',
  'The PNG picture does not start with its header.': 'La imagen PNG no empieza con su encabezado.',
  'The PNG picture is cut short: it has no end.': 'La imagen PNG está cortada: no tiene final.',
  'The PNG picture is animated; keep its first frame as a picture of its own.':
    'La imagen PNG es animada; conservar su primer cuadro como una imagen aparte.',
  'The PNG picture has no image data.': 'La imagen PNG no tiene datos de imagen.',
  'The PNG picture is damaged: its {chunk} chunk does not match its checksum.':
    'La imagen PNG está dañada: su bloque {chunk} no coincide con su suma de verificación.',
  'The JPEG picture is damaged.': 'La imagen JPEG está dañada.',
  'The JPEG picture has no frame header.': 'La imagen JPEG no tiene encabezado de cuadro.',
  'The JPEG picture is cut short.': 'La imagen JPEG está cortada.',
  'The JPEG picture has two frame headers.': 'La imagen JPEG tiene dos encabezados de cuadro.',
  'The JPEG picture has a scan before its frame header.':
    'La imagen JPEG tiene un barrido antes de su encabezado de cuadro.',
  'The JPEG picture is cut short: it has no end.': 'La imagen JPEG está cortada: no tiene final.',
  'The JPEG picture has no image data.': 'La imagen JPEG no tiene datos de imagen.',
  'The WebP picture is cut short.': 'La imagen WebP está cortada.',
  'The WebP picture is damaged.': 'La imagen WebP está dañada.',
  'The WebP picture has no image data.': 'La imagen WebP no tiene datos de imagen.',
  'The WebP picture is animated; keep its first frame as a picture of its own.':
    'La imagen WebP es animada; conservar su primer cuadro como una imagen aparte.',
  'The WebP picture must hold exactly one image.':
    'La imagen WebP debe contener exactamente una imagen.',
  'Its data is not base64.': 'Sus datos no están en base64.',
  'An SVG picture is text.': 'Una imagen SVG es texto.',
  'The outermost element is not an SVG element.': 'El elemento exterior no es un elemento SVG.',
  'The SVG text has text outside its outermost element.':
    'El texto SVG tiene texto fuera de su elemento exterior.',
  'The SVG text has an unfinished processing instruction.':
    'El texto SVG tiene una instrucción de procesamiento sin terminar.',
  'The XML declaration is out of place.': 'La declaración XML está fuera de lugar.',
  'The SVG text has an unfinished comment.': 'El texto SVG tiene un comentario sin terminar.',
  'The SVG text has an unfinished CDATA section.':
    'El texto SVG tiene una sección CDATA sin terminar.',
  'The SVG text has a declaration, such as a DOCTYPE or an ENTITY; it is not read.':
    'El texto SVG tiene una declaración, como un DOCTYPE o un ENTITY; no se lee.',
  'The SVG text has an unfinished end tag.':
    'El texto SVG tiene una etiqueta de cierre sin terminar.',
  'The SVG text closes "{name}" out of order.': 'El texto SVG cierra "{name}" fuera de orden.',
  'The SVG text has more than one outermost element.':
    'El texto SVG tiene más de un elemento exterior.',
  'The SVG text leaves "{name}" open.': 'El texto SVG deja "{name}" abierto.',
  'The SVG text has no element.': 'El texto SVG no tiene ningún elemento.',
  'The SVG text leaves the tag "{name}" unfinished.':
    'El texto SVG deja la etiqueta "{name}" sin terminar.',
  'The tag "{name}" runs its attributes together.':
    'La etiqueta "{name}" junta sus atributos sin separarlos.',
  'The attribute "{attribute}" of "{name}" has no value.':
    'El atributo "{attribute}" de "{name}" no tiene valor.',
  'The attribute "{attribute}" of "{name}" has an unquoted value.':
    'El atributo "{attribute}" de "{name}" tiene un valor sin comillas.',
  'The attribute "{attribute}" of "{name}" is unfinished.':
    'El atributo "{attribute}" de "{name}" está sin terminar.',
  'The attribute "{attribute}" of "{name}" holds "<".':
    'El atributo "{attribute}" de "{name}" contiene "<".',
  'The tag "{name}" has the attribute "{attribute}" twice.':
    'La etiqueta "{name}" tiene el atributo "{attribute}" dos veces.',
  'The SVG text has a malformed tag.': 'El texto SVG tiene una etiqueta mal formada.',
  'The SVG text has an "&" that starts no reference.':
    'El texto SVG tiene un "&" que no empieza ninguna referencia.',
  'The SVG text uses the entity "&{name};", which is not read.':
    'El texto SVG usa la entidad "&{name};", que no se lee.',
  'The SVG text refers to a character XML does not allow (&{name};).':
    'El texto SVG se refiere a un carácter que XML no permite (&{name};).',
  'The SVG picture has no usable view box.': 'La imagen SVG no tiene un viewBox que se pueda usar.',
  'Nothing drawable is left in the SVG picture.': 'No queda nada dibujable en la imagen SVG.',

  // Why the local program refuses a preference the app sends.
  '"theme" must be "system", "light" or "dark", not {value}.':
    '"theme" debe ser "system", "light" o "dark", no {value}.',
  '"language" must be "system", "en" or "es", not {value}.':
    '"language" debe ser "system", "en" o "es", no {value}.',
  '"recentColors" must be a list of colors written #RRGGBB.':
    '"recentColors" debe ser una lista de colores escritos #RRGGBB.',
  '"recentColors" must hold colors written #RRGGBB, not {value}.':
    '"recentColors" debe contener colores escritos #RRGGBB, no {value}.',
  '"recentColors" holds {color} twice.': '"recentColors" tiene {color} dos veces.',
  '"recentColors" holds {n} colors, more than {limit}.':
    '"recentColors" tiene {n} colores, más de {limit}.',
  '"{name}" must be true or false, not {value}.': '"{name}" debe ser true o false, no {value}.',
  // The side panels' widths and strips (ADR 0032's clarification of 2026-10-30).
  '"sidePanels" must hold "model" and "inspector", and nothing else.':
    '"sidePanels" debe tener "model" e "inspector", y nada más.',
  '"{name}" must hold "width" and "collapsed", and nothing else.':
    '"{name}" debe tener "width" y "collapsed", y nada más.',
  '"{name}" must be a whole number of pixels from 200 to 2000, not {value}.':
    '"{name}" debe ser un número entero de píxeles de 200 a 2000, no {value}.',
  // How tours and scenarios move (ADR 0077).
  '"motion" must be "system", "reduced" or "full", not {value}.':
    '"motion" debe ser "system", "reduced" o "full", no {value}.',
  // Who the person's comments are signed as (ADR 0059).
  '"author" must be null, or a name and an email.':
    '"author" debe ser null, o un nombre y un correo electrónico.',
  '"author" has a name and an email, and nothing else.':
    '"author" tiene un nombre y un correo electrónico, y nada más.',
  '"author" needs a name.': '"author" necesita un nombre.',
  '"author" has a name of at most 200 characters.':
    '"author" tiene un nombre de como máximo 200 caracteres.',
  '"author" has an email that is not one: {value}.':
    '"author" tiene un correo electrónico que no lo es: {value}.',

  // Imports (ADR 0042): the action, what the plan cannot be, and why a reader left something out.
  'Import "{name}"': 'Importar "{name}"',
  'Visual Anything cannot tell what this file is: name its format.':
    'Visual Anything no puede saber qué archivo es este: indicar su formato.',
  'The file holds {count} elements; an import brings at most 20,000.':
    'El archivo tiene {count} elementos; una importación trae como máximo 20.000.',
  'The file holds {count} relations, those that put one thing inside another included; an import brings at most 50,000.':
    'El archivo tiene {count} relaciones, contando las que ponen una cosa dentro de otra; una importación trae como máximo 50.000.',
  'The file holds {count} views; an import brings at most 500.':
    'El archivo tiene {count} vistas; una importación trae como máximo 500.',
  'The file holds {count} positions and bend points; an import brings at most 200,000.':
    'El archivo tiene {count} posiciones y puntos de quiebre; una importación trae como máximo 200.000.',
  'The file holds more than 20,000 elements; an import brings at most 20,000.':
    'El archivo tiene más de 20.000 elementos; una importación trae como máximo 20.000.',
  'The file holds more than 50,000 relations, those that put one thing inside another included; an import brings at most 50,000.':
    'El archivo tiene más de 50.000 relaciones, contando las que ponen una cosa dentro de otra; una importación trae como máximo 50.000.',
  'The file holds more rows than an import brings: at most 71,000.':
    'El archivo tiene más filas de las que trae una importación: como máximo 71.000.',
  'The plan uses the key "{key}" twice.': 'El plan usa la clave "{key}" dos veces.',
  'No component is chosen for "{kind}".': 'No se eligió ningún componente para "{kind}".',
  'No relation type is chosen for "{kind}".': 'No se eligió ningún tipo de relación para "{kind}".',
  'The plan updates "{id}", which the project does not hold.':
    'El plan actualiza "{id}", que el proyecto no tiene.',
  'The relation "{key}" ends on something the plan does not hold.':
    'La relación "{key}" termina en algo que el plan no tiene.',
  'No relation type that nests is chosen for what sits inside what.':
    'No se eligió ningún tipo de relación que anida para lo que está dentro de qué.',
  '"{element}" sits inside "{container}", which the plan does not hold.':
    '"{element}" está dentro de "{container}", que el plan no tiene.',
  'The file is larger than 32 MiB; an import reads at most 32 MiB.':
    'El archivo pesa más de 32 MiB; una importación lee como máximo 32 MiB.',
  'There is no import reader for "{format}".':
    'No hay ningún lector de importación para "{format}".',
  'The description is longer than 10,000 characters, so it is cut.':
    'La descripción tiene más de 10.000 caracteres, así que se recorta.',
  'It would sit inside "{container}", which sits inside it, so it stays where it was.':
    'Quedaría dentro de "{container}", que está dentro de él, así que queda donde estaba.',
  'It would sit more than {limit} containers deep, so it stays where it was.':
    'Quedaría a más de {limit} contenedores de profundidad, así que queda donde estaba.',
  // What Mermaid diagrams hold that is not read.
  'The text holds no Mermaid diagram.': 'El texto no tiene nada de Mermaid que se pueda leer.',
  '"{keyword}" diagrams are not read: Visual Anything reads Mermaid flowcharts, and C4, ER and class diagrams.':
    'Los textos "{keyword}" no se leen: de Mermaid, Visual Anything lee flowchart, C4, erDiagram y classDiagram.',
  'The front matter that starts on line {n} never ends.':
    'El encabezado que empieza en la línea {n} nunca termina.',
  'The subgraph "{name}" that starts on line {n} never ends.':
    'El subgrafo "{name}" que empieza en la línea {n} nunca termina.',
  'The boundary "{name}" that starts on line {n} never ends.':
    'El límite "{name}" que empieza en la línea {n} nunca termina.',
  'The block of "{name}" that starts on line {n} never ends.':
    'El bloque de "{name}" que empieza en la línea {n} nunca termina.',
  'The namespace "{name}" that starts on line {n} never ends.':
    'El espacio de nombres "{name}" que empieza en la línea {n} nunca termina.',
  'Directives are not read.': 'Las directivas no se leen.',
  'Styles are not read: the components’ appearances draw the shapes.':
    'Los estilos no se leen: las formas se dibujan con la apariencia de sus componentes.',
  'Layout settings are not read: Visual Anything lays the view out itself.':
    'Las opciones de diseño no se leen: Visual Anything organiza la vista por su cuenta.',
  'Web addresses and callbacks are never followed.':
    'Las direcciones web y las llamadas nunca se siguen.',
  'Images in imports are left out; a component’s own image shows instead.':
    'Las imágenes de una importación se dejan afuera; en su lugar se muestra la imagen del componente.',
  'Notes are not read: add notes on the canvas instead.':
    'Las notas no se leen: agregar notas en el lienzo en su lugar.',
  'An invisible line only spaces shapes out, so it brings no relation.':
    'Una línea invisible solo separa formas, así que no trae ninguna relación.',
  'This line is not read.': 'Esta línea no se lee.',
  'This line is not read: it is not a shape, an arrow or a subgraph.':
    'Esta línea no se lee: no es una forma, una flecha ni un subgrafo.',
  'This line is not read: it is not an attribute, written as type and name.':
    'Esta línea no se lee: no es un atributo, escrito como tipo y nombre.',
  'This line ends no subgraph, so it is not read.':
    'Esta línea no cierra ningún subgrafo, así que no se lee.',
  'This line ends no boundary, so it is not read.':
    'Esta línea no cierra ningún límite, así que no se lee.',
  'This line is longer than 16,384 characters, so it is not read.':
    'Esta línea tiene más de 16.384 caracteres, así que no se lee.',
  'This attribute is listed twice, so it is read once.':
    'Este atributo aparece dos veces, así que se lee una sola vez.',
  'The relation ends on "{name}", which the diagram does not define.':
    'La relación termina en "{name}", que el archivo no define.',
  // What spreadsheets hold that is not read.
  'The spreadsheet holds no table.': 'La hoja de cálculo no tiene ninguna tabla.',
  'A quote that opens on line {n} never closes.':
    'Unas comillas que se abren en la línea {n} nunca se cierran.',
  'The table that starts on line {n} has no name or id column for elements, and no from and to columns for relations.':
    'La tabla que empieza en la línea {n} no tiene columna de nombre ni de id para elementos, ni columnas de origen y destino para relaciones.',
  'The spreadsheet has no column "{name}" to match its rows by.':
    'La hoja de cálculo no tiene ninguna columna "{name}" para emparejar sus filas.',
  'This column has no header, so it is not read.':
    'Esta columna no tiene encabezado, así que no se lee.',
  'This column repeats the header "{name}", so it is not read.':
    'Esta columna repite el encabezado "{name}", así que no se lee.',
  'No attribute may be named "{name}", so this column is not read.':
    'Ningún atributo puede llamarse "{name}", así que esta columna no se lee.',
  'No attribute may be named "{name}", so it is left out.':
    'Ningún atributo puede llamarse "{name}", así que se deja afuera.',
  'The id "{id}" is given to an earlier row, so this row is left out.':
    'El id "{id}" ya lo tiene una fila anterior, así que esta fila se deja afuera.',
  'The id "{id}" is given to an earlier element, so this one is left out.':
    'El id "{id}" ya lo tiene un elemento anterior, así que este se deja afuera.',
  'The id "{id}" is given to an earlier relation, so this one is left out.':
    'El id "{id}" ya lo tiene una relación anterior, así que esta se deja afuera.',
  'This row has no name or id, so it is left out.':
    'Esta fila no tiene nombre ni id, así que se deja afuera.',
  'This row has no from or no to, so it is left out.':
    'A esta fila le falta el origen o el destino, así que se deja afuera.',
  '"{name}" names no element of the file or the project, so the row is left out.':
    '"{name}" no nombra ningún elemento del archivo ni del proyecto, así que la fila se deja afuera.',
  '"{name}" names no element of the file or the project, so the relation is left out.':
    '"{name}" no nombra ningún elemento del archivo ni del proyecto, así que la relación se deja afuera.',
  '"{name}" names no element of the file or the project, so this row sits in no container.':
    '"{name}" no nombra ningún elemento del archivo ni del proyecto, así que esta fila no queda en ningún contenedor.',
  '"{name}" names no element of the file or the project, so this element sits in no container.':
    '"{name}" no nombra ningún elemento del archivo ni del proyecto, así que este elemento no queda en ningún contenedor.',
  '"{name}" names {n} elements of the file, so the row is left out.':
    '"{name}" nombra {n} elementos del archivo, así que la fila se deja afuera.',
  '"{name}" names {n} elements of the file, so it is left out.':
    '"{name}" nombra {n} elementos del archivo, así que se deja afuera.',
  '"{name}" names {n} elements of the project, so the row is left out.':
    '"{name}" nombra {n} elementos del proyecto, así que la fila se deja afuera.',
  '"{name}" names {n} elements of the project, so it is left out.':
    '"{name}" nombra {n} elementos del proyecto, así que se deja afuera.',
  '"{name}" matches {n} elements of the project, so the row is left out.':
    '"{name}" coincide con {n} elementos del proyecto, así que la fila se deja afuera.',
  '"{name}" matches {n} elements of the project, so it is left out.':
    '"{name}" coincide con {n} elementos del proyecto, así que se deja afuera.',
  // What JSON files hold that is not read.
  'The file is not valid JSON: {reason}': 'El archivo no es JSON válido: {reason}',
  'The file nests more than {limit} levels deep.':
    'El archivo anida más de {limit} niveles de profundidad.',
  'The file holds neither a model, with world, elements and relations, nor a list of elements and relations.':
    'El archivo no tiene ni un modelo, con world, elements y relations, ni una lista de elementos y relaciones.',
  'The file as a whole {why}.': 'El archivo completo {why}.',
  '{path} in the file {why}.': '{path} en el archivo {why}.',
  'Its own appearance is left out: an import brings no appearances.':
    'Su apariencia propia se deja afuera: una importación no trae apariencias.',
  'It ends on World, which an import does not bring, so it is left out.':
    'Termina en Mundo, que una importación no trae, así que se deja afuera.',
  'It ends on "{name}", which the file does not hold, so it is left out.':
    'Termina en "{name}", que el archivo no tiene, así que se deja afuera.',
  'It ends on a relation that ends on it in turn, so it is left out.':
    'Termina en una relación que a su vez termina en ella, así que se deja afuera.',
  'It ends on a relation that is left out, so it is left out too.':
    'Termina en una relación que se deja afuera, así que también se deja afuera.',
  // What importing again leaves out.
  'The project already has this relation, so it is not created again.':
    'El proyecto ya tiene esta relación, así que no se vuelve a crear.',
  // Why the Structurizr, LikeC4 and draw.io readers refuse a file, and what they leave out (ADR 0042).
  'The file nests too deeply to be read.': 'El archivo anida demasiado hondo para leerse.',
  'The file is not JSON.': 'El archivo no es JSON.',
  'The file is over 32 MiB, the most an import reads.':
    'El archivo tiene más de 32 MiB, lo máximo que lee una importación.',
  'The name is over 1,000 characters; it is cut there.':
    'El nombre tiene más de 1.000 caracteres; se corta ahí.',
  'One more thing matched nothing; the list stops here.':
    'Una cosa más no coincidió con nada; la lista se detiene aquí.',
  '{count} more things matched nothing; the list stops here.':
    '{count} cosas más no coincidieron con nada; la lista se detiene aquí.',
  'A link that is not a web address is left out.':
    'Se deja fuera lo que lleva a algo que no es una dirección web.',
  'Its {n} bend points are left out: a route bends at most 64 times.':
    'Se dejan fuera sus {n} puntos de quiebre: una ruta se quiebra como máximo 64 veces.',
  'The view is left out: an import brings at most 500 views.':
    'Se deja fuera la vista: una importación trae como máximo 500 vistas.',
  'The view is left out: the views would show over 200,000 shapes in all.':
    'Se deja fuera la vista: las vistas mostrarían más de 200.000 formas en total.',
  'The order of its steps is left out; a scenario can be recorded over the view.':
    'Se deja fuera el orden de sus pasos; se puede grabar un escenario sobre la vista.',
  'The XML has text outside its outermost element.':
    'El XML tiene texto fuera de su elemento exterior.',
  'The XML has an unfinished processing instruction.':
    'El XML tiene una instrucción de procesamiento sin terminar.',
  'The XML has an unfinished comment.': 'El XML tiene un comentario sin terminar.',
  'The XML has an unfinished CDATA section.': 'El XML tiene una sección CDATA sin terminar.',
  'The XML has a DOCTYPE out of place.': 'El XML tiene un DOCTYPE fuera de lugar.',
  'The XML has a DOCTYPE with declarations of its own, which is not read.':
    'El XML tiene un DOCTYPE con declaraciones propias, que no se lee.',
  'The XML has a declaration, such as an ENTITY, outside a DOCTYPE; it is not read.':
    'El XML tiene una declaración, como un ENTITY, fuera de un DOCTYPE; no se lee.',
  'The XML has an unfinished declaration.': 'El XML tiene una declaración sin terminar.',
  'The XML has an unfinished end tag.': 'El XML tiene una etiqueta de cierre sin terminar.',
  'The XML closes "{name}" out of order.': 'El XML cierra "{name}" fuera de orden.',
  'The XML has more than one outermost element.': 'El XML tiene más de un elemento exterior.',
  'The XML has over 500,000 elements.': 'El XML tiene más de 500.000 elementos.',
  'The XML nests elements over 256 deep.': 'El XML anida elementos a más de 256 niveles.',
  'The XML leaves "{name}" open.': 'El XML deja "{name}" abierto.',
  'The XML has no element.': 'El XML no tiene ningún elemento.',
  'The XML leaves the tag "{name}" unfinished.': 'El XML deja la etiqueta "{name}" sin terminar.',
  'The tag "{name}" has over 1,024 attributes.':
    'La etiqueta "{name}" tiene más de 1.024 atributos.',
  'The XML has a malformed tag.': 'El XML tiene una etiqueta mal formada.',
  'The XML has an "&" that starts no reference.':
    'El XML tiene un "&" que no empieza ninguna referencia.',
  'The XML uses the entity "&{name};", which is not read.':
    'El XML usa la entidad "&{name};", que no se lee.',
  'The XML refers to a character XML does not allow (&{name};).':
    'El XML se refiere a un carácter que XML no permite (&{name};).',
  'The compressed content is not valid deflate data.':
    'El contenido comprimido no son datos deflate válidos.',
  'The compressed content inflates to over 32 MiB, the most an import reads.':
    'El contenido comprimido se descomprime en más de 32 MiB, lo máximo que lee una importación.',
  'The compressed content is not valid base64.': 'El contenido comprimido no es base64 válido.',
  'The compressed content is not valid URI-encoded text.':
    'El contenido comprimido no es texto codificado como URI válido.',
  'The SVG picture holds no draw.io diagram: its outermost element has no content.':
    'La imagen SVG no contiene ningún dibujo de draw.io: su elemento exterior no tiene content.',
  'The file is not a draw.io diagram: its outermost element is "{name}", not "mxfile".':
    'El archivo no es un dibujo de draw.io: su elemento exterior es "{name}", no "mxfile".',
  'The draw.io file has no page.': 'El archivo de draw.io no tiene ninguna página.',
  'A page of the draw.io file holds "{name}", not "mxGraphModel".':
    'Una página del archivo de draw.io contiene "{name}", no "mxGraphModel".',
  'A chunk of the PNG picture is damaged.': 'Un bloque de la imagen PNG está dañado.',
  'The PNG picture holds no draw.io diagram.':
    'La imagen PNG no contiene ningún dibujo de draw.io.',
  'A cell on the page "{page}" has no id.': 'Una celda de la página "{page}" no tiene id.',
  'The page "{page}" holds the id "{id}" twice.':
    'La página "{page}" tiene el id "{id}" dos veces.',
  'Its placeholders are filled in up to 64 of them and 4,000 characters; the rest stay as written.':
    'Sus marcadores de posición se completan hasta 64 de ellos y 4.000 caracteres; el resto queda como está escrito.',
  'Placeholders are filled in up to 1,000,000 characters across the file; the rest stay as written.':
    'Los marcadores de posición se completan hasta 1.000.000 de caracteres en todo el archivo; el resto queda como está escrito.',
  'Its container "{id}" is not on the page, so it sits directly in World.':
    'Su contenedor "{id}" no está en la página, así que queda directamente en Mundo.',
  'It sits inside itself through its containers, so it sits directly in World.':
    'Queda dentro de sí mismo a través de sus contenedores, así que queda directamente en Mundo.',
  'A line that is not connected at both ends becomes no relation.':
    'Una línea que no está conectada en ambos extremos no se vuelve una relación.',
  'It ends on "{id}", which the page does not hold.': 'Termina en "{id}", que la página no tiene.',
  'It ends on the page itself, which is no element.':
    'Termina en la página misma, que no es un elemento.',
  'Its relations end on each other in a loop, so none of them becomes a relation.':
    'Sus relaciones terminan unas en otras en un ciclo, así que ninguna se vuelve una relación.',
  'It ends on a line that becomes no relation, so it becomes none either.':
    'Termina en una línea que no se vuelve una relación, así que tampoco se vuelve una.',
  'The page is left out: an import brings at most 500 views.':
    'Se deja fuera la página: una importación trae como máximo 500 vistas.',
  'A shape draws this draw.io stencil, which is left out; the component chosen for it draws it.':
    'Una forma dibuja este stencil de draw.io, que se deja fuera; la dibuja el componente elegido para ella.',
  '{count} shapes draw this draw.io stencil, which is left out; the component chosen for them draws them.':
    '{count} formas dibujan este stencil de draw.io, que se deja fuera; las dibuja el componente elegido para ellas.',
  'A shape shows an image, which is left out: images in imports are left out, and the component chosen for it draws it.':
    'Una forma muestra una imagen, que se deja fuera: las imágenes de las importaciones se dejan fuera, y la dibuja el componente elegido para ella.',
  '{count} shapes show an image, which is left out: images in imports are left out, and the component chosen for them draws them.':
    '{count} formas muestran una imagen, que se deja fuera: las imágenes de las importaciones se dejan fuera, y las dibuja el componente elegido para ellas.',
  'The workspace\'s "{where}" is not what Structurizr writes.':
    'El "{where}" del espacio de trabajo no es lo que escribe Structurizr.',
  'The file is not a Structurizr workspace: it has no model.':
    'El archivo no es un espacio de trabajo de Structurizr: no tiene modelo.',
  'The workspace holds the id "{id}" twice.': 'El espacio de trabajo tiene el id "{id}" dos veces.',
  'The workspace nests its deployment over 64 levels deep.':
    'El espacio de trabajo anida su despliegue a más de 64 niveles.',
  'It ends on "{id}", which the workspace does not hold.':
    'Termina en "{id}", que el espacio de trabajo no tiene.',
  'It is deployed from "{id}", which the workspace does not hold.':
    'Se despliega a partir de "{id}", que el espacio de trabajo no tiene.',
  'A relationship between what the view shows is not in it, but a view shows every relation between what it shows.':
    'Una relación entre lo que muestra la vista no está en ella, pero una vista muestra todas las relaciones entre lo que muestra.',
  '{count} relationships between what the view shows are not in it, but a view shows every relation between what it shows.':
    '{count} relaciones entre lo que muestra la vista no están en ella, pero una vista muestra todas las relaciones entre lo que muestra.',
  'The view "{view}" shows "{id}", which the workspace does not hold.':
    'La vista "{view}" muestra "{id}", que el espacio de trabajo no tiene.',
  'Its base view "{view}" is not in the workspace.':
    'Su vista de base "{view}" no está en el espacio de trabajo.',
  'Image views are left out: images in imports are left out.':
    'Se dejan fuera las vistas de imagen: las imágenes de las importaciones se dejan fuera.',
  'Documentation and decisions are left out.': 'Se dejan fuera la documentación y las decisiones.',
  'The LikeC4 model\'s "{where}" is not what LikeC4 writes.':
    'El "{where}" del modelo de LikeC4 no es lo que escribe LikeC4.',
  'The file is not a LikeC4 model: it has no elements.':
    'El archivo no es un modelo de LikeC4: no tiene elementos.',
  'The LikeC4 model holds a name over 256 characters or 32 levels deep: "{name}".':
    'El modelo de LikeC4 tiene un nombre de más de 256 caracteres o 32 niveles: "{name}".',
  'The LikeC4 model holds the element "{name}" twice.':
    'El modelo de LikeC4 tiene el elemento "{name}" dos veces.',
  'The LikeC4 model holds the deployment element "{name}" twice.':
    'El modelo de LikeC4 tiene el elemento de despliegue "{name}" dos veces.',
  'The LikeC4 model holds the relation "{id}" twice.':
    'El modelo de LikeC4 tiene la relación "{id}" dos veces.',
  'It ends on "{id}", which the model does not hold.': 'Termina en "{id}", que el modelo no tiene.',
  'It ends inside a deployed element, so it ends on the deployed element.':
    'Termina dentro de un elemento desplegado, así que termina en el elemento desplegado.',
  'The view "{view}" shows "{id}", which the model does not hold.':
    'La vista "{view}" muestra "{id}", que el modelo no tiene.',
  'Groups are left out; what they hold sits in the view without them.':
    'Se dejan fuera las agrupaciones; lo que contienen queda en la vista sin ellas.',
  'A step that no relation of the model stands for is left out.':
    'Se deja fuera un paso que no representa ninguna relación del modelo.',
  'It is drawn between containers of its ends; it shows in views that show its ends.':
    'Se dibuja entre contenedores de sus extremos; se muestra en las vistas que muestran sus extremos.',
  // Package code (ADR 0054): writing it, what a project's files hold of it, and what its runs say.
  'Add code to the package "{name}"': 'Agregar código al paquete "{name}"',
  'Change the code of the package "{name}"': 'Cambiar el código del paquete "{name}"',
  'Remove the code of the package "{name}"': 'Quitar el código del paquete "{name}"',
  'Change what the code of the package "{name}" may reach':
    'Cambiar a qué puede llegar el código del paquete "{name}"',
  'Change what the code of the package "{name}" adds':
    'Cambiar lo que agrega el código del paquete "{name}"',
  // What package code adds to the app (ADR 0089).
  'The package declares what its code adds as an object of lists.':
    'El paquete debe declarar lo que agrega su código como un objeto JSON de listas.',
  'The package declares "{key}", which is not actions, importers, exporters or panels.':
    'El paquete declara "{key}", que no es actions, importers, exporters ni panels.',
  'The package declares a kind of what its code adds that is not a list.':
    'El paquete declara un tipo de lo que agrega su código que no es una lista.',
  'The package declares more of one kind than it may: 32 actions, and 8 importers, exporters or panels.':
    'El paquete declara más de un tipo de lo que puede: 32 acciones, y 8 importadores, exportadores o paneles.',
  'The package declares something its code adds that is not an object.':
    'El paquete declara algo que agrega su código que no es un objeto JSON.',
  'The package declares something its code adds whose id is not lower case letters, digits and -.':
    'El paquete declara algo que agrega su código cuyo id no está hecho de minúsculas, dígitos y -.',
  'The package declares two of one kind with the id "{id}".':
    'El paquete declara dos del mismo tipo con el id "{id}".',
  'The package declares "{id}" with a label that is not 1 to 60 characters.':
    'El paquete declara "{id}" con una etiqueta que no tiene de 1 a 60 caracteres.',
  'The package declares "{id}" with "{key}", which it does not have.':
    'El paquete declara "{id}" con "{key}", que no le corresponde.',
  'The package declares "{id}" with a description over 300 characters.':
    'El paquete declara "{id}" con una descripción de más de 300 caracteres.',
  'The package declares "{id}" offered somewhere other than "selection" and "packages-menu".':
    'El paquete declara "{id}" ofrecido en otro lugar que "selection" y "packages-menu".',
  'The package declares "{id}" for components that are not 1 to 32 different ids.':
    'El paquete declara "{id}" para componentes que no son de 1 a 32 ids distintos.',
  'The package declares "{id}" reading extensions that are not 1 to 8 different ones such as ".sql".':
    'El paquete declara "{id}" leyendo extensiones que no son de 1 a 8 distintas, como ".sql".',
  'The package declares "{id}" writing an extension that is not one such as ".sql".':
    'El paquete declara "{id}" escribiendo una extensión que no es como ".sql".',
  'The package "{name}" has no code to add anything to the app.':
    'El paquete "{name}" no tiene código con el que agregar algo a la app.',
  'set-package-code needs the code, the capabilities, what the code adds, or some of them.':
    'set-package-code necesita el código, las capacidades, lo que agrega el código o algunos de ellos.',
  "A package's code is JavaScript text, or its lines as a list of texts.":
    'El código de un paquete es texto en JavaScript, o sus líneas como una lista de textos.',
  'The code has nothing in it; to remove it, set it to null.':
    'El código no tiene nada; para quitarlo, darle el valor null.',
  'The code of the package "{name}" would be over 256 KiB; keep it under that.':
    'El código del paquete "{name}" pasaría de 256 KiB; debe quedar por debajo.',
  'The code holds more than {n} lines.': 'El código tiene más de {n} líneas.',
  'Line {n} of the code is over {m} characters.': 'La línea {n} del código pasa de {m} caracteres.',
  'Line {n} of the code holds a line break; give each line as its own text.':
    'La línea {n} del código tiene un salto de línea; dar cada línea como un texto aparte.',
  'The capabilities are a list, such as ["model:read", "time"].':
    'Las capacidades son una lista, como ["model:read", "time"].',
  'Package code declares at most {n} capabilities.':
    'El código de un paquete declara como máximo {n} capacidades.',
  'The package "{name}" has no code to give capabilities to.':
    'El paquete "{name}" no tiene código al que dar capacidades.',
  '"{capability}" is not a capability: package code may have "model:read", "time" and "network:" with one web origin.':
    '"{capability}" no es una capacidad: el código de un paquete puede tener "model:read", "time" y "network:" con un origen web.',
  '"{capability}" is not a capability: write "network:" and one web origin, such as "network:https://status.example.com", with no path and no default port.':
    '"{capability}" no es una capacidad: escribir "network:" y un origen web, como "network:https://status.example.com", sin ruta ni puerto predeterminado.',
  'The code of the package "{name}" is over 256 KiB, so it never runs.':
    'El código del paquete "{name}" pasa de 256 KiB, así que nunca se ejecuta.',
  'The package "{name}" declares "{capability}", which is not a capability; its code never gets it.':
    'El paquete "{name}" declara "{capability}", que no es una capacidad; su código nunca la recibe.',
  'The package "{name}" declares capabilities but holds no code; they have no effect.':
    'El paquete "{name}" declara capacidades pero no tiene código; no tienen efecto.',
  'The code of the package "{name}" failed in {hook} on "{element}": it threw something that is not an error':
    'El código del paquete "{name}" falló en {hook} sobre "{element}": lanzó algo que no es un error',
  'The code of the package "{name}" failed in {hook} on "{element}": {error}':
    'El código del paquete "{name}" falló en {hook} sobre "{element}": {error}',
  'The code of the package "{name}" was stopped in {hook} on "{element}": it ran past 50 ms.':
    'El código del paquete "{name}" se detuvo en {hook} sobre "{element}": pasó de 50 ms.',
  'The code of the package "{name}" was stopped in {hook} on "{element}": it took more than 32 MiB.':
    'El código del paquete "{name}" se detuvo en {hook} sobre "{element}": ocupó más de 32 MiB.',
  'The answer of {hook} from the package "{name}" on "{element}" was dropped: {why}.':
    'Se descartó la respuesta de {hook} del paquete "{name}" sobre "{element}": {why}.',
  'The code of the package "{name}" did not load: it threw something that is not an error':
    'El código del paquete "{name}" no se cargó: lanzó algo que no es un error',
  'The code of the package "{name}" did not load: {error}':
    'El código del paquete "{name}" no se cargó: {error}',
  'The code of the package "{name}" was stopped as it loaded: it ran past 50 ms.':
    'El código del paquete "{name}" se detuvo al cargarse: pasó de 50 ms.',
  'The code of the package "{name}" was stopped as it loaded: it took more than 32 MiB.':
    'El código del paquete "{name}" se detuvo al cargarse: ocupó más de 32 MiB.',
  'The code of the package "{name}" is off until the project opens again: its calls stopped {n} times in a row.':
    'El código del paquete "{name}" queda apagado hasta que el proyecto se vuelva a abrir: sus llamadas se detuvieron {n} veces seguidas.',
  'The code of the package "{name}" is turned off on this computer: it runs again once it is turned on in Packages….':
    'El código del paquete "{name}" está desactivado en esta computadora: vuelve a ejecutarse cuando se activa en Paquetes….',
  'The code of the package "{name}" is not approved: the person approves it in the app before it runs.':
    'El código del paquete "{name}" no está aprobado: la persona lo aprueba en la app antes de que se ejecute.',
  'The code of the package "{name}" was stopped: it kept the worker that runs package code from answering, so the worker started again.':
    'El código del paquete "{name}" se detuvo: no dejaba responder al proceso que ejecuta el código de los paquetes, así que ese proceso volvió a empezar.',
  // M14.1: what a call of a hook that adds to the app says (ADR 0089), for the action, importer,
  // exporter or panel named by its label.
  'The code of the package "{name}" failed in {hook} for "{label}": {error}':
    'El código del paquete "{name}" falló en {hook} para "{label}": {error}',
  'The code of the package "{name}" failed in {hook} for "{label}": it threw something that is not an error':
    'El código del paquete "{name}" falló en {hook} para "{label}": lanzó algo que no es un error',
  'The code of the package "{name}" failed in {hook} for "{label}": the package exports no {exported}':
    'El código del paquete "{name}" falló en {hook} para "{label}": el paquete no exporta {exported}',
  'The code of the package "{name}" failed in {hook} for "{label}": it imports another module, and package code is one module on its own':
    'El código del paquete "{name}" falló en {hook} para "{label}": importa otro módulo, y el código de un paquete es un único módulo',
  'The code of the package "{name}" failed in {hook} for "{label}": the interpreter stopped working':
    'El código del paquete "{name}" falló en {hook} para "{label}": el intérprete dejó de funcionar',
  'The code of the package "{name}" failed in {hook} for "{label}": the interpreter failed: {error}':
    'El código del paquete "{name}" falló en {hook} para "{label}": falló el intérprete: {error}',
  'The code of the package "{name}" failed in {hook} for "{label}": it threw nothing that says why':
    'El código del paquete "{name}" falló en {hook} para "{label}": lanzó algo que no dice por qué',
  'The code of the package "{name}" failed in {hook} for "{label}": it gave no reason':
    'El código del paquete "{name}" falló en {hook} para "{label}": no dio ningún motivo',
  'The code of the package "{name}" was stopped in {hook} for "{label}": it ran past {n} ms.':
    'El código del paquete "{name}" se detuvo en {hook} para "{label}": pasó de {n} ms.',
  'The code of the package "{name}" was stopped in {hook} for "{label}": it took more than {n} MiB.':
    'El código del paquete "{name}" se detuvo en {hook} para "{label}": ocupó más de {n} MiB.',
  'The answer of {hook} from the package "{name}" for "{label}" was dropped: {why}.':
    'Se descartó la respuesta de {hook} del paquete "{name}" para "{label}": {why}.',
  'The package "{name}" declares no action "{id}", so its code was not called.':
    'El paquete "{name}" no declara ninguna acción "{id}", así que su código no se llamó.',
  'The package "{name}" declares no importer "{id}", so its code was not called.':
    'El paquete "{name}" no declara ningún importador "{id}", así que su código no se llamó.',
  'The package "{name}" declares no exporter "{id}", so its code was not called.':
    'El paquete "{name}" no declara ningún exportador "{id}", así que su código no se llamó.',
  'The package "{name}" declares no panel "{id}", so its code was not called.':
    'El paquete "{name}" no declara ningún panel "{id}", así que su código no se llamó.',
  '"{fileName}" is over {n} characters, so the importer "{label}" of the package "{name}" did not read it.':
    '"{fileName}" pasa de {n} caracteres, así que el importador "{label}" del paquete "{name}" no lo leyó.',
  // M14.1: why the core drops what an action, an importer, an exporter or a panel answered.
  'it is not an object of commands': 'no es un objeto JSON de comandos',
  'it has "{key}"': 'tiene "{key}"',
  'its label is not a text': 'su etiqueta no es un texto',
  'its commands are not a list': 'sus comandos no son una lista',
  'it holds more than {n} commands': 'tiene más de {n} comandos',
  'a command has no type': 'un comando no tiene tipo',
  'package code never sends "{type}"': 'el código de un paquete nunca envía "{type}"',
  'it is not a text': 'no es un texto',
  'it is over {n} characters': 'pasa de {n} caracteres',
  'it is not a list of blocks': 'no es una lista de bloques',
  'it holds more than {n} blocks': 'tiene más de {n} bloques',
  'block {n} is not an object': 'el bloque {n} no es un objeto JSON',
  'block {n} has a text that is not one of at most {m} characters':
    'el bloque {n} tiene un texto de más de {m} caracteres, o que no es un texto',
  'block {n} is not a label and a text, number or true or false':
    'el bloque {n} no es una etiqueta con un texto, un número, o verdadero o falso',
  'block {n} has columns that are not 1 to {m} texts':
    'el bloque {n} tiene columnas que no son de 1 a {m} textos',
  'block {n} has rows that are not at most {m}, each a cell for each column':
    'el bloque {n} tiene filas que no son como máximo {m}, cada una con una celda por columna',
  'block {n} is a chart that is not "bar" or "line"':
    'el bloque {n} es un gráfico que no es "bar" ni "line"',
  'block {n} has labels that are not 1 to {m} texts':
    'el bloque {n} tiene etiquetas que no son de 1 a {m} textos',
  'block {n} has series that are not 1 to {m}, each a number for each label':
    'el bloque {n} tiene series que no son de 1 a {m}, cada una con un número por etiqueta',
  'block {n} is a button whose label is not 1 to {m} characters':
    'el bloque {n} es un botón cuya etiqueta no tiene de 1 a {m} caracteres',
  'block {n} is a button that runs no action the package declares':
    'el bloque {n} es un botón que no ejecuta ninguna acción que declare el paquete',
  'block {n} is not a heading, text, value, table, chart or button':
    'el bloque {n} no es un título, un texto, un valor, una tabla, un gráfico ni un botón',
  // Why an answer of package code was dropped, as the messages above hold it.
  'it is not plain data': 'no son datos simples',
  'it nests deeper than {n} levels': 'anida más de {n} niveles',
  'it is over {n} characters as JSON': 'pasa de {n} caracteres como JSON',
  'it has the key "__proto__"': 'tiene la clave "__proto__"',
  'it is not an object of attribute values': 'no es un objeto JSON de valores de atributos',
  '"{name}" is not a name a computed attribute may have':
    '"{name}" no es un nombre que pueda tener un atributo calculado',
  '"" is not a name a computed attribute may have':
    '"" no es un nombre que pueda tener un atributo calculado',
  'the value of "{name}" is not plain data': 'el valor de "{name}" no son datos simples',
  'the value of "{name}" is not plain data: {why}':
    'el valor de "{name}" no son datos simples: {why}',
  'the value of "{name}" is over {n} characters as JSON':
    'el valor de "{name}" pasa de {n} caracteres como JSON',
  'it computes more than {n} attributes': 'calcula más de {n} atributos',
  'it is not a list of problems': 'no es una lista de problemas',
  'problem {n} is not a message': 'el problema {n} no es un mensaje',
  'problem {n} is over {m} characters': 'el problema {n} pasa de {m} caracteres',
  'it answers more than {n} problems': 'responde más de {n} problemas',
  'it is not a drawing': 'no es un dibujo',
  'its box must be over 0 and at most {n} either way':
    'su caja debe medir más de 0 y como máximo {n} en cada sentido',
  'its items are not a list': 'sus partes no son una lista',
  'it holds more than {n} items': 'tiene más de {n} partes',
  'item {n} is not something a drawing holds': 'la parte {n} no es algo que un dibujo pueda tener',
  'item {n} has a color that is not written #RRGGBB':
    'la parte {n} tiene un color que no está escrito como #RRGGBB',
  'item {n} has a number out of range': 'la parte {n} tiene un número fuera de rango',
  'item {n} has the key "{key}", which a drawing item does not have':
    'la parte {n} tiene la clave "{key}", que una parte de un dibujo no tiene',
  'item {n} needs from 2 to {m} points': 'la parte {n} necesita de 2 a {m} puntos',
  'item {n} has a text over {m} characters': 'la parte {n} tiene un texto de más de {m} caracteres',
  'item {n} has a text that is not one line':
    'la parte {n} tiene un texto que no es una sola línea',
  'item {n} shows the image "{id}", which no package in use defines':
    'la parte {n} muestra la imagen "{id}", que ningún paquete en uso define',
  // What the schema says of a package's code, and what the program refuses of approvals.
  'must be one line, without a line break': 'debe ser una sola línea, sin saltos de línea',
  'must be "model:read", "time", or "network:" and one web origin, such as "network:https://status.example.com"':
    'debe ser "model:read", "time", o "network:" y un origen web, como "network:https://status.example.com"',
  '"codeApprovals" must be a list of approvals of package code.':
    '"codeApprovals" debe ser una lista de aprobaciones del código de paquetes.',
  'An approval of package code has a hash, a package and capabilities, and nothing else.':
    'Una aprobación del código de un paquete tiene un hash, un paquete y capacidades, y nada más.',
  'An approval of package code names its SHA-256 in 64 small hexadecimal digits.':
    'Una aprobación del código de un paquete nombra su SHA-256 en 64 dígitos hexadecimales en minúscula.',
  'An approval of package code names the package it was made in.':
    'Una aprobación del código de un paquete nombra el paquete en el que se hizo.',
  'An approval of package code lists the capabilities it grants.':
    'Una aprobación del código de un paquete enumera las capacidades que concede.',
  '"codeApprovals" approves {hash} twice.': '"codeApprovals" aprueba {hash} dos veces.',
  '"codeApprovals" holds {n} approvals, more than {m}.':
    '"codeApprovals" tiene {n} aprobaciones, más de {m}.',
  // The packages whose code this computer does not run, and reading a package file (ADR 0089).
  '"codeTurnedOff" must be a list of package ids.':
    '"codeTurnedOff" debe ser una lista de ids de paquetes.',
  '"codeTurnedOff" names {id} twice.': '"codeTurnedOff" nombra {id} dos veces.',
  '"codeTurnedOff" holds {n} packages, more than {m}.':
    '"codeTurnedOff" tiene {n} paquetes, más de {m}.',
  'Reading a package file names it, in 1 to 1000 characters.':
    'Leer un archivo de paquete requiere su nombre, de 1 a 1000 caracteres.',
  'Reading a package file needs its text, of at most 2 MiB.':
    'Leer un archivo de paquete requiere su texto, de 2 MiB como máximo.',
  'The package file Visual Anything read cannot be read.':
    'No se puede leer el archivo de paquete que leyó Visual Anything.',
  'The package file {why}.': 'El archivo del paquete {why}.',
  'In the package file, {path} {why}.': 'En el archivo del paquete, {path} {why}.',
  'And {n} more problems.': 'Y {n} problemas más.',
  'The package "{name}" holds solids, whose files a package file does not carry: add it from its project’s folder instead.':
    'El paquete "{name}" tiene sólidos, cuyos archivos no viajan en un archivo de paquete: agregarlo desde la carpeta de su proyecto.',
  'The package "{name}" holds conflicts from a merge: resolve them in its own project first.':
    'El paquete "{name}" tiene conflictos de una fusión: resolverlos antes en su propio proyecto.',
  // Drawing defaults (ADR 0086).
  'Set the drawing defaults of the project': 'Definir los valores de dibujo del proyecto',
  'Reset the drawing defaults of the project': 'Restablecer los valores de dibujo del proyecto',
  'Set the drawing defaults of "{view}"': 'Definir los valores de dibujo de "{view}"',
  'Reset the drawing defaults of "{view}"': 'Restablecer los valores de dibujo de "{view}"',
  // Overlays, their legend, and levels of detail (ADR 0055).
  'Set the overlays of "{view}"': 'Definir las superposiciones de "{view}"',
  'Remove the overlays of "{view}"': 'Quitar las superposiciones de "{view}"',
  'Add the overlay "{name}" to "{view}"': 'Agregar la superposición "{name}" a "{view}"',
  'Turn off the overlay "{name}" in "{view}"': 'Desactivar la superposición "{name}" en "{view}"',
  'Turn on the overlay "{name}" in "{view}"': 'Activar la superposición "{name}" en "{view}"',
  'Edit the overlay "{name}" in "{view}"': 'Editar la superposición "{name}" en "{view}"',
  'Remove the overlay "{name}" from "{view}"': 'Quitar la superposición "{name}" de "{view}"',
  'Remove {n} overlays from "{view}"': 'Quitar {n} superposiciones de "{view}"',
  'Move the overlay "{name}" in "{view}"': 'Mover la superposición "{name}" en "{view}"',
  'A view has at most {n} overlays.': 'Una vista tiene como máximo {n} superposiciones.',
  'The view "{view}" has no overlay "{id}".':
    'La vista "{view}" no tiene ninguna superposición "{id}".',
  'The view "{view}" already has an overlay "{id}".':
    'La vista "{view}" ya tiene una superposición "{id}".',
  'The changes to an overlay are an object.': 'Los cambios a una superposición son un objeto JSON.',
  'An overlay has no "{key}" to change.': 'Una superposición no tiene "{key}" para cambiar.',
  'No overlays were given to remove.': 'No se dio ninguna superposición para quitar.',
  'The overlay "{name}" is given twice.': 'La superposición "{name}" se da dos veces.',
  'An overlay cannot go before itself.': 'Una superposición no puede ir antes de sí misma.',
  'An overlay is an object with a channel.': 'Una superposición es un objeto JSON con un canal.',
  'An overlay holds id, name, of, attribute, channel, mapping and off, not "{key}".':
    'Una superposición tiene id, name, of, attribute, channel, mapping y off, no "{key}".',
  'An overlay names the attribute it reads.': 'Una superposición nombra el atributo que lee.',
  'The name of an overlay has 1 to 64 characters.':
    'El nombre de una superposición tiene de 1 a 64 caracteres.',
  'The overlay "{name}" reads the attributes of "elements" or of "relations".':
    'La superposición "{name}" lee los atributos de "elements" o de "relations".',
  'The overlay "{name}" sets "fill", "stroke", "size", "badge" or "opacity".':
    'La superposición "{name}" define "fill", "stroke", "size", "badge" u "opacity".',
  'A relation has no fill: the overlay "{name}" can color the stroke of relations instead.':
    'Una relación no tiene relleno: la superposición "{name}" puede colorear en cambio el trazo de las relaciones.',
  'Whether the overlay "{name}" is off is true or false.':
    'Si la superposición "{name}" está desactivada es verdadero o falso.',
  'The overlay "{name}" maps its attribute "discrete", "continuous" or "passthrough".':
    'La superposición "{name}" asigna su atributo "discrete", "continuous" o "passthrough".',
  'The overlay "{name}" writes badges, which take no range: map its values one by one, or write the value itself.':
    'La superposición "{name}" escribe insignias, que no admiten un rango: asignar sus valores uno por uno, o escribir el valor mismo.',
  'The mapping of the overlay "{name}" has no "{key}".':
    'La asignación de la superposición "{name}" no tiene "{key}".',
  'Only an overlay of "fill", "stroke" or "badge" takes the value itself; "{name}" sets "{channel}".':
    'Solo una superposición de "fill", "stroke" o "badge" toma el valor mismo; "{name}" define "{channel}".',
  'The overlay "{name}" maps 1 to {n} values one by one.':
    'La superposición "{name}" asigna de 1 a {n} valores uno por uno.',
  'A value the overlay "{name}" maps is an object.':
    'Un valor que asigna la superposición "{name}" es un objeto JSON.',
  'A value the overlay "{name}" maps has no "{key}".':
    'Un valor que asigna la superposición "{name}" no tiene "{key}".',
  'A value the overlay "{name}" maps is text, a number, or true or false.':
    'Un valor que asigna la superposición "{name}" es texto, un número, o verdadero o falso.',
  'The overlay "{name}" maps "{value}" twice.':
    'La superposición "{name}" asigna "{value}" dos veces.',
  'The overlay "{name}" maps a range through 2 to {n} stops.':
    'La superposición "{name}" asigna un rango con de 2 a {n} paradas.',
  'A stop of the overlay "{name}" is an object.':
    'Una parada de la superposición "{name}" es un objeto JSON.',
  'A stop of the overlay "{name}" has no "{key}".':
    'Una parada de la superposición "{name}" no tiene "{key}".',
  'A stop of the overlay "{name}" is at a number.':
    'Una parada de la superposición "{name}" está en un número.',
  'The stops of the overlay "{name}" go up: each at a number above the one before it.':
    'Las paradas de la superposición "{name}" van en aumento: cada una en un número mayor que la anterior.',
  'The overlay "{name}" colors with colors written as #RRGGBB, not {value}.':
    'La superposición "{name}" colorea con colores escritos como #RRGGBB, no {value}.',
  'The overlay "{name}" sizes by a factor from 0.5 to 2.':
    'La superposición "{name}" cambia el tamaño por un factor de 0,5 a 2.',
  'The overlay "{name}" fades to an opacity from 0.1 to 1.':
    'La superposición "{name}" atenúa hasta una opacidad de 0,1 a 1.',
  'The overlay "{name}" writes badges of 1 to 12 characters.':
    'La superposición "{name}" escribe insignias de 1 a 12 caracteres.',
  'What the legend of "{name}" says for a value has 1 to 64 characters.':
    'Lo que dice la leyenda de "{name}" para un valor tiene de 1 a 64 caracteres.',
  'No element has "{attribute}", which the overlay "{name}" reads: it changes nothing yet.':
    'Ningún elemento tiene "{attribute}", que lee la superposición "{name}": todavía no cambia nada.',
  'No relation has "{attribute}", which the overlay "{name}" reads: it changes nothing yet.':
    'Ninguna relación tiene "{attribute}", que lee la superposición "{name}": todavía no cambia nada.',
  'the overlay "{name}" of the view "{view}"': 'la superposición "{name}" de la vista "{view}"',
  'The overlay "{name}" of the view "{view}"': 'La superposición "{name}" de la vista "{view}"',
  'More than one overlay in the view "{view}" has the id "{key}".':
    'Más de una superposición de la vista "{view}" tiene el id "{key}".',
  '{Of} fills relations, which have no fill; it changes nothing.':
    '{Of} rellena relaciones, que no tienen relleno; no cambia nada.',
  'The stops of {of} do not go up; they are read in order of where they are.':
    'Las paradas de {of} no van en aumento; se leen en el orden de dónde están.',
  '{Of} maps "{value}" twice; the first is used.':
    '{Of} asigna "{value}" dos veces; se usa el primero.',
  '{Of} reads "{attribute}", which no element has; it changes nothing.':
    '{Of} lee "{attribute}", que ningún elemento tiene; no cambia nada.',
  '{Of} reads "{attribute}", which no relation has; it changes nothing.':
    '{Of} lee "{attribute}", que ninguna relación tiene; no cambia nada.',
  '"{label}" of "{overlay}" is {n}:1 against the light canvas, under 3:1.':
    '"{label}" de "{overlay}" tiene {n}:1 contra el lienzo claro, menos de 3:1.',
  '"{label}" of "{overlay}" is {n}:1 against the dark canvas, under 3:1.':
    '"{label}" de "{overlay}" tiene {n}:1 contra el lienzo oscuro, menos de 3:1.',
  'Any other value of "{overlay}" is {n}:1 against the light canvas, under 3:1.':
    'Cualquier otro valor de "{overlay}" tiene {n}:1 contra el lienzo claro, menos de 3:1.',
  'Any other value of "{overlay}" is {n}:1 against the dark canvas, under 3:1.':
    'Cualquier otro valor de "{overlay}" tiene {n}:1 contra el lienzo oscuro, menos de 3:1.',
  '"{label}" and "{other}" of "{overlay}" differ by {n}, under {least}: hard to tell apart.':
    '"{label}" y "{other}" de "{overlay}" difieren en {n}, menos de {least}: cuesta distinguirlos.',
  '"{label}" and any other value of "{overlay}" differ by {n}, under {least}: hard to tell apart.':
    '"{label}" y cualquier otro valor de "{overlay}" difieren en {n}, menos de {least}: cuesta distinguirlos.',
  '…and {n} more warnings about the colors of "{overlay}".':
    '…y {n} advertencias más sobre los colores de "{overlay}".',
  'The levels of {of} must be a list.': 'Los niveles de {of} deben ser una lista.',
  '{Of} declares at most {n} levels.': '{Of} declara como máximo {n} niveles.',
  'A level of {of} must be an object.': 'Un nivel de {of} debe ser un objeto JSON.',
  'A level of {of} has no "{key}".': 'Un nivel de {of} no tiene "{key}".',
  'A level of {of} starts at a scale from 0 to {n}.':
    'Un nivel de {of} empieza en una escala de 0 a {n}.',
  'Two levels of {of} start at {n}.': 'Dos niveles de {of} empiezan en {n}.',
  'The level at {n} of {of} shows a silhouette, or some of the name, the detail, the contents, the image and the face.':
    'El nivel en {n} de {of} muestra una silueta, o algo del nombre, el detalle, el contenido, la imagen y la cara.',
  "The level at {n} of {of} names a face's variant by its id.":
    'El nivel en {n} de {of} nombra una variante de la cara por su id.',
  "The level at {n} of {of} names a face's variant but does not show the face.":
    'El nivel en {n} de {of} nombra una variante de la cara pero no muestra la cara.',
  'The level at {n} of {of} shows "{part}" twice.':
    'El nivel en {n} de {of} muestra "{part}" dos veces.',
  'The level at {n} of {of} shows a silhouette only, with nothing else.':
    'El nivel en {n} de {of} muestra solo una silueta, sin nada más.',
  '{Of} expands from a scale above 0 and at most {n}.':
    '{Of} se expande desde una escala mayor que 0 y de {n} como máximo.',
  'Two levels of {of} start at {n}; the last is used.':
    'Dos niveles de {of} empiezan en {n}; se usa el último.',
  'The level at {n} of {of} shows a silhouette only, and nothing else it lists.':
    'El nivel en {n} de {of} muestra solo una silueta, y nada más de lo que enumera.',
  // External identifiers, destinations and the element list (M8, ADR 0056): the core's refusals,
  // labels and warnings, the import's notes, the local program's answers and the schema's words.
  'The external identifiers of {of} are by scheme, a short lowercase name such as "uberon"; "{scheme}" is not one.':
    'Los identificadores externos de {of} van por catálogo, un nombre corto en minúsculas como "uberon"; "{scheme}" no lo es.',
  'The {scheme} identifier of {of} must be text of 1 to {n} characters, without line breaks.':
    'El identificador de {scheme} de {of} debe ser un texto de 1 a {n} caracteres, sin saltos de línea.',
  'Something holds identifiers in at most {n} schemes, not {m}.':
    'Algo tiene identificadores de como máximo {n} catálogos, no {m}.',
  'The external identifiers of {of} must be an object of identifiers by scheme, such as { "uberon": "UBERON:0002135" }.':
    'Los identificadores externos de {of} deben ser un objeto JSON de identificadores por catálogo, como { "uberon": "UBERON:0002135" }.',
  'The changes to the external identifiers of {of} must be an object of identifiers, or null, by scheme.':
    'Los cambios a los identificadores externos de {of} deben ser un objeto JSON de identificadores, o null, por catálogo.',
  '{names} have the same {scheme} identifier, "{identifier}".':
    '{names} tienen el mismo identificador de {scheme}, "{identifier}".',
  '…and {rest} more identifiers are shared by several elements.':
    '…y otros {rest} identificadores los comparten varios elementos.',
  'Change the external identifiers of "{name}"': 'Cambiar los identificadores externos de "{name}"',
  'Change the external identifiers of the component "{name}"':
    'Cambiar los identificadores externos del componente "{name}"',
  'Change the external identifiers of the relation type "{name}"':
    'Cambiar los identificadores externos del tipo de relación "{name}"',
  'A destination is an object: { "view": … }, { "project": … } or { "url": … }.':
    'Un destino es un objeto JSON: { "view": … }, { "project": … } o { "url": … }.',
  'A destination opens one thing: a view, with "view"; another project, with "project"; or a web address, with "url".':
    'Un destino abre una sola cosa: una vista, con "view"; otro proyecto, con "project"; o una dirección web, con "url".',
  'A web address has no "{key}".': 'Una dirección web no tiene "{key}".',
  'A destination to a project has no "{key}".': 'Un destino a un proyecto no tiene "{key}".',
  'A destination to a view has no "{key}".': 'Un destino a una vista no tiene "{key}".',
  'The project of a destination is a path, as text.':
    'El proyecto de un destino es la ubicación de su carpeta, como texto.',
  'The view of a destination is named by its id.': 'La vista de un destino se nombra por su id.',
  'What a destination focuses on is a list of 1 to {n} different element ids.':
    'En lo que se enfoca un destino es una lista de 1 a {n} ids de elementos distintos.',
  'A web address is text.': 'Una dirección web es un texto.',
  'Only web addresses that start with https:// open; file:, javascript: and other schemes never do.':
    'Solo se abren las direcciones web que empiezan con https://; file:, javascript: y cualquier otro prefijo nunca se abren.',
  'A web address holds at most {n} characters.':
    'Una dirección web tiene como máximo {n} caracteres.',
  'A web address holds no spaces, line breaks or backslashes.':
    'Una dirección web no tiene espacios, saltos de línea ni barras invertidas.',
  'A web address with a user name or a password never opens.':
    'Una dirección web con un nombre de usuario o una contraseña nunca se abre.',
  '"{authority}" is not the host of a web address.':
    '"{authority}" no es el sitio de una dirección web.',
  '{port} is not a port: ports go up to 65535.':
    '{port} no es un puerto: los puertos llegan hasta 65535.',
  'A path to a project has 1 to {n} characters.':
    'La ubicación de un proyecto tiene de 1 a {n} caracteres.',
  'A path to a project holds no control characters.':
    'La ubicación de un proyecto no tiene caracteres de control.',
  'A path to a project is written with /, not \\.':
    'La ubicación de un proyecto se escribe con /, no con \\.',
  'A path to a project is relative to this project’s folder, as ../billing is.':
    'La ubicación de un proyecto es relativa a la carpeta de este proyecto, como ../billing.',
  'A path to a project never leads out of the folder that holds this project’s folder.':
    'La ubicación de un proyecto nunca sale de la carpeta que contiene la carpeta de este proyecto.',
  '"{name}" of {of} holds a destination, and this is not one: {why}':
    '"{name}" de {of} contiene un destino, y esto no lo es: {why}',
  'The default of "{name}" of {of} must be a destination: a view, another project or an https: address.':
    'El valor predeterminado de "{name}" de {of} debe ser un destino: una vista, otro proyecto o una dirección https:.',
  'The destination "{name}" of {of} is not one, so it never opens: {why}':
    'El destino "{name}" de {of} no es un destino, así que nunca se abre: {why}',
  'The destination "{name}" of {of} opens the view "{view}", which the project does not have; it is kept, and opens nothing until that view is back.':
    'El destino "{name}" de {of} abre la vista "{view}", que el proyecto no tiene; se conserva, y no abre nada hasta que esa vista vuelva.',
  'The destination "{name}" of {of} focuses on "{ids}", which the model does not have; the view opens without it.':
    'El destino "{name}" de {of} se enfoca en "{ids}", que el modelo no tiene; la vista se abre sin él.',
  'The destination "{name}" of {of} focuses on "{ids}", which the model does not have; the view opens without them.':
    'El destino "{name}" de {of} se enfoca en "{ids}", que el modelo no tiene; la vista se abre sin ellos.',
  '…and {rest} more destinations open nothing.': '…y otros {rest} destinos no abren nada.',
  'Its identifiers are not given by scheme, so it is imported without them.':
    'Sus identificadores no vienen por catálogo, así que se importa sin ellos.',
  '"{scheme}" is not a scheme of identifiers, so it is imported without that one.':
    '"{scheme}" no es un catálogo de identificadores, así que se importa sin ese.',
  'Its {scheme} identifier is not one, so it is imported without it.':
    'Su identificador de {scheme} no lo es, así que se importa sin él.',
  'Its {scheme} identifier is past {n} schemes, so it is imported without it.':
    'Su identificador de {scheme} pasa de {n} catálogos, así que se importa sin él.',
  'Its {scheme} identifier "{identifier}" is the identifier of {count} elements, {names}, so it is imported as a new element.':
    'Su identificador de {scheme} "{identifier}" es el de {count} elementos, {names}, así que se importa como un elemento nuevo.',
  'Its {scheme} identifier "{identifier}" is that of "{name}", which a row before it updates already, so it is imported as a new element.':
    'Su identificador de {scheme} "{identifier}" es el de "{name}", que ya actualiza una fila anterior, así que se importa como un elemento nuevo.',
  'The folder holding this project cannot be read ({reason}).':
    'No se puede leer la carpeta que contiene este proyecto ({reason}).',
  'There is no folder {folder} for this destination to open.':
    'No hay ninguna carpeta {folder} que este destino pueda abrir.',
  '{folder} leads, through a link, out of the folder that holds this project, so it does not open.':
    '{folder} sale, a través de un enlace simbólico, de la carpeta que contiene este proyecto, así que no se abre.',
  '{folder} is not a folder, so it holds no project.':
    '{folder} no es una carpeta, así que no contiene ningún proyecto.',
  '{folder} holds no project: it has no .vaproject file.':
    '{folder} no contiene ningún proyecto: no tiene ningún archivo .vaproject.',
  '{folder} cannot be read ({reason}).': 'No se puede leer {folder} ({reason}).',
  '"{project}" is not a path to a project.': '"{project}" no es la ubicación de un proyecto.',
  'This Visual Anything keeps no runtime folder, so it cannot reach the program of another project.':
    'Este Visual Anything no tiene carpeta de ejecución, así que no puede llegar al programa de otro proyecto.',
  '"{name}" cannot open there: {why}': '"{name}" no se puede abrir allí: {why}',
  'A destination opens the project in {project}, but {folder} holds no project; it is kept, and opens nothing until a project is there.':
    'Un destino abre el proyecto de {project}, pero {folder} no contiene ningún proyecto; se conserva, y no abre nada hasta que haya un proyecto allí.',
  'This Visual Anything cannot open another project.':
    'Este Visual Anything no puede abrir otro proyecto.',
  'The project could not be opened: {why}': 'No se pudo abrir el proyecto: {why}',
  'must be an identifier without line breaks or other control characters':
    'debe ser un identificador sin saltos de línea ni otros caracteres de control',
  'must have schemes as its keys, short lowercase names such as "uberon", and "{key}" is not one':
    'debe tener catálogos como claves, nombres cortos en minúsculas como "uberon", y "{key}" no lo es',
  'must have identifiers as its keys, and "{key}" is not one':
    'debe tener identificadores como claves, y "{key}" no lo es',
  'Paste 1 cell into the element list': 'Pegar 1 celda en la lista de elementos',
  'Paste {n} cells into the element list': 'Pegar {n} celdas en la lista de elementos',
  // Live values (ADR 0057, ADR 0063): keeping one as an attribute, and what the local program says
  // of live values and of what it fetches for package code.
  'Keep the live value of “{attribute}” as an attribute':
    'Conservar el valor en vivo de “{attribute}” como atributo',
  'Live values from Claude come faster than Visual Anything takes them: it takes twenty messages a second and a thousand values a message, and drops the oldest past that.':
    'Los valores en vivo de Claude llegan más rápido de lo que Visual Anything los toma: toma veinte mensajes por segundo y mil valores por mensaje, y descarta los más viejos a partir de ahí.',
  'Live values from the command line come faster than Visual Anything takes them: it takes twenty messages a second and a thousand values a message, and drops the oldest past that.':
    'Los valores en vivo de la línea de comandos llegan más rápido de lo que Visual Anything los toma: toma veinte mensajes por segundo y mil valores por mensaje, y descarta los más viejos a partir de ahí.',
  'Live values from the code of “{name}” come faster than Visual Anything takes them: it takes twenty messages a second and a thousand values a message, and drops the oldest past that.':
    'Los valores en vivo del código de “{name}” llegan más rápido de lo que Visual Anything los toma: toma veinte mensajes por segundo y mil valores por mensaje, y descarta los más viejos a partir de ahí.',
  'Visual Anything keeps at most 100,000 live values, so it drops the oldest to make room for newer ones.':
    'Visual Anything guarda como mucho 100.000 valores en vivo, así que descarta los más viejos para dejar lugar a los más nuevos.',
  'The package "{id}" holds no code.': 'El paquete "{id}" no tiene código.',
  'The code of “{name}” is not approved as it is now, so it reaches nothing.':
    'El código de “{name}” no está aprobado tal como está ahora, así que no llega a nada.',
  'The code of “{name}” is granted no origin, so it fetches nothing and sends no live values.':
    'Al código de “{name}” no se le concede ningún origen, así que no obtiene nada ni envía valores en vivo.',
  'The code of “{name}” may not fetch {url}: it {why}.':
    'El código de “{name}” no puede obtener {url}: {why}.',
  'The code of “{name}” has {n} fetches under way already, so {url} waits for its next turn.':
    'El código de “{name}” ya tiene {n} pedidos en curso, así que {url} espera su próximo turno.',
  'Fetching {url} for “{name}” failed: {why}.': 'No se pudo obtener {url} para “{name}”: {why}.',
  'is not on an origin granted: {origin}': 'no está en un origen concedido: {origin}',
  'is not a web address': 'no es una dirección web',
  'is not an http or https address': 'no es una dirección http ni https',
  'holds a user name or a password': 'tiene un nombre de usuario o una contraseña',
  'is longer than {n} characters': 'tiene más de {n} caracteres',
  'is not https, which an address on the internet must be':
    'no es https, que es lo que tiene que ser una dirección de internet',
  'is not https, which an address by name must be: only an address of this computer or of your network, granted as it is written, may use http':
    'no es https, que es lo que tiene que ser una dirección por nombre: solo una dirección de esta computadora o de la red, concedida tal como está escrita, puede usar http',
  'leads to Visual Anything itself, which package code never reaches':
    'lleva al propio Visual Anything, al que el código de un paquete nunca llega',
  'leads to {address}, an address of no one, which nothing fetches from':
    'lleva a {address}, una dirección de nadie, de la que no se obtiene nada',
  'leads to {address}, a link-local address, such as the cloud metadata one, which nothing fetches from':
    'lleva a {address}, una dirección de autoconfiguración local, como la de los metadatos de la nube, de la que no se obtiene nada',
  'leads to {address}, a multicast address, which nothing fetches from':
    'lleva a {address}, una dirección de multidifusión, de la que no se obtiene nada',
  'leads to {address}, an address the internet does not route, which nothing fetches from':
    'lleva a {address}, una dirección que internet no enruta, de la que no se obtiene nada',
  'leads, by its name {host}, to {address}, an address of this computer, which a name never reaches; grant that address itself if that is where it should go':
    'lleva, por su nombre {host}, a {address}, una dirección de esta computadora, a la que un nombre nunca llega; conceder esa misma dirección si es ahí adonde tiene que ir',
  'leads, by its name {host}, to {address}, an address of your network, which a name never reaches; grant that address itself if that is where it should go':
    'lleva, por su nombre {host}, a {address}, una dirección de la red, a la que un nombre nunca llega; conceder esa misma dirección si es ahí adonde tiene que ir',
  'leads, by its name {host}, to {address}, an address of no one, which a name never reaches; grant that address itself if that is where it should go':
    'lleva, por su nombre {host}, a {address}, una dirección de nadie, a la que un nombre nunca llega; conceder esa misma dirección si es ahí adonde tiene que ir',
  'leads, by its name {host}, to {address}, a link-local address, such as the cloud metadata one, which a name never reaches; grant that address itself if that is where it should go':
    'lleva, por su nombre {host}, a {address}, una dirección de autoconfiguración local, como la de los metadatos de la nube, a la que un nombre nunca llega; conceder esa misma dirección si es ahí adonde tiene que ir',
  'leads, by its name {host}, to {address}, a multicast address, which a name never reaches; grant that address itself if that is where it should go':
    'lleva, por su nombre {host}, a {address}, una dirección de multidifusión, a la que un nombre nunca llega; conceder esa misma dirección si es ahí adonde tiene que ir',
  'leads, by its name {host}, to {address}, an address the internet does not route, which a name never reaches; grant that address itself if that is where it should go':
    'lleva, por su nombre {host}, a {address}, una dirección que internet no enruta, a la que un nombre nunca llega; conceder esa misma dirección si es ahí adonde tiene que ir',
  'it did not answer within {n} seconds': 'no respondió en {n} segundos',
  'it did not answer within {n} second': 'no respondió en {n} segundo',
  'it could not be reached': 'no se pudo llegar a él',
  'it answered with no HTTP status': 'respondió sin un estado HTTP',
  'it answered with more than {n} KiB': 'respondió con más de {n} KiB',
  'its answer broke off': 'su respuesta se cortó',
  'its name, {host}, does not resolve': 'su nombre, {host}, no se resuelve',

  // Threads of comments (ADR 0059): what a thread is about, the history's labels, and why the core
  // refuses a comment.
  'the view "{name}"': 'la vista "{name}"',
  'a point of the view "{name}"': 'un punto de la vista "{name}"',
  'Comment on {of}': 'Comentar {of}',
  'Reply to the thread on {of}': 'Responder al hilo sobre {of}',
  'Edit a comment on {of}': 'Editar un comentario sobre {of}',
  'Resolve the thread on {of}': 'Resolver el hilo sobre {of}',
  'Reopen the thread on {of}': 'Reabrir el hilo sobre {of}',
  'Delete the thread on {of}': 'Eliminar el hilo sobre {of}',
  'A new thread needs its anchor and its first comment.':
    'Un hilo nuevo necesita decir de qué trata y tener su primer comentario.',
  'The thread holds {n} comments, as many as one holds: start another.':
    'El hilo tiene {n} comentarios, todos los que puede tener: empezar otro.',
  'The thread would hold more than 200,000 characters of comments, as many as one holds: start another thread.':
    'El hilo tendría más de 200.000 caracteres de comentarios, todos los que puede tener: empezar otro hilo.',
  'The thread would hold more than 200,000 characters of comments, as many as one holds: write a shorter comment, or put the rest in another thread.':
    'El hilo tendría más de 200.000 caracteres de comentarios, todos los que puede tener: escribir un comentario más corto, o poner el resto en otro hilo.',
  'The thread "{thread}" has no comment "{comment}".':
    'El hilo "{thread}" no tiene ningún comentario "{comment}".',
  'Claude edits only its own comments.': 'Claude edita solo sus propios comentarios.',
  'Only the person who wrote a comment edits it.':
    'Solo quien escribió un comentario puede editarlo.',
  'Say whether the thread is resolved: true or false.':
    'Indicar si el hilo está resuelto: true o false.',
  'There is no thread "{id}".': 'No hay ningún hilo "{id}".',
  'A thread needs an anchor: an element, a relation, a view or a point.':
    'Un hilo necesita tratar sobre algo: un elemento, una relación, una vista o un punto.',
  'A thread cannot be about World: comment on a view instead.':
    'Un hilo no puede tratar sobre Mundo: comentar una vista en su lugar.',
  'The x of a point must be a number.': 'La x de un punto debe ser un número.',
  'The y of a point must be a number.': 'La y de un punto debe ser un número.',
  'The x of a point must be from -10,000,000 to 10,000,000.':
    'La x de un punto debe estar entre -10.000.000 y 10.000.000.',
  'The y of a point must be from -10,000,000 to 10,000,000.':
    'La y de un punto debe estar entre -10.000.000 y 10.000.000.',
  '"{kind}" is not an anchor: a thread is about an element, a relation, a view or a point.':
    '"{kind}" no es algo sobre lo que pueda tratar un hilo: un hilo trata sobre un elemento, una relación, una vista o un punto.',
  'A comment is signed by whoever sends it, and the program did not say who sends this one.':
    'Un comentario lo firma quien lo envía, y el programa no dijo quién envía este.',
  'Claude’s comments are signed as Claude: they never name a person.':
    'Los comentarios de Claude se firman como Claude: nunca nombran a una persona.',
  'The clock gives a time a comment cannot keep.':
    'El reloj da una hora que un comentario no puede guardar.',
  'The comment mentions "{id}", which is no element or relation of the model.':
    'El comentario menciona "{id}", que no es ningún elemento ni relación del modelo.',
  'A comment needs some text.': 'Un comentario necesita algo de texto.',
  'A comment holds at most 20,000 characters.':
    'Un comentario tiene como máximo 20.000 caracteres.',
  'A comment is plain text: it holds no control characters.':
    'Un comentario es texto simple: no tiene caracteres de control.',
  'A comment needs the name of who writes it: set it in your preferences.':
    'Un comentario necesita el nombre de quien lo escribe: indicarlo en las preferencias.',
  'Only Claude signs as Claude.': 'Solo Claude firma como Claude.',
  'An author’s name holds at most 200 characters.':
    'El nombre de un autor tiene como máximo 200 caracteres.',
  'An author’s email must be text.': 'El correo electrónico de un autor debe ser texto.',
  '"{address}" is not an email address.': '"{address}" no es una dirección de correo electrónico.',
  'More than one thread has the id "{id}".': 'Más de un hilo tiene el id "{id}".',
  'More than one comment in the thread "{thread}" has the id "{id}".':
    'Más de un comentario del hilo "{thread}" tiene el id "{id}".',
  // W43, from the review of L1, A1 and A2. The labels of colors changed and taken back, and the
  // project appearances that have no effect (ADR 0034, ADR 0035).
  'Change the colors of a note in "{view}"': 'Cambiar los colores de una nota en "{view}"',
  'Reset the colors of a note in "{view}"': 'Restablecer los colores de una nota en "{view}"',
  'Change the color of an arrow in "{view}"': 'Cambiar el color de una flecha en "{view}"',
  'Reset the color of an arrow in "{view}"': 'Restablecer el color de una flecha en "{view}"',
  'Reset the appearance of {of}': 'Restablecer la apariencia de {of}',
  'Forget the appearance given to "{id}"': 'Olvidar la apariencia dada a "{id}"',
  'The project gives "{name}" an appearance, but no package in use defines it; it is ignored.':
    'El proyecto le da una apariencia a "{name}", pero ningún paquete en uso lo define; se ignora.',
  'The project gives "{name}" an appearance, but it belongs to the project’s package "{package}"; set it there. This entry is ignored.':
    'El proyecto le da una apariencia a "{name}", pero pertenece al paquete propio "{package}"; definirla allí. Esta entrada se ignora.',
  // W43: ids a project's files hold twice, as it opens.
  'More than one package has the id "{key}".': 'Más de un paquete tiene el id "{key}".',
  'More than one view has the id "{key}".': 'Más de una vista tiene el id "{key}".',
  'More than one scenario has the id "{key}".': 'Más de un escenario tiene el id "{key}".',
  // W43: why the core's cleaner refuses a picture past what it keeps, as the image picker and the
  // problems of a project say it.
  'The SVG text is over {n} KiB.': 'El texto SVG pasa de {n} KiB.',
  'The cleaned SVG text is over {n} KiB.': 'El texto SVG ya limpio pasa de {n} KiB.',
  'The SVG text has over {n} elements.': 'El texto SVG tiene más de {n} elementos.',
  'The SVG text has over {n} namespace declarations.':
    'El texto SVG tiene más de {n} declaraciones de espacios de nombres.',
  'The SVG text nests elements over {n} deep.':
    'El texto SVG anida elementos a más de {n} niveles.',
  'The SVG text has over {n} style rules.': 'El texto SVG tiene más de {n} reglas de estilo.',
  'A style rule has over {n} selectors.': 'Una regla de estilo tiene más de {n} selectores.',
  "The SVG text's style rules hold over {n} declarations, counted once per selector.":
    'Las reglas de estilo del texto SVG tienen más de {n} declaraciones, contadas una vez por selector.',
  'The SVG picture has over {n} elements to draw.':
    'La imagen SVG tiene más de {n} elementos para dibujar.',
  'The SVG picture’s style rules match too many of its elements to fold them in.':
    'Las reglas de estilo de la imagen SVG coinciden con demasiados de sus elementos como para incorporarlas.',
  'The SVG picture nests elements over {n} deep.':
    'La imagen SVG anida elementos a más de {n} niveles.',
  'A use element refers to a part that holds a use element.':
    'Un elemento use remite a una parte que tiene otro elemento use.',
  'A gradient has over {n} stops.': 'Un degradado tiene más de {n} paradas.',
  'A clip path or mask holds another.': 'Un trazado de recorte o una máscara contiene otro.',
  'A clip path or mask refers to another.': 'Un trazado de recorte o una máscara remite a otro.',
  'The SVG picture has over {n} use elements.': 'La imagen SVG tiene más de {n} elementos use.',
  'The SVG picture has over {n} gradients.': 'La imagen SVG tiene más de {n} degradados.',
  'The SVG picture has over {n} clip paths and masks.':
    'La imagen SVG tiene más de {n} trazados de recorte y máscaras.',
  'The SVG picture has over {n} path commands.':
    'La imagen SVG tiene más de {n} comandos de trazado.',
  'The SVG picture would cost too much to draw: it has too many masks, clips, transparent groups or elements.':
    'Dibujar la imagen SVG costaría demasiado: tiene demasiadas máscaras, recortes, elementos g transparentes u otros elementos.',
  'The picture is over {n} KiB.': 'La imagen pasa de {n} KiB.',
  'The picture is {width} × {height} pixels; at most {side} a side and {pixels} in all are kept.':
    'La imagen mide {width} × {height} píxeles; se admiten como máximo {side} por lado y {pixels} en total.',
  'The JPEG picture has over {n} scans.': 'La imagen JPEG tiene más de {n} barridos.',
  // W43: why the live connection cannot read a message, as the "unreadable" screen shows it for one
  // from the local program and a refusal for one the app sent (protocol.ts, live/messages.ts).
  'The message is not JSON.': 'El mensaje no es JSON.',
  'The message is not a JSON object.': 'El mensaje no es un objeto JSON.',
  'The message is not text.': 'El mensaje no es texto.',
  'Unknown message type: {type}.': 'Tipo de mensaje desconocido: {type}.',
  'Protocol version {version} is not {n}.': 'La versión {version} del protocolo no es la {n}.',
  'The message has no project.': 'El mensaje no tiene ningún proyecto.',
  'The session token is text.': 'El token de la sesión es texto.',
  'The message has no operations.': 'El mensaje no tiene operaciones.',
  'The message has no preferences.': 'El mensaje no tiene preferencias.',
  'The message names the request and the project that opened.':
    'El mensaje nombra el pedido y el proyecto que se abrió.',
  'The folder is named by text.': 'La carpeta se nombra con un texto.',
  'The message has no samples.': 'El mensaje no tiene proyectos de muestra.',
  'A sample has an id and a name.': 'Un proyecto de muestra tiene un id y un nombre.',
  'Guidance is an object.': 'Una guía es un objeto JSON.',
  'The view of guidance must be an id.': 'La vista de una guía debe ser un id.',
  'Guidance needs a list of one or more targets.':
    'Una guía necesita una lista de uno o más ids a los que apuntar.',
  'Guidance names at most {n} targets.': 'Una guía apunta como máximo a {n} ids.',
  'Every target of guidance must be an id.':
    'Todo aquello a lo que apunta una guía debe ser un id.',
  'Pan to needs a target id.': 'Llevar el lienzo hasta algo necesita su id.',
  'A caption needs its text.': 'Un rótulo necesita su texto.',
  'A caption holds at most {n} characters.': 'Un rótulo tiene como máximo {n} caracteres.',
  'Unknown kind of guidance: {kind}.': 'Tipo de guía desconocido: {kind}.',
  'Filters are an object.': 'Los filtros son un objeto JSON.',
  'The components of filters are a list of ids.':
    'Los componentes de los filtros son una lista de ids.',
  'The relation types of filters are a list of ids.':
    'Los tipos de relación de los filtros son una lista de ids.',
  'Filters name at most {n} components.': 'Los filtros nombran como máximo {n} componentes.',
  'Filters name at most {n} relation types.':
    'Los filtros nombran como máximo {n} tipos de relación.',
  'The conditions of filters are a list.': 'Las condiciones de los filtros son una lista.',
  'A condition of filters is an object.': 'Una condición de los filtros es un objeto JSON.',
  'A condition is on elements or on relations.':
    'Una condición es sobre elementos o sobre relaciones.',
  'A condition that tests with "{test}" needs a value, as text.':
    'Una condición que prueba con "{test}" necesita un valor, como texto.',
  'Focus reaches 1 to {n} degrees, or "all".': 'El foco alcanza de 1 a {n} grados, o "all".',
  'Focus goes one of these ways: {ways}.': 'El foco va en una de estas direcciones: {ways}.',
  'Whether focus isolates is a boolean.': 'Si el foco aísla es un valor booleano.',
  'Playback names its scenario by id.': 'La reproducción nombra su escenario por su id.',
  'Playback does one of: {actions}.': 'La reproducción hace una de estas cosas: {actions}.',
  'Going to a step needs the index of the step, from 0.':
    'Ir a un paso necesita el índice del paso, desde 0.',
  'The actions of the history are a list.': 'Las acciones del historial son una lista.',
  'An action of the history is an object.': 'Una acción del historial es un objeto JSON.',
  'An action of the history has a whole id from 1.':
    'Una acción del historial tiene un id entero desde 1.',
  'Two actions of the history have the id {n}.': 'Dos acciones del historial tienen el id {n}.',
  'An action of the history has a label.': 'Una acción del historial tiene una etiqueta.',
  'An action of the history is the person’s or Claude’s.':
    'Una acción del historial es de la persona o de Claude.',
  'An action of the history has the time it was done.':
    'Una acción del historial tiene el momento en que se hizo.',
  'An action of the history says whether it is undone.':
    'Una acción del historial dice si está deshecha.',
  'The message has no valid request id.': 'El mensaje no tiene un id de pedido válido.',
  'The answer has no valid request id.': 'La respuesta no tiene un id de pedido válido.',
  // Solids over the live connection (ADR 0075).
  'The request has no valid id.': 'El pedido no tiene un id válido.',
  'A solid file is asked for by its SHA-256, in lowercase hexadecimal.':
    'Un archivo de sólido se pide por su SHA-256, en hexadecimal en minúscula.',
  'solid/get holds only its id and a hash.': 'solid/get tiene solo su id y un resumen.',
  'solid/piece holds nothing else.': 'solid/piece no tiene nada más.',
  'solid/prepare holds only its id, the file name, a piece and options.':
    'solid/prepare tiene solo su id, el nombre del archivo, un trozo y opciones.',
  'A piece is its index, the count of pieces and its data.':
    'Un trozo es su índice, la cantidad de trozos y sus datos.',
  'A piece holds nothing else.': 'Un trozo no tiene nada más.',
  'A file comes in 1 to {n} pieces.': 'Un archivo llega en 1 a {n} trozos.',
  "A piece's index is within its count.": 'El índice de un trozo está dentro de su cantidad.',
  'A piece is base64 of at most {n} bytes.': 'Un trozo es base64 de como máximo {n} bytes.',
  'A piece names its file by its hash.': 'Un trozo nombra su archivo por su resumen.',
  "A file's name is its own name, without a folder.":
    'El nombre de un archivo es su propio nombre, sin carpeta.',
  'Options come with the first piece only.': 'Las opciones llegan solo con el primer trozo.',
  'Options are units, up and simplify.': 'Las opciones son units, up y simplify.',
  'Options are units, up, simplify and keep.': 'Las opciones son units, up, simplify y keep.',
  'Keep is the hash a solid’s file is named by.':
    'Keep es el resumen por el que se nombra el archivo de un sólido.',
  'A solid kept from another project is taken as it is, without other options.':
    'Un sólido que se conserva de otro proyecto se toma tal como está, sin otras opciones.',
  'The solid file "solids/{hash}.glb" is over {n} bytes, the most a cleaned file holds.':
    'El archivo de sólido "solids/{hash}.glb" pasa de {n} bytes, lo máximo que tiene un archivo limpio.',
  '"solids/{hash}.glb" was refused.': 'Se rechazó "solids/{hash}.glb".',
  'Visual Anything cannot copy solid files here: open the project through it.':
    'Visual Anything no puede copiar archivos de sólidos aquí: abrir el proyecto con él.',
  'Units are m, cm, mm or in.': 'Las unidades son m, cm, mm o in.',
  'Up is y or z.': 'El eje hacia arriba es y o z.',
  'Simplify is true or false.': 'Simplificar es true o false.',
  'A refusal says its code and why.': 'Un rechazo dice su código y por qué.',
  'A prepared file names itself by its hash.': 'Un archivo preparado se nombra por su resumen.',
  "A prepared file's size is within the cap.":
    'El tamaño de un archivo preparado está dentro del límite.',
  'A prepared file says its bounds and counts.':
    'Un archivo preparado dice sus límites y sus cantidades.',
  'A prepared file lists its parts.': 'Un archivo preparado lista sus partes.',
  'A prepared file lists its animations.': 'Un archivo preparado lista sus animaciones.',
  'A prepared file says what cleaning did, line by line.':
    'Un archivo preparado dice lo que hizo la limpieza, línea por línea.',
  "A file's copyright is offered as text of at most 500 characters.":
    'El copyright de un archivo se ofrece como texto de como máximo 500 caracteres.',
  'The project has no solid file "solids/{hash}.glb".':
    'El proyecto no tiene el archivo de sólido "solids/{hash}.glb".',
  'The solid file "solids/{hash}.glb" cannot be read: {why}':
    'No se puede leer el archivo de sólido "solids/{hash}.glb": {why}',
  'The bytes of the solid file "solids/{hash}.glb" are not the ones its name says.':
    'Los bytes del archivo de sólido "solids/{hash}.glb" no son los que dice su nombre.',
  'Visual Anything sent pieces of a solid’s file that do not fit together.':
    'Visual Anything envió trozos del archivo de un sólido que no encajan entre sí.',
  // The files in solids/ that no package names (ADR 0075).
  'solid-files/list holds only its id.': 'solid-files/list tiene solo su id.',
  'solid-files/remove holds only its id and the hashes of the files to remove.':
    'solid-files/remove tiene solo su id y los resúmenes de los archivos que quitar.',
  'A removal names 1 to {n} solid files by their SHA-256, in lowercase hexadecimal.':
    'Quitar nombra de 1 a {n} archivos de sólidos por su SHA-256, en hexadecimal en minúscula.',
  'solid-files/listed holds nothing else.': 'solid-files/listed no tiene nada más.',
  'The files are listed by their hashes and sizes.':
    'Los archivos se listan por sus resúmenes y tamaños.',
  'The files removed are listed by their hashes.':
    'Los archivos quitados se listan por sus resúmenes.',
  'The files kept are listed by their hashes, each with why.':
    'Los archivos que quedan se listan por sus resúmenes, cada uno con el porqué.',
  'A solid file is named by its SHA-256, in lowercase hexadecimal.':
    'Un archivo de sólido se nombra por su SHA-256, en hexadecimal en minúscula.',
  'A package names the solid file "solids/{hash}.glb", so it stays.':
    'Un paquete nombra el archivo de sólido "solids/{hash}.glb", así que queda.',
  'The project\'s solids/ folder is not a folder of its own, so "solids/{hash}.glb" stays.':
    'La carpeta solids/ del proyecto no es una carpeta propia, así que "solids/{hash}.glb" queda.',
  '"solids/{hash}.glb" is not a regular file, so it stays.':
    '"solids/{hash}.glb" no es un archivo común, así que queda.',
  'The solid file "solids/{hash}.glb" could not be removed: {why}':
    'No se pudo quitar el archivo de sólido "solids/{hash}.glb": {why}',
  "The project's solid files could not be read: {why}":
    'No se pudieron leer los archivos de sólidos del proyecto: {why}',
  // M9: the solid cleaner's refusals and report, and the program's solid files (ADR 0075).
  'The file is over 256 MiB, the most cleaning reads.':
    'El archivo pasa de 256 MiB, lo más que lee la limpieza.',
  'The GLB is cut short.': 'El GLB está cortado.',
  'The file is not glTF 2.0.': 'El archivo no es glTF 2.0.',
  'The GLB says it is longer than the file is.': 'El GLB dice que es más largo que el archivo.',
  'The GLB does not start with its JSON.': 'El GLB no empieza con su JSON.',
  'The JSON of the GLB runs past its end.': 'El JSON del GLB pasa de su final.',
  'A chunk of the GLB runs past its end.': 'Un bloque del GLB pasa de su final.',
  'The file is neither a GLB nor glTF in JSON.': 'El archivo no es ni un GLB ni glTF en JSON.',
  'The JSON of the file is not UTF-8.': 'El JSON del archivo no está en UTF-8.',
  'The JSON of the file cannot be read.': 'No se puede leer el JSON del archivo.',
  'The JSON of the file is not an object.': 'El JSON del archivo no es un objeto JSON.',
  'The JSON of the file nests too deep.': 'El JSON del archivo se anida demasiado.',
  'Its copyright was taken out of the file, and is offered as its source.':
    'Se sacó del archivo su copyright, que se ofrece como su fuente.',
  'The name of the program that wrote it was taken out.':
    'Se sacó el nombre del programa que lo escribió.',
  'The file is compressed with Draco, which cleaning does not read: export it without compression.':
    'El archivo está comprimido con Draco, que la limpieza no lee: expórtalo sin compresión.',
  'The extension {name} was dropped: a solid keeps none of it.':
    'Se descartó la extensión {name}: un sólido no guarda nada de ella.',
  '1 set of extras': '1 conjunto de extras',
  '{n} sets of extras': '{n} conjuntos de extras',
  '1 light': '1 luz',
  '{n} lights': '{n} luces',
  '1 camera': '1 cámara',
  '{n} cameras': '{n} cámaras',
  '1 skin': '1 esqueleto (skin)',
  '{n} skins': '{n} esqueletos (skins)',
  '1 morph target': '1 objetivo de deformación (morph target)',
  '{n} morph targets': '{n} objetivos de deformación (morph targets)',
  '1 name of something other than a node': '1 nombre de algo que no es un nodo glTF',
  '{n} names of things other than nodes': '{n} nombres de cosas que no son nodos glTF',
  'The file holds {count} nodes, more than the {most} cleaning reads.':
    'El archivo tiene {count} nodos glTF, más que los {most} que lee la limpieza.',
  'The file holds {count} meshes, more than the {most} cleaning reads.':
    'El archivo tiene {count} mallas glTF, más que las {most} que lee la limpieza.',
  'The file holds {count} primitives, more than the {most} cleaning reads.':
    'El archivo tiene {count} primitivas, más que las {most} que lee la limpieza.',
  'The file holds {count} accessors, more than the {most} cleaning reads.':
    'El archivo tiene {count} accesores, más que los {most} que lee la limpieza.',
  'The file holds {count} materials, more than the {most} cleaning reads.':
    'El archivo tiene {count} materiales, más que los {most} que lee la limpieza.',
  'The file holds {count} images, more than the {most} cleaning reads.':
    'El archivo tiene {count} imágenes, más que las {most} que lee la limpieza.',
  'The file holds {count} textures, more than the {most} cleaning reads.':
    'El archivo tiene {count} texturas, más que las {most} que lee la limpieza.',
  'The file holds {count} animations, more than the {most} cleaning reads.':
    'El archivo tiene {count} animaciones, más que las {most} que lee la limpieza.',
  'The file holds {count} animation channels, more than the {most} cleaning reads.':
    'El archivo tiene {count} canales de animación, más que los {most} que lee la limpieza.',
  'The file holds something that is not in the form glTF gives it.':
    'El archivo tiene algo que no está en la forma que le da glTF.',
  'The file holds a count, an offset or a length that is not a whole number.':
    'El archivo tiene una cantidad, un desplazamiento o una longitud que no es un número entero.',
  'The file names a part of itself that it does not hold.':
    'El archivo nombra una parte de sí mismo que no tiene.',
  'The file names its data with something other than an address.':
    'El archivo nombra sus datos con algo que no es una dirección.',
  'The file names "{address}" outside itself, which cleaning never reads: bundle it as .glb, with every buffer and image inside.':
    'El archivo nombra "{address}" fuera de sí mismo, que la limpieza nunca lee: empaquétalo como .glb, con todos sus búferes e imágenes dentro.',
  'The file holds data in base64 that is cut short.':
    'El archivo tiene datos en base64 que están cortados.',
  'The binary chunk of the GLB is shorter than its buffer says.':
    'El bloque binario del GLB es más corto de lo que dice su búfer.',
  'A buffer of the file holds no data.': 'Un búfer del archivo no tiene datos.',
  'A buffer of the file is shorter than it says.':
    'Un búfer del archivo es más corto de lo que dice.',
  'A buffer view of the file has a stride glTF does not have.':
    'Una vista de búfer del archivo tiene un paso que glTF no tiene.',
  'Compressed data of the file runs past its buffer.':
    'Datos comprimidos del archivo pasan del final de su búfer.',
  'Data of the file is compressed in a way meshopt does not have.':
    'Datos del archivo están comprimidos de una forma que meshopt no tiene.',
  'Compressed data of the file does not decode to its length.':
    'Datos comprimidos del archivo no se decodifican a su longitud.',
  'The compressed data of the file decodes to over 512 MiB.':
    'Los datos comprimidos del archivo se decodifican a más de 512 MiB.',
  'A buffer view of the file reads a buffer that holds no data.':
    'Una vista de búfer del archivo lee un búfer que no tiene datos.',
  'A buffer view of the file runs past its buffer.':
    'Una vista de búfer del archivo pasa del final de su búfer.',
  'An accessor of the file is not aligned.': 'Un accesor del archivo no está alineado.',
  'An accessor of the file runs past its buffer view.':
    'Un accesor del archivo pasa del final de su vista de búfer.',
  'An accessor of the file is of a type glTF does not have.':
    'Un accesor del archivo es de un tipo que glTF no tiene.',
  'An accessor of the file holds nothing.': 'Un accesor del archivo no tiene nada.',
  "The file's accessors would make over 512 MiB of data.":
    'Los accesores del archivo harían más de 512 MiB de datos.',
  'The sparse values of an accessor do not fit it.':
    'Los valores dispersos de un accesor no encajan en él.',
  '1 texture in another format': '1 textura en otro formato',
  '{n} textures in other formats': '{n} texturas en otros formatos',
  'A node of the file is placed with something other than numbers.':
    'Un nodo glTF del archivo está ubicado con algo que no son números.',
  'A node has more than one holder, or holds itself.':
    'Un nodo glTF tiene más de un contenedor, o se contiene a sí mismo.',
  'A scene holds a node that another node holds.':
    'Una escena tiene un nodo glTF que otro nodo glTF contiene.',
  'A scene holds a node twice.': 'Una escena tiene un nodo glTF dos veces.',
  "Cleaned, it would be {size} MiB, past the 32 MiB of a solid's file: simplify it, or make its textures smaller.":
    'Limpio, ocuparía {size} MiB, más que los 32 MiB del archivo de un sólido: simplifícalo, o achica sus texturas.',
  'Cleaning the file needs more memory than it may use.':
    'Limpiar el archivo necesita más memoria de la que puede usar.',
  'The file could not be read as glTF: {why}': 'No se pudo leer el archivo como glTF: {why}',
  'It was scaled from centimetres to meters.': 'Se escaló de centímetros a metros.',
  'It was scaled from millimetres to meters.': 'Se escaló de milímetros a metros.',
  'It was scaled from inches to meters.': 'Se escaló de pulgadas a metros.',
  'It was turned so that +Y is up, where +Z was.':
    'Se giró para que +Y quede arriba, donde estaba +Z.',
  '1 node that draws nothing': '1 nodo glTF que no dibuja nada',
  '{n} nodes that draw nothing': '{n} nodos glTF que no dibujan nada',
  'The file draws no triangle a solid keeps.':
    'El archivo no dibuja ningún triángulo que un sólido guarde.',
  'It keeps {count} nodes, past the {most} a solid holds.':
    'Guarda {count} nodos glTF, más que los {most} que tiene un sólido.',
  'It keeps {count} meshes, past the {most} a solid holds.':
    'Guarda {count} mallas glTF, más que las {most} que tiene un sólido.',
  'It keeps {count} primitives, past the {most} a solid holds.':
    'Guarda {count} primitivas, más que las {most} que tiene un sólido.',
  'It keeps {count} materials, past the {most} a solid holds.':
    'Guarda {count} materiales, más que los {most} que tiene un sólido.',
  'It keeps {count} animations, past the {most} a solid holds.':
    'Guarda {count} animaciones, más que las {most} que tiene un sólido.',
  'It keeps {count} animation channels, past the {most} a solid holds.':
    'Guarda {count} canales de animación, más que los {most} que tiene un sólido.',
  'It keeps {count} keyframes, past the {most} a solid holds.':
    'Guarda {count} fotogramas clave, más que los {most} que tiene un sólido.',
  '1 primitive of points or lines': '1 primitiva de puntos o líneas',
  '{n} primitives of points or lines': '{n} primitivas de puntos o líneas',
  '1 primitive without positions': '1 primitiva sin posiciones',
  '{n} primitives without positions': '{n} primitivas sin posiciones',
  'A position of the file is not a finite number.':
    'Una posición del archivo no es un número finito.',
  '1 vertex attribute a solid keeps none of': '1 atributo de geometría que un sólido no guarda',
  '{n} vertex attributes a solid keeps none of':
    '{n} atributos de geometría que un sólido no guarda',
  'The attributes of a primitive do not have as many vertices as its positions.':
    'Los atributos de una primitiva no tienen tantos puntos como sus posiciones.',
  "A primitive's indices are not whole numbers.":
    'Los índices de una primitiva no son números enteros.',
  'A triangle of the file names a vertex its primitive does not have.':
    'Un triángulo del archivo nombra un punto que su primitiva no tiene.',
  '1 primitive of triangle strips or fans, made a list of triangles':
    '1 primitiva de tiras o abanicos de triángulos, hecha lista de triángulos',
  '{n} primitives of triangle strips or fans, made lists of triangles':
    '{n} primitivas de tiras o abanicos de triángulos, hechas listas de triángulos',
  '1 primitive that draws no triangle': '1 primitiva que no dibuja ningún triángulo',
  '{n} primitives that draw no triangle': '{n} primitivas que no dibujan ningún triángulo',
  '1 texture that reads coordinates a solid drops':
    '1 textura que lee coordenadas que un sólido descarta',
  '{n} textures that read coordinates a solid drops':
    '{n} texturas que leen coordenadas que un sólido descarta',
  '1 texture past its caps': '1 textura que pasa sus límites',
  '{n} textures past their caps': '{n} texturas que pasan sus límites',
  '1 texture that could not be read': '1 textura que no se pudo leer',
  '{n} textures that could not be read': '{n} texturas que no se pudieron leer',
  'Its textures were rebuilt without their text, positions, profiles and times.':
    'Sus texturas se rehicieron sin su texto, posiciones, perfil de color ni fechas.',
  '1 named node past the 4,096 a solid names, drawn as part of the part holding it':
    '1 nodo glTF con nombre más allá de los 4.096 que nombra un sólido, dibujado como parte de la parte que lo contiene',
  '{n} named nodes past the 4,096 a solid names, drawn as part of the parts holding them':
    '{n} nodos glTF con nombre más allá de los 4.096 que nombra un sólido, dibujados como parte de las partes que los contienen',
  '1 animation channel that moves nothing a solid keeps':
    '1 canal de animación que no mueve nada que un sólido guarde',
  '{n} animation channels that move nothing a solid keeps':
    '{n} canales de animación que no mueven nada que un sólido guarde',
  '1 animation that moves nothing a solid keeps':
    '1 animación que no mueve nada que un sólido guarde',
  '{n} animations that move nothing a solid keeps':
    '{n} animaciones que no mueven nada que un sólido guarde',
  'An animation of the file lasts {n} s, past the 60 s a solid keeps.':
    'Una animación del archivo dura {n} s, más que los 60 s que guarda un sólido.',
  'It draws {count} triangles, past the 1,000,000 a solid holds: simplify it to fit.':
    'Dibuja {count} triángulos, más que el 1.000.000 que tiene un sólido: simplifícalo para que entre.',
  'It draws {count} vertices, past the 1,000,000 a solid holds: simplify it to fit.':
    'Dibuja {count} puntos de geometría, más que el 1.000.000 que tiene un sólido: simplifícalo para que entre.',
  'Simplified as far as it goes, it still draws {count} triangles and {more} vertices, past the 1,000,000 of each a solid holds.':
    'Simplificado todo lo posible, todavía dibuja {count} triángulos y {more} puntos de geometría, más que el 1.000.000 de cada uno que tiene un sólido.',
  'It was simplified from {count} to {more} triangles, to fit.':
    'Se simplificó de {count} a {more} triángulos, para que entre.',
  'The node "{from}" is named "{to}".': 'El nodo glTF "{from}" se llama "{to}".',
  '1 more node is named otherwise.': '1 nodo glTF más se llama de otra forma.',
  '{n} more nodes are named otherwise.': '{n} nodos glTF más se llaman de otra forma.',
  'Its bounds pass 100 km a side.': 'Sus límites pasan de 100 km por lado.',
  'It is less than a micrometre across.': 'Mide menos de un micrómetro.',
  'Cleaning the file took over {n} seconds, so it was stopped.':
    'Limpiar el archivo llevó más de {n} segundos, así que se detuvo.',
  'Checking the solid file took over {n} seconds, so it was stopped.':
    'Revisar el archivo del sólido llevó más de {n} segundos, así que se detuvo.',
  'Cleaning the file needed over {size} MiB of memory, so it was stopped.':
    'Limpiar el archivo necesitó más de {size} MiB de memoria, así que se detuvo.',
  'Checking the solid file needed over {size} MiB of memory, so it was stopped.':
    'Revisar el archivo del sólido necesitó más de {size} MiB de memoria, así que se detuvo.',
  'Cleaning the file failed: {why}': 'Falló la limpieza del archivo: {why}',
  'Checking the solid file failed: {why}': 'Falló la revisión del archivo del sólido: {why}',
  'Cleaning the file could not start: {why}': 'La limpieza del archivo no pudo empezar: {why}',
  'Checking the solid file could not start: {why}':
    'La revisión del archivo del sólido no pudo empezar: {why}',
  'Cleaning the file tried to reach the network or a file, which it never may, so nothing was kept.':
    'La limpieza del archivo intentó llegar a la red o a un archivo, lo que nunca puede hacer, así que no se guardó nada.',
  'Checking the solid file tried to reach the network or a file, which it never may, so nothing was kept.':
    'La revisión del archivo del sólido intentó llegar a la red o a un archivo, lo que nunca puede hacer, así que no se guardó nada.',
  'its worker stopped ({n}).': 'su worker se detuvo ({n}).',
  'The file could not be cleaned.': 'No se pudo limpiar el archivo.',
  'The solid file could not be checked.': 'No se pudo revisar el archivo del sólido.',
  'The file could not be cleaned: {why}': 'No se pudo limpiar el archivo: {why}',
  'Visual Anything is receiving two solids already: import this one once they are prepared.':
    'Visual Anything ya está recibiendo dos sólidos: importa este cuando estén preparados.',
  'Visual Anything is cleaning solids already: import this one once they are prepared.':
    'Visual Anything ya está limpiando sólidos: importa este cuando estén preparados.',
  'The pieces of the file to import do not fit together.':
    'Los trozos del archivo para importar no encajan entre sí.',
  'The solid file "solids/{hash}.glb" could not be written: {why}':
    'No se pudo escribir el archivo de sólido "solids/{hash}.glb": {why}',
  'Visual Anything holds no cleaned file "solids/{hash}.glb": import the file, and the program cleans it first.':
    'Visual Anything no tiene un archivo limpio "solids/{hash}.glb": importa el archivo, y el programa lo limpia primero.',
  'Visual Anything holds no prepared file "solids/{hash}.glb": prepare it again, as it holds one for ten minutes.':
    'Visual Anything no tiene un archivo preparado "solids/{hash}.glb": prepáralo otra vez, ya que guarda uno durante diez minutos.',
  'The solid file "solids/{hash}.glb" is not one Visual Anything cleaned: {why}':
    'El archivo de sólido "solids/{hash}.glb" no es uno que Visual Anything haya limpiado: {why}',
  'its hash is not its name': 'su resumen no es su nombre',
  'The solid "{name}" says another description than its file "solids/{hash}.glb" holds; it is drawn as its file is.':
    'El sólido "{name}" dice otra descripción que la que tiene su archivo "solids/{hash}.glb"; se dibuja como es su archivo.',
  'The solid "{name}" is drawn as its placeholder. {why}':
    'El sólido "{name}" se dibuja como su marcador. {why}',
  'The solid "{name}" names the file "solids/{hash}.glb", which the project does not have; it is drawn as its placeholder.':
    'El sólido "{name}" nombra el archivo "solids/{hash}.glb", que el proyecto no tiene; se dibuja como su marcador.',
  'The solid "{name}" names "solids/{hash}.glb", which is not a regular file; it is drawn as its placeholder.':
    'El sólido "{name}" nombra "solids/{hash}.glb", que no es un archivo normal; se dibuja como su marcador.',
  'The solid "{name}" names the file "solids/{hash}.glb" of {n} bytes, but it holds {m}; it is drawn as its placeholder.':
    'El sólido "{name}" nombra el archivo "solids/{hash}.glb" de {n} bytes, pero tiene {m}; se dibuja como su marcador.',
  'This Visual Anything cleans no solids.': 'Este Visual Anything no limpia sólidos.',
  // Versions and proposals (ADR 0071, ADR 0073).
  'A version is the project as opened, or a commit the program listed, by its id.':
    'Una versión es el proyecto tal como se abrió, o un commit que el programa listó, por su id.',
  'The view to compare is named by its id.': 'La vista que se compara se nombra por su id.',
  'A proposal is named by its id.': 'Una propuesta se nombra por su id.',
  'Accepting names "all" the changes, or at most {n} of them by their keys.':
    'Para aceptar se nombran todos los cambios ("all"), o como máximo {n} por sus claves.',
  'The versions listed are a list.': 'Las versiones listadas son una lista.',
  'A version listed is an object.': 'Una versión listada es un objeto JSON.',
  'A version listed has its kind, its commit, its subject, author and time.':
    'Una versión listada tiene su tipo, su commit, su asunto, su autor y su momento.',
  // M11b: versions read from git, and why they cannot be (ADR 0071).
  'The project folder is not in a git repository, so it has no commits to compare with. Comparing with the project as opened works without one.':
    'La carpeta del proyecto no está en un repositorio de git, así que no tiene commits con los que comparar. Comparar con el proyecto tal como se abrió funciona sin uno.',
  'Comparing with a commit needs git 2.36 or later, and none was found: install git, or name it with VISUAL_ANYTHING_GIT. Comparing with the project as opened works without it.':
    'Comparar con un commit necesita git 2.36 o posterior, y no se encontró ninguno: instalar git, o nombrarlo con VISUAL_ANYTHING_GIT. Comparar con el proyecto tal como se abrió funciona sin él.',
  'Comparing with a commit needs git 2.36 or later, and the git found is {version}. Comparing with the project as opened works without it.':
    'Comparar con un commit necesita git 2.36 o posterior, y el git encontrado es {version}. Comparar con el proyecto tal como se abrió funciona sin él.',
  'The git found, {git}, does not run: {why}': 'El git encontrado, {git}, no se ejecuta: {why}',
  'The git found, {git}, does not say its version.':
    'El git encontrado, {git}, no dice su versión.',
  'VISUAL_ANYTHING_GIT names {git}, which is not a regular file that can be run.':
    'VISUAL_ANYTHING_GIT nombra {git}, que no es un archivo común que se pueda ejecutar.',
  'The git found, {git}, lies inside the project’s repository, so Visual Anything does not run it.':
    'El git encontrado, {git}, está dentro del repositorio del proyecto, así que Visual Anything no lo ejecuta.',
  'Git does not trust the project folder’s repository, so its commits are not read: {reason}':
    'Git no confía en el repositorio de la carpeta del proyecto, así que sus commits no se leen: {reason}',
  'Git could not read the project folder’s repository: {why}':
    'Git no pudo leer el repositorio de la carpeta del proyecto: {why}',
  'The project’s repository is a partial clone, which lacks objects: reading its commits needs git 2.44 or later, which can keep a read from fetching them, and the git found is {version}.':
    'El repositorio del proyecto es un clon parcial, al que le faltan contenidos: leer sus commits necesita git 2.44 o posterior, que puede evitar que una lectura los traiga, y el git encontrado es {version}.',
  'The repository has no commits yet.': 'El repositorio todavía no tiene commits.',
  'git {command} is not one of the commands Visual Anything runs, which only read.':
    'git {command} no es uno de los comandos que ejecuta Visual Anything, que solo leen.',
  'git config runs only with --get or --get-regexp, which read.':
    'git config solo se ejecuta con --get o --get-regexp, que leen.',
  'Git could not be started: {reason}': 'No se pudo iniciar git: {reason}',
  'git {command} failed.': 'git {command} falló.',
  'git {command} took longer than {n} s, so it was stopped.':
    'git {command} tardó más de {n} s, así que se detuvo.',
  'git {command} said more than {size}, the most Visual Anything reads of it.':
    'git {command} dijo más de {size}, lo máximo que Visual Anything lee de él.',
  'What git said did not read: {reason}': 'No se pudo leer lo que dijo git: {reason}',
  'Git’s answer about the repository did not read.':
    'No se pudo leer la respuesta de git sobre el repositorio.',
  'Git’s answer about a commit did not read.':
    'No se pudo leer la respuesta de git sobre un commit.',
  'Git’s answer about a tree did not read.':
    'No se pudo leer la respuesta de git sobre el contenido de una carpeta.',
  'Git’s answer about commits did not read.':
    'No se pudo leer la respuesta de git sobre los commits.',
  'Git’s answer about refs did not read.':
    'No se pudo leer la respuesta de git sobre las ramas y las etiquetas.',
  'Git’s answer about HEAD did not read.': 'No se pudo leer la respuesta de git sobre HEAD.',
  'Git’s answer with the files’ contents did not read.':
    'No se pudo leer la respuesta de git con el contenido de los archivos.',
  'A newer request stopped this one.': 'Un pedido más nuevo detuvo este.',
  'Another version was asked for, so reading this one stopped.':
    'Se pidió otra versión, así que se dejó de leer esta.',
  'Reading the version took longer than {n} s, so it was stopped.':
    'Leer la versión tardó más de {n} s, así que se detuvo.',
  'Listing the versions took longer than {n} s, so it was stopped.':
    'Listar las versiones tardó más de {n} s, así que se detuvo.',
  'That commit is not one the program listed in its recent listings of versions: list them again, then choose one.':
    'Ese commit no es uno de los que el programa listó en sus listas recientes de versiones: listarlas de nuevo y después elegir una.',
  'A version is a commit the program listed, by its id.':
    'Una versión es un commit que el programa listó, por su id.',
  'This commit has no folder {folder}: the project folder may have had another name then.':
    'Este commit no tiene la carpeta {folder}: puede que la carpeta del proyecto tuviera otro nombre entonces.',
  'In this commit, {folder} is a file, a link or a submodule, so it holds no project.':
    'En este commit, {folder} es un archivo, un enlace simbólico o un submódulo, así que no tiene ningún proyecto.',
  'This version holds more than {n} project files, the most Visual Anything reads of one version.':
    'Esta versión tiene más de {n} archivos de proyecto, lo máximo que Visual Anything lee de una versión.',
  'This version’s project files hold more than {size} in all, the most Visual Anything reads of one version.':
    'Los archivos de proyecto de esta versión ocupan más de {size} en total, lo máximo que Visual Anything lee de una versión.',
  'In this commit, the file is a link; Visual Anything reads only regular files.':
    'En este commit, el archivo es un enlace simbólico; Visual Anything solo lee archivos comunes.',
  'In this commit, the file is a submodule; Visual Anything reads only regular files.':
    'En este commit, el archivo es un submódulo; Visual Anything solo lee archivos comunes.',
  'In this commit, the file is not a regular file; Visual Anything reads only regular files.':
    'En este commit, el archivo no es un archivo común; Visual Anything solo lee archivos comunes.',
  'This commit’s copy of the file is not in the repository, which is a partial clone: fetch it with git, then compare again.':
    'La copia del archivo de este commit no está en el repositorio, que es un clon parcial: traerla con git y después volver a comparar.',
  'In this commit, more than one folder is named {folder} but for case; Visual Anything reads only one.':
    'En este commit, más de una carpeta se llama {folder} salvo por mayúsculas y minúsculas; Visual Anything solo lee una.',
  'In this commit, {folder} is a link; Visual Anything reads only real folders and regular files.':
    'En este commit, {folder} es un enlace simbólico; Visual Anything solo lee carpetas reales y archivos comunes.',
  'In this commit, {folder} is a submodule; Visual Anything reads only real folders and regular files.':
    'En este commit, {folder} es un submódulo; Visual Anything solo lee carpetas reales y archivos comunes.',
  'Neither the version nor the project now has the view "{view}".':
    'Ni la versión ni el proyecto actual tienen la vista "{view}".',
  'The version could not be compared: {why}': 'No se pudo comparar la versión: {why}',
  'This Visual Anything reads no versions.': 'Este Visual Anything no lee versiones.',
  'Why no version was listed is said in words.':
    'Por qué no se listó ninguna versión se dice con palabras.',
  'The comparison has no changes, or a project that is not one.':
    'A la comparación le faltan los cambios, o su proyecto no es uno.',
  'The refusal names its request and its problems.': 'El rechazo nombra su pedido y sus problemas.',
  'The proposal shown has its id, revision, labels, operations and changes.':
    'La propuesta que se muestra tiene su id, su revisión, sus etiquetas, sus operaciones y sus cambios.',
  'Accepting names the revision of the proposal shown.':
    'Para aceptar hay que nombrar la revisión de la propuesta que se muestra.',
  'The proposal closed is named, with how it closed.':
    'La propuesta cerrada se nombra, con cómo se cerró.',
  'A comparison shows one of: {drawings}.': 'Una comparación muestra uno de: {drawings}.',
  // M9: the guidance that turns a shape's solid (ADR 0075).
  'Turning names the shape to turn by id.': 'Para girar se nombra por su id la forma que se gira.',
  'Turning gives a camera: an azimuth from -180 to 180, an elevation from -89 to 89, and if it likes a zoom from 0.25 to 16, a target and a projection.':
    'Para girar se da una cámara: un azimut de -180 a 180, una elevación de -89 a 89 y, si se quiere, un zoom de 0.25 a 16, un punto de giro y una proyección.',
  // M10: the guidance that opens, moves and closes the physical-space panel (ADR 0076).
  'Guidance closes the physical-space panel with close: true.':
    'Una guía cierra el panel del espacio físico con close: true.',
  'Guidance that closes the physical-space panel carries nothing else.':
    'Una guía que cierra el panel del espacio físico no lleva nada más.',
  'The physical-space panel shows an element named by its id.':
    'El panel del espacio físico muestra un elemento nombrado por su id.',
  'The camera of the physical-space panel is a target, a point in meters, with an azimuth, an elevation and a distance.':
    'La cámara del panel del espacio físico es un punto al que mira, en metros, con un acimut, una elevación y una distancia.',
  'The physical-space panel frames one to {n} elements, by id.':
    'El panel del espacio físico encuadra de uno a {n} elementos, por su id.',
  'The physical-space panel moves to a camera or frames elements, not both.':
    'El panel del espacio físico va a una cámara o encuadra elementos, no las dos cosas.',
  'The message has no command.': 'El mensaje no tiene ningún comando.',
  'The action to undo up to is named by its id.':
    'La acción hasta la que deshacer se nombra por su id.',
  'The action to redo up to is named by its id.':
    'La acción hasta la que rehacer se nombra por su id.',
  'The message has no preferences to change.': 'El mensaje no tiene preferencias que cambiar.',
  'A sample is named by its id.': 'Un proyecto de muestra se nombra por su id.',
  'The names of a new project are an object.':
    'Los nombres de un proyecto nuevo son un objeto JSON.',
  'A new project\'s names are its "project" and its first "view", each text of at most {n} characters.':
    'Los nombres de un proyecto nuevo son su "project" y su primera "view", cada uno un texto de como máximo {n} caracteres.',
  'The project to open is a path of 1 to {n} characters.':
    'El proyecto que abrir es una ubicación de 1 a {n} caracteres.',
  'The view to open there is named by its id.': 'La vista que abrir allí se nombra por su id.',
  'Live values come as a list of values and a list removed.':
    'Los valores en vivo llegan como una lista de valores y una lista de los quitados.',
  'The answer to live values counts what was kept.':
    'La respuesta a los valores en vivo cuenta lo que se guardó.',
  'The answer to live values lists the targets it did not know.':
    'La respuesta a los valores en vivo enumera los ids que no conocía.',
  'The answer to live values lists what it refused.':
    'La respuesta a los valores en vivo enumera lo que rechazó.',
  'A value refused has its place and why.': 'Un valor rechazado tiene su lugar y el motivo.',
  'What was fetched has an HTTP status.': 'Lo obtenido tiene un estado HTTP.',
  'What was fetched is text of at most 256 KiB.': 'Lo obtenido es un texto de como máximo 256 KiB.',
  'Fetching names its package by id.': 'Obtener algo nombra su paquete por su id.',
  'Fetching needs an address of at most {n} characters.':
    'Obtener algo necesita una dirección de como máximo {n} caracteres.',
  'Live values from package code name the package.':
    'Los valores en vivo del código de un paquete nombran el paquete.',
  'Live values come as a list.': 'Los valores en vivo llegan como una lista.',
  'Live values stay fresh for a whole number of milliseconds, from a second to a week.':
    'Los valores en vivo quedan vigentes durante un número entero de milisegundos, de un segundo a una semana.',
  'A live value {why}.': 'Un valor en vivo {why}.',
  'is not an object': 'no es un objeto JSON',
  'has no target id': 'no tiene el id del elemento o la relación al que pertenece',
  'has no attribute name of 1 to {n} characters on one line':
    'no tiene un nombre de atributo de 1 a {n} caracteres en una sola línea',
  'has no value for "{attribute}"': 'no tiene ningún valor para "{attribute}"',
  'has a value for "{attribute}" that {why}': 'tiene un valor para "{attribute}" que {why}',
  'has a time it was measured at that is not milliseconds since 1970':
    'tiene un momento de medición que no está en milisegundos desde 1970',
  'A live value names its sender.': 'Un valor en vivo nombra a quien lo envía.',
  'A live value says when it arrived.': 'Un valor en vivo dice cuándo llegó.',
  'A live value says how long it stays fresh.':
    'Un valor en vivo dice cuánto tiempo queda vigente.',
  'A live value removed is named by its target and attribute.':
    'Un valor en vivo quitado se nombra por su elemento o relación y su atributo.',
  // W43: why a tab's copy of the project falls out of step with the program (operations.ts). The
  // lists are phrases in lower case, which the sentences hold.
  '{Of} already holds "{key}".': '"{key}" ya está en {Of}.',
  '{Of} has no place {index}.': 'No hay ningún lugar {index} en {Of}.',
  '{Of} holds no "{key}".': '"{key}" no está en {Of}.',
  'The elements of the project': 'los elementos del proyecto',
  'The relations of the project': 'las relaciones del proyecto',
  'The packages of the project': 'los paquetes del proyecto',
  'The views of the project': 'las vistas del proyecto',
  'The scenarios of the project': 'los escenarios del proyecto',
  'The components of package "{package}"': 'los componentes del paquete "{package}"',
  'The relationTypes of package "{package}"': 'los tipos de relación del paquete "{package}"',
  'The images of package "{package}"': 'las imágenes del paquete "{package}"',
  'The positions of view "{view}"': 'las posiciones de la vista "{view}"',
  'The freeShapes of view "{view}"': 'las formas libres de la vista "{view}"',
  'The routes of view "{view}"': 'las rutas de la vista "{view}"',
  'The stacking order of "{container}" in view "{view}"':
    'el orden de apilado de "{container}" en la vista "{view}"',
  'A view cannot change its id ("{id}").': 'Una vista no puede cambiar su id ("{id}").',
  'A package cannot change its id ("{id}").': 'Un paquete no puede cambiar su id ("{id}").',
  // W43: why the sandbox itself could not run package code, in its own words (code/sandbox.ts);
  // only what the engine says after "the interpreter failed:" stays as it is.
  'The code of the package "{name}" did not load: it imports another module, and package code is one module on its own':
    'El código del paquete "{name}" no se cargó: importa otro módulo, y el código de un paquete es un único módulo',
  'The code of the package "{name}" did not load: it waits at the top of its module, which package code may not do':
    'El código del paquete "{name}" no se cargó: espera en el nivel superior de su módulo, y el código de un paquete no puede hacerlo',
  'The code of the package "{name}" did not load: the interpreter stopped working':
    'El código del paquete "{name}" no se cargó: el intérprete dejó de funcionar',
  'The code of the package "{name}" did not load: the interpreter failed: {error}':
    'El código del paquete "{name}" no se cargó: falló el intérprete: {error}',
  'The code of the package "{name}" did not load: it threw nothing that says why':
    'El código del paquete "{name}" no se cargó: lanzó algo que no dice por qué',
  'The code of the package "{name}" did not load: it gave no reason':
    'El código del paquete "{name}" no se cargó: no dio ningún motivo',
  'The code of the package "{name}" failed in {hook} on "{element}": it imports another module, and package code is one module on its own':
    'El código del paquete "{name}" falló en {hook} sobre "{element}": importa otro módulo, y el código de un paquete es un único módulo',
  'The code of the package "{name}" failed in {hook} on "{element}": the package exports no {exported}':
    'El código del paquete "{name}" falló en {hook} sobre "{element}": el paquete no exporta {exported}',
  'The code of the package "{name}" failed in {hook} on "{element}": the interpreter stopped working':
    'El código del paquete "{name}" falló en {hook} sobre "{element}": el intérprete dejó de funcionar',
  'The code of the package "{name}" failed in {hook} on "{element}": the interpreter failed: {error}':
    'El código del paquete "{name}" falló en {hook} sobre "{element}": falló el intérprete: {error}',
  'The code of the package "{name}" failed in {hook} on "{element}": it threw nothing that says why':
    'El código del paquete "{name}" falló en {hook} sobre "{element}": lanzó algo que no dice por qué',
  'The code of the package "{name}" failed in {hook} on "{element}": it gave no reason':
    'El código del paquete "{name}" falló en {hook} sobre "{element}": no dio ningún motivo',
  // W43: what a spreadsheet import does not read of a column of identifiers (ADR 0056).
  'This column repeats the scheme "{scheme}", so it is not read.':
    'Esta columna repite el catálogo "{scheme}", así que no se lee.',
  // W43: why the PDF writer could not write its file, as the Export dialog says it.
  'The fonts the PDF embeds could not be read.':
    'No se pudieron leer las fuentes que incorpora el PDF.',
  // W43: why the local program refuses preferences an app sends.
  'Preferences to change must be an object, such as {"theme": "dark"}.':
    'Las preferencias que cambiar deben ser un objeto JSON, como {"theme": "dark"}.',
  'There is no preference to change.': 'No hay ninguna preferencia que cambiar.',
  '"{name}" is not a preference.': '"{name}" no es una preferencia.',

  // W44: the time range a view state holds (ADR 0044's clarification), and how one is refused.
  'Filters hold components, relation-types, where and range, not "{clause}".':
    'Los filtros tienen components, relation-types, where y range, no "{clause}".',
  'A time range is range:<of>,<attribute>,<kind>,<from>,<to>, then the attribute its periods end at, if it is on periods.':
    'Un rango de tiempo es range:<of>,<attribute>,<kind>,<from>,<to>, y luego el atributo en el que terminan sus períodos, si es sobre períodos.',
  'A time range runs between two numbers.': 'Un rango de tiempo va de un número a otro.',
  'A time range is an object.': 'Un rango de tiempo es un objeto JSON.',
  'A time range has no "{key}".': 'Un rango de tiempo no tiene "{key}".',
  'A time range is on elements or on relations, not "{side}".':
    'Un rango de tiempo es sobre elementos o sobre relaciones, no "{side}".',
  'A time range names the attributes it reads.': 'Un rango de tiempo nombra los atributos que lee.',
  "A time range's attributes hold at most {max} characters.":
    'Los atributos de un rango de tiempo tienen como máximo {max} caracteres.',
  "A time range's attributes are text without broken characters.":
    'Los atributos de un rango de tiempo son texto sin caracteres rotos.',
  'A time range reads its values as one of: {kinds}.':
    'Un rango de tiempo lee sus valores como uno de: {kinds}.',
  // M8b W54: Anchor parts… (ADR 0067).
  'Anchor 1 part of "{name}"': 'Anclar 1 parte de "{name}"',
  'Anchor {count} parts of "{name}"': 'Anclar {count} partes de "{name}"',
  'The element "{name}" is no drawing with parts: it does not show an SVG image with its parts.':
    'El elemento "{name}" no es un dibujo con partes: no muestra una imagen SVG con sus partes.',
  'Parts are matched by an external identifier in a scheme, a short lowercase name such as "uberon"; "{scheme}" is not one.':
    'Las partes coinciden por un identificador externo en un catálogo, un nombre corto en minúsculas como "uberon"; "{scheme}" no lo es.',
  'The picture of "{name}" has no part "{part}".':
    'La imagen de "{name}" no tiene ninguna parte "{part}".',
  // M9: Anchor parts… for solids (ADR 0075).
  'The element "{name}" is no drawing with parts of a solid: it does not show a solid with its parts.':
    'El elemento "{name}" no es un dibujo con partes de un sólido: no muestra un sólido con sus partes.',
  'The solid of "{name}" has no part "{part}".':
    'El sólido de "{name}" no tiene ninguna parte "{part}".',
  // M9: what opening and every action say of solids an appearance or a part names (ADR 0075).
  '{owner} shows the solid "{id}", which no package in use defines; it shows none.':
    '{owner} muestra el sólido "{id}", que ningún paquete en uso define; no muestra ninguno.',
  '{owner} is drawn as a part of the solid "{id}", which no package in use defines; it is drawn as an ordinary shape.':
    '{owner} se dibuja como una parte del sólido "{id}", que ningún paquete en uso define; se dibuja como una forma común.',
  '{owner} is drawn as the part "{part}" of the solid "{name}", which has no such part; it is drawn as an ordinary shape.':
    '{owner} se dibuja como la parte "{part}" del sólido "{name}", que no tiene esa parte; se dibuja como una forma común.',
  // M10 seam 1: poses, what commands refuse of them and what opening warns (ADR 0076).
  'Pose "{name}"': 'Ubicar "{name}"',
  'Pose {n} elements': 'Ubicar {n} elementos',
  'Take "{name}" out of physical space': 'Sacar "{name}" del espacio físico',
  'Take {n} elements out of physical space': 'Sacar {n} elementos del espacio físico',
  'No elements were given to pose.': 'No se indicó ningún elemento para ubicar.',
  'World is where physical space is measured from; it has no pose.':
    'Mundo es desde donde se mide el espacio físico; no tiene ubicación.',
  'The pose of "{name}" is not a pose.': 'La ubicación de "{name}" no es una ubicación.',
  'The pose of "{name}" has "{key}", which a pose has not.':
    'La ubicación de "{name}" tiene "{key}", que una ubicación no tiene.',
  'The pose of "{name}" names no container in "in".':
    'La ubicación de "{name}" no nombra ningún contenedor en "in".',
  'The pose of "{name}" has no place in "at".':
    'La ubicación de "{name}" no tiene un lugar en "at".',
  'The pose of "{name}" has "{key}" in "at", which a place has not.':
    'La ubicación de "{name}" tiene "{key}" en "at", que un lugar no tiene.',
  'The pose of "{name}" has no finite {axis} in "at".':
    'La ubicación de "{name}" no tiene un {axis} finito en "at".',
  'The pose of "{name}" puts {axis} past 1,000 km from its container.':
    'La ubicación de "{name}" pone {axis} a más de 1.000 km de su contenedor.',
  'The pose of "{name}" has no quaternion in "rotation".':
    'La ubicación de "{name}" no tiene un cuaternión en "rotation".',
  'The pose of "{name}" has "{key}" in "rotation", which a quaternion has not.':
    'La ubicación de "{name}" tiene "{key}" en "rotation", que un cuaternión no tiene.',
  'The pose of "{name}" has no finite {part} in "rotation".':
    'La ubicación de "{name}" no tiene un {part} finito en "rotation".',
  'The pose of "{name}" has a rotation that is not of unit length.':
    'La ubicación de "{name}" tiene una rotación que no es de longitud uno.',
  'The pose of "{name}" is measured from "{container}", which is not an element.':
    'La ubicación de "{name}" se mide desde "{container}", que no es un elemento.',
  'The pose of "{name}" is measured from "{container}", which is not one of its containers.':
    'La ubicación de "{name}" se mide desde "{container}", que no es uno de sus contenedores.',
  'The pose of "{name}" is measured from "{container}", which is gone; it is kept, and "{element}" is not in physical space until it is posed again.':
    'La ubicación de "{name}" se mide desde "{container}", que ya no existe; se conserva, y "{element}" no está en el espacio físico hasta que se lo ubique de nuevo.',
  'The pose of "{name}" is measured from "{container}", which no longer holds it; it is kept, and "{element}" is not in physical space until it is posed again.':
    'La ubicación de "{name}" se mide desde "{container}", que ya no lo contiene; se conserva, y "{element}" no está en el espacio físico hasta que se lo ubique de nuevo.',
  // M10 seam 1: the physical-space panel in a view state and its address (ADR 0076).
  'The physical-space panel holds root, camera, cut, explode, relations and names, or is open alone, not "{name}".':
    'El panel del espacio físico tiene root, camera, cut, explode, relations y names, o está abierto solo, no "{name}".',
  'The physical-space panel holds "{name}" twice.':
    'El panel del espacio físico tiene "{name}" dos veces.',
  '"{name}" in the physical-space panel takes no value.':
    '"{name}" en el panel del espacio físico no lleva valor.',
  'The camera of the physical-space panel is six numbers: x,y,z,azimuth,elevation,distance.':
    'La cámara del panel del espacio físico son seis números: x,y,z,azimuth,elevation,distance.',
  'A cut is cut:<axis>,<at>,<keep>: x, y or z, a number, and below or above.':
    'Un corte es cut:<axis>,<at>,<keep>: x, y o z, un número, y below o above.',
  'Explode is one number: explode:<factor>.': 'La explosión es un número: explode:<factor>.',
  'The physical-space panel is an object.': 'El panel del espacio físico es un objeto JSON.',
  'The physical-space panel has no "{name}".': 'El panel del espacio físico no tiene "{name}".',
  'The physical-space panel explodes by a factor from 0 to 2.':
    'El panel del espacio físico separa las partes por un factor de 0 a 2.',
  'Whether the physical-space panel draws relations is true or false.':
    'Si el panel del espacio físico dibuja las relaciones es true o false.',
  'Whether the physical-space panel draws names is true or false.':
    'Si el panel del espacio físico escribe los nombres es true o false.',
  'The physical-space panel looks at most {n} m from the origin of what it shows.':
    'El panel del espacio físico mira a lo sumo a {n} m del origen de lo que muestra.',
  'The azimuth of the physical-space panel is from -180 to 180 degrees.':
    'El acimut del panel del espacio físico va de -180 a 180 grados.',
  'The elevation of the physical-space panel is from -89 to 89 degrees.':
    'La elevación del panel del espacio físico va de -89 a 89 grados.',
  'The physical-space panel looks from more than 0 m and at most {n} m.':
    'El panel del espacio físico mira desde más de 0 m y a lo sumo {n} m.',
  'A cut crosses its axis at most {n} m from the origin of what it cuts.':
    'Un corte cruza su eje a lo sumo a {n} m del origen de lo que corta.',
  'The physical-space panel shows "{root}", which is not an element of the project.':
    'El panel del espacio físico muestra "{root}", que no es un elemento del proyecto.',
  // What a view state's simulation, or a parameter typed in the Simulation section, is refused for
  // (ADR 0085).
  'The simulation shows "{element}", which is not an element of the project.':
    'La simulación muestra "{element}", que no es un elemento del proyecto.',
  'The element "{name}" simulates nothing.': 'El elemento "{name}" no simula nada.',
  'The simulation has no parameter "{name}".': 'La simulación no tiene el parámetro "{name}".',
  'The parameters are not an object of values by name.':
    'Los parámetros no son un conjunto de valores por nombre.',
  'The parameter "{name}" is not a number.': 'El parámetro "{name}" no es un número.',
  'The parameter "{name}" is below its lowest, {min}.':
    'El parámetro "{name}" está por debajo de su mínimo, {min}.',
  'The parameter "{name}" is above its highest, {max}.':
    'El parámetro "{name}" está por encima de su máximo, {max}.',
  'The parameter "{name}" is not true or false.': 'El parámetro "{name}" no es verdadero ni falso.',
  'The parameter "{name}" is not one of its choices.':
    'El parámetro "{name}" no es una de sus opciones.',
  'No simulation of this element is open.': 'No hay ninguna simulación abierta de este elemento.',
  // The simulations a package declares that cannot be one (ADR 0085).
  'The package "{name}" declares simulations but holds no code to work them out.':
    'El paquete "{name}" declara simulaciones pero no tiene código que las calcule.',
  'In the simulation of "{component}" in the package "{name}": {problem}':
    'En la simulación de "{component}" del paquete "{name}": {problem}',
  'The parameter "{name}" is declared twice.': 'El parámetro "{name}" está declarado dos veces.',
  'The simulated value "{name}" is declared twice.':
    'El valor simulado "{name}" está declarado dos veces.',
  'The parameter "{name}" has a range or a step, which only a number has.':
    'El parámetro "{name}" tiene un rango o un paso, que solo tiene un número.',
  'The parameter "{name}" has a unit, which only a number has.':
    'El parámetro "{name}" tiene una unidad, que solo tiene un número.',
  'The parameter "{name}" has choices, which only a choice has.':
    'El parámetro "{name}" tiene opciones, que solo tiene una elección.',
  'The parameter "{name}" is a choice without its choices.':
    'El parámetro "{name}" es una elección sin sus opciones.',
  'The parameter "{name}" has a lowest value above its highest.':
    'El parámetro "{name}" tiene un mínimo por encima de su máximo.',
  'The default of the parameter "{name}" is not a number.':
    'El valor predeterminado del parámetro "{name}" no es un número.',
  'The default of the parameter "{name}" is below its lowest, {min}.':
    'El valor predeterminado del parámetro "{name}" está por debajo de su mínimo, {min}.',
  'The default of the parameter "{name}" is above its highest, {max}.':
    'El valor predeterminado del parámetro "{name}" está por encima de su máximo, {max}.',
  'The default of the parameter "{name}" is not true or false.':
    'El valor predeterminado del parámetro "{name}" no es verdadero ni falso.',
  'The default of the parameter "{name}" is not one of its choices.':
    'El valor predeterminado del parámetro "{name}" no es una de sus opciones.',
  'The simulated value "{name}" has limits, which only a number has.':
    'El valor simulado "{name}" tiene límites, que solo tiene un número.',
  'The simulated value "{name}" has a unit, which only a number has.':
    'El valor simulado "{name}" tiene una unidad, que solo tiene un número.',
  'The simulated value "{name}" has choices, which only a string has.':
    'El valor simulado "{name}" tiene opciones, que solo tiene un texto.',
  'The simulated value "{name}" has a lowest limit above its highest.':
    'El valor simulado "{name}" tiene un límite mínimo por encima de su máximo.',
  'No nesting relation type can hold a new element of "{component}" inside "{name}".':
    'Ningún tipo de relación que anida puede contener un nuevo elemento de "{component}" dentro de "{name}".',
  // M8b seam 1: free geometry, named parts and automatic route styles (ADR 0066, 0067, 0069).
  'the element "{name}"': 'el elemento "{name}"',
  'The package "{name}"': 'El paquete "{name}"',
  'The model': 'El modelo',
  'The free geometry of {of} must be "none" or an outline in a box.':
    'La geometría libre de {of} debe ser "none" o un contorno en una caja.',
  'The free geometry of {of} holds only a width, a height, an outline, keep proportions and a label.':
    'La geometría libre de {of} tiene solo un ancho, un alto, un contorno, mantener proporciones y una etiqueta.',
  'The free geometry of {of}: {why} Its shapes are drawn as their kind.':
    'La geometría libre de {of}: {why} Sus formas se dibujan según su tipo.',
  'The free geometry of {of}: {why}': 'La geometría libre de {of}: {why}',
  'Free geometry is an object with a width, a height and an outline.':
    'La geometría libre es un objeto JSON con un ancho, un alto y un contorno.',
  'The width of free geometry is a number above 0.':
    'El ancho de una geometría libre es un número mayor que 0.',
  'The height of free geometry is a number above 0.':
    'El alto de una geometría libre es un número mayor que 0.',
  'The width of free geometry is at most 100,000.':
    'El ancho de una geometría libre es como máximo 100.000.',
  'The height of free geometry is at most 100,000.':
    'El alto de una geometría libre es como máximo 100.000.',
  'The outline of free geometry holds 1 to 64 contours.':
    'El contorno de una geometría libre tiene de 1 a 64 curvas cerradas.',
  'The outline of free geometry holds at most 64 contours, not {n}.':
    'El contorno de una geometría libre tiene como máximo 64 curvas cerradas, no {n}.',
  'Keep proportions is true or false.': 'Mantener proporciones es true o false.',
  'Free geometry holds at most 32,768 characters of path data and points, not {n}.':
    'Una geometría libre tiene como máximo 32.768 caracteres de datos de trazado y puntos, no {n}.',
  'Free geometry holds at most 2,000 segments, path commands and points.':
    'Una geometría libre tiene como máximo 2.000 segmentos, entre comandos de trazado y puntos.',
  'Contour {n} of free geometry is a path, a polygon or an ellipse.':
    'La curva cerrada {n} de una geometría libre es un trazado, un polígono o una elipse.',
  'Contour {n} has no path data, d.': 'La curva cerrada {n} no tiene datos de trazado, d.',
  'Contour {n} has no points.': 'La curva cerrada {n} no tiene puntos.',
  'Contour {n}: {why}': 'Curva cerrada {n}: {why}',
  'Contour {n} of free geometry draws nothing.':
    'La curva cerrada {n} de una geometría libre no dibuja nada.',
  'a polygon has three points or more.': 'un polígono tiene tres puntos o más.',
  'an ellipse has a finite cx, cy, rx and ry.': 'una elipse tiene cx, cy, rx y ry finitos.',
  "an ellipse's rx and ry are above 0.": 'los rx y ry de una elipse son mayores que 0.',
  'The outline of free geometry leaves its box of {width} by {height}.':
    'El contorno de una geometría libre se sale de su caja de {width} por {height}.',
  'The label area of free geometry is a rectangle with a width and a height above 0.':
    'La zona de la etiqueta de una geometría libre es un rectángulo con un ancho y un alto mayores que 0.',
  'The label area of free geometry leaves its box.':
    'La zona de la etiqueta de una geometría libre se sale de su caja.',
  'The path data is empty.': 'Los datos de trazado están vacíos.',
  'Path data must start with a move, M or m.':
    'Los datos de trazado deben empezar con un movimiento, M o m.',
  'At character {n}: a close, Z, takes no numbers.':
    'En el carácter {n}: un cierre, Z, no lleva números.',
  'At character {n}: the command {command} needs {number} numbers.':
    'En el carácter {n}: el comando {command} necesita {number} números.',
  'At character {n}: the command {command} needs {number} numbers, its flags each 0 or 1.':
    'En el carácter {n}: el comando {command} necesita {number} números, con sus indicadores en 0 o 1.',
  'At character {n}: a number is not finite.': 'En el carácter {n}: un número no es finito.',
  'At character {n}: a comma is followed by no number.':
    'En el carácter {n}: después de una coma no hay ningún número.',
  "At character {n}: a polygon's points are x,y pairs of numbers.":
    'En el carácter {n}: los puntos de un polígono son pares x,y de números.',
  '{Of} holds {size} of free geometry, which slows saving it; it may hold at most {cap}.':
    '{Of} tiene {size} de geometría libre, lo que hace más lento guardarlo; puede tener como máximo {cap}.',
  "{Of} holds {size} of free geometry, past the {cap} it may hold: the last geometry is drawn as its shapes' kind.":
    '{Of} tiene {size} de geometría libre, más de los {cap} que puede tener: la última geometría se dibuja según el tipo de sus formas.',
  "{Of} holds {size} of free geometry, past the {cap} it may hold: the last {n} geometries are drawn as their shapes' kind.":
    '{Of} tiene {size} de geometría libre, más de los {cap} que puede tener: las últimas {n} geometrías se dibujan según el tipo de sus formas.',
  'The part {of} is drawn as must be "none" or a part named by its id.':
    'La parte como la que se dibuja {of} debe ser "none" o una parte nombrada por su id.',
  'The part {of} is drawn as holds only its id, and its image or its solid.':
    'La parte como la que se dibuja {of} tiene solo su id, y su imagen o su sólido.',
  'The part {of} is drawn as must be named by the id it has in its picture.':
    'La parte como la que se dibuja {of} debe nombrarse por el id que tiene en su imagen.',
  'The part {of} is drawn as must name its image by its id.':
    'La parte como la que se dibuja {of} debe nombrar su imagen por su id.',
  'The part {of} is drawn as must name its solid by its id.':
    'La parte como la que se dibuja {of} debe nombrar su sólido por su id.',
  'The part {of} is drawn as names its image or its solid, not both.':
    'La parte como la que se dibuja {of} nombra su imagen o su sólido, no ambos.',
  'The route of {of} is orthogonal, straight or curved.':
    'La ruta de {of} es ortogonal, recta o curva.',
  'A view draws its automatic routes straight or curved, or orthogonal with null, not {value}.':
    'Una vista dibuja sus rutas automáticas rectas o curvas, u ortogonales con null, no {value}.',
  'The image of {of} is placed as an icon, as a drawing, or with its parts.':
    'La imagen de {of} se ubica como ícono, como dibujo o con sus partes.',
  // M8b seam 2: named parts (ADR 0067).
  '{owner} cannot be drawn as a part of the image "{id}": no package in use defines it.':
    '{owner} no puede dibujarse como una parte de la imagen "{id}": ningún paquete en uso la define.',
  '{owner} is drawn as a part of the image "{id}", which no package in use defines; it is drawn as an ordinary shape.':
    '{owner} se dibuja como una parte de la imagen "{id}", que ningún paquete en uso define; se dibuja como una forma común.',
  '{owner} is drawn as the part "{part}" of the image "{name}" ({id}), {why}; it is drawn as an ordinary shape until the picture has that part again.':
    '{owner} se dibuja como la parte "{part}" de la imagen "{name}" ({id}), {why}; se dibuja como una forma común hasta que la imagen vuelva a tener esa parte.',
  'which it does not have': 'que la imagen no tiene',
  'past the first 1,024 parts it lists':
    'más allá de las primeras 1.024 partes que la imagen lista',
  'The image "{name}" ({id}) is past the caps on parts.':
    'La imagen "{name}" ({id}) supera los límites de las partes.',
  'It has {count} named parts; only its first 1,024, in document order, can be drawn as parts.':
    'Tiene {count} partes con nombre; solo las primeras 1.024, en el orden del documento, pueden dibujarse como partes.',
  "Its parts' outlines leave out {count} contours of shapes with more than 256.":
    'Los contornos de sus partes dejan afuera {count} curvas cerradas de formas que tienen más de 256.',
  "Its parts' outlines leave out what its shapes draw past 100,000 segments.":
    'Los contornos de sus partes dejan afuera lo que sus formas dibujan más allá de los 100.000 segmentos.',
  // M8b W55: the editors. Why a file or a part gives no outline, and the history's labels of the
  // Style control's Automatic and of a view's Lines (ADR 0066, 0069, 0039).
  'The picture draws nothing to take an outline from.':
    'La imagen no dibuja nada de lo que tomar un contorno.',
  'The part draws nothing to take an outline from.':
    'La parte no dibuja nada de lo que tomar un contorno.',
  'Draw "{relation}" in its automatic style in "{view}"':
    'Dibujar "{relation}" en su estilo automático en "{view}"',
  'Draw {n} relations in their automatic styles in "{view}"':
    'Dibujar {n} relaciones en sus estilos automáticos en "{view}"',
  'Draw the lines of "{view}" orthogonal': 'Dibujar ortogonales las líneas de "{view}"',
  'Draw the lines of "{view}" straight': 'Dibujar rectas las líneas de "{view}"',
  'Draw the lines of "{view}" curved': 'Dibujar curvas las líneas de "{view}"',
  'Draw only the key rows in "{view}"': 'Dibujar solo las filas clave en "{view}"',
  'Draw every row in "{view}"': 'Dibujar todas las filas en "{view}"',
  'Fade the other lines when selecting in "{view}"':
    'Atenuar las demás líneas al seleccionar en "{view}"',
  'Keep every line when selecting in "{view}"':
    'Dejar todas las líneas como están al seleccionar en "{view}"',

  // M8b W56: HTML imported as a drawing (ADR 0068). What making a drawing dropped, kind by kind, as
  // the local program counts it, then why a drawing was not made, and the history's label.
  '1 attribute past the {limit} a tag keeps':
    '1 atributo más allá de los {limit} que conserva una etiqueta',
  '{n} attributes past the {limit} a tag keeps':
    '{n} atributos más allá de los {limit} que conserva una etiqueta',
  '1 style rule that selects by more than an element name, a class or an id':
    '1 regla de estilo que selecciona por algo más que una clase o un nombre de elemento, o un id',
  '{n} style rules that select by more than an element name, a class or an id':
    '{n} reglas de estilo que seleccionan por algo más que una clase o un nombre de elemento, o un id',
  '1 style declaration the drawing does not lay out':
    '1 declaración de estilo que el dibujo no aplica',
  '{n} style declarations the drawing does not lay out':
    '{n} declaraciones de estilo que el dibujo no aplica',
  '1 gradient background the picture cannot keep': '1 degradado que la imagen no puede conservar',
  '{n} gradient backgrounds the picture cannot keep':
    '{n} degradados que la imagen no puede conservar',
  '1 box that hides its overflow inside another that does':
    '1 caja que oculta lo que desborda dentro de otra que también lo hace',
  '{n} boxes that hide their overflow inside another that does':
    '{n} cajas que ocultan lo que desborda dentro de otra que también lo hace',
  '1 table laid out as rows and columns of boxes': '1 tabla dispuesta en filas y columnas de cajas',
  '{n} tables laid out as rows and columns of boxes':
    '{n} tablas dispuestas en filas y columnas de cajas',
  '1 element nested deeper than {limit} levels, with its contents':
    '1 elemento anidado a más de {limit} niveles, con su contenido',
  '{n} elements nested deeper than {limit} levels, with their contents':
    '{n} elementos anidados a más de {limit} niveles, con su contenido',
  '1 element past the {limit} a drawing keeps, with its contents':
    '1 elemento más allá de los {limit} que conserva un dibujo, con su contenido',
  '{n} elements past the {limit} a drawing keeps, with their contents':
    '{n} elementos más allá de los {limit} que conserva un dibujo, con su contenido',
  '1 character of text past the {limit} a drawing holds':
    '1 carácter de texto más allá de los {limit} que tiene un dibujo',
  '{n} characters of text past the {limit} a drawing holds':
    '{n} caracteres de texto más allá de los {limit} que tiene un dibujo',
  '1 character Roboto cannot draw, such as an emoji':
    '1 carácter que Roboto no puede dibujar, como un emoji',
  '{n} characters Roboto cannot draw, such as emoji':
    '{n} caracteres que Roboto no puede dibujar, como los emoji',
  '1 style value the layout could not read': '1 valor de estilo que el diseño no pudo leer',
  '{n} style values the layout could not read': '{n} valores de estilo que el diseño no pudo leer',
  'The drawing is cut at {limit} pixels high.': 'El dibujo se corta a {limit} píxeles de alto.',
  'Cleaning the picture removed: {removed}.': 'La limpieza de la imagen quitó: {removed}.',
  'The HTML is over {limit} KiB: shorten it, or import a part of the page.':
    'El HTML supera los {limit} KiB: acortarlo, o importar una parte de la página.',
  'The HTML makes over {limit} elements, texts and comments.':
    'El HTML genera más de {limit} elementos, textos y comentarios.',
  'The HTML nests elements over {limit} deep.': 'El HTML anida elementos a más de {limit} niveles.',
  'The HTML has over {limit} style rules.': 'El HTML tiene más de {limit} reglas de estilo.',
  'The HTML’s style rules match too many of its elements to fold them in.':
    'Las reglas de estilo del HTML coinciden con demasiados de sus elementos para aplicarlas.',
  'Making the drawing took over {n} seconds, so it was stopped. Shorten the HTML, or make it narrower.':
    'Hacer el dibujo llevó más de {n} segundos, así que se detuvo. Acortar el HTML, o hacerlo más angosto.',
  'Making the drawing needed over {n} MiB of memory, so it was stopped. Shorten the HTML, or make it narrower.':
    'Hacer el dibujo necesitó más de {n} MiB de memoria, así que se detuvo. Acortar el HTML, o hacerlo más angosto.',
  'The drawing could not be made: its worker stopped ({n}).':
    'No se pudo hacer el dibujo: su proceso de trabajo se detuvo ({n}).',
  'The drawing could not be made: {why}': 'No se pudo hacer el dibujo: {why}',
  'Making the drawing tried to reach the network, which it never may, so nothing was made.':
    'Al hacer el dibujo se intentó llegar a la red, cosa que nunca puede hacer, así que no se hizo nada.',
  'The drawing is too large to keep as a picture: {why} Shorten the HTML, or make it narrower.':
    'El dibujo es demasiado grande para guardarlo como imagen: {why} Acortar el HTML, o hacerlo más angosto.',
  'The HTML draws nothing a picture can keep: {why}':
    'El HTML no dibuja nada que una imagen pueda conservar: {why}',
  'A drawing is laid out at a width of 64 to 2000 pixels, in whole pixels.':
    'Un dibujo se dispone con un ancho de 64 a 2000 píxeles, en píxeles enteros.',
  'Visual Anything is making {n} drawings already: ask again once they are made.':
    'Visual Anything ya está haciendo {n} dibujos: volver a pedirlo cuando estén hechos.',
  'Making a drawing names its file, in 1 to 1000 characters.':
    'Para hacer un dibujo se nombra su archivo, con 1 a 1000 caracteres.',
  'Making a drawing needs its HTML as text, of at most 512 KiB.':
    'Para hacer un dibujo hace falta su HTML como texto, de 512 KiB como máximo.',
  'The drawing Visual Anything made cannot be read.':
    'No se puede leer el dibujo que hizo Visual Anything.',
  'No component "{id}" is defined by the project or a built-in package.':
    'Ni el proyecto ni un paquete incorporado definen el componente "{id}".',
  'Import "{name}" as a drawing': 'Importar "{name}" como dibujo',

  // Conflicts a merge left in files (ADR 0072): the files they are in, the warning, the history's
  // labels, and why the core refuses a resolution.
  'the project file': 'el archivo del proyecto',
  'the model': 'el modelo',
  'the scenario "{name}"': 'el escenario "{name}"',
  'the tour "{name}"': 'el recorrido "{name}"',
  'the thread "{id}"': 'el hilo "{id}"',
  'A merge left a conflict in {of}: resolve it in the Changes tab, then add the file with git add.':
    'Una unión dejó un conflicto en {of}: resolverlo en la pestaña Cambios y después agregar el archivo con git add.',
  'A merge left {n} conflicts in {of}: resolve them in the Changes tab, then add the file with git add.':
    'Una unión dejó {n} conflictos en {of}: resolverlos en la pestaña Cambios y después agregar el archivo con git add.',
  'Resolve a conflict in {of}': 'Resolver un conflicto en {of}',
  'Resolve {n} conflicts in {of}': 'Resolver {n} conflictos en {of}',
  'There is no conflict in {of}.': 'No hay ningún conflicto en {of}.',
  'There is no conflict "{id}" in {of}.': 'No hay ningún conflicto "{id}" en {of}.',
  'The resolutions must be a list.': 'Las resoluciones deben ser una lista.',
  'Resolving takes one conflict at least.': 'Para resolver hace falta un conflicto como mínimo.',
  'A resolution names a conflict and what to take: kept or other.':
    'Una resolución nombra un conflicto y qué tomar: lo que se conserva (kept) o la otra opción (other).',
  'The conflict "{id}" is resolved twice.': 'El conflicto "{id}" se resuelve dos veces.',
  'A conflict is resolved by taking what is kept, or the other choice.':
    'Un conflicto se resuelve tomando lo que se conserva, o la otra opción.',
  'A file is named by its kind, and its id for a file in a folder.':
    'Un archivo se nombra por su tipo, y por su id si es un archivo de una carpeta.',

  // Claude's proposals (ADR 0073): the history's label of what the person accepted, and why the core
  // refuses a proposed command or an acceptance.
  '{of} and {n} more': '{of} y {n} más',
  '{of} ({n} of {m} changes)': '{of} ({n} de {m} cambios)',
  'The proposal holds no change "{key}".': 'La propuesta no tiene ningún cambio "{key}".',
  'The change "{key}" needs the change "{need}", which is not accepted.':
    'El cambio "{key}" necesita el cambio "{need}", que no se acepta.',
  'A comment never joins a proposal: it is added to the project now, signed as Claude.':
    'Un comentario nunca se suma a una propuesta: se agrega al proyecto ahora, firmado como Claude.',
  'Conflicts are never resolved in a proposal: they are resolved in the project now, with the review of Claude’s changes off.':
    'Los conflictos nunca se resuelven en una propuesta: se resuelven en el proyecto ahora, con la revisión de los cambios de Claude desactivada.',
  'The proposal holds {n} changes, as many as one holds: ask the person to review the changes it holds first.':
    'La propuesta tiene {n} cambios, tantos como puede tener una: pedirle a la persona que revise primero los cambios que tiene.',
  'The proposal would hold more than one can: ask the person to review the changes it holds first.':
    'La propuesta tendría más de lo que puede tener una: pedirle a la persona que revise primero los cambios que tiene.',
  // Why the program refuses what an app decided about a proposal (ADR 0073).
  'No proposal of Claude’s waits, so nothing was decided.':
    'No espera ninguna propuesta de Claude, así que no se decidió nada.',
  'The proposal "{id}" is no longer the one that waits, so nothing was decided.':
    'La propuesta "{id}" ya no es la que espera, así que no se decidió nada.',
  'The proposal changed since it was shown: review it again.':
    'La propuesta cambió desde que se mostró: revisarla de nuevo.',

  // Faces (ADR 0083, M3e F4): the core's refusals, warnings and problems, with their line and column.
  // A problem is where it is, then what is wrong, its first letter lowercased; the face editor shows
  // it alone, and the core's messages after whose face it is. A slot, {{…}}, is «ranura».
  'the markup': 'el marcado',
  'the style': 'el estilo',
  'the variant "{id}"': 'la variante "{id}"',
  'In {of}: {why}': 'En {of}: {why}',
  'Line {n} of {of}: {why}': 'Línea {n} de {of}: {why}',
  'Line {n}, column {m} of {of}: {why}': 'Línea {n}, columna {m} de {of}: {why}',
  'The face of {of}: {why}': 'La cara de {of}: {why}',
  'The face of {of} has {n} more problems.': {
    one: 'La cara de {of} tiene {n} problema más.',
    other: 'La cara de {of} tiene {n} problemas más.',
  },
  'The package "{name}" holds {n} KiB of faces, past the 512 KiB a package may hold.':
    'El paquete "{name}" tiene {n} KiB de caras, más de los 512 KiB que puede tener un paquete.',
  // The face's parts, as a command checks them before compiling it.
  'The face of {of} must be "none" or an object of its parts.':
    'La cara de {of} debe ser "none" o un objeto JSON de sus partes.',
  'The changes to the face of {of} must be "none" or an object.':
    'Los cambios a la cara de {of} deben ser "none" o un objeto JSON.',
  'The face of {of} has no "{key}".': 'La cara de {of} no tiene "{key}".',
  'The face of {of} is sized by its "content" or by its "shape".':
    'El tamaño de la cara de {of} lo da su "content" o su "shape".',
  'The markup of the face of {of} is a list of lines of text.':
    'El marcado de la cara de {of} es una lista de líneas de texto.',
  'The style of the face of {of} is a list of lines of text.':
    'El estilo de la cara de {of} es una lista de líneas de texto.',
  'Line {n} of the markup of the face of {of} holds a line break or more than 2,000 characters.':
    'La línea {n} del marcado de la cara de {of} tiene un salto de línea o más de 2.000 caracteres.',
  'Line {n} of the style of the face of {of} holds a line break or more than 2,000 characters.':
    'La línea {n} del estilo de la cara de {of} tiene un salto de línea o más de 2.000 caracteres.',
  'The variants of the face of {of} are a list.': 'Las variantes de la cara de {of} son una lista.',
  'A variant of the face of {of} is an object.':
    'Una variante de la cara de {of} es un objeto JSON.',
  'A variant of the face of {of} has no "{key}".':
    'Una variante de la cara de {of} no tiene "{key}".',
  'A variant of the face of {of} has an id of lowercase letters, digits and "-", a letter first.':
    'Una variante de la cara de {of} tiene un id de letras minúsculas, dígitos y "-", que empieza con una letra.',
  'The face of {of} names its collapsed variant by its id.':
    'La cara de {of} nombra su variante contraída por su id.',
  // What the strict reader refuses in a markup.
  'a comment is never closed with "-->".': 'un comentario nunca se cierra con "-->".',
  'a comment holds "--", which XHTML refuses.': 'un comentario tiene "--", que XHTML rechaza.',
  'doctypes, CDATA sections and processing instructions are not part of a face.':
    'los doctypes, las secciones CDATA y las instrucciones de procesamiento no son parte de una cara.',
  'the closing tag of "{name}" ends with ">".':
    'la etiqueta de cierre de "{name}" termina con ">".',
  '"</{name}>" closes no open element.': '"</{name}>" no cierra ningún elemento abierto.',
  '"</{name}>" closes "{other}", opened at line {n}, column {m}.':
    '"</{name}>" cierra "{other}", abierto en la línea {n}, columna {m}.',
  'elements nest more than {n} deep.': 'los elementos se anidan más de {n} niveles.',
  '"<{name}>" is never closed: write "</{name}>", or "<{name}/>" when it is empty.':
    '"<{name}>" nunca se cierra: escribir "</{name}>", o "<{name}/>" si está vacío.',
  'the tag "<{name}" is never ended with ">".': 'la etiqueta "<{name}" nunca termina con ">".',
  'attributes of "{name}" are separated by spaces.':
    'los atributos de "{name}" se separan con espacios.',
  'a closing tag': 'una etiqueta de cierre',
  'an element': 'un elemento',
  'an attribute of "{name}"': 'un atributo de "{name}"',
  '{of} is named in lowercase.': '{of} se nombra en minúsculas.',
  '{of} needs a name, a letter first.': '{of} necesita un nombre, que empiece con una letra.',
  '{of} is named in lowercase letters, digits and "-".':
    '{of} se nombra con letras minúsculas, dígitos y "-".',
  'the attribute "{attribute}" of "{name}" needs a quoted value, such as {attribute}="…".':
    'el atributo "{attribute}" de "{name}" necesita un valor entre comillas, como {attribute}="…".',
  'the value of "{attribute}" is written in quotes.':
    'el valor de "{attribute}" se escribe entre comillas.',
  'the value of "{attribute}" is never closed.': 'el valor de "{attribute}" nunca se cierra.',
  'the value of "{attribute}" holds "<", which is written "&lt;".':
    'el valor de "{attribute}" tiene "<", que se escribe "&lt;".',
  '"{name}" has the attribute "{attribute}" twice.':
    '"{name}" tiene el atributo "{attribute}" dos veces.',
  'a "&" starts an entity, such as "&amp;", which ends with ";".':
    'un "&" empieza algo como "&amp;", que termina con ";".',
  '"&{name};" is not a character XHTML allows.': '"&{name};" no es un carácter que XHTML permita.',
  '"&{name};" is not an entity a face takes: only &amp;, &lt;, &gt;, &quot;, &apos; and numeric ones.':
    'una cara no acepta la entidad "&{name};": solo &amp;, &lt;, &gt;, &quot;, &apos; y las numéricas.',
  // What a face may hold: its elements, attributes and variants, and its caps.
  'two variants are named "{id}".': 'dos variantes se llaman "{id}".',
  'a collapsed container shows the variant "{id}", which the face does not have.':
    'un contenedor contraído muestra la variante "{id}", que la cara no tiene.',
  'a face has at most {n} variants.': 'una cara tiene como máximo {n} variantes.',
  "a face's markup, its variants' included, holds at most {n} lines.":
    'el marcado de una cara, con el de sus variantes, tiene como máximo {n} líneas.',
  "a face's markup, its variants' included, holds at most {n} KiB.":
    'el marcado de una cara, con el de sus variantes, tiene como máximo {n} KiB.',
  "a face's style holds at most {n} KiB.": 'el estilo de una cara tiene como máximo {n} KiB.',
  "a face's style holds at most {n} rules.": 'el estilo de una cara tiene como máximo {n} reglas.',
  'a line holds at most 2,000 characters and no line break.':
    'una línea tiene como máximo 2.000 caracteres y ningún salto de línea.',
  '<{name}/> is the last element at the top of the markup, under what the face shows above it.':
    '<{name}/> es el último elemento del primer nivel del marcado, debajo de lo que la cara muestra arriba.',
  'an element takes "if" or "else", not both: write the condition in "else".':
    'un elemento lleva "if" o "else", no los dos: escribir la condición en "else".',
  '"else" follows an element with "if", or one with "else" and a condition.':
    '"else" va después de un elemento con "if", o de uno con "else" y una condición.',
  '<{name}> is not part of a face: nothing in a face runs or is fetched.':
    '<{name}> no es parte de una cara: nada en una cara se ejecuta ni se descarga.',
  '<{name}> is not an element a face takes.': '<{name}> no es un elemento que una cara acepte.',
  'a markup holds <{name}/> once.': 'un marcado tiene <{name}/> una sola vez.',
  'a markup holds <rows/> or <contents/>, not both.':
    'un marcado tiene <rows/> o <contents/>, no los dos.',
  '<{name}/> holds nothing: write it "<{name}/>".':
    '<{name}/> no contiene nada: escribirlo "<{name}/>".',
  "<rows/> takes no condition: it shows where the shape's rows go.":
    '<rows/> no lleva condición: muestra dónde van las filas de la forma.',
  "<contents/> takes no condition: it shows where the shape's contents go.":
    '<contents/> no lleva condición: muestra dónde va el contenido de la forma.',
  '"ref" belongs to <image/> only.': '"ref" es solo de <image/>.',
  'an image is named by the id its package gives it.':
    'una imagen se nombra por el id que le da su paquete.',
  '"{name}" is refused: nothing in a face runs.':
    'se rechaza "{name}": nada en una cara se ejecuta.',
  '"{name}" is refused: nothing in a face is fetched.':
    'se rechaza "{name}": nada en una cara se descarga.',
  '"{name}" is not an attribute a face takes: only class, style, if and else.':
    '"{name}" no es un atributo que una cara acepte: solo class, style, if y else.',
  '<image/> names an image of the package with ref="its id".':
    '<image/> nombra una imagen del paquete con ref="su id".',
  '"of" names "attributes", or a list attribute by its name.':
    '"of" nombra "attributes", o un atributo de lista por su nombre.',
  '<each> makes no box of its own: put "{name}" on what it repeats.':
    '<each> no forma una caja propia: poner "{name}" en lo que repite.',
  '"{name}" is not an attribute <each> takes: only of, only, except, if and else.':
    '"{name}" no es un atributo que <each> acepte: solo of, only, except, if y else.',
  '<each> says what it repeats over with "of".': '<each> dice con "of" sobre qué repite.',
  '"only" and "except" choose among the attributes, with of="attributes".':
    '"only" y "except" eligen entre los atributos, con of="attributes".',
  // Slots and conditions.
  'a "{{" is never closed with "}}".': 'un "{{" nunca se cierra con "}}".',
  'a slot names an attribute as attr "its name".':
    'una ranura nombra un atributo como attr "su nombre".',
  'a slot names what it writes: name, component, count, or an attribute.':
    'una ranura nombra lo que escribe: name, component, count o un atributo.',
  '"{word}" is a word of slots: write attr "{word}" for an attribute of that name.':
    '"{word}" es una palabra de las ranuras: escribir attr "{word}" para un atributo con ese nombre.',
  'a slot gives one text in quotes after "??".':
    'una ranura da un solo texto entre comillas después de "??".',
  'a slot takes "| plain" only.': 'una ranura acepta solo "| plain".',
  'a slot is a name, then ?? "a text" or | plain if wanted.':
    'una ranura es un nombre, y luego ?? "un texto" o | plain si se quiere.',
  '"not" goes before a value alone, as in "not archived".':
    '"not" va antes de un valor solo, como en "not archived".',
  "a condition compares with =, !=, <, <=, >, >= or in, as in status = 'live'.":
    "una condición compara con =, !=, <, <=, >, >= o in, como en status = 'live'.",
  'a condition compares with a text in quotes or a number.':
    'una condición compara con un texto entre comillas o un número.',
  "a condition with in lists texts in quotes or numbers, as in status in 'live' 'frozen'.":
    "una condición con in enumera textos entre comillas o números, como en status in 'live' 'frozen'.",
  'a condition compares with one text in quotes or one number.':
    'una condición compara con un solo texto entre comillas o un solo número.',
  '"{op}" compares with a number.': '"{op}" compara con un número.',
  // Style the subset drops.
  '"@" rules are not part of a face: they are dropped.':
    'las reglas "@" no son parte de una cara: se descartan.',
  'this text is not a rule: a rule is selectors, then declarations in braces.':
    'este texto no es una regla: una regla son selectores, y luego declaraciones entre llaves.',
  'rules do not nest: this rule is dropped.': 'las reglas no se anidan: esta regla se descarta.',
  'a rule lists at most {n} selectors: it is dropped.':
    'una regla enumera como máximo {n} selectores: se descarta.',
  'a selector joins at most {n} parts: "{selector}" is dropped.':
    'un selector une como máximo {n} partes: se descarta "{selector}".',
  'the selector "{selector}" is not one a face takes: an element, a class, both, or those joined by spaces. It is dropped.':
    'el selector "{selector}" no es uno que una cara acepte: una clase o un nombre de elemento, los dos juntos, o varios de esos unidos por espacios. Se descarta.',
  '"{text}" is not a declaration: it is a property, ":" and a value.':
    '"{text}" no es una declaración: una declaración es un nombre, ":" y un valor.',
  '"!important" is not part of a face: "{property}" is dropped.':
    '"!important" no es parte de una cara: se descarta "{property}".',
  'the value of "{property}" holds characters a face\'s style does not take: it is dropped.':
    'el valor de "{property}" tiene caracteres que el estilo de una cara no acepta: se descarta.',
  '"{value}" is not a value "{property}" takes in a face: it is dropped.':
    '"{value}" no es un valor que "{property}" acepte en una cara: se descarta.',
  'a grid has at most {n} columns: "{property}" is dropped.':
    'una cuadrícula tiene como máximo {n} columnas: se descarta "{property}".',
  'a face\'s text is {n} to {m} px: "font-size: {value}" is dropped.':
    'el texto de una cara mide de {n} a {m} px: se descarta "font-size: {value}".',
  '"{property}" is not a property a face takes: it is dropped.':
    '"{property}" no es algo que el estilo de una cara acepte: se descarta.',
  // Contrast, attributes, and laying a face out.
  'its text, {text} on {back}, reads at {n}:1 in the light theme, under {m}:1.':
    'su texto, {text} sobre {back}, se lee a {n}:1 en el tema claro, menos de {m}:1.',
  'its text, {text} on {back}, reads at {n}:1 in the dark theme, under {m}:1.':
    'su texto, {text} sobre {back}, se lee a {n}:1 en el tema oscuro, menos de {m}:1.',
  'its contrast was checked only in part: its conditions and classes made from values give more ways to draw it than the check reads.':
    'su contraste se revisó solo en parte: sus condiciones y sus atributos class hechos con valores dan más formas de dibujarla de las que lee la revisión.',
  'it names the attribute "{name}", which the component does not have.':
    'nombra el atributo "{name}", que el componente no tiene.',
  'a face lays out at most {n} runs of text.': 'una cara organiza como máximo {n} tramos de texto.',
  'a face fills at most {n} parts of its markup.':
    'una cara completa como máximo {n} partes de su marcado.',
  'a face lays out at most {n} boxes.': 'una cara organiza como máximo {n} cajas.',
  'the face has no markup.': 'la cara no tiene marcado.',
  // The Arrange tab's and copy and paste appearance's actions (A6.3, A6.4).
  'Resize {n} shapes': 'Cambiar el tamaño de {n} formas',
  'Place "{name}"': 'Colocar "{name}"',
  'Place {n} shapes': 'Colocar {n} formas',
  'Turn "{name}"': 'Girar "{name}"',
  'Turn {n} shapes': 'Girar {n} formas',
  'Mirror "{name}"': 'Reflejar "{name}"',
  'Mirror {n} shapes': 'Reflejar {n} formas',
  'Pin "{name}"': 'Fijar "{name}"',
  'Pin {n} shapes': 'Fijar {n} formas',
  'Paste the appearance onto "{name}"': 'Pegar la apariencia en "{name}"',
  'Paste the appearance onto {n} items': 'Pegar la apariencia en {n} elementos',
};

/**
 * The built-in packages, components and relation types, by id, with the descriptions of the attributes
 * each defines itself, by their names, which are data and stay as they are.
 */
export const builtins: Readonly<
  Record<
    string,
    { name: string; description?: string; attributes?: Readonly<Record<string, string>> }
  >
> = {
  essence: {
    name: 'Esencia',
    description: 'El componente del que, en definitiva, derivan todos los demás.',
  },
  'relates-to': {
    name: 'se relaciona con',
    description: 'El tipo de relación del que, en definitiva, derivan todos los demás.',
  },
  systems: {
    name: 'Sistemas',
    description:
      'Personas, sistemas, servicios y almacenes de datos, y cómo se comunican, leen, escriben y anidan.',
  },
  'systems.box': {
    name: 'Caja',
    description: 'Cualquier parte de un sistema que no tiene un componente más específico.',
    attributes: { owner: 'El equipo que lo opera.' },
  },
  'systems.system': {
    name: 'Sistema',
    description: 'Un conjunto de servicios y almacenes de datos que funcionan juntos.',
  },
  'systems.service': {
    name: 'Servicio',
    description: 'Un programa en ejecución al que otros llaman.',
    attributes: { technology: 'Con qué está hecho, como "Node.js" o "PostgreSQL".' },
  },
  'systems.chat-channel': {
    name: 'Canal de chat',
    description:
      'Un servicio a través del cual las personas hablan con un sistema, como WhatsApp o Slack.',
    attributes: { provider: 'Quién provee el canal.' },
  },
  'systems.ai-agent': {
    name: 'Agente de IA',
    description: 'Un servicio que razona con un modelo de lenguaje y llama a otros servicios.',
    attributes: { model: 'El modelo de lenguaje que usa.' },
  },
  'systems.mcp-server': {
    name: 'Servidor MCP',
    description:
      'Un servicio que da herramientas y datos a los agentes de IA mediante el Model Context Protocol.',
    attributes: { transport: 'Cómo lo alcanzan los clientes: "stdio" o "http".' },
  },
  'systems.semantic-layer': {
    name: 'Capa semántica',
    description:
      'Un servicio que define las métricas del negocio una sola vez y responde consultas en esos términos.',
  },
  'systems.database': {
    name: 'Base de datos',
    description: 'Un almacén de datos estructurados.',
    attributes: { engine: 'Como "postgres" o "mysql".' },
  },
  'systems.object-storage': {
    name: 'Almacenamiento de objetos',
    description: 'Un almacén de archivos y blobs, como los buckets de S3.',
  },
  'systems.person': {
    name: 'Persona',
    description: 'Alguien que usa o administra un sistema.',
    attributes: { role: 'Lo que hace, como "patient".' },
  },
  'systems.communicates-with': {
    name: 'se comunica con',
    description: 'Envía solicitudes o mensajes a otro elemento.',
    attributes: { protocol: 'Como "HTTPS", "gRPC" o "AMQP".' },
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
    description:
      'Tablas y sus columnas, y las referencias entre columnas; los esquemas, vistas, enums, funciones, triggers y secuencias de una base de datos, qué lee de qué, escribe en qué, se dispara en qué y ejecuta qué, y el enum que nombra el tipo de cada columna.',
  },
  'data-modeling.table': {
    name: 'Tabla',
    description: 'Una tabla de una base de datos. Dibuja sus columnas como sus filas.',
    attributes: {
      schema: 'El esquema al que pertenece, como "billing", que su cara escribe junto a su nombre.',
    },
  },
  'data-modeling.column': {
    name: 'Columna',
    description: 'Una columna de una tabla o de una vista.',
    attributes: {
      type: 'Su tipo de datos, como "uuid", "integer" o "varchar(255)".',
      primaryKey: 'Si forma parte de la clave primaria de su tabla.',
      notNull: 'Si rechaza valores vacíos.',
      unique: 'Si dos registros no pueden tener el mismo valor.',
      default:
        'El valor que toma cuando un registro no da ninguno, tal como está escrito, como "now()" o "0". Es texto, y nunca se ejecuta.',
      check:
        'La condición que deben cumplir sus valores, tal como está escrita, como "total_cents >= 0". Es texto, y nunca se ejecuta.',
    },
  },
  'data-modeling.schema': {
    name: 'Esquema',
    description:
      'Un espacio de nombres de una base de datos, como "billing", que tiene tablas, vistas, enums, funciones, triggers y secuencias. Es parte de su base de datos.',
  },
  'data-modeling.view': {
    name: 'Vista',
    description:
      'Una vista de una base de datos: una consulta con nombre que se lee como una tabla. Dibuja sus columnas como sus filas, y lee de las tablas y vistas que nombra.',
  },
  'data-modeling.materialized-view': {
    name: 'Vista materializada',
    description:
      'Una vista cuyos registros guarda la base de datos, y que actualiza cuando se le pide.',
  },
  'data-modeling.enum': {
    name: 'Enum',
    description:
      'Un tipo que toma uno de una lista fija y ordenada de valores. Una columna de ese tipo lo nombra como su tipo.',
    attributes: {
      values: 'Sus valores en orden, separados por comas, como "draft, paid, void".',
    },
  },
  'data-modeling.function': {
    name: 'Función',
    description:
      'Una función o un procedimiento guardado en una base de datos. El modelo tiene lo que lee, escribe y devuelve, nunca su código.',
    attributes: {
      language: 'En qué está escrita, como "sql" o "plpgsql".',
      arguments: 'Sus argumentos tal como están escritos, como "order_id uuid, amount integer".',
      returns:
        'Lo que devuelve, tal como está escrito, como "trigger", "boolean" o "setof orders".',
    },
  },
  'data-modeling.trigger': {
    name: 'Trigger',
    description:
      'Lo que hace una base de datos cuando cambia una tabla o una vista: se dispara en ellas y ejecuta una función. El modelo tiene cuándo se dispara, nunca su código.',
    attributes: {
      timing: 'Cuándo se dispara, respecto del cambio.',
      events:
        'Los cambios en los que se dispara, tal como están escritos, como "insert, update" o "update of status".',
      level: 'Si se dispara una vez por cada registro que cambia o una vez por cada sentencia.',
    },
  },
  'data-modeling.sequence': {
    name: 'Secuencia',
    description:
      'Un contador de una base de datos que entrega el número siguiente, a menudo al valor por omisión de una columna.',
    attributes: {
      type: 'Su tipo de datos, como "bigint".',
      start: 'El primer número que entrega.',
      increment: 'Lo que suma para el número siguiente.',
    },
  },
  'data-modeling.is-column-of': {
    name: 'es columna de',
    description: 'Ubica una columna en su tabla o en su vista.',
  },
  'data-modeling.references': {
    name: 'referencia',
    description:
      'Una clave foránea: los valores de este extremo son valores del otro extremo, por lo general una clave primaria.',
    attributes: {
      onDelete:
        'Qué pasa con los registros que tienen este valor cuando se elimina el registro al que se refieren.',
    },
  },
  'data-modeling.reads-from': {
    name: 'lee de',
    description: 'Una vista o una función lee los registros de una tabla o de una vista.',
  },
  'data-modeling.writes-to': {
    name: 'escribe en',
    description:
      'Una función inserta, actualiza o elimina los registros de una tabla o de una vista, o toma el número siguiente de una secuencia.',
  },
  'data-modeling.fires-on': {
    name: 'se dispara en',
    description: 'Un trigger se dispara cuando cambian los registros de esta tabla o vista.',
  },
  'data-modeling.runs': {
    name: 'ejecuta',
    description: 'Un trigger ejecuta esta función cada vez que se dispara.',
  },
  'data-modeling.has-type': {
    name: 'tiene tipo',
    description: 'Una columna toma los valores de este enum: el enum que nombra su tipo.',
  },
  c4: {
    name: 'Arquitectura C4',
    description:
      'Personas, sistemas de software, contenedores, componentes y nodos de despliegue, como el modelo C4 dibuja la arquitectura de software.',
  },
  'c4.person': {
    name: 'Persona',
    description: 'Alguien que usa los sistemas de software, como un cliente o un operador.',
    attributes: { external: 'Si queda fuera de la organización cuyos sistemas se modelan.' },
  },
  'c4.software-system': {
    name: 'Sistema de software',
    description:
      'Algo que da valor a sus usuarios como un todo, hecho de contenedores; el nivel más alto del modelo C4.',
    attributes: { external: 'Si queda fuera de la organización cuyos sistemas se modelan.' },
  },
  'c4.container': {
    name: 'Contenedor',
    description:
      'Algo que se ejecuta por sí mismo y tiene código o datos, como una aplicación web, una app móvil o una base de datos.',
    attributes: { technology: 'Con qué está hecho, como "Java y Spring Boot" o "PostgreSQL".' },
  },
  'c4.component': {
    name: 'Componente',
    description:
      'Un conjunto de funciones relacionadas detrás de una interfaz, dentro de un contenedor.',
    attributes: { technology: 'Con qué está hecho, como "Java y Spring Boot" o "PostgreSQL".' },
  },
  'c4.deployment-node': {
    name: 'Nodo de despliegue',
    description:
      'Donde se ejecuta el software, como un servidor, un dispositivo, un clúster o todo un centro de datos.',
    attributes: { technology: 'Con qué está hecho, como "Java y Spring Boot" o "PostgreSQL".' },
  },
  'c4.uses': {
    name: 'usa',
    description:
      'Depende de otro elemento para hacer su trabajo, como llamar a su API o leer sus datos.',
    attributes: { technology: 'Cómo, como "JSON sobre HTTPS" o "SQL".' },
  },
  'c4.runs-in': {
    name: 'se ejecuta en',
    description:
      'Ubica un sistema de software, un contenedor o un nodo de despliegue en el nodo de despliegue en el que se ejecuta.',
  },
  'c4.delivers-to': {
    name: 'entrega a',
    description: 'Envía algo a una persona, como un correo electrónico o una página para leer.',
    attributes: { technology: 'Cómo, como "SMTP" o "HTTPS".' },
  },
  'c4.is-part-of': {
    name: 'es parte de',
    description: 'Ubica un contenedor en su sistema de software, o un componente en su contenedor.',
  },
  'data-science': {
    name: 'Canalizaciones de ciencia de datos',
    description:
      'Fuentes, transformaciones, almacenes de características, modelos y paneles de indicadores, y cómo los datos los alimentan y entrenan modelos.',
  },
  'data-science.source': {
    name: 'Fuente',
    description:
      'De donde vienen los datos, como una base de datos, una API, archivos o un flujo de eventos.',
    attributes: { system: 'Qué los guarda, como "PostgreSQL", "Kafka" o "S3".' },
  },
  'data-science.transform': {
    name: 'Transformación',
    description: 'Un paso que limpia, combina o reorganiza datos para dar otros datos.',
    attributes: {
      engine: 'Qué la ejecuta, como "dbt", "Spark" o "pandas".',
      schedule: 'Cuándo se ejecuta, como "cada hora" o "con cada evento".',
    },
  },
  'data-science.feature-store': {
    name: 'Almacén de características',
    description:
      'Un almacén de características, calculadas una vez y servidas igual al entrenamiento y a las predicciones.',
    attributes: { engine: 'Como "Feast" o "Tecton".' },
  },
  'data-science.model': {
    name: 'Modelo',
    description: 'Un modelo entrenado con datos, que predice, clasifica o genera.',
    attributes: {
      framework: 'Con qué está hecho, como "PyTorch" o "scikit-learn".',
      metric: 'Cómo se lo evalúa, como "AUC 0.91".',
    },
  },
  'data-science.dashboard': {
    name: 'Panel de indicadores',
    description: 'Donde las personas leen los resultados: gráficos, tablas y alertas.',
    attributes: { tool: 'Como "Superset", "Grafana" o "Streamlit".' },
  },
  'data-science.feeds': {
    name: 'alimenta',
    description: 'Pasa datos al paso siguiente.',
    attributes: { format: 'Como "Parquet", "JSON" o "Avro".' },
  },
  'data-science.trains': {
    name: 'entrena',
    description: 'Le da a un modelo los datos con los que aprende.',
  },
  // P1 W62: the built-in Machine learning package (ADR 0079). Its layers are layers of a neural
  // network, which the glossary's avoided "capa" does not mean.
  'machine-learning': {
    name: 'Aprendizaje automático',
    description:
      'Conjuntos de datos, tensores, capas de red neuronal, bloques y modelos, y las funciones de pérdida, los optimizadores, las métricas y las corridas de entrenamiento que los entrenan: cómo se construye un modelo y cómo fluyen los datos por él.',
  },
  'machine-learning.dataset': {
    name: 'Conjunto de datos',
    description:
      'Los registros con los que un modelo aprende, se ajusta o se evalúa: una porción de los datos.',
    attributes: {
      split:
        'Qué porción de los datos: "train" para aprender, "validation" para ajustar, "test" para evaluar.',
      rows: 'Cuántos registros tiene.',
      format: 'Cómo se guarda, como "Parquet", "TFRecord" o "CSV".',
    },
  },
  'machine-learning.tensor': {
    name: 'Tensor',
    description:
      'Números dispuestos a lo largo de varios ejes, como un lote de entradas o lo que una capa de una red neuronal le pasa a la siguiente.',
    attributes: {
      shape: 'Su tamaño en cada eje, como "[batch, 512]".',
      dtype: 'El tipo de sus números, como "float32", "bfloat16" o "int64".',
    },
  },
  'machine-learning.layer': {
    name: 'Capa',
    description:
      'Un paso de una red neuronal, que convierte el tensor que recibe en otro. Cada tipo de capa deriva de ella.',
    attributes: {
      kind: 'Cómo la llama su framework, como "Linear", "Conv2d" o "MultiheadAttention".',
      parameters: 'Cuántos números aprende: sus pesos y sesgos.',
      activation: 'La función que se aplica a lo que da, como "ReLU", "GELU" o "none".',
    },
  },
  'machine-learning.dense-layer': {
    name: 'Capa densa',
    description:
      'Una capa de una red neuronal en la que cada salida es una suma ponderada de todas las entradas; también se la llama totalmente conectada o lineal.',
    attributes: { units: 'Cuántas salidas da.' },
  },
  'machine-learning.convolution-layer': {
    name: 'Capa de convolución',
    description:
      'Una capa de una red neuronal que desliza pequeños núcleos aprendidos sobre su entrada, como sobre los píxeles de una imagen o los pasos de una señal.',
    attributes: {
      filters: 'Cuántos núcleos aprende.',
      kernel: 'El tamaño de cada núcleo, como "3×3".',
    },
  },
  'machine-learning.attention-layer': {
    name: 'Capa de atención',
    description:
      'Una capa de una red neuronal en la que cada posición de su entrada pondera a todas las demás, como en un Transformer.',
    attributes: { heads: 'Cuántas cabezas atienden en paralelo.' },
  },
  'machine-learning.embedding-layer': {
    name: 'Capa de embedding',
    description:
      'Una capa de una red neuronal que convierte cada token, palabra o categoría en un vector de números que aprende.',
    attributes: { dimensions: 'Cuántos números tiene cada vector.' },
  },
  'machine-learning.normalization-layer': {
    name: 'Capa de normalización',
    description:
      'Una capa de una red neuronal que lleva los valores que recibe a una misma escala, lo que mantiene estable el entrenamiento.',
    attributes: { method: 'Qué normalización, como "layer", "batch" o "RMS".' },
  },
  'machine-learning.recurrent-layer': {
    name: 'Capa recurrente',
    description:
      'Una capa de una red neuronal que lee una secuencia paso a paso y lleva un estado de cada paso al siguiente.',
    attributes: { cell: 'Su celda, como "LSTM" o "GRU".' },
  },
  'machine-learning.pooling-layer': {
    name: 'Capa de agrupación',
    description:
      'Una capa de una red neuronal que reduce cada ventana de su entrada a un solo valor, como el mayor o el promedio.',
    attributes: { operation: 'Cómo se reduce cada ventana, como "max" o "average".' },
  },
  'machine-learning.block': {
    name: 'Bloque',
    description:
      'Capas de una red neuronal que funcionan como una sola y a menudo se repiten, como un bloque residual o un bloque Transformer.',
    attributes: { repeats: 'Cuántas veces lo repite el modelo, una copia tras otra.' },
  },
  'machine-learning.transformer-block': {
    name: 'Bloque Transformer',
    description:
      'Un bloque de atención de múltiples cabezas y una red feed-forward, cada una sumada a su entrada y normalizada, dibujado con sus partes: las capas de red neuronal que contiene se dibujan como ellas.',
  },
  'machine-learning.model': {
    name: 'Modelo',
    description:
      'Un modelo tal como se construye: los bloques y las capas de red neuronal que lo forman, y cuántos números aprende.',
    attributes: { parameters: 'Cuántos números aprende: sus pesos y sesgos.' },
  },
  'machine-learning.convolutional-network': {
    name: 'Red convolucional',
    description:
      'Una pequeña red neuronal convolucional para imágenes, dibujada con sus partes: dos convoluciones con una agrupación entre ellas, y luego flatten, dense y softmax. Las capas que contiene se dibujan como ellas.',
  },
  'machine-learning.loss': {
    name: 'Función de pérdida',
    description:
      'Cuánto se alejan las salidas de un modelo de lo que deberían ser, lo que el entrenamiento reduce, como la entropía cruzada.',
  },
  'machine-learning.optimizer': {
    name: 'Optimizador',
    description:
      'Cómo se cambian los parámetros de un modelo en cada paso del entrenamiento, como SGD o AdamW.',
    attributes: { learningRate: 'Qué tan grandes son sus pasos, como 0.001.' },
  },
  'machine-learning.metric': {
    name: 'Métrica',
    description: 'Un número que dice qué tan bien funciona un modelo, como la exactitud o el AUC.',
    attributes: {
      value: 'Su valor, según la última medición.',
      higherIsBetter:
        'Si un valor más alto es mejor, como en la exactitud, o uno más bajo, como en el error.',
    },
  },
  'machine-learning.training-run': {
    name: 'Corrida de entrenamiento',
    description: 'Una corrida del entrenamiento de un modelo, de su primera época a la última.',
    attributes: {
      epochs: 'Cuántas veces recorre los datos.',
      seed: 'La semilla de sus números aleatorios, que permite volver a correrla igual.',
      hardware: 'En qué corre, como "8 × A100" o "la CPU de una portátil".',
    },
  },
  'machine-learning.flows-into': {
    name: 'fluye hacia',
    description: 'Pasa un tensor, o un lote de datos, al paso siguiente del cómputo de un modelo.',
    attributes: { shape: 'La forma de lo que pasa, como "[batch, 90, 128]".' },
  },
  'machine-learning.adds-to': {
    name: 'se suma a',
    description:
      'Suma su entrada a lo que da un paso posterior, salteando los pasos intermedios: una conexión residual.',
  },
  'machine-learning.is-part-of': {
    name: 'es parte de',
    description:
      'Ubica una capa de red neuronal o un tensor en su bloque o su modelo, o un bloque en su modelo.',
  },
  'machine-learning.trains-on': {
    name: 'se entrena con',
    description:
      'Aprende de un conjunto de datos, o se ajusta o se evalúa con él, según su porción.',
    attributes: {
      split:
        'Qué porción de los datos: "train" para aprender, "validation" para ajustar, "test" para evaluar.',
    },
  },
  'machine-learning.is-measured-by': {
    name: 'se mide con',
    description: 'Se evalúa con una métrica.',
  },
  'machine-learning.minimizes': {
    name: 'minimiza',
    description: 'Reduce una función de pérdida mientras entrena.',
  },
  'machine-learning.updates': {
    name: 'actualiza',
    description:
      'Cambia los parámetros de un modelo, un bloque o una capa de red neuronal: un optimizador en cada paso, una corrida de entrenamiento en su conjunto.',
  },
  // P1 W63: Physical AI and robotics. "Node" is "Nodo de software", as C4's "Nodo de despliegue".
  'physical-ai': {
    name: 'IA física y robótica',
    description:
      'Robots, sus eslabones y articulaciones, los sensores, actuadores, controladores y políticas aprendidas que los mueven, y los nodos de software y los tópicos de su software.',
  },
  'physical-ai.robot': {
    name: 'Robot',
    description:
      'Una máquina que percibe y actúa en el mundo, como un brazo, un robot móvil o un humanoide, y que contiene sus eslabones, articulaciones, sensores y actuadores.',
    attributes: {
      model: 'Qué es, o su marca y modelo, como "brazo de seis ejes".',
      degreesOfFreedom:
        'De cuántas maneras independientes se mueve: una por cada articulación que acciona.',
    },
  },
  'physical-ai.link': {
    name: 'Eslabón',
    description:
      'Un cuerpo rígido de un robot, como su base, un brazo o una rueda, que las articulaciones unen al siguiente.',
    attributes: {
      mass: 'Cuánto pesa.',
      length: 'Cuánto mide, desde la articulación anterior hasta la siguiente.',
    },
  },
  'physical-ai.joint': {
    name: 'Articulación',
    description:
      'Donde dos eslabones se encuentran y se mueven uno respecto del otro, girando sobre su eje o deslizándose a lo largo de él.',
    attributes: {
      kind: 'Cómo se mueve: girando entre dos límites, deslizándose, sin moverse o girando sin fin.',
      lowerLimit:
        'La posición más baja que alcanza: un ángulo en grados si gira, una distancia en metros si se desliza.',
      upperLimit:
        'La posición más alta que alcanza: un ángulo en grados si gira, una distancia en metros si se desliza.',
      axis: 'El eje sobre el que gira o a lo largo del cual se desliza, en su propio marco, como "0 0 1".',
      position:
        'Dónde está ahora entre sus límites: un ángulo en grados si gira, una distancia en metros si se desliza. Mueve todo lo que la articulación sostiene (ADR 0090).',
    },
  },
  'physical-ai.sensor': {
    name: 'Sensor',
    description: 'Algo que mide el robot o el mundo que lo rodea.',
    attributes: {
      rate: 'Cuántas lecturas da por segundo.',
      frame: 'El marco en el que da sus lecturas, como "camera_link".',
    },
  },
  'physical-ai.camera': {
    name: 'Cámara',
    description: 'Un sensor que toma imágenes de lo que tiene enfrente.',
  },
  'physical-ai.depth-camera': {
    name: 'Cámara de profundidad',
    description: 'Una cámara que además mide a qué distancia está cada punto que ve.',
  },
  'physical-ai.lidar': {
    name: 'LiDAR',
    description: 'Un sensor que mide las distancias a su alrededor con luz láser.',
  },
  'physical-ai.imu': {
    name: 'IMU',
    description: 'Una unidad de medición inercial: mide cómo acelera y gira el robot.',
  },
  'physical-ai.force-torque-sensor': {
    name: 'Sensor de fuerza y torque',
    description:
      'Un sensor que mide las fuerzas y los torques sobre lo que sostiene, como una herramienta.',
  },
  'physical-ai.encoder': {
    name: 'Codificador',
    description:
      'Un sensor que mide dónde está una articulación o un eje que gira, y qué tan rápido gira.',
  },
  'physical-ai.actuator': {
    name: 'Actuador',
    description: 'Algo que mueve el robot, como un motor o un cilindro.',
  },
  'physical-ai.motor': {
    name: 'Motor',
    description: 'Un actuador que hace girar un eje.',
    attributes: { torque: 'El torque máximo que da.' },
  },
  'physical-ai.servo': {
    name: 'Servomotor',
    description:
      'Un motor que mantiene la posición que se le indica, con su propia realimentación adentro.',
  },
  'physical-ai.gripper': {
    name: 'Pinza',
    description: 'Un actuador en el extremo de un brazo que se cierra sobre lo que toma.',
  },
  'physical-ai.controller': {
    name: 'Controlador',
    description:
      'Lo que convierte una meta y las lecturas de los sensores en comandos para los actuadores, una y otra vez.',
    attributes: {
      kind: 'Cómo decide: por su error y sus ganancias, prediciendo sobre un horizonte o con una política aprendida.',
      rate: 'Cuántas veces por segundo se ejecuta.',
    },
  },
  'physical-ai.policy': {
    name: 'Política',
    description:
      'Un controlador aprendido: un modelo que elige la próxima acción a partir de lo que ve.',
    attributes: {
      model:
        'El modelo que ejecuta, como "una política de difusión" o "un modelo de visión, lenguaje y acción".',
    },
  },
  'physical-ai.compute-unit': {
    name: 'Unidad de cómputo',
    description: 'Una computadora en el robot o junto a él, en la que se ejecuta su software.',
    attributes: {
      hardware: 'Con qué calcula, como "un módulo embebido con GPU" o "una PC industrial".',
    },
  },
  'physical-ai.node': {
    name: 'Nodo de software',
    description:
      'Un proceso del software del robot, como el que lee una cámara, un planificador o un controlador, que se comunica con los demás a través de tópicos.',
    attributes: {
      middleware: 'A través de qué se comunica con los demás, como "ROS 2", "LCM" o "ZeroMQ".',
    },
  },
  'physical-ai.topic': {
    name: 'Tópico',
    description:
      'Un canal de mensajes con nombre, en el que algunos nodos de software publican y al que otros se suscriben.',
    attributes: {
      messageType: 'El tipo de sus mensajes, como "Image" o "JointState".',
      rate: 'Cuántos mensajes por segundo lleva.',
    },
  },
  'physical-ai.is-attached-to': {
    name: 'está unido a',
    description:
      'Une un eslabón a la articulación sobre la que se mueve, una articulación al eslabón en el que está, o un sensor al eslabón en el que va montado: la cadena cinemática.',
    attributes: {
      origin:
        'Dónde está sobre aquello a lo que está unido, dado por una posición y una rotación, como "xyz 0 0 0.1, rpy 0 0 0".',
    },
  },
  'physical-ai.is-part-of': {
    name: 'es parte de',
    description:
      'Ubica un eslabón, una articulación, un sensor o un actuador en el robot al que pertenece.',
  },
  'physical-ai.drives': {
    name: 'mueve',
    description: 'Mueve una articulación: un actuador la hace girar o deslizarse.',
  },
  'physical-ai.senses': {
    name: 'mide',
    description: 'Mide algo: un eslabón, una articulación o lo que rodea al robot.',
    attributes: { quantity: 'Qué mide, como "ángulo", "fuerza" o "distancia".' },
  },
  'physical-ai.commands': {
    name: 'comanda',
    description:
      'Le dice a un actuador qué hacer, o a un controlador de nivel inferior qué alcanzar, como una política le da sus objetivos a un controlador de articulaciones.',
  },
  'physical-ai.publishes-to': {
    name: 'publica en',
    description: 'Envía los mensajes de un nodo de software a un tópico.',
  },
  'physical-ai.subscribes-to': {
    name: 'se suscribe a',
    description: 'Hace que un nodo de software reciba los mensajes de un tópico.',
  },
  'physical-ai.runs-on': {
    name: 'se ejecuta en',
    description: 'Ubica un nodo de software en la unidad de cómputo en la que se ejecuta.',
  },
  // P1 W64: Processes and state machines (ADR 0079).
  process: {
    name: 'Procesos y máquinas de estados',
    description:
      'Pools y carriles, eventos, tareas, subprocesos, compuertas, objetos de datos y almacenes de datos, al estilo de BPMN, y los estados, las elecciones y las transiciones de las máquinas de estados.',
  },
  'process.pool': {
    name: 'Pool',
    description:
      'Un participante de un proceso, como una empresa, un área o un cliente, con los carriles y el trabajo que hace.',
  },
  'process.lane': {
    name: 'Carril',
    description: 'Una parte de un pool, como un rol o un equipo, con el trabajo que hace.',
  },
  'process.start-event': {
    name: 'Evento de inicio',
    description:
      'Donde empieza un proceso, como un pedido que llega o un temporizador que se cumple; se dibuja como un círculo fino.',
    attributes: {
      trigger:
        'Qué lo desencadena: "none", "message", "timer" o "signal". Los íconos del paquete lo muestran, puestos como la imagen propia del elemento.',
    },
  },
  'process.end-event': {
    name: 'Evento de fin',
    description:
      'Donde termina un camino de un proceso, quizás enviando un mensaje al hacerlo; se dibuja como un círculo grueso.',
    attributes: {
      trigger:
        'Qué lo desencadena: "none", "message", "timer" o "signal". Los íconos del paquete lo muestran, puestos como la imagen propia del elemento.',
    },
  },
  'process.intermediate-event': {
    name: 'Evento intermedio',
    description:
      'Algo que pasa mientras un proceso avanza, que el proceso espera o envía, como un mensaje o un plazo; se dibuja como un círculo doble.',
    attributes: {
      trigger:
        'Qué lo desencadena: "none", "message", "timer" o "signal". Los íconos del paquete lo muestran, puestos como la imagen propia del elemento.',
    },
  },
  'process.task': {
    name: 'Tarea',
    description: 'Un trabajo, hecho por una persona, por software o a mano.',
    attributes: {
      kind: 'Quién lo hace: "user", una persona con software; "service", el software solo; "manual", una persona sin software.',
    },
  },
  'process.subprocess': {
    name: 'Subproceso',
    description:
      'Una parte de un proceso con sus propios eventos, tareas y compuertas, que se muestran dentro de ella o quedan contraídos.',
  },
  'process.exclusive-gateway': {
    name: 'Compuerta exclusiva',
    description:
      'Donde un proceso toma exactamente uno de los caminos que salen de ella, según sus condiciones; se dibuja como un rombo con una X.',
  },
  'process.parallel-gateway': {
    name: 'Compuerta paralela',
    description:
      'Donde un proceso se divide en caminos que avanzan todos, o espera a que todos se unan; se dibuja como un rombo con un signo más.',
  },
  'process.inclusive-gateway': {
    name: 'Compuerta inclusiva',
    description:
      'Donde un proceso toma uno o más de los caminos que salen de ella, según sus condiciones; se dibuja como un rombo con un círculo.',
  },
  'process.data-object': {
    name: 'Objeto de datos',
    description:
      'Información que un proceso lee o produce, como un pedido o una factura; se dibuja como una página con una esquina doblada.',
  },
  'process.data-store': {
    name: 'Almacén de datos',
    description:
      'Donde un proceso guarda información que dura más que él, como una base de datos; se dibuja como un cilindro con franjas.',
  },
  'process.state': {
    name: 'Estado',
    description:
      'Una condición en la que algo puede estar por un tiempo, como "Pagado" o "Enviado"; puede contener estados propios.',
  },
  'process.initial-state': {
    name: 'Estado inicial',
    description:
      'Donde empieza una máquina de estados, o un estado que contiene estados; se dibuja como un punto.',
  },
  'process.final-state': {
    name: 'Estado final',
    description:
      'Donde termina una máquina de estados; se dibuja como un punto dentro de un anillo.',
  },
  'process.choice': {
    name: 'Elección',
    description:
      'Donde una transición sigue uno de varios caminos, según las guardas de las transiciones que salen de ella; se dibuja como un rombo.',
  },
  'process.sequence-flow': {
    name: 'flujo de secuencia',
    description: 'El orden del trabajo: lo que pasa después en un proceso.',
    attributes: {
      condition:
        'Cuándo se lo toma después de una compuerta, en texto, como "hay stock de todos los artículos"; nunca se ejecuta.',
    },
  },
  'process.message-flow': {
    name: 'flujo de mensaje',
    description: 'Un mensaje que un participante le envía a otro, de pool a pool.',
  },
  'process.association': {
    name: 'asociación',
    description:
      'Une un objeto de datos o un almacén de datos con el trabajo que lo lee o lo escribe.',
  },
  'process.transition': {
    name: 'transición',
    description:
      'Un cambio de un estado a otro, cuando ocurre su disparador y se cumple su guarda, que realiza su efecto.',
    attributes: {
      trigger: 'Lo que la hace ocurrir, como "pago recibido".',
      guard: 'Lo que debe cumplirse para que ocurra, en texto, como "stock > 0"; nunca se ejecuta.',
      effect: 'Lo que hace al ocurrir, en texto, como "enviar el recibo"; nunca se ejecuta.',
    },
  },
  'process.is-part-of': {
    name: 'es parte de',
    description:
      'Ubica un carril en su pool, el trabajo en su carril o su subproceso, o un estado en el estado que lo contiene.',
  },
  // P5: Healthcare, in the words of Argentine medical audit: a payer is "Financiador", a claim a
  // "Factura" with its "ítems", an encounter an "Atención" and a condition a "Diagnóstico".
  healthcare: {
    name: 'Salud',
    description:
      'Pacientes, sus atenciones y los prestadores que las dan; financiadores y planes, facturas y sus ítems, autorizaciones, auditorías y sus hallazgos; planes de cuidados y sus objetivos; y registros clínicos.',
  },
  'healthcare.patient': {
    name: 'Paciente',
    description: 'Una persona que recibe atención.',
    attributes: {
      birthYear: 'El año en que nació, que suele ser todo lo que un modelo necesita de su edad.',
      recordNumber: 'El número con el que su prestador lo registra, como "HC-000117".',
    },
  },
  'healthcare.encounter': {
    name: 'Atención',
    description:
      'La atención que sus prestadores le dan a un paciente, como una consulta, una internación o una llamada; contiene los registros clínicos que deja.',
    attributes: {
      setting:
        'Dónde y cómo ocurre: en un consultorio, en una guardia, durante una internación, a distancia o en el domicilio.',
      date: 'Cuándo ocurre, o cuándo empieza, como "2026-03-04".',
    },
  },
  'healthcare.provider': {
    name: 'Prestador',
    description: 'Quien da atención, o la factura: una persona o una organización.',
  },
  'healthcare.practitioner': {
    name: 'Profesional de la salud',
    description: 'Una persona que da atención, como un médico, una enfermera o un terapeuta.',
    attributes: { specialty: 'Lo que ejerce, como "medicina familiar" o "radiología".' },
  },
  'healthcare.provider-organization': {
    name: 'Organización prestadora',
    description:
      'Una organización que da atención, como una clínica, un hospital, un laboratorio o una farmacia; contiene a los profesionales que trabajan en ella.',
    attributes: { kind: 'Qué tipo de organización es.' },
  },
  'healthcare.payer': {
    name: 'Financiador',
    description:
      'Quien paga la atención en nombre de un paciente, como una aseguradora, una obra social o un programa público; contiene los planes que ofrece.',
    attributes: { kind: 'Qué tipo de financiador es.' },
  },
  'healthcare.plan': {
    name: 'Plan',
    description:
      'Lo que un financiador cubre y en qué condiciones: la atención que paga, lo que necesita una autorización previa y lo que paga el propio paciente.',
    attributes: {
      tier: 'Su categoría entre los planes del financiador, como "Básico", "Plata" u "Oro".',
    },
  },
  'healthcare.claim': {
    name: 'Factura',
    description:
      'El cobro que un prestador le presenta a un financiador por la atención dada, ítem por ítem. Dibuja sus ítems como sus filas.',
    attributes: {
      number: 'El número con el que se la registra, como "C-1001".',
      status: 'En qué estado está: escrita, enviada, en revisión o decidida.',
      total: 'Lo que suman sus ítems, en su moneda.',
    },
  },
  'healthcare.claim-line': {
    name: 'Ítem de factura',
    description:
      'Un servicio que cobra una factura, como una consulta, un estudio, un procedimiento o un medicamento, con su código y su importe.',
    attributes: {
      code: 'El código con el que se factura el servicio, en la codificación que pide el financiador.',
      quantity: 'Cuántas unidades del servicio factura.',
      amount: 'Cuánto suma, en la moneda de su factura.',
    },
  },
  'healthcare.authorization': {
    name: 'Autorización',
    description:
      'La aprobación de un financiador, dada antes de la atención, de que pagará un servicio: cuántas unidades y hasta cuándo.',
    attributes: {
      number: 'El número que le dio el financiador, que la factura luego cita.',
      status: 'En qué estado está: pedida, otorgada, rechazada o vencida.',
      quantity: 'Cuántas unidades del servicio aprueba.',
      validUntil: 'El último día en que se puede usar, como "2026-04-30".',
    },
  },
  'healthcare.audit': {
    name: 'Auditoría',
    description:
      'Una revisión de facturas o registros según las reglas que les corresponden, hecha por un financiador, un prestador o alguien en su nombre; contiene los hallazgos que hace.',
    attributes: {
      timing: 'Si revisa las facturas antes de que se paguen o después.',
      period: 'El período que abarca, como "abril a junio de 2026".',
    },
  },
  'healthcare.audit-finding': {
    name: 'Hallazgo de auditoría',
    description:
      'Algo que una auditoría encuentra mal o faltante, como un servicio facturado sin la autorización que necesita.',
    attributes: {
      severity: 'Cuánto importa.',
      amount: 'Cuánto dinero pone en duda, en la moneda de la factura.',
      status:
        'En qué estado está: recién encontrado, aceptado o discutido por quien corresponde, o resuelto.',
    },
  },
  'healthcare.care-plan': {
    name: 'Plan de cuidados',
    description:
      'Lo que un paciente y sus prestadores piensan hacer por su salud, y los objetivos que persigue. Dibuja sus objetivos como sus filas.',
    attributes: {
      status: 'Si se está escribiendo, se está siguiendo o ya se cumplió.',
      period: 'El período que abarca, como "2026".',
    },
  },
  'healthcare.goal': {
    name: 'Objetivo',
    description:
      'Un resultado que persigue un plan de cuidados, como mantener la glucemia por debajo de una meta.',
    attributes: {
      target: 'Qué cuenta como alcanzarlo, como "menos de 7%".',
      due: 'Para cuándo debería alcanzarse, como "2026-09".',
    },
  },
  'healthcare.clinical-record': {
    name: 'Registro clínico',
    description:
      'Algo escrito en la historia de un paciente sobre su salud o su atención, tal como lo deja una atención.',
    attributes: {
      date: 'Cuándo se registró, o cuándo ocurrió lo que registra.',
      code: 'El código con el que se registra, en la codificación que usa el prestador.',
    },
  },
  'healthcare.observation': {
    name: 'Observación',
    description:
      'Algo que se midió o se vio, como una presión arterial, un resultado de laboratorio o una escala de dolor.',
    attributes: {
      value: 'Lo que se midió o se vio, con su unidad, como "132/84 mmHg".',
    },
  },
  'healthcare.condition': {
    name: 'Diagnóstico',
    description:
      'Un problema de salud, confirmado o por confirmar, como un ligamento roto o la diabetes.',
    attributes: {
      clinicalStatus:
        'Si todavía hay que confirmarlo, si está presente, si está en remisión o si terminó.',
    },
  },
  'healthcare.procedure': {
    name: 'Procedimiento',
    description:
      'Algo que se hace por un paciente, como una cirugía, un estudio por imágenes o una vacuna.',
  },
  'healthcare.medication': {
    name: 'Medicación',
    description: 'Un medicamento recetado a un paciente o que se le administra.',
    attributes: { dose: 'Cuánto y cada cuánto, como "500 mg dos veces por día".' },
  },
  'healthcare.treats': {
    name: 'trata',
    description:
      'Da atención: un prestador a un paciente, o un procedimiento o una medicación a un diagnóstico.',
  },
  'healthcare.is-for': {
    name: 'corresponde a',
    description:
      'Dice de qué paciente es una atención, una factura, una autorización, un plan de cuidados o un registro clínico.',
  },
  'healthcare.is-covered-by': {
    name: 'tiene cobertura de',
    description:
      'Hace que un plan, o un financiador, pague la atención de un paciente, como su afiliado.',
    attributes: {
      memberId: 'El número de afiliado del paciente, tal como lo muestra su credencial.',
    },
  },
  'healthcare.requests': {
    name: 'solicita',
    description:
      'Le pide una autorización a un financiador: un prestador, antes de dar la atención que cubre.',
  },
  'healthcare.is-submitted-to': {
    name: 'se presenta ante',
    description:
      'Envía una factura, o el pedido de una autorización, al financiador que la decide.',
    attributes: { date: 'Cuándo se envió, como "2026-03-14".' },
  },
  'healthcare.authorizes': {
    name: 'autoriza',
    description:
      'Aprueba atención antes de que se dé: una autorización para un procedimiento, una medicación, una atención o un ítem de factura.',
  },
  'healthcare.bills': {
    name: 'factura',
    description:
      'Cobra la atención dada: una factura, o uno de sus ítems, por una atención o un registro clínico, como un procedimiento, un estudio o un medicamento.',
  },
  'healthcare.pays': {
    name: 'paga',
    description:
      'Paga lo que pide una factura, o uno de sus ítems: un financiador, una vez que decide.',
  },
  'healthcare.denies': {
    name: 'rechaza',
    description:
      'Se niega a pagar una factura o uno de sus ítems, o rechaza una autorización: un financiador, por un motivo que da.',
    attributes: {
      reason: 'Por qué, tal como lo dice el financiador, como "ninguna autorización lo cubre".',
    },
  },
  'healthcare.audits': {
    name: 'audita',
    description:
      'Revisa lo que abarca una auditoría: facturas y sus ítems, atenciones, registros clínicos, autorizaciones o el trabajo de un prestador.',
  },
  'healthcare.is-found-in': {
    name: 'se encuentra en',
    description:
      'Señala dónde se encontró un hallazgo de auditoría: una factura o uno de sus ítems, una atención, un registro clínico o una autorización.',
  },
  'healthcare.addresses': {
    name: 'aborda',
    description: 'Dirige un plan de cuidados, o uno de sus objetivos, a un diagnóstico.',
  },
  'healthcare.measures': {
    name: 'mide',
    description:
      'Dice cómo va un objetivo o un diagnóstico: una observación, como una medición de glucemia para un objetivo de diabetes.',
  },
  'healthcare.is-part-of': {
    name: 'es parte de',
    description:
      'Ubica a un profesional en su organización, un plan o una auditoría en su financiador, un ítem en su factura, un hallazgo en su auditoría, un objetivo en su plan de cuidados o un registro clínico en su atención.',
  },
  // P6: Finance (ADR 0079). A transaction is an "operación", since "transacción" is the word the
  // glossary avoids for an action, and a party an "interviniente", since a "parte" is a drawing's.
  finance: {
    name: 'Finanzas',
    description:
      'Libros mayores y las cuentas que contienen, asientos contables cuyas líneas debitan y acreditan cuentas por partida doble, operaciones, pagos y facturas, instrumentos que las carteras tienen por medio de posiciones, y los riesgos y los controles sobre todo ello.',
  },
  'finance.ledger': {
    name: 'Libro mayor',
    description:
      'Un libro de cuentas, como el libro mayor general de una empresa, con sus cuentas; los asientos contables se contabilizan en él.',
    attributes: { currency: 'La moneda de sus importes, en un código de tres letras como "EUR".' },
  },
  'finance.account': {
    name: 'Cuenta',
    description:
      'Un registro en un libro mayor de lo que se tiene, se debe, se gana o se gasta, que los asientos contables debitan y acreditan. Cada tipo de cuenta deriva de ella.',
    attributes: {
      code: 'Su código en el plan de cuentas, como "1200".',
      balance:
        'Su saldo al cierre del período, en la moneda de su libro mayor, del lado que la aumenta.',
    },
  },
  'finance.asset-account': {
    name: 'Cuenta de activo',
    description:
      'Lo que la empresa tiene o le deben, como el dinero en el banco o lo que deben los clientes; un débito la aumenta.',
  },
  'finance.liability-account': {
    name: 'Cuenta de pasivo',
    description:
      'Lo que la empresa les debe a otros, como impuestos por pagar o un préstamo; un crédito la aumenta.',
  },
  'finance.equity-account': {
    name: 'Cuenta de patrimonio neto',
    description: 'Lo que aportaron los dueños y las ganancias retenidas; un crédito la aumenta.',
  },
  'finance.revenue-account': {
    name: 'Cuenta de ingresos',
    description: 'Lo que se gana, como las ventas; un crédito la aumenta.',
  },
  'finance.expense-account': {
    name: 'Cuenta de gastos',
    description: 'Lo que se gasta para ganarlo, como materiales o alquiler; un débito la aumenta.',
  },
  'finance.journal-entry': {
    name: 'Asiento contable',
    description:
      'El registro de un hecho en los libros, como una factura o un pago, con fecha y número. Sus líneas debitan y acreditan cuentas por totales iguales, y se contabiliza en un libro mayor. Dibuja sus líneas como sus filas.',
    attributes: {
      number: 'El número con el que se archiva, como "JE-0107" o "INV-0107".',
      date: 'Cuándo ocurrió, como la fecha "2026-03-31".',
    },
  },
  'finance.entry-line': {
    name: 'Línea de asiento',
    description:
      'Una línea de un asiento contable: debita o acredita una cuenta por su importe. Su fila escribe el importe, y "Dr" o "Cr" según la relación que inicia.',
    attributes: { amount: 'Cuánto debita o acredita, en la moneda de su libro mayor.' },
  },
  'finance.transaction': {
    name: 'Operación',
    description:
      'Un intercambio de valor, como una venta, una compra, una transferencia o una compraventa de valores, que los asientos contables registran.',
    attributes: {
      kind: 'Qué es: "sale", una venta; "purchase", una compra; "transfer", una transferencia; o "trade", una compraventa de valores.',
      amount: 'Cuánto, en su moneda.',
      currency: 'La moneda de sus importes, en un código de tres letras como "EUR".',
      date: 'Cuándo ocurrió, como la fecha "2026-03-31".',
    },
  },
  'finance.payment': {
    name: 'Pago',
    description: 'Dinero que pasa de un interviniente a otro, que salda una factura o una deuda.',
    attributes: {
      method:
        'Cómo se paga: "transfer", por transferencia bancaria; "card", con tarjeta; "direct debit", por débito automático; o "cash", en efectivo.',
    },
  },
  'finance.invoice': {
    name: 'Factura',
    description:
      'Lo que un interviniente le cobra a otro por lo que vendió, con el importe a pagar y la fecha en que vence; un pago la salda.',
    attributes: {
      number: 'El número con el que se archiva, como "JE-0107" o "INV-0107".',
      amount: 'Cuánto, en su moneda.',
      currency: 'La moneda de sus importes, en un código de tres letras como "EUR".',
      dueDate: 'Cuándo vence, como "2026-04-30".',
      status:
        'En qué estado está: "open", abierta; "paid", pagada; "overdue", vencida; o "cancelled", anulada.',
    },
  },
  'finance.party': {
    name: 'Interviniente',
    description:
      'Una persona o una organización con la que tratan los libros, como un cliente, un proveedor, un banco o la empresa que los lleva.',
    attributes: {
      role: 'Quién es para los libros: "company", la empresa que los lleva; "customer", un cliente; "supplier", un proveedor; "bank", un banco; "broker", un agente de bolsa; "employee", un empleado; o "authority", una autoridad, como el fisco.',
    },
  },
  'finance.instrument': {
    name: 'Instrumento',
    description:
      'Algo que se tiene y tiene un precio, como una acción, un bono, un fondo de inversión o un depósito; las posiciones lo tienen.',
    attributes: {
      kind: 'Qué es: "share", una acción; "bond", un bono; "fund", un fondo de inversión; "deposit", un depósito; o "derivative", un derivado.',
      identifier: 'Su identificador donde se negocia, como un ISIN.',
      currency: 'La moneda de sus importes, en un código de tres letras como "EUR".',
    },
  },
  'finance.portfolio': {
    name: 'Cartera',
    description: 'Inversiones que se tienen y se administran juntas, con sus posiciones.',
    attributes: { currency: 'La moneda de sus importes, en un código de tres letras como "EUR".' },
  },
  'finance.position': {
    name: 'Posición',
    description: 'Cuánto de un instrumento tiene una cartera, y cuánto vale.',
    attributes: {
      quantity: 'Cuántas unidades del instrumento.',
      value: 'Cuánto vale al último precio, en la moneda de su cartera.',
    },
  },
  'finance.risk': {
    name: 'Riesgo',
    description:
      'Algo que podría costar dinero, como que bajen los precios, que un cliente no pague o que un pago se pierda.',
    attributes: {
      category:
        'Qué tipo de riesgo es: "market", de mercado; "credit", de crédito; "liquidity", de liquidez; "operational", operativo; o "compliance", de cumplimiento normativo.',
      likelihood: 'Qué tan probable es: "low", poco; "medium", algo; o "high", muy probable.',
      impact: 'Cuánto costaría si ocurriera: "low", poco; "medium", algo; o "high", mucho.',
    },
  },
  'finance.control': {
    name: 'Control',
    description:
      'Una verificación que mantiene a raya un riesgo, como aplicar los pagos a sus facturas o conciliar la cuenta bancaria; mitiga riesgos y verifica lo que resguarda.',
    attributes: {
      kind: 'Cómo actúa: "preventive", antes de que algo salga mal; "detective", descubriéndolo después; o "corrective", corrigiéndolo.',
      frequency: 'Cada cuánto se aplica, como "en cada pago" o "mensual".',
    },
  },
  'finance.posts-to': {
    name: 'se contabiliza en',
    description:
      'Pasa un asiento contable al libro mayor cuyas cuentas debitan y acreditan sus líneas.',
  },
  'finance.debits': {
    name: 'debita',
    description:
      'Una línea de un asiento contable anota su importe en el lado izquierdo de una cuenta, el debe: aumenta un activo o un gasto, y disminuye las demás.',
  },
  'finance.credits': {
    name: 'acredita',
    description:
      'Una línea de un asiento contable anota su importe en el lado derecho de una cuenta, el haber: aumenta un pasivo, el patrimonio neto o un ingreso, y disminuye las demás.',
  },
  'finance.records': {
    name: 'registra',
    description:
      'Un asiento contable registra en los libros la operación, el pago o la factura de la que surge.',
  },
  'finance.issues': {
    name: 'emite',
    description: 'Un interviniente le cobra a otro con una factura.',
  },
  'finance.pays': {
    name: 'paga',
    description: 'Un interviniente paga una factura, o le paga a otro interviniente.',
  },
  'finance.settles': {
    name: 'salda',
    description:
      'Un pago, u otra operación, cancela lo que se debe: una factura, o una operación que cierra.',
  },
  'finance.holds': {
    name: 'tiene',
    description:
      'Una posición tiene su instrumento; un interviniente tiene una cartera o una cuenta que le pertenece.',
  },
  'finance.is-exposed-to': {
    name: 'está expuesto a',
    description:
      'Podría perder valor si el riesgo ocurriera: una cuenta, una posición, un instrumento, un pago.',
  },
  'finance.mitigates': {
    name: 'mitiga',
    description: 'Un control hace que un riesgo sea menos probable, o menos costoso si ocurre.',
  },
  'finance.checks': {
    name: 'verifica',
    description: 'Un control revisa lo que resguarda, como cada pago que entra.',
  },
  'finance.is-part-of': {
    name: 'es parte de',
    description:
      'Ubica una cuenta en su libro mayor, una línea en su asiento contable o una posición en su cartera.',
  },
};
