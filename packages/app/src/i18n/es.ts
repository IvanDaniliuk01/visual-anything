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
 * | collapsed container     | contenedor contraído             |
 * | view                    | vista                            |
 * | perspective             | perspectiva                      |
 * | scope                   | alcance                          |
 * | outside the view        | fuera de la vista                |
 * | component               | componente                       |
 * | component palette       | paleta de componentes            |
 * | appearance              | apariencia                       |
 * | fill, stroke            | relleno, trazo                   |
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
 * | sample project          | proyecto de ejemplo              |
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
 * | caption                 | leyenda                          |
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
 *
 * The words CONTEXT.md avoids are not used for its terms either: no "nodo", "objeto" or "instancia"
 * for an element, "propiedad" or "campo" for an attribute, "capa" for the stacking order, "enlace" or
 * "vínculo" for a relation, nor "ajustes" for options, since "ajuste" is snapping. A JSON object is
 * "objeto JSON" and a file system link "enlace simbólico", which are neither.
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
    'Esta carpeta todavía no tiene ningún proyecto. Empezar uno a partir de un ejemplo, o vacío; después se puede cambiar todo.',
  'Ways to start': 'Formas de empezar',
  'C4 architecture: internet banking': 'Arquitectura C4: banca por internet',
  'A bank’s internet banking system, from the people who use it down to its components and the servers it runs on, with a scenario of a customer signing in.':
    'El sistema de banca por internet de un banco, desde las personas que lo usan hasta sus componentes y los servidores en los que se ejecuta, con un escenario de un cliente que inicia sesión.',
  'Data science pipeline: churn prediction':
    'Canalización de ciencia de datos: predicción de bajas',
  'The data a subscription business turns into a churn model, and the dashboards it feeds, with a scenario of the nightly run.':
    'Los datos que un negocio de suscripciones convierte en un modelo de bajas, y los paneles de indicadores que alimenta, con un escenario de la ejecución nocturna.',
  'Start from the sample “{name}”': 'Empezar a partir del ejemplo “{name}”',
  'Start from this sample': 'Empezar a partir de este ejemplo',
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
  'Your theme applies to this tab only: Visual Anything is not connected.':
    'El tema se aplica solo a esta pestaña: Visual Anything no está conectado.',
  'Your approval of package code applies to this tab only: Visual Anything is not connected.':
    'La aprobación del código del paquete se aplica solo a esta pestaña: Visual Anything no está conectado.',

  // Search and jump: the find field over the canvas.
  'Find in the project': 'Buscar en el proyecto',
  'Names, ids, components, values…': 'Nombres, ids, componentes, valores…',
  'Close find': 'Cerrar la búsqueda',
  'Close find (Escape)': 'Cerrar la búsqueda (Escape)',
  'Up and down move through what was found. Enter goes to it; Alt+Enter lists every view that draws it. Escape closes. {shortcut} finds again.':
    'Arriba y abajo recorren lo encontrado. Enter va a lo elegido; Alt+Enter lista cada vista que lo dibuja. Escape cierra. {shortcut} vuelve a buscar.',
  Found: 'Encontrado',
  'Getting ready to find…': 'Preparando la búsqueda…',
  'Nothing found': 'No se encontró nada',
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
  'Copy an address that opens this view where it is: its camera, selection, filters, focus and scenario step':
    'Copiar una dirección que abre esta vista tal como está: su cámara, selección, filtros, foco y paso del escenario',
  'Address copied.': 'Dirección copiada.',
  'Address copied, without the selection: an address holds at most {max} selected things.':
    'Dirección copiada, sin la selección: una dirección guarda como máximo {max} cosas seleccionadas.',

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

  // The read-only page (ADR 0041): its header, canvas, panels and About.
  'Reading tools': 'Herramientas de lectura',
  Find: 'Buscar',
  'Find (Ctrl+F)': 'Buscar (Ctrl+F)',
  About: 'Acerca de',
  'This project has no view to show.': 'Este proyecto no tiene ninguna vista para mostrar.',
  '{view} ({perspective})': '{view} ({perspective})',
  'Zoom in (+)': 'Acercar (+)',
  'Zoom out (−)': 'Alejar (−)',
  'Fit the view': 'Encuadrar la vista',
  'Fit the view (0)': 'Encuadrar la vista (0)',
  'This view has no shapes.': 'Esta vista no tiene formas.',
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
  '{count} views': { one: '{count} vista', other: '{count} vistas' },
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
  Format: 'Formato',
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
  'It holds the whole project, every view and scenario, whatever this view shows: share it only with those who may read all of it. It connects nowhere, and the browser saves it.':
    'Contiene todo el proyecto, cada vista y cada escenario, muestre lo que muestre esta vista: compartirla solo con quien pueda leerlo todo. No se conecta a ningún lado, y la guarda el navegador.',
  'Editing, the history and Claude’s guidance: the page only reads.':
    'La edición, el historial y la guía de Claude: la página solo lee.',
  'Layout, which does not run in the page: shapes a view keeps no position for are drawn in a row, as before a layout.':
    'El diseño automático, que no se ejecuta en la página: las formas para las que una vista no guarda posición se dibujan en una fila, como antes de organizar.',
  'This page is {size}, past {limit}: it may open slowly, and some hosts and mail refuse files this large.':
    'Esta página pesa {size}, más de {limit}: puede abrirse con lentitud, y algunos servidores y correos rechazan archivos tan grandes.',
  'This copy of Visual Anything has no viewer for read-only pages, as when it runs from its sources. Run pnpm build, then start it again.':
    'Esta copia de Visual Anything no tiene el visor de páginas de solo lectura, como cuando se ejecuta desde sus fuentes. Ejecutar pnpm build y volver a iniciarla.',
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
  '{name}, {component}, row {position} of {count} in {container}, {relations}.':
    '{name}, {component}, fila {position} de {count} en {container}, {relations}.',
  '{name}, {component}, {detail}, row {position} of {count} in {container}, {relations}.':
    '{name}, {component}, {detail}, fila {position} de {count} en {container}, {relations}.',
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
  // The image picker.
  Image: 'Imagen',
  'Choose an image…': 'Elegir una imagen…',
  'Use a picture already in the project': 'Usar una imagen que ya está en el proyecto',
  'Pictures in the project': 'Imágenes del proyecto',
  'Use “{name}”': 'Usar “{name}”',
  Placement: 'Ubicación',
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
  'No view is open.': 'No hay ninguna vista abierta.',
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
  'No relation ends on it.': 'Ninguna relación termina en él.',
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
  'Its {definer} defines no attributes.': 'Su {definer} no define atributos.',
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
    'Escribir un color como #RRGGBB, #RGB o rgb(r, g, b), por ejemplo #F3F5F8.',
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
  'The project uses no package yet.': 'El proyecto todavía no usa ningún paquete.',
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
  'It is built into Visual Anything, so only its colors can be changed here, for this project. Derive a {noun} from it to have one of the project’s own that you can change.':
    'Está incorporado en Visual Anything, así que aquí solo se pueden cambiar sus colores, para este proyecto. Derivar un {noun} de él para tener uno propio del proyecto que se pueda cambiar.',
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
  'It has no attributes to write.': 'No tiene atributos para escribir.',
  '(it has no such attribute)': '(no tiene ese atributo)',
  'Write “{name}” earlier': 'Escribir “{name}” antes',
  'Write “{name}” later': 'Escribir “{name}” después',
  'while “{name}” is true': 'mientras “{name}” es verdadero',
  'while it is the from end of “{name}”': 'mientras es el extremo de origen de “{name}”',
  'No badges.': 'Sin insignias.',
  'Remove the badge “{text}”': 'Quitar la insignia “{text}”',
  'Give the badge a text, such as PK.': 'La insignia necesita un texto, como PK.',
  'New badge': 'Nueva insignia',
  'Badge text': 'Texto de la insignia',
  Written: 'Se escribe',
  'Add the badge': 'Agregar la insignia',
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
  'It has no attributes yet.': 'Todavía no tiene atributos.',
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
  '{count} images': { one: '{count} imagen', other: '{count} imágenes' },
  'It defines no components.': 'No define componentes.',
  'It defines no relation types.': 'No define tipos de relación.',
  'Use this package': 'Usar este paquete',
  '{count} components': { one: '{count} componente', other: '{count} componentes' },
  '{count} relation types': { one: '{count} tipo de relación', other: '{count} tipos de relación' },
  'Remove this package': 'Quitar este paquete',
  'Stop using this package': 'Dejar de usar este paquete',
  'Its file goes, with the {defines} it defines; Undo brings them back.':
    'Se va su archivo, con {defines} que define; Deshacer los recupera.',
  'Used by': 'Usado por',
  'Nothing uses it yet.': 'Nada lo usa todavía.',
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
  'The package “{name}” holds code that is not approved, so it does not run. Review it from one of its elements in the inspector, or from the package in the Components tab.':
    'El paquete “{name}” tiene código que no está aprobado, así que no se ejecuta. Revisarlo desde uno de sus elementos en el inspector, o desde el paquete en la pestaña Componentes.',
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
  // What a view shows, its scope (ADR 0040).
  'Set what "{view}" shows': 'Definir qué muestra "{view}"',
  'Show the whole model in "{view}"': 'Mostrar todo el modelo en "{view}"',
  'Add "{name}" to "{view}"': 'Agregar "{name}" a "{view}"',
  'Add {n} elements to "{view}"': 'Agregar {n} elementos a "{view}"',
  'Leave "{name}" out of "{view}"': 'Dejar "{name}" fuera de "{view}"',
  'Leave {n} elements out of "{view}"': 'Dejar {n} elementos fuera de "{view}"',
  'A scope is an object, or null to show the whole model.':
    'Un alcance es un objeto, o null para mostrar todo el modelo.',
  'A scope holds include, exclude, added and leftOut, not "{key}".':
    'Un alcance tiene include, exclude, added y leftOut, no "{key}".',
  "A scope's {part} holds at most {n} rules.":
    'El {part} de un alcance tiene como máximo {n} reglas.',
  "A scope's {part} must be a list.": 'El {part} de un alcance debe ser una lista.',
  'A rule of a scope is an object with a kind.':
    'Una regla de un alcance es un objeto con un kind.',
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

  // The labels of what the inspector changes.
  'Change the appearance of {of}': 'Cambiar la apariencia de {of}',
  'Change the appearance of {n} shapes': 'Cambiar la apariencia de {n} formas',

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
  'Each definition and image of a package is an object.':
    'Cada definición e imagen de un paquete es un objeto JSON.',
  'An image is of the kind "svg" or "bitmap".': 'Una imagen es de la clase "svg" o "bitmap".',
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
    'El patrón de línea de {of} debe ser "solid", "dashed" o "dotted".',
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
  'The scope of the view "{view}" names "{id}", which is no element of the model; it is ignored.':
    'El alcance de la vista "{view}" nombra "{id}", que no es ningún elemento del modelo; se ignora.',
  'A rule of the scope of the view "{view}" names the component "{id}", which no package in use defines; it takes nothing.':
    'Una regla del alcance de la vista "{view}" nombra el componente "{id}", que ningún paquete en uso define; no toma nada.',
  'A rule of the scope of the view "{view}" names the relation type "{id}", which no package in use defines; it takes nothing.':
    'Una regla del alcance de la vista "{view}" nombra el tipo de relación "{id}", que ningún paquete en uso define; no toma nada.',
  'A rule of the scope of the view "{view}" names the container "{id}", which is no element of the model; it takes nothing.':
    'Una regla del alcance de la vista "{view}" nombra el contenedor "{id}", que no es ningún elemento del modelo; no toma nada.',
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
  'No project is open here yet: choose how to start one first.':
    'Todavía no hay ningún proyecto abierto aquí: primero elegir cómo empezar uno.',
  'The project here is being started already.': 'El proyecto de aquí ya se está empezando.',
  'There is no sample "{id}" to start from.': 'No hay ningún ejemplo "{id}" del que partir.',
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
  'Filters hold components, relation-types and where, not "{clause}".':
    'Los filtros tienen components, relation-types y where, no "{clause}".',
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
  'The package id "{id}" is used twice.': 'El id de paquete "{id}" se usa dos veces.',
  'The view id "{id}" is used twice.': 'El id de vista "{id}" se usa dos veces.',
  'The scenario id "{id}" is used twice.': 'El id de escenario "{id}" se usa dos veces.',
  'The page holds a package with the id "{id}", which Visual Anything keeps for its built-in {name} package.':
    'La página tiene un paquete con el id "{id}", que Visual Anything reserva para su paquete incorporado {name}.',
  'The package "{id}" is listed, but neither this page nor the built-in packages hold it.':
    'El paquete "{id}" está en la lista, pero ni esta página ni los paquetes incorporados lo tienen.',
  '{file} takes the id "{id}", which Visual Anything keeps for its built-in {name} package. Give it another id: {how}':
    '{file} usa el id "{id}", que Visual Anything reserva para su paquete incorporado {name}. Darle otro id: {how}',
  '{file} takes the id "{id}", which Visual Anything keeps for a built-in package to come. Rename it before that package ships: {how}':
    '{file} usa el id "{id}", que Visual Anything reserva para un paquete incorporado que vendrá. Cambiarlo antes de que ese paquete salga: {how}',
  'change "id" in this file, the start of every component and relation type id in it, and every reference to them, and rename the file to match.':
    'cambiar "id" en este archivo, el comienzo de cada id de componente y de tipo de relación que tiene, y cada referencia a ellos, y cambiar el nombre del archivo para que coincida.',
  'The package "{id}" is listed, but neither packages/ nor the built-in packages hold it.':
    'El paquete "{id}" figura en la lista, pero no está ni en packages/ ni entre los paquetes incorporados.',

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
  'An attachment is a connection point or a place on the border.':
    'Una conexión es un punto de conexión o un lugar del borde.',
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
  'The view "{view}" attaches the start of "{name}" at the connection point "{point}", which "{owner}" does not have; it attaches automatically.':
    'La vista "{view}" conecta el inicio de "{name}" en el punto de conexión "{point}", que "{owner}" no tiene; se conecta automáticamente.',
  'The view "{view}" attaches the end of "{name}" at the connection point "{point}", which "{owner}" does not have; it attaches automatically.':
    'La vista "{view}" conecta el final de "{name}" en el punto de conexión "{point}", que "{owner}" no tiene; se conecta automáticamente.',
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

  // Why the Structurizr, LikeC4 and draw.io readers refuse a file, and what they leave out (ADR 0042).
  'The file nests too deeply to be read.': 'El archivo anida demasiado hondo para leerse.',
  'The file is not JSON.': 'El archivo no es JSON.',
  'The file is over 32 MiB, the most an import reads.':
    'El archivo tiene más de 32 MiB, lo máximo que lee una importación.',
  'The file holds {count} elements; an import brings at most 20,000.':
    'El archivo tiene {count} elementos; una importación trae como máximo 20.000.',
  'The file holds {count} relations, those that put one thing inside another included; an import brings at most 50,000.':
    'El archivo tiene {count} relaciones, contando las que ponen una cosa dentro de otra; una importación trae como máximo 50.000.',
  'The name is over 1,000 characters; it is cut there.':
    'El nombre tiene más de 1.000 caracteres; se corta ahí.',
  'One more thing matched nothing; the list stops here.':
    'Una cosa más no coincidió con nada; la lista se detiene aquí.',
  '{count} more things matched nothing; the list stops here.':
    '{count} cosas más no coincidieron con nada; la lista se detiene aquí.',
  'A link that is not a web address is left out.':
    'Se deja fuera una referencia que no es una dirección web.',
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
    'Se dejan fuera los grupos; lo que contienen queda en la vista sin ellos.',
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
  'set-package-code needs the code, the capabilities, or both.':
    'set-package-code necesita el código, las capacidades o ambos.',
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
  'The code of the package "{name}" is not approved: the person approves it in the app before it runs.':
    'El código del paquete "{name}" no está aprobado: la persona lo aprueba en la app antes de que se ejecute.',
  'The code of the package "{name}" was stopped: it kept the worker that runs package code from answering, so the worker started again.':
    'El código del paquete "{name}" se detuvo: no dejaba responder al proceso que ejecuta el código de los paquetes, así que ese proceso volvió a empezar.',
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
    description: 'Tablas y sus columnas, y las referencias entre columnas.',
  },
  'data-modeling.table': {
    name: 'Tabla',
    description: 'Una tabla de una base de datos. Dibuja sus columnas como sus filas.',
  },
  'data-modeling.column': {
    name: 'Columna',
    description: 'Una columna de una tabla.',
    attributes: {
      type: 'Su tipo de datos, como "uuid", "integer" o "varchar(255)".',
      primaryKey: 'Si forma parte de la clave primaria de su tabla.',
      notNull: 'Si rechaza valores vacíos.',
      unique: 'Si dos registros no pueden tener el mismo valor.',
    },
  },
  'data-modeling.is-column-of': {
    name: 'es columna de',
    description: 'Ubica una columna en su tabla.',
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
      'Un grupo de funciones relacionadas detrás de una interfaz, dentro de un contenedor.',
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
};
