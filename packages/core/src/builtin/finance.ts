/**
 * The built-in "Finance" package (P6, ADR 0079): the books kept by double entry, and the holdings,
 * risks and controls around them.
 *
 * - A ledger holds accounts, each of one kind: asset, liability, equity, revenue or expense.
 * - A journal entry records one event, such as an invoice or a payment, and posts to a ledger. Its
 *   lines, drawn as its rows, each debit or credit one account by an amount, and its debits and
 *   credits balance. Whether a line debits or credits is the relation it starts, which its row writes
 *   as "Dr" or "Cr" beside its amount.
 * - Transactions, payments among them, and invoices are what entries record; parties issue invoices
 *   and pay them, and payments settle them.
 * - A portfolio holds positions, each holding an instrument; anything can be exposed to a risk, and
 *   controls mitigate risks and check what they guard.
 *
 * Its icons are drawn for Visual Anything, CC0-1.0, and its shapes are the kinds. Amounts are plain
 * numbers, in the currency their element or its ledger names: the package converts nothing, and an
 * entry's balance is the data's to keep, which its sample's test checks.
 *
 * Once projects use these ids, they change only by additions: built-in packages have no versions yet
 * (ADR 0018).
 */
import type { AttributeDefinition, Component, PackageFile } from '@visual-anything/schema';
import { OWN_CREDITS } from './credits';
import {
  ACCOUNT_ICONS,
  CONTROL_ICON,
  FINANCE_ICONS,
  INSTRUMENT_ICON,
  INVOICE_ICON,
  JOURNAL_ENTRY_ICON,
  LEDGER_ICON,
  PARTY_ICON,
  PAYMENT_ICON,
  PORTFOLIO_ICON,
  POSITION_ICON,
  RISK_ICON,
  TRANSACTION_ICON,
} from './finance-images';

const CURRENCY: AttributeDefinition = {
  name: 'currency',
  type: 'string',
  description: 'The currency its amounts are in, as a three-letter code such as "EUR".',
};

const AMOUNT: AttributeDefinition = {
  name: 'amount',
  type: 'number',
  description: 'How much, in its currency.',
};

const DATE: AttributeDefinition = {
  name: 'date',
  type: 'string',
  description: 'When it happened, as a date such as "2026-03-31".',
};

const NUMBER: AttributeDefinition = {
  name: 'number',
  type: 'string',
  description: 'The number it is filed under, such as "JE-0107" or "INV-0107".',
};

/** A kind of account: its colors, its icon, and which side of an entry increases it. */
function accountKind(
  kind: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense',
  name: string,
  description: string,
  fill: string,
  stroke: string,
): Component {
  return {
    id: `finance.${kind}-account`,
    name,
    derivesFrom: 'finance.account',
    description,
    appearance: { fill, stroke, image: { image: ACCOUNT_ICONS[kind].id } },
  };
}

