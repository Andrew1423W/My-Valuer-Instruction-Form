import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { inspectionPhotos } from '@/db/schema';

const TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.heic': 'image/heic', '.gif': 'image/gif',
};

/** Serves an inspection photo from UPLOAD_DIR. In production this becomes a
 *  redirect to a short-lived Azure Blob SAS URL instead. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return new Response('Not found', { status: 404 });

  const [photo] = await db.select().from(inspectionPhotos).where(eq(inspectionPhotos.id, id)).limit(1);
  if (!photo) return new Response('Not found', { status: 404 });

  const root = path.resolve(process.env.UPLOAD_DIR ?? './uploads');
  const file = path.resolve(root, photo.filename);
  // Never serve outside the upload root, whatever is in the database.
  if (!file.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });

  try {
    const buf = await readFile(file);
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
