import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { valuers, clients, contacts, properties } from '@/db/schema';
import { createJob } from '@/app/actions';
import { SectionCard } from '@/components/ui';
import { PROPERTY_TYPE_LABELS } from '@/lib/format';
import { CLIENT_KIND_LABELS } from '@/lib/clients';
import { REPORT_TYPES_BY_TEMPLATE, REPORT_TYPE_LABELS } from '@/report/job-fields';

export const dynamic = 'force-dynamic';

const PURPOSES = [
  'Mortgage / finance',
  'Insurance replacement',
  'Market rental assessment',
  'Rating objection',
  'Financial reporting',
  'Family / matrimonial',
  'Pre-purchase advice',
  'Sale advice',
  'Compensation',
  'Rent review',
];

const BASES = ['Market Value', 'Market Rental', 'Insurance Replacement', 'Fair Value', 'Compensation'];

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ clientOrgId?: string }>;
}) {
  const [staff, allContacts, existingProperties, clientOrgs, query] = await Promise.all([
    db.select().from(valuers).where(eq(valuers.active, true)).orderBy(asc(valuers.name)),
    db.select().from(contacts).orderBy(asc(contacts.name)),
    db.select().from(properties).orderBy(asc(properties.address)).limit(300),
    db.select().from(clients).where(eq(clients.active, true)).orderBy(asc(clients.name)),
    searchParams,
  ]);
  const preselectedClient = query.clientOrgId ?? '';

  const instructors = allContacts.filter((c) => c.type === 'instructor');
  const clientContacts = allContacts.filter((c) => c.type !== 'instructor');
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4 max-w-[1100px]">
      <div>
        <Link href="/jobs" className="text-[12px] font-bold text-gray-500 hover:text-navy">← Pipeline</Link>
        <h1 className="text-[22px] font-extrabold text-navy mt-1">New instruction</h1>
        <p className="text-[12.5px] text-gray-500">
          Leave the job number blank and the next number in this year&apos;s sequence is allocated automatically.
        </p>
      </div>

      <form action={createJob} className="space-y-4">
        <SectionCard title="Property">
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="sm:col-span-3">
              <span className="label">Existing property (optional — skip the fields below)</span>
              <select name="propertyId" className="select" defaultValue="">
                <option value="">— New property —</option>
                {existingProperties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.address}{p.town ? `, ${p.town}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="sm:col-span-2">
              <span className="label">Property address</span>
              <input name="address" className="input" placeholder="215 Heretaunga Street East" />
            </label>
            <label>
              <span className="label">Property type</span>
              <select name="propertyType" className="select" defaultValue="">
                <option value="">—</option>
                {Object.entries(PROPERTY_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label><span className="label">Suburb</span><input name="suburb" className="input" /></label>
            <label><span className="label">Town / city</span><input name="town" className="input" defaultValue="Napier" /></label>
            <label><span className="label">Record of title</span><input name="titleNo" className="input" /></label>
            <label className="sm:col-span-2"><span className="label">Legal description</span><input name="legalDescription" className="input" /></label>
            <label><span className="label">Seismic (NBS)</span><input name="nbsRating" className="input" placeholder="67% NBS (IL2)" /></label>
            <label><span className="label">Land area (m²)</span><input name="landArea" className="input" /></label>
            <label><span className="label">Floor area (m²)</span><input name="floorArea" className="input" /></label>
          </div>
        </SectionCard>

        <div className="grid lg:grid-cols-2 gap-4">
          <SectionCard title="Instructor">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="sm:col-span-2">
                <span className="label">Existing instructor</span>
                <select name="instructorId" className="select" defaultValue="">
                  <option value="">— New instructor —</option>
                  {instructors.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</option>
                  ))}
                </select>
              </label>
              <label><span className="label">Name</span><input name="instructorName" className="input" /></label>
              <label><span className="label">Company</span><input name="instructorCompany" className="input" /></label>
              <label><span className="label">Email</span><input name="instructorEmail" type="email" className="input" /></label>
              <label><span className="label">Phone</span><input name="instructorPhone" className="input" /></label>
            </div>
          </SectionCard>

          <SectionCard title="Client">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="sm:col-span-2">
                <span className="label">Client (the organisation the report is addressed to)</span>
                <select name="clientOrgId" className="select" defaultValue={preselectedClient}>
                  <option value="">— None —</option>
                  {clientOrgs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.division ? ` — ${c.division}` : ''}
                      {` (${CLIENT_KIND_LABELS[c.kind] ?? c.kind})`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sm:col-span-2">
                <span className="label">Named contact</span>
                <select name="clientId" className="select" defaultValue="">
                  <option value="">— New contact —</option>
                  {clientContacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label><span className="label">Name</span><input name="clientName" className="input" /></label>
              <label><span className="label">Phone</span><input name="clientPhone" className="input" /></label>
              <label><span className="label">Email</span><input name="clientEmail" type="email" className="input" /></label>
              <label><span className="label">Borrower</span><input name="borrower" className="input" /></label>
              <label className="sm:col-span-2"><span className="label">Postal address</span><input name="clientAddress" className="input" /></label>
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Instruction">
          <div className="grid sm:grid-cols-3 gap-3">
            <label>
              <span className="label">Purpose</span>
              <select name="purpose" className="select" defaultValue="Mortgage / finance">
                {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label>
              <span className="label">Basis</span>
              <select name="basis" className="select" defaultValue="Market Value">
                {BASES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
            <label>
              <span className="label">Report template</span>
              <select name="reportTemplate" className="select" defaultValue="commercial">
                <option value="commercial">Commercial master</option>
                <option value="residential">Residential master</option>
              </select>
            </label>
            <label>
              <span className="label">Report type</span>
              <select name="reportType" className="select" defaultValue="market_value">
                {[...new Set([...REPORT_TYPES_BY_TEMPLATE.commercial, ...REPORT_TYPES_BY_TEMPLATE.residential])].map(
                  (t) => <option key={t} value={t}>{REPORT_TYPE_LABELS[t]}</option>,
                )}
              </select>
            </label>
            <label>
              <span className="label">Counter-signed by</span>
              <select name="authorisedById" className="select" defaultValue="">
                <option value="">Not counter-signed</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label>
              <span className="label">Allocated to</span>
              <select name="allocatedToId" className="select" defaultValue="">
                <option value="">Unallocated</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label><span className="label">Job number</span><input name="jobNo" className="input" placeholder="auto" /></label>
            <label><span className="label">Instruction date</span><input type="date" name="instructionDate" defaultValue={today} className="input" /></label>
            <label><span className="label">Due date</span><input type="date" name="dueDate" className="input" /></label>
            <label><span className="label">VOS order no.</span><input name="vosOrderNo" className="input" /></label>
            <label><span className="label">PO number</span><input name="poNumber" className="input" /></label>
            <label><span className="label">Fee — market ($)</span><input name="feeMarket" className="input" placeholder="2,200" /></label>
            <label><span className="label">Fee — insurance ($)</span><input name="feeInsurance" className="input" /></label>
            <label><span className="label">Site contact name</span><input name="appointmentName" className="input" /></label>
            <label><span className="label">Site contact phone</span><input name="appointmentPhone" className="input" /></label>
            <label className="sm:col-span-3">
              <span className="label">Purpose detail / scope</span>
              <textarea name="purposeDetail" rows={2} className="textarea" />
            </label>
            <label className="sm:col-span-3">
              <span className="label">File notes</span>
              <textarea name="notes" rows={2} className="textarea" />
            </label>
            <label className="flex items-center gap-2 text-[13px] font-bold text-navy">
              <input type="checkbox" name="isQuote" className="w-4 h-4" />
              This is a quote, not a confirmed instruction
            </label>
          </div>
        </SectionCard>

        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary">Create job</button>
          <Link href="/jobs" className="btn btn-ghost">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
