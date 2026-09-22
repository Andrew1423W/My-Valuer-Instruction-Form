import { buildJobReport } from '@/report/build';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return new Response('Not found', { status: 404 });

  const built = await buildJobReport(id);
  if (!built) return new Response('Not found', { status: 404 });

  const { docx, filename, report } = built;
  return new Response(new Uint8Array(docx), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // So the valuer can see what the report is missing without opening it.
      'X-Report-Fields-Filled': String(report.fieldsFilled),
      'X-Report-Fields-Missing': String(report.fieldsMissing.length),
      'X-Report-Blocks-Dropped': String(report.blocksDropped.length),
      'X-Report-Images-Skipped': String(report.imagesSkipped),
    },
  });
}
