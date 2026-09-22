/** NZ-flavoured formatting helpers. All money values arrive as strings from
 *  Postgres numeric columns so exact values round-trip without float drift. */

const nz = (opts: Intl.NumberFormatOptions) => new Intl.NumberFormat('en-NZ', opts);

/** The firm works in New Zealand time. Dates and times are always rendered in
 *  Pacific/Auckland so they read the same whether the server runs here, in
 *  Azure Australia East, or anywhere else. */
export const NZ_TZ = 'Pacific/Auckland';

export function money(v: string | number | null | undefined, dp = 0): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isFinite(n)) return '—';
  return nz({ style: 'currency', currency: 'NZD', minimumFractionDigits: dp, maximumFractionDigits: dp }).format(n);
}

export function moneyShort(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return '$' + (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 2) + 'm';
  if (Math.abs(n) >= 1_000) return '$' + Math.round(n / 1_000) + 'k';
  return money(n);
}

export function num(v: string | number | null | undefined, dp = 0): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return nz({ minimumFractionDigits: dp, maximumFractionDigits: dp }).format(n);
}

export function area(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  return num(v, 0) + ' m²';
}

export function pct(v: string | number | null | undefined, dp = 2): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(dp) + '%';
}

/** $/m² of floor area, derived rather than stored so it can never go stale. */
export function ratePerSqm(price: string | null, sqm: string | null): string {
  const p = Number(price), a = Number(sqm);
  if (!p || !a) return '—';
  return money(p / a, 0) + '/m²';
}

export function yieldPct(income: string | null, price: string | null): string {
  const i = Number(income), p = Number(price);
  if (!i || !p) return '—';
  return pct((i / p) * 100);
}

export function shortDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')) : d;
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric', timeZone: NZ_TZ });
}

export function longDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')) : d;
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric', timeZone: NZ_TZ });
}

export function dateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('en-NZ', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: NZ_TZ,
  });
}

/** Today's date in New Zealand, as YYYY-MM-DD. */
export function nzToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: NZ_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/** Days until a due date, counted against the New Zealand calendar day;
 *  negative means overdue. */
export function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null;
  const due = Date.parse(d.slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(due)) return null;
  const today = Date.parse(nzToday() + 'T00:00:00Z');
  return Math.round((due - today) / 86_400_000);
}

/** A `datetime-local` input value for an instant, in New Zealand time. */
export function nzInputValue(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: NZ_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(dt);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`;
}

/** Parses a `datetime-local` value as New Zealand wall-clock time. */
export function parseNzDateTime(value: string): Date {
  // Probe UTC, then correct by New Zealand's offset at that instant (NZST +12 / NZDT +13).
  const naive = Date.parse(value.length === 16 ? value + ':00Z' : value + 'Z');
  if (Number.isNaN(naive)) return new Date(NaN);
  const asNz = new Date(naive);
  const shown = new Intl.DateTimeFormat('en-CA', {
    timeZone: NZ_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(asNz);
  const g = (t: string) => shown.find((p) => p.type === t)!.value;
  const offset = Date.parse(
    `${g('year')}-${g('month')}-${g('day')}T${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}:${g('second')}Z`,
  ) - naive;
  return new Date(naive - offset);
}

export function titleCase(s: string | null | undefined): string {
  if (!s) return '—';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  office: 'Office',
  retail: 'Retail',
  industrial: 'Industrial',
  showroom_large_format: 'Showroom / Large format',
  trade_retail: 'Trade retail',
  mixed_use: 'Mixed use',
  residential: 'Residential',
  lifestyle: 'Lifestyle',
  rural: 'Rural',
  development_land: 'Development land',
  special_purpose: 'Special purpose',
};

export function propertyType(v: string | null | undefined): string {
  if (!v) return '—';
  return PROPERTY_TYPE_LABELS[v] ?? titleCase(v);
}
