import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  inspectionPhotos,
  inspections,
  jobReportRows,
  jobReportSwitches,
  jobReportValues,
  jobs,
} from '@/db/schema';
import { savePhotoSlots, saveReportRows, saveReportSection } from '@/app/actions';
import { Empty, SectionCard, StatTile } from '@/components/ui';
import { photoSlots } from '@/report/photo-slots';
import { entryProgress, entryRegions, entrySections, entrySwitches } from '@/report/entry';
import { REPORT_TYPE_LABELS, reportTypeSwitchField, templateSpec, REPORT_TYPE_SWITCH } from '@/report/job-fields';

export const dynamic = 'force-dynamic';

export default async function ReportEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isFinite(id)) notFound();

  const job = await db.query.jobs.findFirst({
    where: eq(jobs.id, id),
    with: { property: true, clientOrg: true },
  });
  if (!job) notFound();

  const [storedValues, storedSwitches, storedRows] = await Promise.all([
    db.select().from(jobReportValues).where(eq(jobReportValues.jobId, id)),
    db.select().from(jobReportSwitches).where(eq(jobReportSwitches.jobId, id)),
    db
      .select()
      .from(jobReportRows)
      .where(eq(jobReportRows.jobId, id))
      .orderBy(asc(jobReportRows.region), asc(jobReportRows.sortOrder)),
  ]);

  // Photographs come from the most recent inspection — the one the report describes.
  const latestInspection = await db.query.inspections.findFirst({
    where: eq(inspections.jobId, id),
    orderBy: [desc(inspections.inspectedAt)],
  });
  const photos = latestInspection
    ? await db
        .select()
        .from(inspectionPhotos)
        .where(eq(inspectionPhotos.inspectionId, latestInspection.id))
        .orderBy(asc(inspectionPhotos.sortOrder), asc(inspectionPhotos.id))
    : [];
  const slots = photoSlots(job.reportTemplate).filter((s) => !s.grid);

  const values = Object.fromEntries(storedValues.map((v) => [v.fieldName, v.value]));
  const rowsByRegion = new Map<string, Record<string, unknown>[]>();
  for (const r of storedRows) {
    const list = rowsByRegion.get(r.region) ?? [];
    list.push((r.values ?? {}) as Record<string, unknown>);
    rowsByRegion.set(r.region, list);
  }

  // The same defaults the fill uses, so the form shows the report that would
  // come out if the valuer pressed download now.
  const switches: Record<string, string> = {};
  for (const f of templateSpec(job.reportTemplate).switch_fields) switches[f] = 'No';
  for (const s of storedSwitches) switches[s.fieldName] = s.value;
  switches[reportTypeSwitchField(job.reportTemplate)] = REPORT_TYPE_SWITCH[job.reportType];

  const sections = entrySections(job.reportTemplate, switches);
  const questions = entrySwitches(job.reportTemplate, reportTypeSwitchField(job.reportTemplate));
  const schedules = entryRegions(job.reportTemplate, switches);
  const progress = entryProgress(job.reportTemplate, switches, values);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <Link href={`/jobs/${job.id}`} className="text-[12px] font-bold text-gray-500 hover:text-navy">
            ← {job.jobNo}
          </Link>
          <h1 className="text-[22px] font-extrabold text-navy mt-1">Report — {job.property.address}</h1>
          <p className="text-[12.5px] text-gray-500">
            {REPORT_TYPE_LABELS[job.reportType]} · {job.reportTemplate} master template
            {job.clientOrg ? ` · ${job.clientOrg.name}` : ''}
          </p>
        </div>
        <a href={`/api/jobs/${job.id}/report`} className="btn btn-primary">Download the report</a>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Written"
          value={`${progress.written} / ${progress.total}`}
          sub="fields this report needs"
          tone={progress.written === progress.total ? 'green' : 'amber'}
        />
        <StatTile label="Sections" value={sections.length} sub="from the template" />
        <StatTile label="Schedules" value={schedules.length} sub="tables to fill" />
        <StatTile label="Questions" value={questions.length} sub="decide what is included" />
      </div>

      <SectionCard title="What this report contains">
        <p className="text-[12.5px] text-gray-500 mb-3">
          Each answer adds or removes a section of the template. The fields below follow the answers,
          so a section you switch off stops asking for its wording.
        </p>
        <form action={saveReportSection} className="space-y-3">
          <input type="hidden" name="jobId" value={job.id} />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {questions.map((q) => (
              <label key={q.name} className="block">
                <span className="label">{q.label}</span>
                <select name={`switch:${q.name}`} defaultValue={switches[q.name] ?? 'No'} className="select">
                  {q.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <span className="block text-[11px] text-gray-400 mt-1">{q.effect}</span>
              </label>
            ))}
          </div>
          <button type="submit" className="btn btn-primary">Save answers</button>
        </form>
      </SectionCard>

      {sections.map((section) => (
        <SectionCard key={section.title} title={`${section.title} — ${section.fields.length}`}>
          <form action={saveReportSection} className="space-y-3">
            <input type="hidden" name="jobId" value={job.id} />
            <div className="grid sm:grid-cols-2 gap-3">
              {section.fields.map((f) => (
                <label key={f.name} className={f.long ? 'sm:col-span-2' : ''}>
                  <span className="label">{f.label}</span>
                  {f.long ? (
                    <textarea
                      name={`field:${f.name}`}
                      rows={3}
                      className="textarea"
                      defaultValue={values[f.name] ?? ''}
                    />
                  ) : (
                    <input
                      name={`field:${f.name}`}
                      className="input"
                      defaultValue={values[f.name] ?? ''}
                    />
                  )}
                </label>
              ))}
            </div>
            <button type="submit" className="btn btn-ghost">Save {section.title.toLowerCase()}</button>
          </form>
        </SectionCard>
      ))}

      <SectionCard title={`Photographs — ${photos.length}`}>
        <p className="text-[12.5px] text-gray-500 mb-3">
          Where each photograph from the inspection goes in the report. The slots come from the
          {' '}{job.reportTemplate} master template. Anything left on the back-page grid is laid out
          two to a row, in this order; a slot with no photograph is left out of the report rather
          than printed empty.
        </p>
        {photos.length === 0 ? (
          <Empty>
            No photographs yet — they come from the inspection.{' '}
            <Link href={`/jobs/${job.id}/inspection`} className="font-bold text-navy">
              Record an inspection
            </Link>
            .
          </Empty>
        ) : (
          <form action={savePhotoSlots} className="space-y-3">
            <input type="hidden" name="jobId" value={job.id} />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {photos.map((photo) => (
                <div key={photo.id} className="border border-gray-200 rounded-lg p-2 space-y-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/photos/${photo.id}`}
                    alt={photo.caption ?? 'Inspection photograph'}
                    className="w-full h-32 object-cover rounded bg-gray-100"
                  />
                  <label className="block">
                    <span className="label">Goes in</span>
                    <select
                      name={`slot:${photo.id}`}
                      defaultValue={photo.slot ?? ''}
                      className="select"
                    >
                      <option value="">Back-page grid</option>
                      {slots.map((s) => (
                        <option key={s.name} value={s.name}>
                          {s.label}
                          {s.section ? ` — ${s.section}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label">Caption</span>
                    <input
                      name={`caption:${photo.id}`}
                      className="input"
                      defaultValue={photo.caption ?? ''}
                      placeholder="Front elevation from Karamu Road"
                    />
                  </label>
                </div>
              ))}
            </div>
            <button type="submit" className="btn btn-primary">Save photographs</button>
          </form>
        )}
      </SectionCard>

      <SectionCard title={`Schedules — ${schedules.length}`}>
        <p className="text-[12.5px] text-gray-500 mb-3">
          Tables the report repeats once per row. The tenancy schedule, the evidence and the valuer
          involvement table are filled from the job&apos;s own records, so they are not here.
        </p>
        {schedules.length === 0 ? (
          <Empty>No schedules for this report type.</Empty>
        ) : (
          <div className="space-y-5">
            {schedules.map((region) => {
              const existing = rowsByRegion.get(region.name) ?? [];
              // Three blank rows, so adding one takes no round trip.
              const rows = [...existing, {}, {}, {}];
              return (
                <form key={region.name} action={saveReportRows} className="space-y-2">
                  <input type="hidden" name="jobId" value={job.id} />
                  <input type="hidden" name="region" value={region.name} />
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="panel-title">{region.label}</div>
                    <div className="text-[11px] text-gray-400">{region.section}</div>
                  </div>
                  <div className="overflow-x-auto -mx-4 sm:mx-0">
                    <table className="table min-w-[560px]">
                      <thead>
                        <tr>{region.fields.map((f) => <th key={f.name}>{f.label}</th>)}</tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr key={i}>
                            {region.fields.map((f) => (
                              <td key={f.name}>
                                <input
                                  name={`row:${i}:${f.name}`}
                                  className="input"
                                  defaultValue={String((row as Record<string, unknown>)[f.name] ?? '')}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="submit" className="btn btn-ghost">
                    Save {region.label.toLowerCase()}
                  </button>
                </form>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
