'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/jobs', label: 'Pipeline' },
  { href: '/clients', label: 'Clients' },
  { href: '/evidence', label: 'Evidence' },
  { href: '/properties', label: 'Properties' },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="order-3 sm:order-2 w-full sm:w-auto flex items-center gap-1 overflow-x-auto border-t sm:border-0 border-[var(--color-line)] pt-2 sm:pt-0">
      {LINKS.map((l) => {
        const active = l.href === '/' ? path === '/' : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={
              'px-3 py-1.5 rounded-md text-[13px] font-bold whitespace-nowrap ' +
              (active ? 'bg-brand-pale text-navy' : 'text-gray-600 hover:text-navy hover:bg-brand-pale')
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
