/**
 * What the start screen and the Projects screen say about each sample the program holds, by its id
 * (ADR 0051, ADR 0093): its title, its description in full for the start screen, and its summary in
 * one short line for the Projects screen's cards. Each text goes through `t()` where it is shown.
 */
export const SAMPLE_TEXTS: Readonly<
  Record<string, { title: string; description: string; summary: string }>
> = {
  'c4-architecture': {
    title: 'C4 architecture: internet banking',
    description:
      'A bank’s internet banking system, from the people who use it down to its components and the servers it runs on, with a scenario of a customer signing in.',
    summary: 'From the people who use a bank’s internet banking down to its servers.',
  },
  'data-science-pipeline': {
    title: 'Data science pipeline: churn prediction',
    description:
      'The data a subscription business turns into a churn model, and the dashboards it feeds, with a scenario of the nightly run.',
    summary: 'How a subscription business turns its data into a churn model.',
  },
  'churn-classifier': {
    title: 'Machine learning: churn classifier',
    description:
      'A Transformer that reads each customer’s last 90 events to tell who will cancel, beside the pipeline that feeds it, with a scenario of its forward pass.',
    summary: 'A Transformer that reads each customer’s last events to tell who will cancel.',
  },
  'spam-filter': {
    title: 'Machine learning: the math of a spam filter',
    description:
      'A logistic regression that tells spam from wanted email, written out in Math: the probability it gives, the log loss it brings down, how gradient descent trains it and how it is judged, with a scenario that scores a batch of emails and a tour of its math.',
    summary: 'A spam filter’s probability, loss and training, written out in Math.',
  },
  'quadratic-function': {
    title: 'Math: a quadratic function',
    description:
      'The quadratic function f(x) = ax² + bx + c, its coefficients, discriminant and roots written out in Math, and an explorable that draws its parabola as a, b and c change, with a tour that sets them step by step. The explorable runs once you approve it.',
    summary: 'A quadratic function’s parabola, drawn live as its coefficients change.',
  },
  'robot-arm': {
    title: 'Physical AI: a pick-and-place arm',
    description:
      'A six-axis arm drawn as a solid that turns, its links and joints anchored to its parts, with its motors and encoders, its control loop and its software, and a scenario in which it picks a part.',
    summary:
      'A six-axis arm drawn as a solid that turns, with its motors, control loop and software.',
  },
  'order-process': {
    title: 'Processes and state machines: an online order',
    description:
      'An online shop’s order, from the customer’s order through a stock check to shipping, and the states it goes through, with a scenario of an order that ships.',
    summary: 'An online order, from its stock check to shipping, and the states it goes through.',
  },
  'clinic-claim': {
    title: 'Healthcare: a clinic’s claim',
    description:
      'An invented clinic bills an invented insurer for a knee MRI, from the visit through its authorization to payment or denial, with the audit that reviews the claim and the patient’s care plan.',
    summary: 'A clinic’s claim for a knee MRI, from the visit to payment or denial, and its audit.',
  },
  'workshop-books': {
    title: 'Finance: a workshop’s books',
    description:
      'An invented furniture workshop’s books, from an invoice through its payment to the general ledger by double entry, and the small portfolio that holds its reserve, with a scenario that decides how a payment is recorded.',
    summary: 'A workshop’s books, from an invoice to the general ledger by double entry.',
  },
  'bookshop-database': {
    title: 'Data modeling: a bookshop’s database',
    description:
      'An invented online bookshop’s tables in two schemas, its catalog and its sales, with their columns, keys and the foreign keys between them, and a scenario that follows an order’s keys from its customer to a book’s author.',
    summary: 'A bookshop’s tables in two schemas, their keys and the foreign keys between them.',
  },
};
