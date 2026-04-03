'use client';

import { useState, useEffect } from 'react';
import type { UniverseJob } from '@/app/dashboard/page';
import type { ScoredJob } from '@/app/api/score-jobs/route';
import DarkJobCard from './DarkJobCard';

interface Props {
  jobs:            UniverseJob[];
  refreshingJobId: string | null;
  onClose:         () => void;
  onCardClick:     (job: ScoredJob) => void;
  onOpenScore:     (job: ScoredJob) => void;
  onOpenOutreach:  (job: ScoredJob) => void;
  onOpenInterview: (job: ScoredJob) => void;
  onApply:         (job: ScoredJob) => void;
  onRefresh:       (job: UniverseJob) => void;
  onStatusChange:  (jobId: string, status: UniverseJob['status']) => void;
}

type FilterStatus = 'all' | 'new' | 'viewed' | 'applied';

export default function AllJobsOverlay({
  jobs, refreshingJobId, onClose,
  onCardClick, onOpenScore, onOpenOutreach, onOpenInterview, onApply, onRefresh,
}: Props) {
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [sort,   setSort]   = useState<'score' | 'recent'>('score');

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const filtered = jobs
    .filter(j => filter === 'all' || j.status === filter)
    .sort((a, b) =>
      sort === 'score'
        ? b.compositeScore - a.compositeScore
        : new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
    );

  const counts: Record<FilterStatus, number> = {
    all:     jobs.length,
    new:     jobs.filter(j => j.status === 'new').length,
    viewed:  jobs.filter(j => j.status === 'viewed').length,
    applied: jobs.filter(j => j.status === 'applied').length,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#0c0c0c] animate-fade-in"
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center gap-4 px-8 py-4 border-b border-white/[0.07] flex-shrink-0">
        <button
          onClick={onClose}
          className="text-[#444] hover:text-[#888] text-sm transition-colors cursor-pointer"
        >
          ← Back
        </button>
        <span className="text-sm font-semibold text-[#d0d0d0]">All Jobs</span>
        <span className="text-xs text-[#333]">{jobs.length} in universe</span>

        <div className="ml-auto">
          <select
            value={sort}
            onChange={e => setSort(e.target.value as 'score' | 'recent')}
            className="text-[11px] bg-white/[0.04] border border-white/[0.08] text-[#666] rounded-lg px-3 py-1.5 focus:outline-none cursor-pointer"
          >
            <option value="score">By Score</option>
            <option value="recent">Most Recent</option>
          </select>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-8 py-2.5 border-b border-white/[0.04] flex-shrink-0">
        {(['all', 'new', 'viewed', 'applied'] as FilterStatus[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[11px] px-3 py-1.5 rounded-lg transition-all cursor-pointer capitalize ${
              filter === f
                ? 'bg-white/[0.07] text-[#ccc]'
                : 'text-[#444] hover:text-[#777]'
            }`}
          >
            {f}{counts[f] > 0 ? ` (${counts[f]})` : ''}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <p className="text-sm text-[#333]">No jobs with this filter</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-w-5xl mx-auto">
            {filtered.map(job => (
              <DarkJobCard
                key={job.id}
                job={job}
                refreshing={refreshingJobId === job.id}
                onCardClick={    () => onCardClick(job)}
                onScoreClick={   () => onOpenScore(job)}
                onOutreachClick={() => onOpenOutreach(job)}
                onInterviewClick={() => onOpenInterview(job)}
                onApplyClick={   () => onApply(job)}
                onRefreshClick={ () => onRefresh(job)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
