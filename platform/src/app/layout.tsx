import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { currentValuer } from '@/lib/session';
import { NavLinks } from '@/components/nav-links';

export const metadata: Metadata = {
  title: 'My Valuer — Practice Platform',
  description:
    'Valuation practice management for My Valuer Limited: job pipeline, inspections, sales and rental evidence, and report assembly.',
};

/**
 * The header names the signed-in valuer, which is a per-request lookup, so
 * nothing here can be prerendered. Saying so keeps `next build` from trying to
 * reach the database at build time.
 */
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await currentValuer();

  return (
    <html lang="en-NZ">
      <body className="min-h-screen">
        <header className="bg-white border-b border-[var(--color-line)] sticky top-0 z-20">
          <div className="h-[3px] bg-gradient-to-r from-navy via-navy-600 to-brand" />
          <div className="px-4 sm:px-6 py-2 sm:py-0 sm:h-14 flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex items-center gap-3 min-w-0 order-1">
              <Link href="/" className="font-extrabold tracking-[0.05em] text-navy uppercase text-[15px] whitespace-nowrap">
                My <span className="text-navy-600">Valuer</span>
              </Link>
              <span className="hidden sm:inline text-[10.5px] font-bold tracking-[0.13em] uppercase text-gray-500 border-l border-[var(--color-line)] pl-3">
                Practice Platform
              </span>
            </div>

            <NavLinks />

            <div className="flex items-center gap-3 shrink-0 order-2 sm:order-3">
              {me ? (
                <div className="text-right leading-tight hidden sm:block">
                  <div className="text-[12.5px] font-bold text-navy">{me.name}</div>
                  <div className="text-[10.5px] uppercase tracking-wide text-gray-500">
                    {me.role.replace(/_/g, ' ')}
                  </div>
                </div>
              ) : (
                <Link href="/api/auth/signin" className="btn btn-primary">
                  Sign in with Microsoft
                </Link>
              )}
              {me && (
                <div className="w-8 h-8 rounded-full bg-navy text-white grid place-items-center text-[11px] font-extrabold">
                  {me.initials}
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="px-4 sm:px-6 py-6 max-w-[1600px] mx-auto">{children}</main>

        <footer className="px-6 py-6 text-[11px] text-gray-500 text-center">
          My Valuer Limited — practice platform. Seeded demonstration data is synthetic and is not
          valuation evidence.
        </footer>
      </body>
    </html>
  );
}
