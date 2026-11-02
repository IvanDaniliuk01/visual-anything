/**
 * The icons of the built-in Finance package (P6, ADR 0079): drawn for Visual Anything as plain shapes
 * on a 24-unit grid, under CC0-1.0, each in one color that reads at 3:1 or more on its component's
 * fill in both themes, and stored as the core's cleaner writes them, so that cleaning them again
 * changes nothing. Tests check both.
 */
import type { SvgImage } from '@visual-anything/schema';
import { OWN_LICENSE, OWN_SOURCE } from './credits';

/** An icon of this package, drawn for Visual Anything, in the cleaned SVG text given. */
function icon(id: string, name: string, svg: string): SvgImage {
  return {
    kind: 'svg',
    id,
    name,
    source: OWN_SOURCE,
    license: OWN_LICENSE,
    width: 24,
    height: 24,
    svg,
  };
}

/** The strokes every icon of this package is drawn with, in one color. */
function strokes(color: string): string {
  return `fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"`;
}

/** A rectangle with rounded corners, stroked, its attributes in the order the cleaner writes them. */
function rect(x: number, y: number, width: number, height: number, color: string): string {
  return `<rect fill="none" height="${height}" rx="2" stroke="${color}" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" width="${width}" x="${x}" y="${y}"/>`;
}

const OPEN = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">';
const CLOSE = '</svg>';

/**
 * A T-account, as accountants sketch one: debits written on the left of the stem, credits on the
 * right. Each kind of account draws it in its own color.
 */
function tAccount(id: string, name: string, color: string): SvgImage {
  return icon(
    id,
    name,
    `${OPEN}<path d="M3 6h18M12 6v14" ${strokes(color)}/><path d="M5 10h4M5 14h4M15 10h4" ${strokes(color)}/>${CLOSE}`,
  );
}

/** A bound book with ruled lines: the ledger that holds accounts. */
export const LEDGER_ICON = icon(
  'finance.ledger-icon',
  'Ledger',
  `${OPEN}${rect(5, 3, 15, 18, '#6B7A8C')}<path d="M9 3v18M12.5 8h4M12.5 12h4" ${strokes('#6B7A8C')}/>${CLOSE}`,
);

/** The T-accounts of an account and of each of its kinds. */
export const ACCOUNT_ICONS = {
  account: tAccount('finance.account-icon', 'Account', '#6B7A8C'),
  asset: tAccount('finance.asset-account-icon', 'Asset account', '#3F7AC0'),
  liability: tAccount('finance.liability-account-icon', 'Liability account', '#A86E0A'),
  equity: tAccount('finance.equity-account-icon', 'Equity account', '#7A5BC4'),
  revenue: tAccount('finance.revenue-account-icon', 'Revenue account', '#2F8A57'),
  expense: tAccount('finance.expense-account-icon', 'Expense account', '#C0503F'),
} as const;

/** A page ruled into two columns, debits on the left and credits on the right: a journal entry. */
export const JOURNAL_ENTRY_ICON = icon(
  'finance.journal-entry-icon',
  'Journal entry',
  `${OPEN}${rect(4, 3, 16, 18, '#5A7290')}<path d="M12 7v10M7 9h3M7 12h3M14 12h3M14 15h3" ${strokes('#5A7290')}/>${CLOSE}`,
);

/** Two arrows that go opposite ways: value exchanged. */
export const TRANSACTION_ICON = icon(
  'finance.transaction-icon',
  'Transaction',
  `${OPEN}<path d="M4 8h14M15 5l3 3-3 3" ${strokes('#3F7AC0')}/><path d="M20 16H6M9 13l-3 3 3 3" ${strokes('#3F7AC0')}/>${CLOSE}`,
);

/** A banknote. */
export const PAYMENT_ICON = icon(
  'finance.payment-icon',
  'Payment',
  `${OPEN}${rect(2, 6, 20, 12, '#2F8A57')}<circle cx="12" cy="12" fill="none" r="2.5" stroke="#2F8A57" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M6 10v4M18 10v4" ${strokes('#2F8A57')}/>${CLOSE}`,
);

/** A bill torn off a roll, its lines over a jagged foot. */
export const INVOICE_ICON = icon(
  'finance.invoice-icon',
  'Invoice',
  `${OPEN}<path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5z" ${strokes('#9A7400')}/><path d="M9 8h6M9 12h6M9 16h3" ${strokes('#9A7400')}/>${CLOSE}`,
);

/** A building with a lower wing: a company, a customer, a bank. */
export const PARTY_ICON = icon(
  'finance.party-icon',
  'Party',
  `${OPEN}<path d="M5 21V4a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v17M14 9h4a1 1 0 0 1 1 1v11M3 21h18" ${strokes('#A86E0A')}/><path d="M8 7h3M8 11h3M8 15h3" ${strokes('#A86E0A')}/>${CLOSE}`,
);

/** A price that rises over a base line: something whose value is quoted. */
export const INSTRUMENT_ICON = icon(
  'finance.instrument-icon',
  'Instrument',
  `${OPEN}<path d="M3 20h18" ${strokes('#6470D2')}/><path d="M5 16l4-5 4 3 6-8M15 6h4v4" ${strokes('#6470D2')}/>${CLOSE}`,
);

/** A briefcase: holdings kept together. */
export const PORTFOLIO_ICON = icon(
  'finance.portfolio-icon',
  'Portfolio',
  `${OPEN}${rect(3, 7, 18, 13, '#5A7290')}<path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18" ${strokes('#5A7290')}/>${CLOSE}`,
);

/** A circle with one slice filled: a share of a portfolio. */
export const POSITION_ICON = icon(
  'finance.position-icon',
  'Position',
  `${OPEN}<circle cx="12" cy="12" fill="none" r="9" stroke="#6470D2" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M12 12V3a9 9 0 0 1 9 9z" fill="#6470D2"/>${CLOSE}`,
);

/** A warning triangle. */
export const RISK_ICON = icon(
  'finance.risk-icon',
  'Risk',
  `${OPEN}<path d="M12 3.5l9.5 16.5h-19z" ${strokes('#C44D80')}/><path d="M12 10v4.5" ${strokes('#C44D80')}/><circle cx="12" cy="17.25" fill="#C44D80" r="1.25"/>${CLOSE}`,
);

/** A shield with a check mark. */
export const CONTROL_ICON = icon(
  'finance.control-icon',
  'Control',
  `${OPEN}<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" ${strokes('#21897C')}/><path d="M8.5 12l2.5 2.5 4.5-5" ${strokes('#21897C')}/>${CLOSE}`,
);

/** Every icon of the package, in the order its components show them. */
export const FINANCE_ICONS: readonly SvgImage[] = [
  LEDGER_ICON,
  ACCOUNT_ICONS.account,
  ACCOUNT_ICONS.asset,
  ACCOUNT_ICONS.liability,
  ACCOUNT_ICONS.equity,
  ACCOUNT_ICONS.revenue,
  ACCOUNT_ICONS.expense,
  JOURNAL_ENTRY_ICON,
  TRANSACTION_ICON,
  PAYMENT_ICON,
  INVOICE_ICON,
  PARTY_ICON,
  INSTRUMENT_ICON,
  PORTFOLIO_ICON,
  POSITION_ICON,
  RISK_ICON,
  CONTROL_ICON,
];
