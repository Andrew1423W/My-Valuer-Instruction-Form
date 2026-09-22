import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, desc, eq, notInArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { jobs, jobEvents, valuers, clients, salesEvidence, rentalEvidence } from '@/db/schema';
import { STATUS_META } from '@/lib/status';
import { StatusBadge, RatingBadge, SectionCard, Field, Empty } from '@/components/ui';
import { StatusMover } from '@/components/status-mover';
import { updateJobDetails, addComparable, updateComparable, removeComparable, addJobNote } from '@/app/actions';
import {
  money, shortDate, dateTime, area, propertyType, ratePerSqm, yieldPct, titleCase, daysUntil, nzInputValue,
} from '@/lib/format';
import { REPORT_TYPES_BY_TEMPLATE, REPORT_TYPE_LABELS } from '@/report/job-fields';

export const dynamic = 'force-dynamic';

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isFinite(id)) notFound();

  const job = await db.query.jobs.findFirst({
    where: eq(jobs.id, id),
    with: {
      property: true,
      instructor: true,
      client: true,
      clientOrg: true,
      allocatedTo: true,
      takenBy: true,
      authorisedBy: true,
      inspections: { with: { inspectedBy: true, photos: true }, orderBy: [desc(sql`inspected_at`)] },
      comparables: { with: { sale: true, rental: true }, orderBy: [asc(sql`sort_order`)] },
      events: { with: { valuer: true }, orderBy: [desc(jobEvents.at)] },
    },
  });
  if (!job) notFound();

  const [staff, clientOrgs] = await Promise.all([
    db.select().from(valuers).where(eq(valuers.active, true)).orderBy(asc(valuers.name)),
    db.select().from(clients).where(eq(clients.active, true)).orderBy(asc(clients.name)),
  ]);
  const inspection = job.inspections[0] ?? null;
  const dd = daysUntil(job.dueDate);

  // Candidate evidence for the comparable picker: same property type first,
  // most recent first, excluding anything already attached.
  const usedSales = job.comparables.map((c) => c.salesEvidenceId).filter(Boolean) as number[];
  const usedRentals = job.comparables.map((c) => c.rentalEvidenceId).filter(Boolean) as number[];

  const saleCandidates = await db
    .select()
    .from(salesEvidence)
    .where(usedSales.length ? notInArray(salesEvidence.id, usedSales) : undefined)
    .orderBy(
      sql`case when ${salesEvidence.propertyType}::text = ${job.property.propertyType ?? ''} then 0 else 1 end`,
      desc(salesEvidence.saleDate),
    )
    .limit(40);

  const rentalCandidates = await db
    .select()
    .from(rentalEvidence)
    .where(usedRentals.length ? notInArray(rentalEvidence.id, usedRentals) : undefined)
    .orderBy(
      sql`case when ${rentalEvidence.propertyType}::text = ${job.property.propertyType ?? ''} then 0 else 1 end`,
      desc(rentalEvidence.commencementDate),
    )
    .limit(40);

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------- header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <Link href="/jobs" className="text-[12px] font-bold text-gray-500 hover:text-navy">← Pipeline</Link>
            <span className="text-[12px] text-gray-400">/</span>
            <span className="text-[13px] font-extrabold text-navy-600">{job.jobNo}</span>
            <StatusBadge status={job.status} />
            {job.isQuote && (
              <span className="text-[10.5px] font-extrabold uppercase tracking-wide bg-slate-100 border border-slate-200 text-slate-700 rounded-full px-2 py-[2px]">
                Quote
              </span>
            )}
          </div>
          <h1 className="text-[22px] font-extrabold text-navy mt-1">{job.property.address}</h1>
          <p className="text-[12.5px] text-gray-500">
            {[job.property.suburb, job.property.town, job.property.region].filter(Boolean).join(', ')} ·{' '}
            {propertyType(job.property.propertyType)}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href={`/jobs/${job.id}/inspection`} className="btn btn-ghost">
            {inspection ? 'Edit inspection' : 'Start inspection'}
          </Link>
          <Link href={`/jobs/${job.id}/report`} className="btn btn-primary">Write the report</Link>
          <a href={`/api/jobs/${job.id}/report`} className="btn btn-ghost">Download (.docx)</a>
        </div>
      </div>

      <StatusMover jobId={job.id} status={job.status} />

      <div className="grid lg:grid-cols-3 gap-4">
        {/* ------------------------------------------------------ property */}
        <SectionCard title="Property">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Legal description">{job.property.legalDescription ?? '—'}</Field>
            <Field label="Record of title">{job.property.titleNo ?? '—'}</Field>
            <Field label="Estate">{job.property.estate ?? '—'}</Field>
            <Field label="Zoning">{job.property.zoning ?? '—'}</Field>
            <Field label="Land area">{area(job.property.landArea)}</Field>
            <Field label="Floor area">{area(job.property.floorArea)}</Field>
            <Field label="Year built">{job.property.yearBuilt ?? '—'}</Field>
            <Field label="Seismic">{job.property.nbsRating ?? '—'}</Field>
            <Field label="Council rates">{money(job.property.councilRates)}</Field>
            <Field label="Regional rates">{money(job.property.regionalRates)}</Field>
            <Field label="Rating valuation">
              {job.property.ratingCapitalValue
                ? `${money(job.property.ratingCapitalValue)} CV (${money(job.property.ratingLandValue)} LV)`
                : '—'}
            </Field>
            <Field label="Rating effective">{shortDate(job.property.ratingEffectiveDate)}</Field>
          </div>
        </SectionCard>

        {/* -------------------------------------------------------- parties */}
        <SectionCard title="Parties & instruction">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Client">
              {job.clientOrg ? (
                <Link href={`/clients/${job.clientOrg.id}`} className="font-bold text-navy hover:underline">
                  {job.clientOrg.name}
                </Link>
              ) : '—'}
              {job.clientOrg?.division && (
                <div className="text-[11.5px] text-gray-500">{job.clientOrg.division}</div>
              )}
            </Field>
            <Field label="Report">
              {REPORT_TYPE_LABELS[job.reportType]}
              <div className="text-[11.5px] text-gray-500">{job.reportTemplate} master template</div>
            </Field>
            <Field label="Instructor">
              {job.instructor ? (
                <>
                  {job.instructor.name}
                  {job.instructor.company && <div className="text-[11.5px] text-gray-500">{job.instructor.company}</div>}
                  {job.instructor.phone && <div className="text-[11.5px] text-gray-500">{job.instructor.phone}</div>}
                </>
              ) : '—'}
            </Field>
            <Field label="Named contact">
              {job.client ? (
                <>
                  {job.client.name}
                  {job.client.phone && <div className="text-[11.5px] text-gray-500">{job.client.phone}</div>}
                  {job.client.email && <div className="text-[11.5px] text-gray-500 break-all">{job.client.email}</div>}
                </>
              ) : '—'}
            </Field>
            <Field label="Borrower">{job.borrower ?? '—'}</Field>
            <Field label="Purpose">{job.purpose ?? '—'}</Field>
            <Field label="Basis of value">{job.basis ?? '—'}</Field>
            <Field label="VOS order no.">{job.vosOrderNo ?? '—'}</Field>
            <Field label="Instructed">{shortDate(job.instructionDate)} ({job.takenBy?.initials ?? '—'})</Field>
            <Field label="Counter-signed by">{job.authorisedBy?.name ?? 'Not counter-signed'}</Field>
            <Field label="Due">
              <span className={dd !== null && dd < 0 ? 'text-red-700 font-bold' : ''}>{shortDate(job.dueDate)}</span>
            </Field>
            <Field label="Site contact">
              {job.appointmentName ?? '—'}
              {job.appointmentPhone && <div className="text-[11.5px] text-gray-500">{job.appointmentPhone}</div>}
            </Field>
            <Field label="Inspection">{dateTime(job.inspectionAt)}</Field>
          </div>
          {job.purposeDetail && (
            <p className="mt-3 pt-3 border-t border-[var(--color-line)] text-[12.5px] text-gray-700">{job.purposeDetail}</p>
          )}
        </SectionCard>

        {/* ---------------------------------------------------- conclusions */}
        <SectionCard title="Valuation & management">
          <form action={updateJobDetails} className="space-y-3">
            <input type="hidden" name="jobId" value={job.id} />
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2">
                <span className="label">Client</span>
                <select name="clientOrgId" defaultValue={job.clientOrgId ?? ''} className="select">
                  <option value="">— None —</option>
                  {clientOrgs.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.division ? ` — ${c.division}` : ''}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">Report template</span>
                <select name="reportTemplate" defaultValue={job.reportTemplate} className="select">
                  <option value="commercial">Commercial master</option>
                  <option value="residential">Residential master</option>
                </select>
              </label>
              <label>
                <span className="label">Report type</span>
                <select name="reportType" defaultValue={job.reportType} className="select">
                  {[...new Set([...REPORT_TYPES_BY_TEMPLATE.commercial, ...REPORT_TYPES_BY_TEMPLATE.residential])].map(
                    (t) => <option key={t} value={t}>{REPORT_TYPE_LABELS[t]}</option>,
                  )}
                </select>
              </label>
              <label>
                <span className="label">Allocated to</span>
                <select name="allocatedToId" defaultValue={job.allocatedToId ?? ''} className="select">
                  <option value="">Unallocated</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label>
                <span className="label">Due date</span>
                <input type="date" name="dueDate" defaultValue={job.dueDate ?? ''} className="input" />
              </label>
              <label>
                <span className="label">Inspection date/time</span>
                <input
                  type="datetime-local"
                  name="inspectionAt"
                  defaultValue={job.inspectionAt ? nzInputValue(job.inspectionAt) : ''}
                  className="input"
                />
              </label>
              <label>
                <span className="label">Effective date</span>
                <input type="date" name="effectiveDate" defaultValue={job.effectiveDate ?? ''} className="input" />
              </label>
              <label>
                <span className="label">Market value</span>
                <input name="adoptedValue" defaultValue={job.adoptedValue ?? ''} placeholder="1,520,000" className="input" />
              </label>
              <label>
                <span className="label">Market rental (pa)</span>
                <input name="adoptedRental" defaultValue={job.adoptedRental ?? ''} placeholder="292,500" className="input" />
              </label>
              <label>
                <span className="label">Adopted yield %</span>
                <input name="adoptedYield" defaultValue={job.adoptedYield ?? ''} placeholder="7.25" className="input" />
              </label>
              <label>
                <span className="label">Rate $/m²</span>
                <input name="adoptedRate" defaultValue={job.adoptedRate ?? ''} placeholder="1,033" className="input" />
              </label>
              <label>
                <span className="label">Land value</span>
                <input name="adoptedLandValue" defaultValue={job.adoptedLandValue ?? ''} className="input" />
              </label>
              <label>
                <span className="label">Insurance replacement</span>
                <input name="insuranceReplacement" defaultValue={job.insuranceReplacement ?? ''} className="input" />
              </label>
              <label>
                <span className="label">Fee — market</span>
                <input name="feeMarket" defaultValue={job.feeMarket ?? ''} className="input" />
              </label>
              <label>
                <span className="label">Fee — insurance</span>
                <input name="feeInsurance" defaultValue={job.feeInsurance ?? ''} className="input" />
              </label>
              <label className="col-span-2">
                <span className="label">Counter-signed by</span>
                <select name="authorisedById" defaultValue={job.authorisedById ?? ''} className="select">
                  <option value="">Not counter-signed</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="label">File notes</span>
              <textarea name="notes" defaultValue={job.notes ?? ''} rows={3} className="textarea" />
            </label>
            <button type="submit" className="btn btn-primary">Save</button>
          </form>
        </SectionCard>
      </div>

      {/* ------------------------------------------------------- inspection */}
      <SectionCard
        title="Inspection"
        action={
          <Link href={`/jobs/${job.id}/inspection`} className="text-[11.5px] font-bold text-navy-600">
            {inspection ? 'Edit →' : 'Record inspection →'}
          </Link>
        }
      >
        {!inspection ? (
          <Empty>No inspection recorded. Open the inspection form on a phone while on site.</Empty>
        ) : (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-4 gap-3">
              <Field label="Inspected">{dateTime(inspection.inspectedAt)}</Field>
              <Field label="By">{inspection.inspectedBy?.name ?? '—'}</Field>
              <Field label="Present">{inspection.presentAt ?? '—'}</Field>
              <Field label="Measured floor area">{area(inspection.measuredFloorArea)}</Field>
              <Field label="Construction">{inspection.construction ?? '—'}</Field>
              <Field label="Roof">{inspection.roof ?? '—'}</Field>
              <Field label="Condition">{inspection.condition ?? '—'}</Field>
              <Field label="Services">{inspection.services ?? '—'}</Field>
              <Field label="Carparking">{inspection.carparking ?? '—'}</Field>
              <Field label="Seismic">{inspection.nbsRating ?? '—'}</Field>
              <Field label="Seismic source">{inspection.nbsSource ?? '—'}</Field>
              <Field label="Deferred maintenance">{inspection.deferredMaintenance ?? '—'}</Field>
            </div>

            {(inspection.accommodation?.length ?? 0) > 0 && (
              <div>
                <div className="label">Accommodation schedule</div>
                <table className="data max-w-lg">
                  <thead><tr><th>Area</th><th className="num">m²</th><th>Notes</th></tr></thead>
                  <tbody>
                    {inspection.accommodation!.map((a, i) => (
                      <tr key={i}>
                        <td>{a.label}</td>
                        <td className="num">{a.areaSqm}</td>
                        <td className="text-gray-500">{a.notes ?? ''}</td>
                      </tr>
                    ))}
                    <tr className="font-bold">
                      <td>Total</td>
                      <td className="num">
                        {inspection.accommodation!.reduce((t, a) => t + (Number(a.areaSqm) || 0), 0).toFixed(0)}
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {inspection.notes && <p className="text-[12.5px] text-gray-700">{inspection.notes}</p>}

            {inspection.photos.length > 0 && (
              <div>
                <div className="label">Photos ({inspection.photos.length})</div>
                <div className="flex gap-2 flex-wrap">
                  {inspection.photos.map((p) => (
                    <figure key={p.id} className="w-32">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/photos/${p.id}`} alt={p.caption ?? 'Inspection photo'} className="w-32 h-24 object-cover rounded border border-[var(--color-line)]" />
                      <figcaption className="text-[10.5px] text-gray-500 mt-0.5 truncate">{p.caption ?? ''}</figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* ------------------------------------------------------ comparables */}
      <SectionCard
        title="Comparable evidence"
        action={<Link href="/evidence" className="text-[11.5px] font-bold text-navy-600">Evidence ledger →</Link>}
      >
        {job.comparables.length === 0 ? (
          <Empty>No comparables attached yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>#</th><th>Address</th><th>Date</th><th className="num">Price / Rent</th>
                  <th className="num">Area</th><th className="num">Rate</th><th className="num">Yield</th>
                  <th>Rating & commentary</th><th />
                </tr>
              </thead>
              <tbody>
                {job.comparables.map((c, i) => {
                  const s = c.sale;
                  const r = c.rental;
                  return (
                    <tr key={c.id}>
                      <td className="font-bold">{i + 1}</td>
                      <td>
                        {s?.address ?? r?.address}
                        <div className="text-[11.5px] text-gray-500">
                          {[s?.suburb ?? r?.suburb, s?.town ?? r?.town].filter(Boolean).join(', ')}
                          {r && ` · ${titleCase(r.kind)}`}
                        </div>
                      </td>
                      <td className="whitespace-nowrap">{shortDate(s?.saleDate ?? r?.commencementDate)}</td>
                      <td className="num whitespace-nowrap">{money(s?.salePrice ?? r?.annualRent)}{r && ' pa'}</td>
                      <td className="num whitespace-nowrap">{area(s?.floorArea ?? r?.lettableArea)}</td>
                      <td className="num whitespace-nowrap">
                        {s ? ratePerSqm(s.salePrice, s.floorArea) : ratePerSqm(r!.annualRent, r!.lettableArea)}
                      </td>
                      <td className="num whitespace-nowrap">{s ? yieldPct(s.netIncome, s.salePrice) : '—'}</td>
                      <td className="min-w-[320px]">
                        <form action={updateComparable} className="space-y-1.5">
                          <input type="hidden" name="comparableId" value={c.id} />
                          <input type="hidden" name="jobId" value={job.id} />
                          <div className="flex items-center gap-2">
                            <select name="rating" defaultValue={c.rating ?? ''} className="select !w-auto !py-1 !text-[12px]">
                              <option value="">Rate…</option>
                              <option value="inferior">Inferior</option>
                              <option value="comparable">Comparable</option>
                              <option value="superior">Superior</option>
                            </select>
                            <RatingBadge rating={c.rating} />
                            <button type="submit" className="btn btn-ghost !py-1 !px-2 !text-[11px]">Save</button>
                          </div>
                          <textarea
                            name="commentary"
                            defaultValue={c.commentary ?? ''}
                            rows={3}
                            placeholder="Comparison commentary — location, age, seismic, tenure, overall assessment…"
                            className="textarea !text-[12px]"
                          />
                        </form>
                      </td>
                      <td>
                        <form action={removeComparable.bind(null, c.id, job.id)}>
                          <button type="submit" className="text-[11px] text-red-700 font-bold hover:underline">Remove</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-[var(--color-line)] grid md:grid-cols-2 gap-4">
          <form action={addComparable} className="flex flex-col gap-2">
            <input type="hidden" name="jobId" value={job.id} />
            <input type="hidden" name="kind" value="sale" />
            <span className="label !mb-0">Attach a sale</span>
            <select name="evidenceId" className="select" required defaultValue="">
              <option value="" disabled>Choose a sale…</option>
              {saleCandidates.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.address} — {shortDate(s.saleDate)} — {money(s.salePrice)} ({propertyType(s.propertyType)})
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <select name="rating" className="select !w-auto" defaultValue="">
                <option value="">Rating…</option>
                <option value="inferior">Inferior</option>
                <option value="comparable">Comparable</option>
                <option value="superior">Superior</option>
              </select>
              <button type="submit" className="btn btn-ghost">Attach sale</button>
            </div>
          </form>

          <form action={addComparable} className="flex flex-col gap-2">
            <input type="hidden" name="jobId" value={job.id} />
            <input type="hidden" name="kind" value="rental" />
            <span className="label !mb-0">Attach a letting / review</span>
            <select name="evidenceId" className="select" required defaultValue="">
              <option value="" disabled>Choose rental evidence…</option>
              {rentalCandidates.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.address} — {shortDate(r.commencementDate)} — {money(r.annualRent)} pa ({titleCase(r.kind)})
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <select name="rating" className="select !w-auto" defaultValue="">
                <option value="">Rating…</option>
                <option value="inferior">Inferior</option>
                <option value="comparable">Comparable</option>
                <option value="superior">Superior</option>
              </select>
              <button type="submit" className="btn btn-ghost">Attach rental</button>
            </div>
          </form>
        </div>
      </SectionCard>

      {/* --------------------------------------------------------- timeline */}
      <SectionCard title="File history">
        <form action={async (fd: FormData) => { 'use server'; await addJobNote(job.id, String(fd.get('note') ?? '')); }} className="flex gap-2 mb-3">
          <input name="note" placeholder="Add a file note…" className="input" />
          <button type="submit" className="btn btn-ghost whitespace-nowrap">Add note</button>
        </form>
        <ol className="space-y-2">
          {job.events.map((e) => (
            <li key={e.id} className="flex gap-3 text-[12.5px]">
              <span className="text-gray-500 w-32 shrink-0 tabular-nums">{dateTime(e.at)}</span>
              <span className="font-bold w-8 shrink-0">{e.valuer?.initials ?? '—'}</span>
              <span className="text-gray-700">
                {e.detail}
                {e.kind === 'status_change' && e.toStatus && (
                  <span className="text-gray-400">
                    {' '}({e.fromStatus ? STATUS_META[e.fromStatus].label + ' → ' : ''}{STATUS_META[e.toStatus].label})
                  </span>
                )}
              </span>
            </li>
          ))}
          {job.events.length === 0 && <Empty>Nothing logged yet.</Empty>}
        </ol>
      </SectionCard>
    </div>
  );
}

