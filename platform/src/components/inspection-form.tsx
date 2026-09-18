'use client';

import { useState } from 'react';
import { saveInspection } from '@/app/actions';
import type { AccommodationLine, Inspection } from '@/db/schema';
import { nzInputValue } from '@/lib/format';

type Props = {
  jobId: number;
  address: string;
  jobNo: string;
  inspection: Inspection | null;
  defaultInspectedAt: string;
};

const CONDITIONS = ['Excellent', 'Good', 'Average', 'Fair', 'Poor'];

/** Mobile-first: one column of large controls, camera input, and an
 *  accommodation schedule you can add rows to with one thumb. */
export function InspectionForm({ jobId, address, jobNo, inspection, defaultInspectedAt }: Props) {
  const [rows, setRows] = useState<AccommodationLine[]>(
    inspection?.accommodation?.length ? inspection.accommodation : [{ label: '', areaSqm: '', notes: '' }],
  );

  const total = rows.reduce((t, r) => t + (Number(r.areaSqm) || 0), 0);

  const setRow = (i: number, patch: Partial<AccommodationLine>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <form action={saveInspection} className="space-y-4 max-w-[760px]">
      <input type="hidden" name="jobId" value={jobId} />
      {inspection && <input type="hidden" name="inspectionId" value={inspection.id} />}

      <div className="card p-4 space-y-3">
        <div>
          <h2 className="panel-title">Inspection</h2>
          <p className="text-[15px] font-bold mt-1">{address}</p>
          <p className="text-[12px] text-gray-500">{jobNo}</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <label>
            <span className="label">Date & time of inspection</span>
            <input
              type="datetime-local"
              name="inspectedAt"
              defaultValue={inspection?.inspectedAt ? nzInputValue(inspection.inspectedAt) : defaultInspectedAt}
              className="input"
            />
          </label>
          <label>
            <span className="label">Who was present</span>
            <input name="presentAt" defaultValue={inspection?.presentAt ?? ''} className="input" placeholder="Tenant, owner, agent…" />
          </label>
          <label>
            <span className="label">Weather</span>
            <input name="weather" defaultValue={inspection?.weather ?? ''} className="input" placeholder="Fine, 18°C" />
          </label>
          <label>
            <span className="label">Overall condition</span>
            <select name="condition" defaultValue={inspection?.condition ?? ''} className="select">
              <option value="">—</option>
              {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              {inspection?.condition && !CONDITIONS.includes(inspection.condition) && (
                <option value={inspection.condition}>{inspection.condition}</option>
              )}
            </select>
          </label>
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <h2 className="panel-title">Construction & services</h2>
        <label className="block">
          <span className="label">Construction</span>
          <textarea name="construction" defaultValue={inspection?.construction ?? ''} rows={2} className="textarea" placeholder="Reinforced concrete frame, precast panel infill…" />
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          <label><span className="label">Roof</span><input name="roof" defaultValue={inspection?.roof ?? ''} className="input" /></label>
          <label><span className="label">Carparking</span><input name="carparking" defaultValue={inspection?.carparking ?? ''} className="input" placeholder="18 sealed on-site spaces" /></label>
          <label className="sm:col-span-2"><span className="label">Services</span><input name="services" defaultValue={inspection?.services ?? ''} className="input" placeholder="Three-phase power, ducted HVAC, sprinklers…" /></label>
          <label><span className="label">Seismic rating (NBS)</span><input name="nbsRating" defaultValue={inspection?.nbsRating ?? ''} className="input" placeholder="67% NBS (IL2)" /></label>
          <label><span className="label">Seismic source</span><input name="nbsSource" defaultValue={inspection?.nbsSource ?? ''} className="input" placeholder="DSA by … dated …" /></label>
          <label className="sm:col-span-2">
            <span className="label">Deferred maintenance</span>
            <textarea name="deferredMaintenance" defaultValue={inspection?.deferredMaintenance ?? ''} rows={2} className="textarea" />
          </label>
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="panel-title">Accommodation schedule</h2>
          <span className="text-[12px] font-bold text-navy tabular-nums">Total {total.toFixed(0)} m²</span>
        </div>

        <div className="space-y-2">
          {rows.map((r, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_76px_28px] sm:grid-cols-[1fr_84px_1fr_32px] gap-2 items-start"
            >
              <input
                name="accLabel"
                value={r.label}
                onChange={(e) => setRow(i, { label: e.target.value })}
                placeholder="Ground floor office"
                className="input"
              />
              <input
                name="accArea"
                value={r.areaSqm}
                onChange={(e) => setRow(i, { areaSqm: e.target.value })}
                inputMode="decimal"
                placeholder="m²"
                className="input text-right"
              />
              <button
                type="button"
                onClick={() => setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, j) => j !== i)))}
                className="h-[36px] text-gray-400 hover:text-red-700 font-bold"
                aria-label="Remove row"
              >
                ×
              </button>
              {/* Notes drop to their own line on a phone, where a third
                  column would leave every field unreadably narrow. */}
              <input
                name="accNotes"
                value={r.notes ?? ''}
                onChange={(e) => setRow(i, { notes: e.target.value })}
                placeholder="Notes"
                className="input col-span-3 sm:col-span-1"
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, { label: '', areaSqm: '', notes: '' }])}
          className="btn btn-ghost"
        >
          + Add area
        </button>

        <label className="block sm:max-w-[220px]">
          <span className="label">Measured floor area (m²)</span>
          <input name="measuredFloorArea" defaultValue={inspection?.measuredFloorArea ?? ''} inputMode="decimal" className="input" />
        </label>
      </div>

      <div className="card p-4 space-y-3">
        <h2 className="panel-title">Photos & notes</h2>
        <label className="block">
          <span className="label">Add photos (camera or gallery)</span>
          <input type="file" name="photos" accept="image/*" capture="environment" multiple className="input !py-2" />
          <span className="block text-[11px] text-gray-500 mt-1">
            Stored against this job. Existing photos are kept — this only adds to them.
          </span>
        </label>
        <label className="block">
          <span className="label">Inspection notes</span>
          <textarea name="notes" defaultValue={inspection?.notes ?? ''} rows={5} className="textarea" placeholder="Anything that will matter when you write the report…" />
        </label>
        <label className="flex items-center gap-2 text-[13px] font-bold text-navy">
          <input type="checkbox" name="complete" defaultChecked={!!inspection?.completedAt} className="w-4 h-4" />
          Inspection complete — advance the job to Inspected
        </label>
      </div>

      <div className="flex gap-2 sticky bottom-0 bg-white border-t border-[var(--color-line)] py-3 px-4 -mx-4 sm:mx-0 sm:px-0 sm:border-0 sm:bg-canvas">
        <button type="submit" className="btn btn-primary flex-1 sm:flex-none justify-center">Save inspection</button>
        <a href={`/jobs/${jobId}`} className="btn btn-ghost">Cancel</a>
      </div>
    </form>
  );
}

