/** Client labels, kept beside the other display helpers rather than in a page. */
export const CLIENT_KIND_LABELS: Record<string, string> = {
  bank: 'Bank',
  non_bank_lender: 'Non-bank lender',
  law_firm: 'Law firm',
  accountant: 'Accountant',
  corporate: 'Corporate',
  government: 'Government',
  council: 'Council',
  trust: 'Trust',
  private: 'Private',
  other: 'Other',
};

export function clientKind(v: string | null | undefined): string {
  if (!v) return '—';
  return CLIENT_KIND_LABELS[v] ?? v;
}
