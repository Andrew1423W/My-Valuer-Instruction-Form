import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { clients, contacts, jobs } from '@/db/schema';
import { addClientContact, updateClient } from '@/app/actions';
import { Empty, Field, SectionCard, StatTile, StatusBadge } from '@/components/ui';
import { money, shortDate } from '@/lib/format';
import { CLIENT_KIND_LABELS } from '@/lib/clients';
import { REPORT_TYPE_LABELS } from '@/report/job-fields';

export const dynamic = 'force-dynamic';

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isFinite(id)) notFound();

  const [client] = await db.select().from(clients).where(eq(clients.id, id));
  if (!client) notFound();

  const [people, work] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.clientId, id)).orderBy(asc(contacts.name)),
    db.query.jobs.findMany({
      where: eq(jobs.clientOrgId, id),
      with: { property: true, allocatedTo: true },
      orderBy: [desc(jobs.instructionDate), desc(jobs.id)],
      limit: 100,
    }),
  ]);

  const open = work.filter((j) => j.status !== 'issued' && j.status !== 'cancelled');
  const fees = work.reduce((sum, j) => sum + Number(j.feeMarket ?? 0) + Number(j.feeInsurance ?? 0), 0);
  const issued = work.filter((j) => j.status === 'issued');

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <Link href="/clients" className="text-[12px] font-bold text-gray-500 hover:text-navy">← Clients</Link>
          <h1 className="text-[22px] font-extrabold text-navy mt-1">{client.name}</h1>
          <p className="text-[12.5px] text-gray-500">
            {CLIENT_KIND_LABELS[client.kind] ?? client.kind}
            {client.division ? ` · ${client.division}` : ''}
            {client.active ? '' : ' · archived'}
          </p>
        </div>
        <Link href={`/jobs/new?clientOrgId=${client.id}`} className="btn btn-primary">New job for this client</Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Jobs" value={work.length} sub="all time" />
        <StatTile label="Open" value={open.length} sub="not yet issued" tone={open.length ? 'amber' : 'navy'} />
        <StatTile label="Issued" value={issued.length} />
        <StatTile label="Fees" value={money(fees)} sub="market and insurance" tone="green" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <SectionCard title="Client record" className="lg:col-span-2">
          <form action={updateClient} className="grid sm:grid-cols-2 gap-3">
            <input type="hidden" name="clientId" value={client.id} />
            <label className="sm:col-span-2">
              <span className="label">Name</span>
              <input name="name" className="input" defaultValue={client.name} required />
            </label>
            <label>
              <span className="label">Type</span>
              <select name="kind" className="select" defaultValue={client.kind}>
                {Object.entries(CLIENT_KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>
              <span className="label">Division / branch</span>
              <input name="division" className="input" defaultValue={client.division ?? ''} />
            </label>
            <label className="sm:col-span-2">
              <span className="label">Postal address</span>
              <input name="address" className="input" defaultValue={client.address ?? ''} />
            </label>
            <label><span className="label">Phone</span><input name="phone" className="input" defaultValue={client.phone ?? ''} /></label>
            <label><span className="label">Reports to</span><input name="reportsEmail" type="email" className="input" defaultValue={client.reportsEmail ?? ''} /></label>
            <label><span className="label">Accounts email</span><input name="accountsEmail" type="email" className="input" defaultValue={client.accountsEmail ?? ''} /></label>
            <label><span className="label">Standard fee ($)</span><input name="defaultFee" className="input" defaultValue={client.defaultFee ?? ''} /></label>
            <label><span className="label">Turnaround (days)</span><input name="defaultTurnaroundDays" className="input" defaultValue={client.defaultTurnaroundDays ?? ''} /></label>
            <label className="sm:col-span-2">
              <span className="label">Standing terms</span>
              <textarea name="terms" rows={2} className="textarea" defaultValue={client.terms ?? ''} />
            </label>
            <label className="sm:col-span-2">
              <span className="label">Notes</span>
              <textarea name="notes" rows={2} className="textarea" defaultValue={client.notes ?? ''} />
            </label>
            <label className="flex items-center gap-2 text-[13px] font-bold text-navy sm:col-span-2">
              <input type="checkbox" name="active" className="w-4 h-4" defaultChecked={client.active} />
              Still instructing us
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className="btn btn-primary">Save client</button>
            </div>
          </form>
        </SectionCard>

        <SectionCard title={`Contacts — ${people.length}`}>
          {people.length === 0 ? (
            <Empty>No named contacts yet.</Empty>
          ) : (
            <ul className="space-y-3">
              {people.map((c) => (
                <li key={c.id} className="border-b border-[var(--color-line)] pb-2 last:border-0 last:pb-0">
                  <div className="font-bold text-[13.5px] text-navy">{c.name}</div>
                  {c.company && <div className="text-[11.5px] text-gray-500">{c.company}</div>}
                  <div className="text-[12px] text-gray-600">
                    {[c.email, c.phone].filter(Boolean).join(' · ') || '—'}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form action={addClientContact} className="mt-4 pt-3 border-t border-[var(--color-line)] space-y-2">
            <input type="hidden" name="clientId" value={client.id} />
            <div className="label">Add a contact</div>
            <input name="contactName" className="input" placeholder="Name" required />
            <input name="contactEmail" type="email" className="input" placeholder="Email" />
            <input name="contactPhone" className="input" placeholder="Phone" />
            <button type="submit" className="btn btn-ghost w-full">Add contact</button>
          </form>
        </SectionCard>
      </div>

      <SectionCard title={`Jobs — ${work.length}`}>
        {work.length === 0 ? (
          <Empty>No jobs for this client yet.</Empty>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="table min-w-[820px]">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Property</th>
                  <th>Report</th>
                  <th>Status</th>
                  <th>Instructed</th>
                  <th>Due</th>
                  <th>Valuer</th>
                  <th className="text-right">Fee</th>
                </tr>
              </thead>
              <tbody>
                {work.map((j) => (
                  <tr key={j.id}>
                    <td>
                      <Link href={`/jobs/${j.id}`} className="font-bold text-navy hover:underline">{j.jobNo}</Link>
                    </td>
                    <td>{j.property.address}{j.property.town ? `, ${j.property.town}` : ''}</td>
                    <td className="text-[12.5px]">{REPORT_TYPE_LABELS[j.reportType]}</td>
                    <td><StatusBadge status={j.status} /></td>
                    <td>{shortDate(j.instructionDate)}</td>
                    <td>{shortDate(j.dueDate)}</td>
                    <td>{j.allocatedTo?.name ?? '—'}</td>
                    <td className="text-right">{money(j.feeMarket)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Reports sent to">{client.reportsEmail ?? '—'}</Field>
        <Field label="Invoices sent to">{client.accountsEmail ?? '—'}</Field>
        <Field label="On the books since">{shortDate(client.createdAt)}</Field>
      </div>
    </div>
  );
}
