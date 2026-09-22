/**
 * Produces a job's report: reads what the job holds, fills the master template.
 *
 * The output is the firm's own document — same layout, same clause wording,
 * same compliance text — with this job's data in it. Nothing about the report's
 * appearance lives in this codebase, which is the point: the template stays
 * the firm's to change in Word.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  inspections,
  jobComparables,
  jobReportRows,
  jobReportSwitches,
  jobReportValues,
  jobs,
  tenancies,
} from '@/db/schema';
import { fillTemplate, type FieldValues, type FillReport } from './docx-template';
import {
  TEMPLATE_FILES,
  buildFillInput,
  type ReportJob,
  type StoredReportData,
} from './job-fields';

export type BuiltReport = {
  docx: Buffer;
  filename: string;
  report: FillReport;
};

/** Reads the report data a job holds, in the shape the fill wants. */
export async function loadStoredReportData(jobId: number): Promise<StoredReportData> {
  const [values, switches, rows] = await Promise.all([
    db.select().from(jobReportValues).where(eq(jobReportValues.jobId, jobId)),
    db.select().from(jobReportSwitches).where(eq(jobReportSwitches.jobId, jobId)),
    db
      .select()
      .from(jobReportRows)
      .where(eq(jobReportRows.jobId, jobId))
      .orderBy(asc(jobReportRows.region), asc(jobReportRows.sortOrder)),
  ]);

  const byRegion: Record<string, FieldValues[]> = {};
  for (const row of rows) {
    (byRegion[row.region] ??= []).push((row.values ?? {}) as FieldValues);
  }

  return {
    values: Object.fromEntries(values.map((v) => [v.fieldName, v.value])),
    switches: Object.fromEntries(switches.map((s) => [s.fieldName, s.value])),
    rows: byRegion,
  };
}

/** The job graph the fill reads. */
export async function loadJobForReport(jobId: number) {
  const job = await db.query.jobs.findFirst({
    where: eq(jobs.id, jobId),
    with: {
      property: true,
      clientOrg: true,
      instructor: true,
      client: true,
      allocatedTo: true,
      authorisedBy: true,
      inspections: { with: { inspectedBy: true }, orderBy: [desc(inspections.inspectedAt)] },
      comparables: { with: { sale: true, rental: true }, orderBy: [asc(jobComparables.sortOrder)] },
    },
  });
  if (!job) return null;

  // Tenancies hang off the property, not the job, so they come separately.
  const schedule = await db
    .select()
    .from(tenancies)
    .where(eq(tenancies.propertyId, job.propertyId))
    .orderBy(asc(tenancies.sortOrder), asc(tenancies.id));

  return { ...job, property: { ...job.property, tenancies: schedule } };
}

export async function buildJobReport(jobId: number): Promise<BuiltReport | null> {
  const job = await loadJobForReport(jobId);
  if (!job) return null;

  const stored = await loadStoredReportData(jobId);
  const input = buildFillInput(job as unknown as ReportJob, stored);

  const templatePath = path.join(process.cwd(), TEMPLATE_FILES[job.reportTemplate]);
  const templateBytes = await readFile(templatePath);
  const { docx, report } = await fillTemplate(templateBytes, input);

  const safeAddress = job.property.address.replace(/[^A-Za-z0-9 ,-]/g, '').trim();
  return { docx, filename: `${job.jobNo} ${safeAddress}.docx`, report };
}
