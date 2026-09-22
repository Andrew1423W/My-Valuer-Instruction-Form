'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, sql } from 'drizzle-orm';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { db } from '@/db';
import {
  jobs,
  jobEvents,
  jobComparables,
  jobReportRows,
  jobReportSwitches,
  jobReportValues,
  properties,
  clients,
  contacts,
  inspections,
  inspectionPhotos,
  salesEvidence,
  rentalEvidence,
  tenancies,
  type AccommodationLine,
  type JobStatus,
} from '@/db/schema';
import { requireValuer } from '@/lib/session';
import { nzToday, parseNzDateTime } from '@/lib/format';

/* --------------------------------------------------------------- helpers */

const str = (fd: FormData, k: string): string | null => {
  const v = fd.get(k);
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
};

/** Money/area inputs: strip $ , and spaces so "1,250,000" and "$1250000" both work. */
const numStr = (fd: FormData, k: string): string | null => {
  const v = str(fd, k);
  if (v === null) return null;
  const cleaned = v.replace(/[$,\s]/g, '');
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? cleaned : null;
};

const intOrNull = (fd: FormData, k: string): number | null => {
  const v = numStr(fd, k);
  return v === null ? null : Math.round(Number(v));
};

const enumOrNull = <T extends string>(fd: FormData, k: string, allowed: readonly T[]): T | null => {
  const v = str(fd, k);
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : null;
};

const PROPERTY_TYPES = [
  'office', 'retail', 'industrial', 'showroom_large_format', 'trade_retail', 'mixed_use',
  'residential', 'lifestyle', 'rural', 'development_land', 'special_purpose',
] as const;

const RATINGS = ['inferior', 'comparable', 'superior'] as const;
const TENURES = ['vacant_possession', 'investment', 'part_occupied', 'development_site'] as const;
const RENTAL_KINDS = ['new_letting', 'rent_review', 'renewal', 'sublease'] as const;

const CLIENT_KINDS = [
  'bank', 'non_bank_lender', 'law_firm', 'accountant', 'corporate',
  'government', 'council', 'trust', 'private', 'other',
] as const;

const REPORT_TEMPLATES = ['commercial', 'residential'] as const;

const REPORT_TYPES = [
  'market_value', 'market_rental', 'ground_rental',
  'lessors_interest', 'current_market_rental', 'insurance',
] as const;

/* ------------------------------------------------------------ job status */

export async function moveJob(jobId: number, status: JobStatus) {
  const me = await requireValuer();
  const [before] = await db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, jobId));
  if (!before || before.status === status) return;

  await db.update(jobs).set({ status, updatedAt: new Date() }).where(eq(jobs.id, jobId));
  await db.insert(jobEvents).values({
    jobId,
    valuerId: me.id,
    kind: 'status_change',
    fromStatus: before.status,
    toStatus: status,
    detail: `Moved to ${status.replace(/_/g, ' ')}`,
  });

  revalidatePath('/jobs');
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath('/');
}

export async function addJobNote(jobId: number, detail: string) {
  const me = await requireValuer();
  if (!detail.trim()) return;
  await db.insert(jobEvents).values({ jobId, valuerId: me.id, kind: 'note', detail: detail.trim() });
  revalidatePath(`/jobs/${jobId}`);
}

/* ------------------------------------------------------------- new job */

