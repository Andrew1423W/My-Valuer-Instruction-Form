import type { JobStatus } from '@/db/schema';

export const STATUS_ORDER: JobStatus[] = [
  'quote',
  'instructed',
  'inspection_booked',
  'inspected',
  'drafting',
  'qa_review',
  'issued',
];

export const STATUS_META: Record<JobStatus, { label: string; short: string; tone: string }> = {
  quote:             { label: 'Quote sent',        short: 'Quote',      tone: 'slate' },
  instructed:        { label: 'Instructed',        short: 'Instructed', tone: 'blue' },
  inspection_booked: { label: 'Inspection booked', short: 'Booked',     tone: 'indigo' },
  inspected:         { label: 'Inspected',         short: 'Inspected',  tone: 'teal' },
  drafting:          { label: 'Drafting',          short: 'Drafting',   tone: 'amber' },
  qa_review:         { label: 'QA review',         short: 'QA',         tone: 'purple' },
  issued:            { label: 'Issued',            short: 'Issued',     tone: 'green' },
  on_hold:           { label: 'On hold',           short: 'Hold',       tone: 'orange' },
  cancelled:         { label: 'Cancelled',         short: 'Cancelled',  tone: 'grey' },
};

/** Statuses that count as work in progress for KPI tiles. */
export const LIVE_STATUSES: JobStatus[] = [
  'instructed',
  'inspection_booked',
  'inspected',
  'drafting',
  'qa_review',
];

export function isLive(s: JobStatus) {
  return LIVE_STATUSES.includes(s);
}
