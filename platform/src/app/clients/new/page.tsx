import Link from 'next/link';
import { createClient } from '@/app/actions';
import { SectionCard } from '@/components/ui';
import { CLIENT_KIND_LABELS } from '@/lib/clients';

export const dynamic = 'force-dynamic';

export default function NewClientPage() {
  return (
    <div className="space-y-4 max-w-[820px]">
      <div>
        <Link href="/clients" className="text-[12px] font-bold text-gray-500 hover:text-navy">← Clients</Link>
        <h1 className="text-[22px] font-extrabold text-navy mt-1">New client</h1>
        <p className="text-[12.5px] text-gray-500">
          The standard fee and turnaround are defaults for new jobs, not a commitment — each job keeps its own.
        </p>
      </div>

      <form action={createClient} className="space-y-4">
        <SectionCard title="Client">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="sm:col-span-2">
              <span className="label">Name</span>
              <input name="name" className="input" required placeholder="Example Bank Limited" />
            </label>
            <label>
              <span className="label">Type</span>
              <select name="kind" className="select" defaultValue="bank">
                {Object.entries(CLIENT_KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>
              <span className="label">Division / branch</span>
              <input name="division" className="input" placeholder="Hawke's Bay Business Banking" />
            </label>
            <label className="sm:col-span-2">
              <span className="label">Postal address</span>
              <input name="address" className="input" placeholder="PO Box 1234, Napier 4140" />
            </label>
            <label><span className="label">Phone</span><input name="phone" className="input" /></label>
            <label><span className="label">Reports to</span><input name="reportsEmail" type="email" className="input" /></label>
            <label><span className="label">Accounts email</span><input name="accountsEmail" type="email" className="input" /></label>
            <label><span className="label">Standard fee ($)</span><input name="defaultFee" className="input" placeholder="2,200" /></label>
            <label><span className="label">Turnaround (days)</span><input name="defaultTurnaroundDays" className="input" placeholder="10" /></label>
            <label className="sm:col-span-2">
              <span className="label">Standing terms</span>
              <textarea name="terms" rows={2} className="textarea" placeholder="Panel agreement, fee scale, reliance wording" />
            </label>
            <label className="sm:col-span-2">
              <span className="label">Notes</span>
              <textarea name="notes" rows={2} className="textarea" />
            </label>
          </div>
        </SectionCard>

        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary">Create client</button>
          <Link href="/clients" className="btn btn-ghost">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
