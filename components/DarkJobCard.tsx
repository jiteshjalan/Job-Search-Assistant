'use client';

import type { UniverseJob } from '@/app/dashboard/page';

interface Props {
  job:              UniverseJob;
  refreshing?:      boolean;
  onCardClick:      () => void;
  onScoreClick:     () => void;
  onOutreachClick:  () => void;
  onInterviewClick: () => void;
  onApplyClick:     () => void;
  onRefreshClick:   () => void;
}

const STATUS = {
  new:     { label: 'New',     cls: 'bg-indigo-500/15 text-indigo-400' },
  viewed:  { label: 'Viewed',  cls: 'bg-white/[0.05] text-[#555]' },
  applied: { label: 'Applied', cls: 'bg-green-500/10 text-green-500' },
};

const WARM = {
  strong:   { dot: 'bg-green-500',   label: 'Warm: Strong' },
  moderate: { dot: 'bg-amber-400',   label: 'Warm: Moderate' },
  cold:     { dot: 'bg-[#2e2e2e]',   label: 'Cold' },
};

export default function DarkJobCard({
  job, refreshing,
  onCardClick, onScoreClick, onOutreachClick, onInterviewClick,
  onApplyClick, onRefreshClick,
}: Props) {
  const st = STATUS[job.status];
  const wm = WARM[job.warmPath] ?? WARM.cold;

  const scoreCol =
    job.compositeScore >= 75 ? 'text-green-400' :
    job.compositeScore >= 55 ? 'text-amber-400' : 'text-[#666]';

  return (
    <div
      className={`rounded-xl border transition-all duration-150 ${
        refreshing
          ? 'border-indigo-500/20 bg-indigo-500/[0.04] opacity-60'
          : 'border-white/[0.07] bg-white/[0.015] hover:border-white/[0.11] hover:bg-white/[0.035]'
      }`}
    >
      {/* ── Clickable body (opens JD drawer) ─── */}
      <div
        className="px-3.5 py-3 cursor-pointer"
        onClick={onCardClick}
      >
        <div className="flex items-start gap-3">
          {/* Company initial */}
          <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.06] flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-[11px] font-bold text-[#555]">
              {(job.company[0] ?? '?').toUpperCase()}
            </span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${st.cls}`}>
                {st.label}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-[#3a3a3a]" title={wm.label}>
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${wm.dot}`} />
                {wm.label}
              </span>
            </div>
            <p className="text-[13px] font-medium text-[#e0e0e0] leading-snug truncate">{job.title}</p>
            <p className="text-[11px] text-[#4a4a4a] truncate mt-0.5">{job.company} · {job.location}</p>
          </div>

          {/* Score */}
          <div className="text-right flex-shrink-0">
            <div className={`text-[18px] font-bold leading-tight ${scoreCol}`}>{job.compositeScore}</div>
            <div className="text-[9px] text-[#2e2e2e]">/ 100</div>
          </div>
        </div>

        {/* Top signal */}
        {job.topSignals?.[0] && (
          <p className="text-[10px] text-[#3a3a3a] mt-2 ml-11 truncate">
            <span className="text-[#2e2e2e] mr-1">✓</span>{job.topSignals[0]}
          </p>
        )}
      </div>

      {/* ── Action buttons (stop propagation to card click) ─── */}
      <div
        className="flex items-center gap-1 px-3 pb-2.5"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onScoreClick}
          className="text-[10px] px-2 py-1 rounded-md bg-indigo-500/8 text-indigo-500/70 hover:bg-indigo-500/15 hover:text-indigo-400 transition-colors cursor-pointer"
        >
          Score
        </button>
        <button
          onClick={onOutreachClick}
          className="text-[10px] px-2 py-1 rounded-md bg-violet-500/8 text-violet-500/70 hover:bg-violet-500/15 hover:text-violet-400 transition-colors cursor-pointer"
        >
          Outreach
        </button>
        <button
          onClick={onInterviewClick}
          className="text-[10px] px-2 py-1 rounded-md bg-blue-500/8 text-blue-500/70 hover:bg-blue-500/15 hover:text-blue-400 transition-colors cursor-pointer"
        >
          Interview
        </button>
        <button
          onClick={onApplyClick}
          className="text-[10px] px-2 py-1 rounded-md bg-green-500/8 text-green-500/70 hover:bg-green-500/15 hover:text-green-400 transition-colors cursor-pointer"
        >
          Apply
        </button>
        <button
          onClick={onRefreshClick}
          disabled={refreshing}
          title="Re-score and clear cached contacts"
          className="ml-auto text-[10px] px-2 py-1 rounded-md text-[#2e2e2e] hover:text-[#666] hover:bg-white/[0.04] transition-colors cursor-pointer disabled:cursor-default"
        >
          {refreshing ? <span className="animate-spin inline-block">↻</span> : '↻'}
        </button>
      </div>
    </div>
  );
}
