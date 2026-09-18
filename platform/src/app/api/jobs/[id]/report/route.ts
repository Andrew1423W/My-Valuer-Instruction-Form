import { asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { jobs } from '@/db/schema';
import { buildReport, type ReportData } from '@/lib/report';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return new Response('Not found', { status: 404 });

  const job = await db.query.jobs.findFirst({
    where: eq(jobs.id, id),
    with: {
      property: true,
      instructor: true,
      client: true,
      allocatedTo: true,
      inspections: { with: { inspectedBy: true }, orderBy: [desc(sql`inspected_at`)] },
      comparables: { with: { sale: true, rental: true }, orderBy: [asc(sql`sort_order`)] },
    },
  });
  if (!job) return new Response('Not found', { status: 404 });

  const buffer = await buildReport(job as unknown as ReportData);
  const filename = `${job.jobNo} ${job.property.address.replace(/[^a-zA-Z0-9 -]/g, '')}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