export async function createJob(fd: FormData) {
  const me = await requireValuer();

  // Property: reuse an existing record when one is chosen, else create it.
  let propertyId = intOrNull(fd, 'propertyId');
  if (!propertyId) {
    const address = str(fd, 'address');
    if (!address) throw new Error('A property address is required.');
    const [p] = await db
      .insert(properties)
      .values({
        address,
        suburb: str(fd, 'suburb'),
        town: str(fd, 'town'),
        propertyType: enumOrNull(fd, 'propertyType', PROPERTY_TYPES),
        legalDescription: str(fd, 'legalDescription'),
        titleNo: str(fd, 'titleNo'),
        landArea: numStr(fd, 'landArea'),
        floorArea: numStr(fd, 'floorArea'),
        nbsRating: str(fd, 'nbsRating'),
      })
      .returning();
    propertyId = p.id;
  }

  const instructorId = await upsertContact(fd, 'instructor');
  const clientId = await upsertContact(fd, 'client');

  const jobNo = str(fd, 'jobNo') ?? (await nextJobNo());
  const isQuote = fd.get('isQuote') === 'on';

  const [job] = await db
    .insert(jobs)
    .values({
      jobNo,
      status: isQuote ? 'quote' : 'instructed',
      propertyId,
      instructorId,
      clientId,
      clientOrgId: intOrNull(fd, 'clientOrgId'),
      borrower: str(fd, 'borrower'),
      purpose: str(fd, 'purpose'),
      purposeDetail: str(fd, 'purposeDetail'),
      basis: str(fd, 'basis') ?? 'Market Value',
      reportTemplate: enumOrNull(fd, 'reportTemplate', REPORT_TEMPLATES) ?? 'commercial',
      reportType: enumOrNull(fd, 'reportType', REPORT_TYPES) ?? 'market_value',
      isQuote,
      vosOrderNo: str(fd, 'vosOrderNo'),
      poNumber: str(fd, 'poNumber'),
      allocatedToId: intOrNull(fd, 'allocatedToId'),
      authorisedById: intOrNull(fd, 'authorisedById'),
      takenById: me.id,
      instructionDate: str(fd, 'instructionDate') ?? nzToday(),
      dueDate: str(fd, 'dueDate'),
      appointmentName: str(fd, 'appointmentName'),
      appointmentPhone: str(fd, 'appointmentPhone'),
      feeMarket: numStr(fd, 'feeMarket'),
      feeInsurance: numStr(fd, 'feeInsurance'),
      notes: str(fd, 'notes'),
    })
    .returning();

  await db.insert(jobEvents).values({
    jobId: job.id,
    valuerId: me.id,
    kind: 'status_change',
    toStatus: job.status,
    detail: isQuote ? 'Quote created' : 'Instruction received',
  });

  revalidatePath('/jobs');
  revalidatePath('/');
  redirect(`/jobs/${job.id}`);
}

async function upsertContact(fd: FormData, prefix: 'instructor' | 'client') {
  const existing = intOrNull(fd, `${prefix}Id`);
  if (existing) return existing;
  const name = str(fd, `${prefix}Name`);
  if (!name) return null;
  const [c] = await db
    .insert(contacts)
    .values({
      type: prefix,
      name,
      company: str(fd, `${prefix}Company`),
      email: str(fd, `${prefix}Email`),
      phone: str(fd, `${prefix}Phone`),
      address: str(fd, `${prefix}Address`),
    })
    .returning();
  return c.id;
}

/** Sequential job number in the firm's YY-NNNN format, on the NZ calendar. */
async function nextJobNo() {
  const yy = nzToday().slice(2, 4);
  const [row] = await db
    .select({ max: sql<string | null>`max(job_no)` })
    .from(jobs)
    .where(sql`job_no like ${yy + '-%'}`);
  const next = row?.max ? Number(row.max.split('-')[1]) + 1 : 1;
  return `${yy}-${String(next).padStart(4, '0')}`;
}

/* -------------------------------------------------------- job conclusions */

