import Link from 'next/link';
import { and, desc, eq, gte, ilike, lte, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { salesEvidence, rentalEvidence } from '@/db/schema';
import { SectionCard, Empty } from '@/components/ui';
import {
  money, shortDate, area, pct, propertyType, ratePerSqm, yieldPct, titleCase, num, PROPERTY_TYPE_LABELS,
} from '@/lib/format';

export const dynamic = 'force-dynamic';

type Search = { tab?: string; q?: string; type?: string; town?: string; from?: string; to?: string };

function median(values: number[]): number | null {
  const v = values.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export default async function EvidencePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const tab = sp.tab === 'rentals' ? 'rentals' : 'sales';

  const towns = await db
    .select({ town: salesEvidence.town })
    .from(salesEvidence)
    .groupBy(salesEvidence.town)
    .orderBy(salesEvidence.town);

  const sales = tab === 'sales' ? await querySales(sp) : [];
  const rentals = tab === 'rentals' ? await queryRentals(sp) : [];

  const salesRates = sales.map((s) => (Number(s.salePrice) || 0) / (Number(s.floorArea) || Infinity));
  const salesYields = sales.map((s) => ((Number(s.netIncome) || 0) / (Number(s.salePrice) || Infinity)) * 100);
  const rentalRates = rentals.map((r) => (Number(r.annualRent) || 0) / (Number(r.lettableArea) || Infinity));

  const medRate = median(tab === 'sales' ? salesRates : rentalRates);
  const medYield = median(salesYields);
  const rows = tab === 'sales' ? sales.length : rentals.length;

  const tabLink = (label: string, key: string) => (
    <Link
      href={`/evidence?tab=${key}`}
      className={
        'px-3 py-1.5 rounded-md text-[12.5px] font-bold ' +
        (tab === key ? 'bg-navy text-white' : 'bg-white border border-[var(--color-line)] text-navy hover:bg-brand-pale')
      }
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-extrabold text-navy">Evidence ledger</h1>
          <p className="text-[12.5px] text-gray-500 mt-0.5">
            Sales and rental evidence held by the firm. Rates and yields are derived on read, so they can never
            disagree with the underlying figures.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {tabLink('Sales', 'sales')}
          {tabLink('Rentals', 'rentals')}
          <Link href={`/evidence/new?kind=${tab === 'sales' ? 'sale' : 'rental'}`} className="btn btn-primary">
            + Add {tab === 'sales' ? 'sale' : 'rental'}
          </Link>
        </div>
      </div>

      <form className="card p-3 grid sm:grid-cols-6 gap-2 items-end">
        <input type="hidden" name="tab" value={tab} />
        <label className="sm:col-span-2">
          <span className="label">Search address / tenant</span>
          <input name="q" defaultValue={sp.q ?? ''} className="input" placeholder="Heretaunga, Omahu…" />
        </label>
        <label>
          <span className="label">Type</span>
          <select name="type" defaultValue={sp.type ?? ''} className="select">
            <option value="">All</option>
            {Object.entries(PROPERTY_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>
          <span className="label">Town</span>
          <select name="town" defaultValue={sp.town ?? ''} className="select">
            <option value="">All</option>
            {towns.filter((t) => t.town).map((t) => <option key={t.town!} value={t.town!}>{t.town}</option>)}
          </select>
        </label>
        <label><span className="label">From</span><input type="date" name="from" defaultValue={sp.from ?? ''} className="input" /></label>
        <label className="flex gap-2">
          <span className="flex-1">
            <span className="label">To</span>
            <input type="date" name="to" defaultValue={sp.to ?? ''} className="input" />
          </span>
          <button type="submit" className="btn btn-primary h-[36px] self-end">Filter</button>
        </label>
      </form>

      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3">
          <div className="panel-title">Records</div>
          <div className="text-2xl font-extrabold text-navy mt-1">{rows}</div>
        </div>
        <div className="card p-3">
          <div className="panel-title">Median {tab === 'sales' ? 'sale' : 'rent'} rate</div>
          <div className="text-2xl font-extrabold text-navy mt-1">
            {medRate ? money(medRate) + '/m²' : '—'}
          </div>
        </div>
        <div className="card p-3">
          <div className="panel-title">{tab === 'sales' ? 'Median passing yield' : 'Median rent pa'}</div>
          <div className="text-2xl font-extrabold text-navy mt-1">
            {tab === 'sales'
              ? medYield ? pct(medYield) : '—'
              : money(median(rentals.map((r) => Number(r.annualRent))) ?? null)}
          </div>
        </div>
      </div>

      <SectionCard title={tab === 'sales' ? 'Sales evidence' : 'Rental evidence'} className="overflow-hidden">
        <div className="overflow-x-auto -m-4">
          {tab === 'sales' ? (
            sales.length === 0 ? <div className="p-4"><Empty>No sales match these filters.</Empty></div> : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Address</th><th>Type</th><th>Sale date</th><th className="num">Price</th>
                    <th className="num">Land</th><th className="num">Floor</th><th className="num">$/m²</th>
                    <th className="num">Net income</th><th className="num">Yield</th><th>Seismic</th><th>Tenure</th><th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => (
                    <tr key={s.id}>
                      <td>
                        {s.address}
                        <div className="text-[11.5px] text-gray-500">{[s.suburb, s.town].filter(Boolean).join(', ')}</div>
                      </td>
                      <td className="whitespace-nowrap">{propertyType(s.propertyType)}</td>
                      <td className="whitespace-nowrap">{shortDate(s.saleDate)}</td>
                      <td className="num whitespace-nowrap">{money(s.salePrice)}</td>
                      <td className="num whitespace-nowrap">{area(s.landArea)}</td>
                      <td className="num whitespace-nowrap">{area(s.floorArea)}</td>
                      <td className="num whitespace-nowrap font-bold">{ratePerSqm(s.salePrice, s.floorArea)}</td>
                      <td className="num whitespace-nowrap">{money(s.netIncome)}</td>
                      <td className="num whitespace-nowrap font-bold">{yieldPct(s.netIncome, s.salePrice)}</td>
                      <td className="whitespace-nowrap">{s.nbsRating ?? '—'}</td>
                      <td className="whitespace-nowrap">{titleCase(s.tenure)}</td>
                      <td className="text-[11px] text-gray-500 max-w-[160px]">{s.source ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : rentals.length === 0 ? <div className="p-4"><Empty>No rentals match these filters.</Empty></div> : (
            <table className="data">
              <thead>
                <tr>
                  <th>Address</th><th>Type</th><th>Basis</th><th>Commenced</th><th>Tenant</th>
                  <th className="num">Area</th><th className="num">Rent pa</th><th className="num">$/m²</th>
                  <th className="num">Term</th><th>Renewals</th><th>Source</th>
                </tr>
              </thead>
              <tbody>
                {rentals.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.address}
                      <div className="text-[11.5px] text-gray-500">{[r.suburb, r.town].filter(Boolean).join(', ')}</div>
                    </td>
                    <td className="whitespace-nowrap">{propertyType(r.propertyType)}</td>
                    <td className="whitespace-nowrap">{titleCase(r.kind)}</td>
                    <td className="whitespace-nowrap">{shortDate(r.commencementDate)}</td>
                    <td>{r.tenant ?? '—'}</td>
                    <td className="num whitespace-nowrap">{area(r.lettableArea)}</td>
                    <td className="num whitespace-nowrap">{money(r.annualRent)} {r.netOrGross}</td>
                    <td className="num whitespace-nowrap font-bold">{ratePerSqm(r.annualRent, r.lettableArea)}</td>
                    <td className="num whitespace-nowrap">{r.termYears ? num(r.termYears, 0) + ' yrs' : '—'}</td>
                    <td className="whitespace-nowrap">{r.rightsOfRenewal ?? '—'}</td>
                    <td className="text-[11px] text-gray-500 max-w-[160px]">{r.source ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

async function querySales(sp: Search) {
  const w: SQL[] = [];
  if (sp.q) w.push(or(ilike(salesEvidence.address, `%${sp.q}%`), ilike(salesEvidence.suburb, `%${sp.q}%`))!);
  if (sp.type) w.push(sql`${salesEvidence.propertyType}::text = ${sp.type}`);
  if (sp.town) w.push(eq(salesEvidence.town, sp.town));
  if (sp.from) w.push(gte(salesEvidence.saleDate, sp.from));
  if (sp.to) w.push(lte(salesEvidence.saleDate, sp.to));
  return db
    .select()
    .from(salesEvidence)
    .where(w.length ? and(...w) : undefined)
    .orderBy(desc(salesEvidence.saleDate))
    .limit(300);
}

async function queryRentals(sp: Search) {
  const w: SQL[] = [];
  if (sp.q) {
    w.push(or(ilike(rentalEvidence.address, `%${sp.q}%`), ilike(rentalEvidence.tenant, `%${sp.q}%`))!);
  }
  if (sp.type) w.push(sql`${rentalEvidence.propertyType}::text = ${sp.type}`);
  if (sp.town) w.push(eq(rentalEvidence.town, sp.town));
  if (sp.from) w.push(gte(rentalEvidence.commencementDate, sp.from));
  if (sp.to) w.push(lte(rentalEvidence.commencementDate, sp.to));
  return db
    .select()
    .from(rentalEvidence)
    .where(w.length ? and(...w) : undefined)
    .orderBy(desc(rentalEvidence.commencementDate))
    .limit(300);
}
