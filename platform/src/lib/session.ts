import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { valuers, type Valuer } from '@/db/schema';
import { auth } from '@/auth';

/**
 * The signed-in valuer, resolved from the Entra ID session and matched to a
 * row in `valuers` by email address. In development DEV_USER_EMAIL short
 * circuits sign-in; it must never be set in production.
 */
export const currentValuer = cache(async (): Promise<Valuer | null> => {
  const devEmail = process.env.DEV_USER_EMAIL;
  const email = devEmail ?? (await auth())?.user?.email;
  if (!email) return null;

  const [row] = await db.select().from(valuers).where(eq(valuers.email, email.toLowerCase())).limit(1);
  return row ?? null;
});

/** Same, but for code paths that cannot proceed without a user. */
export async function requireValuer(): Promise<Valuer> {
  const v = await currentValuer();
  if (!v) throw new Error('Not signed in, or no valuer record matches the signed-in email address.');
  return v;
}