export async function updateJobDetails(fd: FormData) {
  await requireValuer();
  const id = intOrNull(fd, 'jobId');
  if (!id) throw new Error('jobId missing');

  await db
    .update(jobs)
    .set({
      dueDate: str(fd, 'dueDate'),
      allocatedToId: intOrNull(fd, 'allocatedToId'),
      authorisedById: intOrNull(fd, 'authorisedById'),
      // Only what the form actually carried: a form that leaves the report
      // type out must not reset the job to a commercial market valuation.
      ...(fd.has('clientOrgId') ? { clientOrgId: intOrNull(fd, 'clientOrgId') } : {}),
      ...(enumOrNull(fd, 'reportTemplate', REPORT_TEMPLATES)
        ? { reportTemplate: enumOrNull(fd, 'reportTemplate', REPORT_TEMPLATES)! }
        : {}),
      ...(enumOrNull(fd, 'reportType', REPORT_TYPES)
        ? { reportType: enumOrNull(fd, 'reportType', REPORT_TYPES)! }
        : {}),
      inspectionAt: str(fd, 'inspectionAt') ? parseNzDateTime(str(fd, 'inspectionAt')!) : null,
      effectiveDate: str(fd, 'effectiveDate'),
      adoptedValue: numStr(fd, 'adoptedValue'),
      adoptedLandValue: numStr(fd, 'adoptedLandValue'),
      adoptedImprovements: numStr(fd, 'adoptedImprovements'),
      adoptedRental: numStr(fd, 'adoptedRental'),
      adoptedYield: numStr(fd, 'adoptedYield'),
      adoptedRate: numStr(fd, 'adoptedRate'),
      insuranceReplacement: numStr(fd, 'insuranceReplacement'),
      feeMarket: numStr(fd, 'feeMarket'),
      feeInsurance: numStr(fd, 'feeInsurance'),
      notes: str(fd, 'notes'),
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, id));

  revalidatePath(`/jobs/${id}`);
  revalidatePath('/jobs');
}

/* ------------------------------------------------------------ inspection */

