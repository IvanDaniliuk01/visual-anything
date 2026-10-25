/**
 * Spreadsheets for the table reader's tests, as people export them: a CSV of elements then relations,
 * the same as TSV, one with semicolons as Excel writes them in many languages, and hostile ones. Kept
 * as text here, since the core's tests load no files.
 */

/** Elements, a blank line, then relations: ids, names with commas and quotes, containers, attributes. */
export const ELEMENTS_AND_RELATIONS = `id,name,component,container,owner,latency
shop,Shop,System,,Team A,
api,Checkout API,Service,shop,Team B,120
db,"Orders, archived",Database,shop,Team B,
web,"Web ""front""",Service,shop,,

from,to,relation type,name,protocol
api,db,writes to,Stores orders,SQL
web,Checkout API,calls,,HTTPS
`;

/** The same, separated by tabs. */
export const TAB_SEPARATED = ELEMENTS_AND_RELATIONS.replace(
  /"([^"]*(?:""[^"]*)*)"|,/g,
  (whole, quoted: string | undefined) => (quoted === undefined ? '\t' : `"${quoted}"`),
);

/** Semicolons, as a spreadsheet set to Spanish writes them, with a decimal comma in a value. */
export const SEMICOLONS = `Name;Component;Owner;Cost
Agenda;Service;Clínica;12,5
Turnos;Database;Clínica;
`;

/** A cell whose quote opens and never closes. */
export const UNCLOSED_QUOTE = `name,component
Fine,Service
"Broken,Service
Next,Service
`;

/** Cells that hold HTML, entities and a formula, which stay text exactly as written. */
export const HOSTILE_CELLS = `name,component,note
<script>alert(1)</script>,Service,=HYPERLINK("http://example.com")
&lt;b&gt;,Service,&amp;
`;
