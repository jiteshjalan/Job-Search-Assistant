'use client';

import type { ScoredJob } from '@/app/api/score-jobs/route';

interface Props {
  job: ScoredJob;
  tracked: boolean;
  refreshing: boolean;
  onScoreClick: () => void;
  onOutreachClick: () => void;
  onInterviewClick: () => void;
  onTrackClick: () => void;
  onRefreshClick: () => void;
}

const warmPathConfig = {
  strong: { label: 'Warm path: Strong', color: 'bg-green-100 text-green-700' },
  moderate: { label: 'Warm path: Moderate', color: 'bg-yellow-100 text-yellow-700' },
  cold: { label: 'Cold outreach', color: 'bg-slate-100 text-slate-500' },
};

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 75 ? 'bg-green-500' :
    score >= 55 ? 'bg-amber-400' :
    'bg-red-400';
  return (
    <div className={`${color} text-white font-bold rounded-xl px-3 py-1.5 text-center min-w-[60px]`}>
      <div className="text-xl leading-none">{score}</div>
      <div className="text-xs font-normal opacity-80">/ 100</div>
    </div>
  );
}

const sourceLabels: Record<string, string> = {
  serpapi: 'Google Jobs',
  yc: 'YC',
  hardcoded: 'Direct',
};

export default function JobCard({
  job,
  tracked,
  refreshing,
  onScoreClick,
  onOutreachClick,
  onInterviewClick,
  onTrackClick,
  onRefreshClick,
}: Props) {
  const warmCfg = warmPathConfig[job.warmPath];

  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-5 transition-shadow ${
      refreshing ? 'border-indigo-300 opacity-70' : 'border-slate-200 hover:shadow-md'
    }`}>
      {/* Top row */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">
              {sourceLabels[job.source] ?? job.source}
            </span>
            <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${warmCfg.color}`}>
              {warmCfg.label}
            </span>
          </div>
          <h3 className="font-semibold text-slate-900 text-base leading-snug">{job.title}</h3>
          <p className="text-slate-500 text-sm">{job.company} · {job.location}</p>
        </div>
        <ScoreBadge score={job.compositeScore} />
      </div>

      {/* Signals & Gaps */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <p className="text-xs font-medium text-green-700 mb-1">Top signals</p>
          <ul className="space-y-0.5">
            {job.topSignals.slice(0, 2).map((s, i) => (
              <li key={i} className="text-xs text-slate-600 flex items-start gap-1">
                <span className="text-green-500 mt-0.5">✓</span> {s}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium text-red-600 mb-1">Top gaps</p>
          <ul className="space-y-0.5">
            {job.topGaps.slice(0, 2).map((g, i) => (
              <li key={i} className="text-xs text-slate-600 flex items-start gap-1">
                <span className="text-red-400 mt-0.5">△</span> {g}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
        <button
          onClick={onScoreClick}
          disabled={refreshing}
          className="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 font-medium hover:bg-indigo-100 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-default"
        >
          Why This Score
        </button>
        <button
          onClick={onOutreachClick}
          disabled={refreshing}
          className="text-xs px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 font-medium hover:bg-violet-100 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-default"
        >
          Outreach Centre
        </button>
        <button
          onClick={onInterviewClick}
          disabled={refreshing}
          className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-medium hover:bg-blue-100 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-default"
        >
          Interview Prep
        </button>
        <button
          onClick={onTrackClick}
          disabled={tracked || refreshing}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-colors ${
            tracked
              ? 'bg-green-50 text-green-600 cursor-default'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-default'
          }`}
        >
          {tracked ? '✓ Tracked' : 'Track Application'}
        </button>

        {/* Refresh — the only way to bypass cache and re-score + re-fetch contacts */}
        <button
          onClick={onRefreshClick}
          disabled={refreshing}
          title="Re-score this role and clear cached contacts"
          className="text-xs px-3 py-1.5 rounded-lg bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer transition-colors disabled:cursor-default ml-auto flex items-center gap-1"
        >
          {refreshing ? (
            <>
              <span className="animate-spin inline-block">↻</span>
              <span>Refreshing…</span>
            </>
          ) : (
            <>
              <span>↻</span>
              <span>Refresh</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
