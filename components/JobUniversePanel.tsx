'use client';

import type { UniverseJob, SearchState } from '@/app/dashboard/page';
import type { ScoredJob } from '@/app/api/score-jobs/route';
import DarkJobCard from './DarkJobCard';

interface Props {
  jobs:            UniverseJob[];
  topJobs:         UniverseJob[];
  searchMode:      boolean;
  searchState:     SearchState;
  refreshingJobId: string | null;
  onCardClick:     (job: ScoredJob) => void;
  onOpenScore:     (job: ScoredJob) => void;
  onOpenOutreach:  (job: ScoredJob) => void;
  onOpenInterview: (job: ScoredJob) => void;
  onApply:         (job: ScoredJob) => void;
  onRefresh:       (job: UniverseJob) => void;
  onViewAll:       () => void;
  onStatusChange:  (jobId: string, status: UniverseJob['status']) => void;
}

export default function JobUniversePanel({
  jobs, topJobs, searchMode, searchState,
  refreshingJobId, onCardClick, onOpenScore, onOpenOutreach, onOpenInterview,
  onApply, onRefresh, onViewAll,
}: Props) {
  // Only show jobs that have not been tracked/acted on
  const untrackedJobs    = jobs.filter(j => j.status !== 'applied');
  const untrackedTopJobs = topJobs.filter(j => j.status !== 'applied');

  const newCount = untrackedJobs.filter(j => j.status === 'new').length;
  const isLoading = searchState === 'fetching' || searchState === 'scoring';

  // In search mode show all sorted by score; in default show top 3
  const display = searchMode
    ? [...untrackedJobs].sort((a, b) => b.compositeScore - a.compositeScore)
    : untrackedTopJobs;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-[#3a3a3a] uppercase tracking-widest">
            Job Universe
          </span>
          {untrackedJobs.length > 0 && (
            <span className="text-[10px] bg-white/[0.05] text-[#555] rounded-full px-2 py-0.5">
              {untrackedJobs.length}
            </span>
          )}
          {newCount > 0 && (
            <span className="text-[10px] bg-indigo-500/12 text-indigo-400 rounded-full px-2 py-0.5 animate-fade-in">
              {newCount} new
            </span>
          )}
        </div>

        {!searchMode && untrackedJobs.length > 3 && (
          <button
            onClick={onViewAll}
            className="text-[11px] text-[#3a3a3a] hover:text-[#777] transition-colors cursor-pointer"
          >
            View all →
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-3">

        {/* Empty state */}
        {untrackedJobs.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-10 h-10 rounded-xl bg-white/[0.03] flex items-center justify-center mb-3">
              <span className="text-lg">🎯</span>
            </div>
            <p className="text-sm text-[#3a3a3a] font-medium mb-1">Universe is empty</p>
            <p className="text-[11px] text-[#2a2a2a]">Search for a role to populate it</p>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && display.length === 0 && (
          <div className="space-y-2.5 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-[72px] rounded-xl bg-white/[0.025] border border-white/[0.04]" />
            ))}
          </div>
        )}

        {/* Job cards */}
        {display.length > 0 && (
          <div className="space-y-2 animate-fade-in">
            {display.map(job => (
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

        {/* View All button */}
        {!searchMode && untrackedJobs.length > 3 && (
          <button
            onClick={onViewAll}
            className="w-full mt-3 py-2 border border-white/[0.06] rounded-xl text-[11px] text-[#333] hover:text-[#666] hover:border-white/[0.10] transition-all cursor-pointer"
          >
            View all {untrackedJobs.length} jobs →
          </button>
        )}
      </div>
    </div>
  );
}
