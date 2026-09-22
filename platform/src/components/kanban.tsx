'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { moveJob } from '@/app/actions';
import { STATUS_META, STATUS_ORDER } from '@/lib/status';
import { shortDate, daysUntil, moneyShort } from '@/lib/format';
import type { JobStatus } from '@/db/schema';

export type KanbanJob = {
  id: number;
  jobNo: string;
  status: JobStatus;
  address: string;
  town: string | null;
  client: string | null;
  instructor: string | null;
  valuer: string | null;
  dueDate: string | null;
  fee: string | null;
  purpose: string | null;
};

const COLUMNS: JobStatus[] = [...STATUS_ORDER, 'on_hold'];

export function KanbanBoard({ jobs }: { jobs: KanbanJob[] }) {
  // Optimistic local copy so a dropped card moves before the server responds.
  const [items, setItems] = useState(jobs);
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<JobStatus | null>(null);
  const [, startTransition] = useTransition();

  function drop(status: JobStatus) {
    setOver(null);
    const id = dragId;
    setDragId(null);
    if (id === null) return;
    const job = items.find((j) => j.id === id);
    if (!job || job.status === status) return;

    setItems((prev) => prev.map((j) => (j.id === id ? { ...j, status } : j)));
    startTransition(() => {
      moveJob(id, status);
    });
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {COLUMNS.map((status) => {
        const colJobs = items.filter((j) => j.status === status);
        const meta = STATUS_META[status];
        return (
          <div
            key={status}
            className={'kanban-col rounded-lg bg-white/60 border border-[var(--color-line)] ' + (over === status ? 'drop-target' : '')}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(status);
            }}
            onDragLeave={() => setOver((o) => (o === status ? null : o))}
            onDrop={() => drop(status)}
          >
            <div className="px-3 py-2 border-b border-[var(--color-line)] flex items-center justify-between sticky top-0 bg-white rounded-t-lg">
              <span className="panel-title">{meta.label}</span>
              <span className="text-[11px] font-extrabold text-gray-500 tabular-nums">{colJobs.length}</span>
            </div>

            <div className="p-2 space-y-2 min-h-[120px]">
              {colJobs.map((j) => {
                const dd = daysUntil(j.dueDate);
                const late = dd !== null && dd < 0;
                return (
                  <div
                    key={j.id}
                    draggable
                    onDragStart={() => setDragId(j.id)}
                    onDragEnd={() => setDragId(null)}
                    className={'job-card card p-2.5 ' + (dragId === j.id ? 'opacity-50' : '')}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <Link href={`/jobs/${j.id}`} className="text-[12px] font-extrabold text-navy-600 hover:underline">
                        {j.jobNo}
                      </Link>
                      {j.valuer && (
                        <span className="text-[10px] font-extrabold bg-brand-pale text-navy rounded px-1.5 py-[1px]">
                          {j.valuer}
                        </span>
                      )}
                    </div>
                    <Link href={`/jobs/${j.id}`} className="block text-[13px] font-bold leading-snug mt-1 hover:text-navy-600">
                      {j.address}
                    </Link>
                    <div className="text-[11px] text-gray-500 truncate">
                      {[j.town, j.client].filter(Boolean).join(' · ')}
                    </div>
                    {j.purpose && <div className="text-[11px] text-gray-500 truncate mt-0.5">{j.purpose}</div>}
                    <div className="flex items-center justify-between gap-2 mt-1.5 text-[11px]">
                      <span className={late ? 'text-red-700 font-bold' : 'text-gray-500'}>
                        {j.dueDate ? (late ? `${Math.abs(dd!)}d overdue` : shortDate(j.dueDate)) : 'No due date'}
                      </span>
                      <span className="text-gray-500 tabular-nums">{moneyShort(j.fee)}</span>
                    </div>
                  </div>
                );
              })}
              {colJobs.length === 0 && (
                <p className="text-[11.5px] text-gray-400 italic px-1 py-2">Drag a job here</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
