import Link from 'next/link';
import { STATUS_META } from '@/lib/status';
import type { JobStatus } from '@/db/schema';

const TONES: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
  blue: 'bg-blue-50 text-blue-800 border-blue-200',
  indigo: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  teal: 'bg-teal-50 text-teal-800 border-teal-200',
  amber: 'bg-amber-50 text-amber-900 border-amber-200',
  purple: 'bg-purple-50 text-purple-800 border-purple-200',
  green: 'bg-green-50 text-green-800 border-green-200',
  orange: 'bg-orange-50 text-orange-900 border-orange-200',
  grey: 'bg-gray-100 text-gray-600 border-gray-200',
};

export function StatusBadge({ status }: { status: JobStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className={`inline-block border rounded-full px-2 py-[2px] text-[10.5px] font-extrabold uppercase tracking-wide ${TONES[m.tone]}`}
    >
      {m.short}
    </span>
  );
}

export function RatingBadge({ rating }: { rating: 'inferior' | 'comparable' | 'superior' | null }) {
  if (!rating) return <span className="text-gray-400">—</span>;
  const tone =
    rating === 'inferior'
      ? 'bg-amber-50 text-amber-900 border-amber-200'
      : rating === 'superior'
        ? 'bg-purple-50 text-purple-800 border-purple-200'
        : 'bg-teal-50 text-teal-800 border-teal-200';
  return (
    <span className={`inline-block border rounded px-2 py-[2px] text-[10.5px] font-extrabold uppercase tracking-wide ${tone}`}>
      {rating}
    </span>
  );
}

export function StatTile({
  label,
  value,
  sub,
  href,
  tone = 'navy',
}: {
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
  tone?: 'navy' | 'red' | 'amber' | 'green';
}) {
  const colour =
    tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : tone === 'green' ? 'text-green-700' : 'text-navy';
  const inner = (
    <div className="card p-4 h-full">
      <div className="panel-title">{label}</div>
      <div className={`text-3xl font-extrabold mt-2 leading-none ${colour}`}>{value}</div>
      {sub && <div className="text-[11.5px] text-gray-500 mt-1.5">{sub}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block hover:brightness-[0.99]">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="text-[13.5px] break-words">{children ?? '—'}</div>
    </div>
  );
}

export function SectionCard({
  title,
  action,
  children,
  className = '',
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--color-line)]">
        <h2 className="panel-title">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-gray-500 italic py-2">{children}</p>;
}