export const FINANCE: PackageFile = {
  id: 'finance',
  name: 'Finance',
  description:
    'Ledgers and the accounts they hold, journal entries whose lines debit and credit accounts by double entry, transactions, payments and invoices, instruments held in portfolios by positions, and the risks and controls over them.',
  ...OWN_CREDITS,
  components: [
    {
      id: 'finance.ledger',
      name: 'Ledger',
      derivesFrom: 'essence',
      description:
        'A book of accounts, such as a company’s general ledger, holding its accounts; journal entries post to it.',
      attributes: [CURRENCY],
      appearance: {
        shape: 'rectangle',
        fill: '#FAFBFC',
        stroke: '#5B6878',
        width: 480,
        height: 320,
        detail: { attributes: ['currency'] },
        image: { image: LEDGER_ICON.id },
      },
    },
    {
      id: 'finance.account',
      name: 'Account',
      derivesFrom: 'essence',
      description:
        'A record in a ledger of what is owned, owed, earned or spent, which journal entries debit and credit. Each kind of account derives from it.',
      attributes: [
        {
          name: 'code',
          type: 'string',
          description: 'Its code in the chart of accounts, such as "1200".',
        },
        {
          name: 'balance',
          type: 'number',
          description:
            'What it holds at the end of the period, in its ledger’s currency, on the side that increases it.',
        },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#F3F5F7',
        stroke: '#4A5A6A',
        width: 192,
        height: 72,
        detail: { componentName: true, attributes: ['code'] },
        image: { image: ACCOUNT_ICONS.account.id },
      },
    },
    accountKind(
      'asset',
      'Asset account',
      'What the company owns or is owed, such as cash in the bank or what customers owe; a debit increases it.',
      '#E3EEFB',
      '#1C5DA6',
    ),
    accountKind(
      'liability',
      'Liability account',
      'What the company owes others, such as tax due or a loan; a credit increases it.',
      '#FFF0D4',
      '#865400',
    ),
    accountKind(
      'equity',
      'Equity account',
      'What the owners have put in and the earnings kept; a credit increases it.',
      '#F1ECFB',
      '#5A3A9C',
    ),
    accountKind(
      'revenue',
      'Revenue account',
      'What is earned, such as sales; a credit increases it.',
      '#DDF3E6',
      '#1B6B3F',
    ),
    accountKind(
      'expense',
      'Expense account',
      'What is spent to earn it, such as materials or rent; a debit increases it.',
      '#FBE3E1',
      '#A23B2E',
    ),
    {
      id: 'finance.journal-entry',
      name: 'Journal entry',
      derivesFrom: 'essence',
      description:
        'The record of one event in the books, such as an invoice or a payment, dated and numbered. Its lines debit and credit accounts by equal totals, and it posts to a ledger. It draws its lines as its rows.',
      attributes: [NUMBER, DATE],
      appearance: {
        shape: 'rectangle',
        fill: '#EEF2F6',
        stroke: '#3E5774',
        width: 320,
        detail: { componentName: false, attributes: ['date'] },
        contentsAsRows: true,
        image: { image: JOURNAL_ENTRY_ICON.id },
      },
    },
    {
      id: 'finance.entry-line',
      name: 'Entry line',
      derivesFrom: 'essence',
      description:
        'One line of a journal entry: it debits or credits one account by its amount. Its row writes the amount, and "Dr" or "Cr" by the relation it starts.',
      attributes: [
        { ...AMOUNT, description: 'How much it debits or credits, in its ledger’s currency.' },
      ],
      appearance: {
        shape: 'rectangle',
        fill: '#FFFFFF',
        stroke: '#3E5774',
        width: 200,
        height: 32,
        detail: {
          componentName: false,
          attributes: ['amount'],
          badges: [
            { when: 'from-end', text: 'Dr', relationType: 'finance.debits' },
            { when: 'from-end', text: 'Cr', relationType: 'finance.credits' },
          ],
        },
      },
    },
    {
      id: 'finance.transaction',
      name: 'Transaction',
      derivesFrom: 'essence',
      description:
        'An exchange of value, such as a sale, a purchase, a transfer or a trade, which journal entries record.',
      attributes: [
        {
          name: 'kind',
          type: 'string',
          description: 'What it is: a sale, a purchase, a transfer or a trade.',
          choices: ['sale', 'purchase', 'transfer', 'trade'],
        },
        AMOUNT,
        CURRENCY,
        DATE,
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#EFF5FD',
        stroke: '#2F6DB5',
        width: 192,
        height: 80,
        detail: { componentName: false, attributes: ['amount', 'currency'] },
        image: { image: TRANSACTION_ICON.id },
      },
    },
    {
      id: 'finance.payment',
      name: 'Payment',
      derivesFrom: 'finance.transaction',
      description:
        'Money that moves from one party to another, which settles an invoice or a debt.',
      attributes: [
        {
          name: 'method',
          type: 'string',
          description: 'How it is paid: by bank transfer, by card, by direct debit or in cash.',
          choices: ['transfer', 'card', 'direct debit', 'cash'],
        },
      ],
      appearance: {
        fill: '#E3F3E8',
        stroke: '#1E6B43',
        image: { image: PAYMENT_ICON.id },
      },
    },
    {
      id: 'finance.invoice',
      name: 'Invoice',
      derivesFrom: 'essence',
      description:
        'A bill a party issues for what it sold, with the amount due and the date it is due by; a payment settles it.',
      attributes: [
        NUMBER,
        AMOUNT,
        CURRENCY,
        { name: 'dueDate', type: 'string', description: 'When it is due, such as "2026-04-30".' },
        {
          name: 'status',
          type: 'string',
          description: 'Where it stands: open, paid, overdue or canceled.',
          choices: ['open', 'paid', 'overdue', 'canceled'],
        },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#FFF6D6',
        stroke: '#7A5A00',
        width: 192,
        height: 80,
        detail: { componentName: false, attributes: ['amount', 'currency'] },
        image: { image: INVOICE_ICON.id },
      },
    },
    {
      id: 'finance.party',
      name: 'Party',
      derivesFrom: 'essence',
      description:
        'A person or an organization the books deal with, such as a customer, a supplier, a bank, or the company that keeps them.',
      attributes: [
        {
          name: 'role',
          type: 'string',
          description:
            'Who it is to the books: the company that keeps them, a customer, a supplier, a bank, a broker, an employee or an authority, such as the tax office.',
          choices: ['company', 'customer', 'supplier', 'bank', 'broker', 'employee', 'authority'],
        },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#FDE8CC',
        stroke: '#8A5A12',
        width: 176,
        height: 72,
        detail: { componentName: false, attributes: ['role'] },
        image: { image: PARTY_ICON.id },
      },
    },
    {
      id: 'finance.instrument',
      name: 'Instrument',
      derivesFrom: 'essence',
      description:
        'Something that is held and has a price, such as a share, a bond, a fund or a deposit; positions hold it.',
      attributes: [
        {
          name: 'kind',
          type: 'string',
          description: 'What it is: a share, a bond, a fund, a deposit or a derivative.',
          choices: ['share', 'bond', 'fund', 'deposit', 'derivative'],
        },
        {
          name: 'identifier',
          type: 'string',
          description: 'Its identifier where it is traded, such as an ISIN.',
        },
        CURRENCY,
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#E8EAFB',
        stroke: '#3A4AA8',
        width: 192,
        height: 72,
        detail: { componentName: false, attributes: ['kind'] },
        image: { image: INSTRUMENT_ICON.id },
      },
    },
    {
      id: 'finance.portfolio',
      name: 'Portfolio',
      derivesFrom: 'essence',
      description: 'Holdings kept and managed together, holding its positions.',
      attributes: [CURRENCY],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#F4F6F9',
        stroke: '#3E5774',
        width: 240,
        height: 96,
        detail: { attributes: ['currency'] },
        image: { image: PORTFOLIO_ICON.id },
      },
    },
    {
      id: 'finance.position',
      name: 'Position',
      derivesFrom: 'essence',
      description: 'How much of one instrument a portfolio holds, and what it is worth.',
      attributes: [
        { name: 'quantity', type: 'number', description: 'How many units of the instrument.' },
        {
          name: 'value',
          type: 'number',
          description: 'What it is worth at the latest price, in its portfolio’s currency.',
        },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#EEF0FC',
        stroke: '#3A4AA8',
        width: 192,
        height: 72,
        detail: { componentName: false, attributes: ['value'] },
        image: { image: POSITION_ICON.id },
      },
    },
    {
      id: 'finance.risk',
      name: 'Risk',
      derivesFrom: 'essence',
      description:
        'Something that could cost money, such as prices falling, a customer not paying or a payment going astray.',
      attributes: [
        {
          name: 'category',
          type: 'string',
          description:
            'What kind of risk it is: market, credit, liquidity, operational or compliance.',
          choices: ['market', 'credit', 'liquidity', 'operational', 'compliance'],
        },
        {
          name: 'likelihood',
          type: 'string',
          description: 'How likely it is: low, medium or high.',
          choices: ['low', 'medium', 'high'],
        },
        {
          name: 'impact',
          type: 'string',
          description: 'How much it would cost if it happened: low, medium or high.',
          choices: ['low', 'medium', 'high'],
        },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#FBE4EE',
        stroke: '#8A1F4C',
        width: 192,
        height: 72,
        detail: { componentName: false, attributes: ['category'] },
        image: { image: RISK_ICON.id },
      },
    },
    {
      id: 'finance.control',
      name: 'Control',
      derivesFrom: 'essence',
      description:
        'A check that keeps a risk in hand, such as matching payments to invoices or reconciling the bank account; it mitigates risks and checks what it guards.',
      attributes: [
        {
          name: 'kind',
          type: 'string',
          description:
            'How it works: preventive, before something goes wrong; detective, finding it after; or corrective, putting it right.',
          choices: ['preventive', 'detective', 'corrective'],
        },
        {
          name: 'frequency',
          type: 'string',
          description: 'How often it runs, such as "each payment" or "monthly".',
        },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#DDF2F0',
        stroke: '#0D6B60',
        width: 192,
        height: 72,
        detail: { componentName: false, attributes: ['kind'] },
        image: { image: CONTROL_ICON.id },
      },
    },
  ],
  relationTypes: [
    {
      id: 'finance.posts-to',
      name: 'posts to',
      derivesFrom: 'relates-to',
      description:
        'Enters a journal entry in the ledger whose accounts its lines debit and credit.',
      direction: 'directed',
      appearance: { stroke: '#3D4651', width: 2 },
      limits: { from: ['finance.journal-entry'], to: ['finance.ledger'] },
    },
    {
      id: 'finance.debits',
      name: 'debits',
      derivesFrom: 'relates-to',
      description:
        'A line of a journal entry enters its amount on the left side of an account: it increases an asset or an expense, and decreases the others.',
      direction: 'directed',
      appearance: { stroke: '#1C5DA6', width: 2 },
      limits: { from: ['finance.entry-line'], to: ['finance.account'] },
    },
    {
      id: 'finance.credits',
      name: 'credits',
      derivesFrom: 'relates-to',
      description:
        'A line of a journal entry enters its amount on the right side of an account: it increases a liability, equity or revenue, and decreases the others.',
      direction: 'directed',
      appearance: { stroke: '#5A3A9C', width: 2 },
      limits: { from: ['finance.entry-line'], to: ['finance.account'] },
    },
    {
      id: 'finance.records',
      name: 'records',
      derivesFrom: 'relates-to',
      description:
        'A journal entry enters in the books the transaction, payment or invoice it is made from.',
      direction: 'directed',
      limits: {
        from: ['finance.journal-entry'],
        to: ['finance.transaction', 'finance.invoice'],
      },
    },
    {
      id: 'finance.issues',
      name: 'issues',
      derivesFrom: 'relates-to',
      description: 'A party bills another with an invoice.',
      direction: 'directed',
      limits: { from: ['finance.party'], to: ['finance.invoice'] },
    },
    {
      id: 'finance.pays',
      name: 'pays',
      derivesFrom: 'relates-to',
      description: 'A party pays an invoice, or pays another party.',
      direction: 'directed',
      appearance: { stroke: '#1B6B3F', width: 2 },
      limits: { from: ['finance.party'], to: ['finance.invoice', 'finance.party'] },
    },
    {
      id: 'finance.settles',
      name: 'settles',
      derivesFrom: 'relates-to',
      description:
        'A payment, or another transaction, pays off what is owed: an invoice, or a transaction it closes.',
      direction: 'directed',
      limits: { from: ['finance.transaction'], to: ['finance.invoice', 'finance.transaction'] },
    },
    {
      id: 'finance.holds',
      name: 'holds',
      derivesFrom: 'relates-to',
      description:
        'A position holds its instrument; a party holds a portfolio or an account it owns.',
      direction: 'directed',
      limits: {
        from: ['finance.position', 'finance.portfolio', 'finance.party'],
        to: ['finance.instrument', 'finance.portfolio', 'finance.account'],
      },
    },
    {
      id: 'finance.is-exposed-to',
      name: 'is exposed to',
      derivesFrom: 'relates-to',
      description:
        'Could lose value if the risk happened: an account, a position, an instrument, a payment.',
      direction: 'directed',
      appearance: { stroke: '#A23B2E', width: 1.5, dash: 'dotted' },
      limits: { to: ['finance.risk'] },
    },
    {
      id: 'finance.mitigates',
      name: 'mitigates',
      derivesFrom: 'relates-to',
      description: 'A control makes a risk less likely, or less costly when it happens.',
      direction: 'directed',
      appearance: { stroke: '#0D6B60', width: 2 },
      limits: { from: ['finance.control'], to: ['finance.risk'] },
    },
    {
      id: 'finance.checks',
      name: 'checks',
      derivesFrom: 'relates-to',
      description: 'A control looks at what it guards, such as each payment that comes in.',
      direction: 'directed',
      limits: { from: ['finance.control'] },
    },
    {
      id: 'finance.is-part-of',
      name: 'is part of',
      derivesFrom: 'relates-to',
      description:
        'Places an account in its ledger, a line in its journal entry, or a position in its portfolio.',
      direction: 'directed',
      nests: true,
      limits: {
        to: ['finance.ledger', 'finance.journal-entry', 'finance.portfolio'],
      },
    },
  ],
  images: [...FINANCE_ICONS],
};