export async function saveInspection(fd: FormData) {
  const me = await requireValuer();
  const jobId = intOrNull(fd, 'jobId');
  if (!jobId) throw new Error('jobId missing');

  const labels = fd.getAll('accLabel').map(String);
  const areas = fd.getAll('accArea').map(String);
  const accNotes = fd.getAll('accNotes').map(String);
  const accommodation: AccommodationLine[] = labels
    .map((label, i) => ({
      label: label.trim(),
      areaSqm: (areas[i] ?? '').replace(/[,\s]/g, ''),
      notes: (accNotes[i] ?? '').trim() || undefined,
    }))
    .filter((l) => l.label !== '' || l.areaSqm !== '');

  const values = {
    jobId,
    inspectedById: me.id,
    inspectedAt: str(fd, 'inspectedAt') ? parseNzDateTime(str(fd, 'inspectedAt')!) : new Date(),
    presentAt: str(fd, 'presentAt'),
    weather: str(fd, 'weather'),
    construction: str(fd, 'construction'),
    roof: str(fd, 'roof'),
    condition: str(fd, 'condition'),
    services: str(fd, 'services'),
    carparking: str(fd, 'carparking'),
    nbsRating: str(fd, 'nbsRating'),
    nbsSource: str(fd, 'nbsSource'),
    deferredMaintenance: str(fd, 'deferredMaintenance'),
    accommodation,
    measuredFloorArea: numStr(fd, 'measuredFloorArea'),
    notes: str(fd, 'notes'),
    completedAt: fd.get('complete') === 'on' ? new Date() : null,
  };

  const existingId = intOrNull(fd, 'inspectionId');
  let inspectionId: number;
  if (existingId) {
    await db.update(inspections).set(values).where(eq(inspections.id, existingId));
    inspectionId = existingId;
  } else {
    const [row] = await db.insert(inspections).values(values).returning();
    inspectionId = row.id;
  }

  // Photos are written to UPLOAD_DIR in development; point this at an Azure
  // Blob container for production (see README).
  const files = fd.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length) {
    const dir = path.join(process.env.UPLOAD_DIR ?? './uploads', String(jobId));
    await mkdir(dir, { recursive: true });
    let order = 0;
    for (const file of files) {
      const safe = `${Date.now()}-${order}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      await writeFile(path.join(dir, safe), Buffer.from(await file.arrayBuffer()));
      await db.insert(inspectionPhotos).values({
        inspectionId,
        filename: path.join(String(jobId), safe),
        sortOrder: order++,
      });
    }
  }

  // An inspection completed on site advances the job automatically.
  if (values.completedAt) {
    const [j] = await db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, jobId));
    if (j && ['instructed', 'inspection_booked'].includes(j.status)) {
      await db.update(jobs).set({ status: 'inspected', updatedAt: new Date() }).where(eq(jobs.id, jobId));
      await db.insert(jobEvents).values({
        jobId, valuerId: me.id, kind: 'status_change',
        fromStatus: j.status, toStatus: 'inspected', detail: 'Inspection completed on site',
      });
    }
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath('/jobs');
  redirect(`/jobs/${jobId}`);
}

/* ----------------------------------------------------------- comparables */

export async function addComparable(fd: FormData) {
  await requireValuer();
  const jobId = intOrNull(fd, 'jobId');
  const kind = str(fd, 'kind');
  const evidenceId = intOrNull(fd, 'evidenceId');
  if (!jobId || !evidenceId || !kind) return;

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(jobComparables)
    .where(eq(jobComparables.jobId, jobId));

  await db.insert(jobComparables).values({
    jobId,
    salesEvidenceId: kind === 'sale' ? evidenceId : null,
    rentalEvidenceId: kind === 'rental' ? evidenceId : null,
    rating: enumOrNull(fd, 'rating', RATINGS),
    commentary: str(fd, 'commentary'),
    sortOrder: n + 1,
  });

  revalidatePath(`/jobs/${jobId}`);
}

export async function updateComparable(fd: FormData) {
  await requireValuer();
  const id = intOrNull(fd, 'comparableId');
  const jobId = intOrNull(fd, 'jobId');
  if (!id) return;
  await db
    .update(jobComparables)
    .set({ rating: enumOrNull(fd, 'rating', RATINGS), commentary: str(fd, 'commentary') })
    .where(eq(jobComparables.id, id));
  if (jobId) revalidatePath(`/jobs/${jobId}`);
}

export async function removeComparable(id: number, jobId: number) {
  await requireValuer();
  await db.delete(jobComparables).where(and(eq(jobComparables.id, id), eq(jobComparables.jobId, jobId)));
  revalidatePath(`/jobs/${jobId}`);
}

/* -------------------------------------------------------------- evidence */

export async function createSalesEvidence(fd: FormData) {
  await requireValuer();
  const address = str(fd, 'address');
  if (!address) throw new Error('Address is required.');

  await db.insert(salesEvidence).values({
    address,
    suburb: str(fd, 'suburb'),
    town: str(fd, 'town'),
    region: str(fd, 'region') ?? "Hawke's Bay",
    propertyType: enumOrNull(fd, 'propertyType', PROPERTY_TYPES),
    saleDate: str(fd, 'saleDate'),
    salePrice: numStr(fd, 'salePrice'),
    tenure: enumOrNull(fd, 'tenure', TENURES),
    armsLength: fd.get('armsLength') !== null,
    landArea: numStr(fd, 'landArea'),
    floorArea: numStr(fd, 'floorArea'),
    netIncome: numStr(fd, 'netIncome'),
    passingYield: numStr(fd, 'passingYield'),
    nbsRating: str(fd, 'nbsRating'),
    zoning: str(fd, 'zoning'),
    yearBuilt: intOrNull(fd, 'yearBuilt'),
    vendor: str(fd, 'vendor'),
    purchaser: str(fd, 'purchaser'),
    source: str(fd, 'source'),
    notes: str(fd, 'notes'),
  });

  revalidatePath('/evidence');
  redirect('/evidence?tab=sales');
}

export async function createRentalEvidence(fd: FormData) {
  await requireValuer();
  const address = str(fd, 'address');
  if (!address) throw new Error('Address is required.');

  await db.insert(rentalEvidence).values({
    address,
    suburb: str(fd, 'suburb'),
    town: str(fd, 'town'),
    region: str(fd, 'region') ?? "Hawke's Bay",
    propertyType: enumOrNull(fd, 'propertyType', PROPERTY_TYPES),
    kind: enumOrNull(fd, 'kind', RENTAL_KINDS) ?? 'new_letting',
    commencementDate: str(fd, 'commencementDate'),
    tenant: str(fd, 'tenant'),
    lessor: str(fd, 'lessor'),
    lettableArea: numStr(fd, 'lettableArea'),
    annualRent: numStr(fd, 'annualRent'),
    netOrGross: str(fd, 'netOrGross') ?? 'Net',
    termYears: numStr(fd, 'termYears'),
    rightsOfRenewal: str(fd, 'rightsOfRenewal'),
    reviewPattern: str(fd, 'reviewPattern'),
    carparks: intOrNull(fd, 'carparks'),
    carparkRate: numStr(fd, 'carparkRate'),
    incentives: str(fd, 'incentives'),
    source: str(fd, 'source'),
    notes: str(fd, 'notes'),
  });

  revalidatePath('/evidence');
  redirect('/evidence?tab=rentals');
}

/* ---------------------------------------------------------------- clients */

export async function createClient(fd: FormData) {
  await requireValuer();
  const name = str(fd, 'name');
  if (!name) throw new Error('A client name is required.');

  const [client] = await db
    .insert(clients)
    .values({
      name,
      kind: enumOrNull(fd, 'kind', CLIENT_KINDS) ?? 'other',
      division: str(fd, 'division'),
      address: str(fd, 'address'),
      phone: str(fd, 'phone'),
      accountsEmail: str(fd, 'accountsEmail'),
      reportsEmail: str(fd, 'reportsEmail'),
      terms: str(fd, 'terms'),
      defaultFee: numStr(fd, 'defaultFee'),
      defaultTurnaroundDays: intOrNull(fd, 'defaultTurnaroundDays'),
      notes: str(fd, 'notes'),
    })
    .returning();

  revalidatePath('/clients');
  redirect(`/clients/${client.id}`);
}

export async function updateClient(fd: FormData) {
  await requireValuer();
  const id = intOrNull(fd, 'clientId');
  if (!id) throw new Error('clientId missing');

  await db
    .update(clients)
    .set({
      name: str(fd, 'name') ?? undefined,
      kind: enumOrNull(fd, 'kind', CLIENT_KINDS) ?? undefined,
      division: str(fd, 'division'),
      address: str(fd, 'address'),
      phone: str(fd, 'phone'),
      accountsEmail: str(fd, 'accountsEmail'),
      reportsEmail: str(fd, 'reportsEmail'),
      terms: str(fd, 'terms'),
      defaultFee: numStr(fd, 'defaultFee'),
      defaultTurnaroundDays: intOrNull(fd, 'defaultTurnaroundDays'),
      notes: str(fd, 'notes'),
      active: fd.get('active') === 'on',
      updatedAt: new Date(),
    })
    .where(eq(clients.id, id));

  revalidatePath(`/clients/${id}`);
  revalidatePath('/clients');
}

export async function addClientContact(fd: FormData) {
  await requireValuer();
  const clientId = intOrNull(fd, 'clientId');
  const name = str(fd, 'contactName');
  if (!clientId) throw new Error('clientId missing');
  if (!name) throw new Error('A contact name is required.');

  await db.insert(contacts).values({
    clientId,
    type: 'instructor',
    name,
    company: str(fd, 'contactCompany'),
    email: str(fd, 'contactEmail'),
    phone: str(fd, 'contactPhone'),
    notes: str(fd, 'contactNotes'),
  });

  revalidatePath(`/clients/${clientId}`);
}

/* ---------------------------------------------------------- tenancy schedule */

export async function saveTenancy(fd: FormData) {
  await requireValuer();
  const propertyId = intOrNull(fd, 'propertyId');
  if (!propertyId) throw new Error('propertyId missing');
  const tenant = str(fd, 'tenant');
  if (!tenant) throw new Error('A tenant name is required.');

  const values = {
    propertyId,
    tenant,
    unit: str(fd, 'unit'),
    use: str(fd, 'use'),
    areaSqm: numStr(fd, 'areaSqm'),
    carParks: intOrNull(fd, 'carParks'),
    rentPa: numStr(fd, 'rentPa'),
    outgoingsBasis: str(fd, 'outgoingsBasis'),
    outgoingsPa: numStr(fd, 'outgoingsPa'),
    marketRentPa: numStr(fd, 'marketRentPa'),
    leaseStart: str(fd, 'leaseStart'),
    leaseExpiry: str(fd, 'leaseExpiry'),
    renewals: str(fd, 'renewals'),
    finalExpiry: str(fd, 'finalExpiry'),
    reviewBasis: str(fd, 'reviewBasis'),
    nextReview: str(fd, 'nextReview'),
    bondOrGuarantee: str(fd, 'bondOrGuarantee'),
    comments: str(fd, 'comments'),
    sortOrder: intOrNull(fd, 'sortOrder') ?? 0,
  };

  const id = intOrNull(fd, 'tenancyId');
  if (id) await db.update(tenancies).set(values).where(eq(tenancies.id, id));
  else await db.insert(tenancies).values(values);

  const jobId = intOrNull(fd, 'jobId');
  if (jobId) revalidatePath(`/jobs/${jobId}/report`);
  revalidatePath('/properties');
}

export async function removeTenancy(id: number, jobId: number) {
  await requireValuer();
  await db.delete(tenancies).where(eq(tenancies.id, id));
  revalidatePath(`/jobs/${jobId}/report`);
}

/* ------------------------------------------------------- report narrative */

/**
 * Saves one section of the report entry form.
 *
 * Every field the form carries is written, blanks included, so clearing a box
 * clears the value. The form names each input `field:<template field name>`
 * and `switch:<template field name>`, which keeps the handler independent of
 * which template version is in use.
 */
export async function saveReportSection(fd: FormData) {
  const me = await requireValuer();
  const jobId = intOrNull(fd, 'jobId');
  if (!jobId) throw new Error('jobId missing');

  const values: { fieldName: string; value: string | null }[] = [];
  const switches: { fieldName: string; value: string }[] = [];
  for (const [key, raw] of fd.entries()) {
    if (typeof raw !== 'string') continue;
    if (key.startsWith('field:')) {
      const value = raw.trim();
      values.push({ fieldName: key.slice('field:'.length), value: value === '' ? null : value });
    } else if (key.startsWith('switch:')) {
      switches.push({ fieldName: key.slice('switch:'.length), value: raw.trim() || 'No' });
    }
  }

  for (const v of values) {
    await db
      .insert(jobReportValues)
      .values({ jobId, fieldName: v.fieldName, value: v.value, updatedById: me.id })
      .onConflictDoUpdate({
        target: [jobReportValues.jobId, jobReportValues.fieldName],
        set: { value: v.value, updatedById: me.id, updatedAt: new Date() },
      });
  }

  for (const sw of switches) {
    await db
      .insert(jobReportSwitches)
      .values({ jobId, fieldName: sw.fieldName, value: sw.value })
      .onConflictDoUpdate({
        target: [jobReportSwitches.jobId, jobReportSwitches.fieldName],
        set: { value: sw.value, updatedAt: new Date() },
      });
  }

  revalidatePath(`/jobs/${jobId}/report`);
}

/** Adds or replaces the rows of one repeating region. */
export async function saveReportRows(fd: FormData) {
  await requireValuer();
  const jobId = intOrNull(fd, 'jobId');
  const region = str(fd, 'region');
  if (!jobId || !region) throw new Error('jobId and region are required');

  // The form posts `row:<index>:<field>`, so the rows arrive in order.
  const rows = new Map<number, Record<string, string>>();
  for (const [key, raw] of fd.entries()) {
    if (typeof raw !== 'string' || !key.startsWith('row:')) continue;
    const [, index, ...rest] = key.split(':');
    const i = Number(index);
    if (!Number.isFinite(i)) continue;
    const row = rows.get(i) ?? {};
    const value = raw.trim();
    if (value !== '') row[rest.join(':')] = value;
    rows.set(i, row);
  }

  await db.delete(jobReportRows).where(
    and(eq(jobReportRows.jobId, jobId), eq(jobReportRows.region, region)),
  );

  const toInsert = [...rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, row]) => Object.keys(row).length > 0)
    .map(([, row], order) => ({ jobId, region, sortOrder: order, values: row }));

  if (toInsert.length > 0) await db.insert(jobReportRows).values(toInsert);

  revalidatePath(`/jobs/${jobId}/report`);
}
