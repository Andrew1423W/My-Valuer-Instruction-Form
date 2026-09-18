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
  properties,
  contacts,
  inspections,
  inspectionPhotos,
  salesEvidence,
  rentalEvidence,
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
      borrower: str(fd, 'borrower'),
      purpose: str(fd, 'purpose'),
      purposeDetail: str(fd, 'purposeDetail'),
      basis: str(fd, 'basis') ?? 'Market Value',
      isQuote,
      vosOrderNo: str(fd, 'vosOrderNo'),
      poNumber: str(fd, 'poNumber'),
      allocatedToId: intOrNull(fd, 'allocatedToId'),
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
