import Link from 'next/link';
import { and, asc, desc, eq, inArray, isNotNull, lte, ne, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { jobs, valuers } from '@/db/schema';
import { LIVE_STATUSES } from '@/lib/status';
import { KanbanBoard, type KanbanJob } from '@/components/kanban';
import { StatusBadge } from '@/components/ui';
import { shortDate, daysUntil, money, propertyType, nzToday } from '@/lib/format';

export const dynamic = 'force-dynamic';

type Search = { view?: string; filter?: string; valuer?: string };

export default async function JobsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const view = sp.view === 'list' ? 'list' : 'board';
  const today = nzToday();

  const conditions = [];
  if (sp.filter === 'overdue') {
    conditions.push(and(inArray(jobs.status, LIVE_STATUSES), isNotNull(jobs.dueDate), lte(jobs.dueDate, today)));
  } else if (sp.filter === 'live') {
    conditions.push(inArray(jobs.status, LIVE_STATUSES));
  } else if (view === 'board') {
    // The board shows everything except finished work, which would swamp it.
    conditions.push(or(ne(jobs.status, 'cancelled'), sql`false`)!);
  }
  if (sp.valuer) conditions.push(eq(jobs.allocatedToId, Number(sp.valuer)));

  const rows = await db.query.jobs.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    with: { property: true, allocatedTo: true, client: true, instructor: true },
    orderBy: view === 'list' ? [desc(jobs.instructionDate), desc(jobs.id)] : [asc(jobs.dueDate)],
    limit: 300,
  });

  const staff = await db.select().from(valuers).where(eq(valuers.active, true)).orderBy(asc(valuers.name));

  const boardJobs: KanbanJob[] = rows
    .filter((j) => j.status !== 'issued' || (j.issuedDate ?? '') >= addDays(today, -30))
    .map((j) => ({
      id: j.id,
      jobNo: j.jobNo,
      status: j.status,
      address: j.property.address,
      town: j.property.town,
      client: j.client?.name ?? null,
      instructor: j.instructor?.company ?? j.instructor?.name ?? null,
      valuer: j.allocatedTo?.initials ?? null,
      dueDate: j.dueDate,
      fee: j.feeMarket ?? j.feeInsurance,
      purpose: j.purpose,
    }));

  const tab = (label: string, params: string, active: boolean) => (
    <Link
      key={label}
      href={`/jobs${params}`}
      className={
        'px-3 py-1.5 rounded-md text-[12.5px] font-bold ' +
        (active ? 'bg-navy text-white' : 'bg-white border border-[var(--color-line)] text-navy hover:bg-brand-pale')
      }
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-extrabold text-navy">Job pipeline</h1>
          <p className="text-[12.5px] text-gray-500 mt-0.5">
            {view === 'board' ? 'Drag a job between stages to update it — every move is logged against the job.' : `${rows.length} jobs`}
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {tab('Board', '', view === 'board' && !sp.filter)}
          {tab('List', '?view=list', view === 'list' && !sp.filter)}
          {tab('Overdue', '?view=list&filter=overdue', sp.filter === 'overdue')}
          <Link href="/jobs/new" className="btn btn-primary">+ New instruction</Link>
        </div>
      </div>

      {view === 'board' ? (
        <KanbanBoard jobs={boardJobs} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Job</th>
                <th>Property</th>
                <th>Type</th>
                <th>Purpose</th>
                <th>Instructor</th>
                <th>Valuer</th>
                <th>Status</th>
                <th>Instructed</th>
                <th>Due</th>
                <th className="num">Fee</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => {
                const dd = daysUntil(j.dueDate);
                const late = dd !== null && dd < 0 && LIVE_STATUSES.includes(j.status);
                return (
                  <tr key={j.id}>
                    <td className="font-bold whitespace-nowrap">
                      <Link href={`/jobs/${j.id}`} className="text-navy-600 hover:underline">{j.jobNo}</Link>
                    </td>
                    <td>
                      {j.property.address}
                      <div className="text-[11.5px] text-gray-500">{[j.property.suburb, j.property.town].filter(Boolean).join(', ')}</div>
                    </td>
                    <td className="whitespace-nowrap">{propertyType(j.property.propertyType)}</td>
                    <td>{j.purpose ?? '—'}</td>
                    <td>{j.instructor?.company ?? j.instructor?.name ?? '—'}</td>
                    <td>{j.allocatedTo?.initials ?? '—'}</td>
                    <td><StatusBadge status={j.status} /></td>
                    <td className="whitespace-nowrap">{shortDate(j.instructionDate)}</td>
                    <td className={'whitespace-nowrap ' + (late ? 'text-red-700 font-bold' : '')}>{shortDate(j.dueDate)}</td>
                    <td className="num whitespace-nowrap">{money(j.feeMarket ?? j.feeInsurance)}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={10} className="text-gray-500 italic">No jobs match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {staff.length > 0 && (
        <div className="flex items-center gap-2 text-[12px] text-gray-500 flex-wrap">
          <span className="font-bold uppercase tracking-wide text-[10.5px]">Filter by valuer:</span>
          <Link href={`/jobs?view=${view}`} className="underline">All</Link>
          {staff.map((s) => (
            <Link key={s.id} href={`/jobs?view=${view}&valuer=${s.id}`} className={'underline ' + (sp.valuer === String(s.id) ? 'font-bold text-navy' : '')}>
              {s.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function addDays(iso: string, n: number) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
