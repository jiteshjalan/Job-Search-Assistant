'use client';

import { useEffect } from 'react';
import type { ScoredJob } from '@/app/api/score-jobs/route';

export type ApplyDecision = 'direct' | 'outreach' | 'outreach+direct';

interface Props {
  job:      ScoredJob;
  onDecide: (decision: ApplyDecision) => void;
  onClose:  () => void;
}

export default function ApplyDecisionPanel({ job, onDecide, onClose }: Props) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-[2px]" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-6 pointer-events-none">
        <div className="w-full max-w-sm bg-[#1a1a1a] border border-white/[0.10] rounded-2xl shadow-2xl shadow-black/80 animate-fade-in pointer-events-auto">

          {/* Header */}
          <div className="px-5 pt-5 pb-4 border-b border-white/[0.07]">
            <p className="text-sm font-semibold text-[#e0e0e0]">How would you like to apply?</p>
            <p className="text-[11px] text-[#555] mt-0.5 truncate">{job.title} · {job.company}</p>
          </div>

          {/* Options */}
          <div className="p-4 space-y-2.5">

            {/* Direct Apply */}
            <button
              onClick={() => onDecide('direct')}
              className="w-full text-left px-4 py-3 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:border-indigo-500/30 hover:bg-indigo-500/[0.05] transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-medium text-[#e0e0e0]">Direct Apply</p>
                <span className="text-[10px] bg-indigo-500/15 text-indigo-400 rounded-full px-2 py-0.5">Opens JD ↗</span>
              </div>
              <p className="text-[11px] text-[#444] leading-relaxed">
                Opens the job URL in a new tab and moves to <span className="text-[#666]">Applied</span> in your tracker.
              </p>
            </button>

            {/* Outreach First */}
            <button
              onClick={() => onDecide('outreach')}
              className="w-full text-left px-4 py-3 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:border-violet-500/30 hover:bg-violet-500/[0.05] transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-medium text-[#e0e0e0]">Outreach First</p>
                <span className="text-[10px] bg-violet-500/15 text-violet-400 rounded-full px-2 py-0.5">Opens Outreach</span>
              </div>
              <p className="text-[11px] text-[#444] leading-relaxed">
                Draft cold email + LinkedIn before applying. Moves to <span className="text-[#666]">Outreach Sent</span> with follow-up reminder.
              </p>
            </button>

            {/* Outreach + Apply */}
            <button
              onClick={() => onDecide('outreach+direct')}
              className="w-full text-left px-4 py-3 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:border-green-500/30 hover:bg-green-500/[0.05] transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-medium text-[#e0e0e0]">Outreach + Apply</p>
                <span className="text-[10px] bg-green-500/15 text-green-400 rounded-full px-2 py-0.5">Both</span>
              </div>
              <p className="text-[11px] text-[#444] leading-relaxed">
                Opens job URL and outreach panel simultaneously. Moves to <span className="text-[#666]">Applied</span> with full outreach history.
              </p>
            </button>
          </div>

          {/* Cancel */}
          <div className="px-4 pb-4">
            <button
              onClick={onClose}
              className="w-full py-2 text-[11px] text-[#444] hover:text-[#666] transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
