/**
 * What the start screen and the Projects screen say about each sample the program holds, by its id
 * (ADR 0051, ADR 0093); each text goes through `t()` where it is shown.
 */
export const SAMPLE_TEXTS: Readonly<Record<string, { title: string; description: string }>> = {
  'c4-architecture': {
    title: 'C4 architecture: internet banking',
    description:
      'A bank’s internet banking system, from the people who use it down to its components and the servers it runs on, with a scenario of a customer signing in.',
  },
  'data-science-pipeline': {
    title: 'Data science pipeline: churn prediction',
    description:
      'The data a subscription business turns into a churn model, and the dashboards it feeds, with a scenario of the nightly run.',
  },
  'churn-classifier': {
    title: 'Machine learning: churn classifier',
    description:
      'A Transformer that reads each customer’s last 90 events to tell who will cancel, beside the pipeline that feeds it, with a scenario of its forward pass.',
  },
  'robot-arm': {
    title: 'Physical AI: a pick-and-place arm',
    description:
      'A six-axis arm drawn as a solid that turns, its links and joints anchored to its parts, with its motors and encoders, its control loop and its software, and a scenario in which it picks a part.',
  },
  'order-process': {
    title: 'Processes and state machines: an online order',
    description:
      'An online shop’s order, from the customer’s order through a stock check to shipping, and the states it goes through, with a scenario of an order that ships.',
  },
  'clinic-claim': {
    title: 'Healthcare: a clinic’s claim',
    description:
      'An invented clinic bills an invented insurer for a knee MRI, from the visit through its authorization to payment or denial, with the audit that reviews the claim and the patient’s care plan.',
  },
  'workshop-books': {
    title: 'Finance: a workshop’s books',
    description:
      'An invented furniture workshop’s books, from an invoice through its payment to the general ledger by double entry, and the small portfolio that holds its reserve, with a scenario that decides how a payment is recorded.',
  },
  'bookshop-database': {
    title: 'Data modeling: a bookshop’s database',
    description:
      'An invented online bookshop’s tables in two schemas, its catalog and its sales, with their columns, keys and the foreign keys between them, and a scenario that follows an order’s keys from its customer to a book’s author.',
  },
};
