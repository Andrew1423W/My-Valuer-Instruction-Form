import Link from 'next/link';
import { createSalesEvidence, createRentalEvidence } from '@/app/actions';
import { SectionCard } from '@/components/ui';
import { PROPERTY_TYPE_LABELS } from '@/lib/format';

export const dynamic = 'force-dynamic';

const TENURES = [
  ['investment', 'Investment (tenanted)'],
  ['vacant_possession', 'Vacant possession'],
  ['part_occupied', 'Part occupied'],
  ['development_site', 'Development site'],
] as const;

const KINDS = [
  ['new_letting', 'New letting'],
  ['rent_review', 'Rent review'],
  ['renewal', 'Renewal'],
  ['sublease', 'Sublease'],
] as const;

export default async function NewEvidencePage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const kind = (await searchParams).kind === 'rental' ? 'rental' : 'sale';

  const typeSelect = (
    <label>
      <span className="label">Property type</span>
      <select name="propertyType" className="select" defaultValue="">
        <option value="">—</option>
        {Object.entries(PROPERTY_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </label>
  );

  return (
    <div className="space-y-4 max-w-[900px]">
      <div>
        <Link href={`/evidence?tab=${kind === 'sale' ? 'sales' : 'rentals'}`} className="text-[12px] font-bold text-gray-500 hover:text-navy">
          ← Evidence ledger
        </Link>
        <h1 className="text-[22px] font-extrabold text-navy mt-1">
          Add {kind === 'sale' ? 'sales' : 'rental'} evidence
        </h1>
        <p className="text-[12.5px] text-gray-500">
          Record the figures as verified. Rates per m² and yields are calculated from them, not entered.
        </p>
      </div>

      {kind === 'sale' ? (
        <form action={createSalesEvidence} className="space-y-4">
          <SectionCard title="Property">
            <div className="grid sm:grid-cols-3 gap-3">
              <label className="sm:col-span-2"><span className="label">Address *</span><input name="address" required className="input" /></label>
              {typeSelect}
              <label><span className="label">Suburb</span><input name="suburb" className="input" /></label>
              <label><span className="label">Town / city</span><input name="town" className="input" defaultValue="Napier" /></label>
              <label><span className="label">Region</span><input name="region" className="input" defaultValue="Hawke's Bay" /></label>
              <label><span className="label">Zoning</span><input name="zoning" className="input" /></label>
              <label><span className="label">Year built</span><input name="yearBuilt" inputMode="numeric" className="input" /></label>
              <label><span className="label">Seismic (NBS)</span><input name="nbsRating" className="input" placeholder="67% NBS" /></label>
            </div>
          </SectionCard>

          <SectionCard title="Sale">
            <div className="grid sm:grid-cols-3 gap-3">
              <label><span className="label">Sale date</span><input type="date" name="saleDate" className="input" /></label>
              <label><span className="label">Sale price ($)</span><input name="salePrice" inputMode="decimal" className="input" placeholder="1,075,000" /></label>
              <label>
                <span className="label">Tenure at sale</span>
                <select name="tenure" className="select" defaultValue="investment">
                  {TENURES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label><span className="label">Land area (m²)</span><input name="landArea" inputMode="decimal" className="input" /></label>
              <label><span className="label">Floor area (m²)</span><input name="floorArea" inputMode="decimal" className="input" /></label>
              <label><span className="label">Net income ($ pa)</span><input name="netIncome" inputMode="decimal" className="input" /></label>
              <label><span className="label">Vendor</span><input name="vendor" className="input" /></label>
              <label><span className="label">Purchaser</span><input name="purchaser" className="input" /></label>
              <label><span className="label">Source</span><input name="source" className="input" placeholder="Agency advice, report 25-0361, QV…" /></label>
              <label className="flex items-center gap-2 text-[13px] font-bold text-navy sm:col-span-3">
                <input type="checkbox" name="armsLength" defaultChecked className="w-4 h-4" />
                Arm&apos;s length transaction
              </label>
              <label className="sm:col-span-3">
                <span className="label">Notes / analysis</span>
                <textarea name="notes" rows={3} className="textarea" />
              </label>
            </div>
          </SectionCard>

          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">Save sale</button>
            <Link href="/evidence?tab=sales" className="btn btn-ghost">Cancel</Link>
          </div>
        </form>
      ) : (
        <form action={createRentalEvidence} className="space-y-4">
          <SectionCard title="Property">
            <div className="grid sm:grid-cols-3 gap-3">
              <label className="sm:col-span-2"><span className="label">Address *</span><input name="address" required className="input" /></label>
              {typeSelect}
              <label><span className="label">Suburb</span><input name="suburb" className="input" /></label>
              <label><span className="label">Town / city</span><input name="town" className="input" defaultValue="Napier" /></label>
              <label><span className="label">Region</span><input name="region" className="input" defaultValue="Hawke's Bay" /></label>
            </div>
          </SectionCard>

          <SectionCard title="Letting / review">
            <div className="grid sm:grid-cols-3 gap-3">
              <label>
                <span className="label">Basis</span>
                <select name="kind" className="select" defaultValue="new_letting">
                  {KINDS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label><span className="label">Commencement</span><input type="date" name="commencementDate" className="input" /></label>
              <label><span className="label">Tenant</span><input name="tenant" className="input" /></label>
              <label><span className="label">Lessor</span><input name="lessor" className="input" /></label>
              <label><span className="label">Lettable area (m²)</span><input name="lettableArea" inputMode="decimal" className="input" /></label>
              <label><span className="label">Annual rent ($ pa)</span><input name="annualRent" inputMode="decimal" className="input" /></label>
              <label>
                <span className="label">Net or gross</span>
                <select name="netOrGross" className="select" defaultValue="Net">
                  <option value="Net">Net</option>
                  <option value="Gross">Gross</option>
                </select>
              </label>
              <label><span className="label">Term (years)</span><input name="termYears" inputMode="decimal" className="input" /></label>
              <label><span className="label">Rights of renewal</span><input name="rightsOfRenewal" className="input" placeholder="2 x 3 years" /></label>
              <label><span className="label">Review pattern</span><input name="reviewPattern" className="input" placeholder="3 yearly to market" /></label>
              <label><span className="label">Carparks</span><input name="carparks" inputMode="numeric" className="input" /></label>
              <label><span className="label">Carpark rate ($ ea pa)</span><input name="carparkRate" inputMode="decimal" className="input" /></label>
              <label className="sm:col-span-3"><span className="label">Incentives</span><input name="incentives" className="input" placeholder="3 months rent free, $120,000 fitout contribution…" /></label>
              <label><span className="label">Source</span><input name="source" className="input" /></label>
              <label className="sm:col-span-3">
                <span className="label">Notes / analysis</span>
                <textarea name="notes" rows={3} className="textarea" />
              </label>
            </div>
          </SectionCard>

          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">Save rental</button>
            <Link href="/evidence?tab=rentals" className="btn btn-ghost">Cancel</Link>
          </div>
        </form>
      )}
    </div>
  );
}
