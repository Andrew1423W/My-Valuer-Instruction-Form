import Link from 'next/link';
import { notFound } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { jobs, inspections } from '@/db/schema';
import { InspectionForm } from '@/components/inspection-form';
import { nzInputValue } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function InspectionPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isFinite(id)) notFound();

  const job = await db.query.jobs.findFirst({ where: eq(jobs.id, id), with: { property: true } });
  if (!job) notFound();

  const [existing] = await db
    .select()
    .from(inspections)
    .where(eq(inspections.jobId, id))
    .orderBy(desc(inspections.inspectedAt))
    .limit(1);

  // Default to the booked inspection time, else now — in New Zealand time.
  const defaultInspectedAt = nzInputValue(job.inspectionAt ?? new Date());

  return (
    <div className="space-y-3">
      <Link href={`/jobs/${job.id}`} className="text-[12px] font-bold text-gray-500 hover:text-navy">← {job.jobNo}</Link>
      <InspectionForm
        jobId={job.id}
        jobNo={job.jobNo}
        address={job.property.address}
        inspection={existing ?? null}
        defaultInspectedAt={defaultInspectedAt}
      />
    </div>
  );
}
