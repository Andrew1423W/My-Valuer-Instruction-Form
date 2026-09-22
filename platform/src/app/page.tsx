import Link from 'next/link';
import { and, asc, count, desc, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { db } from '@/db';
import { jobs, valuers, salesEvidence, rentalEvidence, jobEvents } from '@/db/schema';
import { LIVE_STATUSES, STATUS_META } from '@/lib/status';
import { StatTile, StatusBadge, SectionCard, Empty } from '@/components/ui';
import { shortDate, dateTime, daysUntil, money, nzToday, NZ_TZ } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** Deadlines are measured against the New Zealand calendar day, not the
 *  server's. */
function inDays(n: number) {
  const d = new Date(nzToday() + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function Dashboard() {
  const t = nzToday();

  const [live, overdue, dueWeek, awaitingInspection, inQa, evidenceCounts] = await Promise.all([
    db.select({ n: count() }).from(jobs).where(inArray(jobs.status, LIVE_STATUSES)),
    db
      .select({ n: count() })
      .from(jobs)
      .where(and(inArray(jobs.status, LIVE_STATUSES), isNotNull(jobs.dueDate), lte(jobs.dueDate, t))),
    db
      .select({ n: count() })
      .from(jobs)
      .where(
        and(inArray(jobs.status, LIVE_STATUSES), isNotNull(jobs.dueDate), gte(jobs.dueDate, t), lte(jobs.dueDate, inDays(7))),
      ),
    db.select({ n: count() }).from(jobs).where(inArray(jobs.status, ['instructed', 'inspection_booked'])),
    db.select({ n: count() }).from(jobs).where(eq(jobs.status, 'qa_review')),
    Promise.all([
      db.select({ n: count() }).from(salesEvidence),
      db.select({ n: count() }).from(rentalEvidence),
    ]),
  ]);

  const overdueJobs = await db.query.jobs.findMany({
    where: and(inArray(jobs.status, LIVE_STATUSES), isNotNull(jobs.dueDate), lte(jobs.dueDate, inDays(7))),
    with: { property: true, allocatedTo: true, instructor: true },
    orderBy: [asc(jobs.dueDate)],
    limit: 8,
  });

  const upcomingInspections = await db.query.jobs.findMany({
    where: and(isNotNull(jobs.inspectionAt), inArray(jobs.status, ['instructed', 'inspection_booked', 'inspected'])),
    with: { property: true, allocatedTo: true },
    orderBy: [asc(jobs.inspectionAt)],
    limit: 6,
  });

  const workload = await db
    .select({
      id: valuers.id,
      name: valuers.name,
      initials: valuers.initials,
      live: sql<number>`count(${jobs.id})`.mapWith(Number),
      overdue: sql<number>`count(${jobs.id}) filter (where ${jobs.dueDate} <= ${t})`.mapWith(Number),
      fees: sql<string>`coalesce(sum(coalesce(${jobs.feeMarket},0) + coalesce(${jobs.feeInsurance},0)),0)`,
    })
    .from(valuers)
    .leftJoin(jobs, and(eq(jobs.allocatedToId, valuers.id), inArray(jobs.status, LIVE_STATUSES)))
    .where(eq(valuers.active, true))
    .groupBy(valuers.id, valuers.name, valuers.initials)
    .orderBy(desc(sql`count(${jobs.id})`));

  const activity = await db.query.jobEvents.findMany({
    with: { job: { with: { property: true } }, valuer: true },
    orderBy: [desc(jobEvents.at)],
    limit: 8,
  });

  const byStatus = await db
    .select({ status: jobs.status, n: count() })
    .from(jobs)
    .groupBy(jobs.status);
  const statusMap = new Map(byStatus.map((r) => [r.status, Number(r.n)]));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-extrabold text-navy">Dashboard</h1>
          <p className="text-[12.5px] text-gray-500 mt-0.5">
            {new Date().toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: NZ_TZ })}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/jobs/new" className="btn btn-primary">+ New instruction</Link>
          <Link href="/jobs" className="btn btn-ghost">Open pipeline</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile label="Live jobs" value={Number(live[0].n)} sub="Instructed through QA" href="/jobs" />
        <StatTile
          label="Overdue"
          value={Number(overdue[0].n)}
          tone={Number(overdue[0].n) > 0 ? 'red' : 'navy'}
          sub="Past due date"
          href="/jobs?view=list&filter=overdue"
        />
        <StatTile label="Due in 7 days" value={Number(dueWeek[0].n)} tone="amber" sub="Next week's deadlines" />
        <StatTile label="Awaiting inspection" value={Number(awaitingInspection[0].n)} sub="Not yet inspected" />
        <StatTile label="In QA review" value={Number(inQa[0].n)} sub="Peer review before issue" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <SectionCard
          title="Due next 7 days & overdue"
          className="lg:col-span-2"
          action={<Link href="/jobs?view=list" className="text-[11.5px] font-bold text-navy-600">All jobs →</Link>}
        >
          {overdueJobs.length === 0 ? (
            <Empty>Nothing due in the next week.</Empty>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Property</th>
                  <th>Instructor</th>
                  <th>Valuer</th>
                  <th>Status</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {overdueJobs.map((j) => {
                  const dd = daysUntil(j.dueDate);
                  return (
                    <tr key={j.id}>
                      <td className="font-bold">
                        <Link href={`/jobs/${j.id}`} className="text-navy-600 hover:underline">{j.jobNo}</Link>
                      </td>
                      <td>{j.property.address}<div className="text-[11.5px] text-gray-500">{j.property.town}</div></td>
                      <td>{j.instructor?.company ?? j.instructor?.name ?? '—'}</td>
                      <td>{j.allocatedTo?.initials ?? '—'}</td>
                      <td><StatusBadge status={j.status} /></td>
                      <td className="whitespace-nowrap">
                        {shortDate(j.dueDate)}
                        <div className={'text-[11px] font-bold ' + (dd !== null && dd < 0 ? 'text-red-700' : 'text-gray-500')}>
                          {dd === null ? '' : dd < 0 ? `${Math.abs(dd)} days overdue` : dd === 0 ? 'Today' : `in ${dd} days`}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </SectionCard>

        <SectionCard title="Workload by valuer">
          <ul className="space-y-3">
            {workload.map((w) => (
              <li key={w.id} className="flex items-center gap-3">
                <span className="w-8 h-8 shrink-0 rounded-full bg-brand-pale text-navy grid place-items-center text-[11px] font-extrabold">
                  {w.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold truncate">{w.name}</span>
                  <span className="block text-[11.5px] text-gray-500">
                    {w.live} live{w.overdue > 0 && <span className="text-red-700 font-bold"> · {w.overdue} overdue</span>}
                    {Number(w.fees) > 0 && <> · {money(w.fees)} fees</>}
                  </span>
                </span>
                <span className="text-lg font-extrabold text-navy tabular-nums">{w.live}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <SectionCard title="Upcoming inspections">
          {upcomingInspections.length === 0 ? (
            <Empty>No inspections booked.</Empty>
          ) : (
            <ul className="divide-y divide-[#eef2f7]">
              {upcomingInspections.map((j) => (
                <li key={j.id} className="py-2 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link href={`/jobs/${j.id}`} className="text-[13px] font-bold text-navy-600 hover:underline">
                      {j.property.address}
                    </Link>
                    <span className="text-[11.5px] text-gray-500 whitespace-nowrap">{j.allocatedTo?.initials}</span>
                  </div>
                  <div className="text-[11.5px] text-gray-500">{dateTime(j.inspectionAt)} · {j.jobNo}</div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Pipeline by stage">
          <ul className="space-y-1.5">
            {Object.entries(STATUS_META).map(([k, m]) => {
              const n = statusMap.get(k as keyof typeof STATUS_META) ?? 0;
              return (
                <li key={k} className="flex items-center gap-2 text-[13px]">
                  <span className="flex-1">{m.label}</span>
                  <span className="h-1.5 rounded bg-brand" style={{ width: `${Math.min(n * 18, 90)}px` }} />
                  <span className="w-6 text-right font-bold tabular-nums">{n}</span>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 pt-3 border-t border-[var(--color-line)] text-[11.5px] text-gray-500">
            Evidence held: <strong>{Number(evidenceCounts[0][0].n)}</strong> sales ·{' '}
            <strong>{Number(evidenceCounts[1][0].n)}</strong> rentals ·{' '}
            <Link href="/evidence" className="text-navy-600 font-bold">browse →</Link>
          </div>
        </SectionCard>

        <SectionCard title="Recent activity">
          {activity.length === 0 ? (
            <Empty>No activity recorded yet.</Empty>
          ) : (
            <ul className="divide-y divide-[#eef2f7]">
              {activity.map((e) => (
                <li key={e.id} className="py-2 first:pt-0 last:pb-0">
                  <div className="text-[12.5px]">
                    <Link href={`/jobs/${e.jobId}`} className="font-bold text-navy-600 hover:underline">
                      {e.job?.jobNo}
                    </Link>{' '}
                    <span className="text-gray-700">{e.detail ?? e.kind}</span>
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {e.valuer?.initials ?? '—'} · {dateTime(e.at)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
