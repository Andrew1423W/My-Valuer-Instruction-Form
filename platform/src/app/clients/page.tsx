import Link from 'next/link';
import { asc, count, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { clients, jobs } from '@/db/schema';
import { SectionCard, Empty } from '@/components/ui';
import { money } from '@/lib/format';
import { clientKind } from '@/lib/clients';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  // One query: the client, how much work it has sent, and what is still open.
  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      kind: clients.kind,
      division: clients.division,
      reportsEmail: clients.reportsEmail,
      defaultFee: clients.defaultFee,
      defaultTurnaroundDays: clients.defaultTurnaroundDays,
      active: clients.active,
      jobCount: count(jobs.id),
      openCount: sql<number>`count(${jobs.id}) filter (where ${jobs.status} not in ('issued', 'cancelled'))`,
      feesBilled: sql<string | null>`sum(${jobs.feeMarket})`,
    })
    .from(clients)
    .leftJoin(jobs, eq(jobs.clientOrgId, clients.id))
    .groupBy(clients.id)
    .orderBy(asc(clients.name));

  const active = rows.filter((r) => r.active);
  const archived = rows.filter((r) => !r.active);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[22px] font-extrabold text-navy">Clients</h1>
          <p className="text-[12.5px] text-gray-500">
            The organisations that instruct us. A job belongs to one, and the report is addressed to it.
          </p>
        </div>
        <Link href="/clients/new" className="btn btn-primary">New client</Link>
      </div>

      <SectionCard title={`Active — ${active.length}`}>
        {active.length === 0 ? (
          <Empty>No clients yet. Add the first one to start allocating jobs against it.</Empty>
        ) : (
          <ClientTable rows={active} />
        )}
      </SectionCard>

      {archived.length > 0 && (
        <SectionCard title={`Archived — ${archived.length}`}>
          <ClientTable rows={archived} />
        </SectionCard>
      )}
    </div>
  );
}

type Row = {
  id: number;
  name: string;
  kind: string;
  division: string | null;
  reportsEmail: string | null;
  defaultFee: string | null;
  defaultTurnaroundDays: number | null;
  jobCount: number;
  openCount: number;
  feesBilled: string | null;
};

function ClientTable({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="table min-w-[760px]">
        <thead>
          <tr>
            <th>Client</th>
            <th>Type</th>
            <th>Reports to</th>
            <th className="text-right">Jobs</th>
            <th className="text-right">Open</th>
            <th className="text-right">Fees</th>
            <th className="text-right">Standard fee</th>
            <th className="text-right">Turnaround</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <Link href={`/clients/${r.id}`} className="font-bold text-navy hover:underline">
                  {r.name}
                </Link>
                {r.division && <div className="text-[11.5px] text-gray-500">{r.division}</div>}
              </td>
              <td>{clientKind(r.kind)}</td>
              <td className="text-[12.5px]">{r.reportsEmail ?? '—'}</td>
              <td className="text-right">{r.jobCount}</td>
              <td className="text-right font-bold">{Number(r.openCount) || '—'}</td>
              <td className="text-right">{money(r.feesBilled)}</td>
              <td className="text-right">{money(r.defaultFee)}</td>
              <td className="text-right">
                {r.defaultTurnaroundDays ? `${r.defaultTurnaroundDays} days` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
