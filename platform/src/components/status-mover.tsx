'use client';

import { useTransition } from 'react';
import { moveJob } from '@/app/actions';
import { STATUS_META, STATUS_ORDER } from '@/lib/status';
import type { JobStatus } from '@/db/schema';

const ALL: JobStatus[] = [...STATUS_ORDER, 'on_hold', 'cancelled'];

/** Inline stage switcher — the same transitions as dragging on the board,
 *  for when you are already inside the job. */
export function StatusMover({ jobId, status }: { jobId: number; status: JobStatus }) {
  const [pending, start] = useTransition();

  return (
    <div className="card p-2 flex items-center gap-1.5 overflow-x-auto">
      <span className="panel-title pl-1.5 pr-1 whitespace-nowrap">Stage</span>
      {ALL.map((s) => {
        const active = s === status;
        return (
          <button
            key={s}
            type="button"
            disabled={pending || active}
            onClick={() => start(() => { moveJob(jobId, s); })}
            className={
              'px-2.5 py-1.5 rounded-md text-[12px] font-bold whitespace-nowrap border ' +
              (active
                ? 'bg-navy text-white border-navy cursor-default'
                : 'bg-white border-[var(--color-line)] text-navy hover:bg-brand-pale disabled:opacity-50')
            }
          >
            {STATUS_META[s].label}
          </button>
        );
      })}
      {pending && <span className="text-[11.5px] text-gray-500 pl-1">saving…</span>}
    </div>
  );
}
