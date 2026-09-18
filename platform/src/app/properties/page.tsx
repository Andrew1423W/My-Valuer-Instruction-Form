import Link from 'next/link';
import { asc, sql } from 'drizzle-orm';
import { db } from '@/db';
import { properties, jobs } from '@/db/schema';
import { SectionCard } from '@/components/ui';
import { area, money, propertyType, shortDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function PropertiesPage() {
  const rows = await db
    .select({
      id: properties.id,
      address: properties.address,
      suburb: properties.suburb,
      town: properties.town,
      propertyType: properties.propertyType,
      landArea: properties.landArea,
      floorArea: properties.floorArea,
      nbsRating: properties.nbsRating,
      ratingCapitalValue: properties.ratingCapitalValue,
      jobCount: sql<number>`count(${jobs.id})`.mapWith(Number),
      lastJobId: sql<number | null>`max(${jobs.id})`,
      lastInstruction: sql<string | null>`max(${jobs.instructionDate})`,
    })
    .from(properties)
    .leftJoin(jobs, sql`${jobs.propertyId} = ${properties.id}`)
    .groupBy(properties.id)
    .orderBy(asc(properties.address));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-extrabold text-navy">Properties</h1>
        <p className="text-[12.5px] text-gray-500 mt-0.5">
          Every property the firm has valued. Repeat instructions reuse the record, so title, area and seismic
          details are entered once.
        </p>
      </div>

      <SectionCard title={`${rows.length} property records`} className="overflow-hidden">
        <div className="overflow-x-auto -m-4">
          <table className="data">
            <thead>
              <tr>
                <th>Address</th><th>Type</th><th className="num">Land</th><th className="num">Floor</th>
                <th>Seismic</th><th className="num">Rating CV</th><th className="num">Jobs</th><th>Last instructed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.lastJobId ? (
                      <Link href={`/jobs/${r.lastJobId}`} className="font-bold text-navy-600 hover:underline">{r.address}</Link>
                    ) : r.address}
                    <div className="text-[11.5px] text-gray-500">{[r.suburb, r.town].filter(Boolean).join(', ')}</div>
                  </td>
                  <td className="whitespace-nowrap">{propertyType(r.propertyType)}</td>
                  <td className="num whitespace-nowrap">{area(r.landArea)}</td>
                  <td className="num whitespace-nowrap">{area(r.floorArea)}</td>
                  <td className="whitespace-nowrap">{r.nbsRating ?? '—'}</td>
                  <td className="num whitespace-nowrap">{money(r.ratingCapitalValue)}</td>
                  <td className="num">{r.jobCount}</td>
                  <td className="whitespace-nowrap">{shortDate(r.lastInstruction)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
