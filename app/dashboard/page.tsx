'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { ScoredJob } from '../api/score-jobs/route';
import type { RawJob } from '../api/fetch-jobs/route';
import ProfilePanel        from '@/components/ProfilePanel';
import KanbanBoard         from '@/components/KanbanBoard';
import SearchCenter        from '@/components/SearchCenter';
import JobUniversePanel    from '@/components/JobUniversePanel';
import ScorePanel          from '@/components/ScorePanel';
import OutreachPanel       from '@/components/OutreachPanel';
import InterviewPanel      from '@/components/InterviewPanel';
import JobDrawer           from '@/components/JobDrawer';
import ApplyDecisionPanel  from '@/components/ApplyDecisionPanel';
import AllJobsOverlay      from '@/components/AllJobsOverlay';
import type { ApplyDecision } from '@/components/ApplyDecisionPanel';

// ─── Shared types exported for child components ────────────────────────────

export interface UniverseJob extends ScoredJob {
  status: 'new' | 'viewed' | 'applied';
  addedAt: string;
}

export interface KanbanEntry {
  jobId:          string;
  company:        string;
  title:          string;
  jobUrl?:        string;
  addedAt:        string;
  // History
  outreachSentAt?: string;
  appliedAt?:      string;
  followUpDueAt?:  string;
  applyMethod?:    'direct' | 'outreach' | 'outreach+direct';
}

export interface KanbanData {
  outreachSent: KanbanEntry[];
  applied:      KanbanEntry[];
  interviewing: KanbanEntry[];
  offer:        KanbanEntry[];
  rejected:     KanbanEntry[];
}

// ─── localStorage helpers ─────────────────────────────────────────────────

const UNIVERSE_KEY = 'jsa_job_universe';
const KANBAN_KEY   = 'jsa_kanban';
const NAME_KEY     = 'jsa_user_name';

function toTitleCase(s: string): string {
  return s
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function loadUniverse(): UniverseJob[] {
  try { return JSON.parse(localStorage.getItem(UNIVERSE_KEY) ?? '[]'); }
  catch { return []; }
}
function saveUniverse(jobs: UniverseJob[]) {
  localStorage.setItem(UNIVERSE_KEY, JSON.stringify(jobs));
}

function loadKanban(): KanbanData {
  try {
    const d = JSON.parse(localStorage.getItem(KANBAN_KEY) ?? '{}');
    return {
      outreachSent: d.outreachSent ?? [],
      applied:      d.applied      ?? [],
      interviewing: d.interviewing ?? [],
      offer:        d.offer        ?? [],
      rejected:     d.rejected     ?? [],
    };
  } catch {
    return { outreachSent: [], applied: [], interviewing: [], offer: [], rejected: [] };
  }
}
function saveKanban(data: KanbanData) {
  localStorage.setItem(KANBAN_KEY, JSON.stringify(data));
}

// ─── Types ────────────────────────────────────────────────────────────────

type ActivePanel =
  | { type: 'score';     job: ScoredJob }
  | { type: 'outreach';  job: ScoredJob }
  | { type: 'interview'; job: ScoredJob }
  | { type: 'drawer';    job: ScoredJob }
  | null;

export type SearchState = 'idle' | 'fetching' | 'scoring' | 'done' | 'error';

// ─── Component ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [ready,    setReady]    = useState(false);
  const [userName, setUserName] = useState('you');

  const [universe, setUniverse] = useState<UniverseJob[]>([]);
  const [kanban,   setKanban]   = useState<KanbanData>({
    outreachSent: [], applied: [], interviewing: [], offer: [], rejected: [],
  });

  const [searchState,   setSearchState]   = useState<SearchState>('idle');
  const [searchMode,    setSearchMode]    = useState(false);
  const [uncachedCount, setUncachedCount] = useState<number | null>(null);
  const [searchError,   setSearchError]   = useState('');

  const [activePanel,      setActivePanel]      = useState<ActivePanel>(null);
  const [applyDecisionJob, setApplyDecisionJob] = useState<ScoredJob | null>(null);
  const [showAllJobs,      setShowAllJobs]      = useState(false);
  const [refreshingJobId,  setRefreshingJobId]  = useState<string | null>(null);

  const hasChecked   = useRef(false);
  const kanbanRef    = useRef<KanbanData>({ outreachSent: [], applied: [], interviewing: [], offer: [], rejected: [] });
  const universeRef  = useRef<UniverseJob[]>([]);

  useEffect(() => {
    if (hasChecked.current) return;
    hasChecked.current = true;

    if (!localStorage.getItem('jsa_profile_complete') || !localStorage.getItem('jsa_cv')) {
      router.replace('/');
      return;
    }
    // Fix 2: normalize to title case
    const rawName = localStorage.getItem(NAME_KEY) ?? '';
    setUserName(rawName ? toTitleCase(rawName) : 'you');
    setUniverse(loadUniverse());
    const initialKanban = loadKanban();
    kanbanRef.current = initialKanban;
    setKanban(initialKanban);
    setReady(true);
  }, [router]);

  // Keep universeRef in sync so handleKanbanChange can look up scores without stale closure
  useEffect(() => { universeRef.current = universe; }, [universe]);

  // ── Search ──────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async (
    query: string,
    filters: Record<string, string>,
  ) => {
    if (!query.trim() && Object.values(filters).every(v => !v)) return;

    const parts: string[] = [];
    if (query.trim())       parts.push(query.trim());
    if (filters.roleType)   parts.push(`looking for ${filters.roleType} role`);
    if (filters.location)   parts.push(`in ${filters.location}`);
    if (filters.stage)      parts.push(`at ${filters.stage} company`);
    if (filters.industry)   parts.push(`in the ${filters.industry} industry`);
    const preferences = parts.join(', ');

    setSearchMode(true);
    setSearchState('fetching');
    setSearchError('');
    setUncachedCount(null);

    const cvText = localStorage.getItem('jsa_cv') ?? '';

    try {
      const fetchRes = await fetch('/api/fetch-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences }),
      });
      if (!fetchRes.ok) throw new Error('Failed to fetch jobs');
      const { jobs: rawJobs } = await fetchRes.json() as { jobs: RawJob[] };

      if (rawJobs.length === 0) { setSearchState('done'); return; }

      setSearchState('scoring');

      const scoreRes = await fetch('/api/score-all-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobs: rawJobs, cvText, preferences }),
      });
      if (!scoreRes.ok) throw new Error('Failed to score jobs');
      const { scoredJobs, uncachedCount: fresh } = await scoreRes.json();

      setUncachedCount(fresh ?? 0);

      // Determine which jobs are genuinely new before updating state
      const currentIds = new Set(universeRef.current.map(j => j.id));
      const newScoredJobs = (scoredJobs as ScoredJob[]).filter(j => !currentIds.has(j.id));

      setUniverse(prev => {
        const existingIds = new Set(prev.map(j => j.id));
        const newJobs: UniverseJob[] = (scoredJobs as ScoredJob[])
          .filter(j => !existingIds.has(j.id))
          .map(j => ({ ...j, status: 'new' as const, addedAt: new Date().toISOString() }));
        const updated = prev.map(existing => {
          const refreshed = (scoredJobs as ScoredJob[]).find(j => j.id === existing.id);
          return refreshed ? { ...existing, ...refreshed } : existing;
        });
        const merged = [...updated, ...newJobs];
        saveUniverse(merged);
        return merged;
      });

      // Fix 1: write each new job to the sheet immediately after scoring
      newScoredJobs.forEach(j => {
        fetch('/api/track-application', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId:   j.id,
            company: j.company,
            title:   j.title,
            url:     j.url ?? '',
            status:  'Tracked',
            score:   j.compositeScore,
          }),
        }).catch(() => {});
      });

      localStorage.setItem('jsa_preferences', preferences);
      setSearchState('done');
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
      setSearchState('error');
    }
  }, []);

  const handleBack = useCallback(() => {
    setSearchMode(false);
    setSearchState('idle');
    setSearchError('');
  }, []);

  // ── Job actions ──────────────────────────────────────────────────────────

  const updateStatus = useCallback((jobId: string, status: UniverseJob['status']) => {
    setUniverse(prev => {
      const updated = prev.map(j => j.id === jobId ? { ...j, status } : j);
      saveUniverse(updated);
      return updated;
    });
  }, []);

  const handleOpenPanel = useCallback((
    type: 'score' | 'outreach' | 'interview',
    job: ScoredJob,
  ) => {
    updateStatus(job.id, 'viewed');
    setActivePanel({ type, job });
  }, [updateStatus]);

  // Fix 3: open the JD drawer on card click
  const handleOpenDrawer = useCallback((job: ScoredJob) => {
    updateStatus(job.id, 'viewed');
    setActivePanel({ type: 'drawer', job });
  }, [updateStatus]);

  // Fix 6: open apply decision panel (replaces old handleTrack)
  const handleApply = useCallback((job: ScoredJob) => {
    setApplyDecisionJob(job);
  }, []);

  // Fix 6: process the decision
  const handleApplyDecision = useCallback((decision: ApplyDecision, job: ScoredJob) => {
    setApplyDecisionJob(null);

    const now = new Date().toISOString();
    const followUpDueAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

    // Open job URL for direct / outreach+direct
    if ((decision === 'direct' || decision === 'outreach+direct') && job.url) {
      window.open(job.url, '_blank');
    }

    // Open outreach panel for outreach / outreach+direct
    if (decision === 'outreach' || decision === 'outreach+direct') {
      setActivePanel({ type: 'outreach', job });
    }

    const targetCol: keyof KanbanData =
      decision === 'outreach' ? 'outreachSent' : 'applied';

    setKanban(prev => {
      // Avoid duplicate: if already tracked in any column, skip
      const alreadyIn = Object.values(prev).flat().some(e => e.jobId === job.id);
      if (alreadyIn) return prev;

      const entry: KanbanEntry = {
        jobId:    job.id,
        company:  job.company,
        title:    job.title,
        jobUrl:   job.url,
        addedAt:  now,
        outreachSentAt: (decision !== 'direct') ? now : undefined,
        appliedAt:      (decision !== 'outreach') ? now : undefined,
        followUpDueAt:  (decision !== 'direct') ? followUpDueAt : undefined,
        applyMethod:    decision,
      };

      const updated: KanbanData = { ...prev, [targetCol]: [...prev[targetCol], entry] };
      saveKanban(updated);
      return updated;
    });

    updateStatus(job.id, 'applied');

    // Fix 2: track the apply decision in the sheet
    const trackStatus = decision === 'outreach' ? 'Outreach Sent' : 'Applied';
    fetch('/api/track-application', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId:   job.id,
        company: job.company,
        title:   job.title,
        url:     job.url ?? '',
        status:  trackStatus,
        score:   job.compositeScore,
      }),
    }).catch(() => {});
  }, [updateStatus]);

  const KANBAN_STATUS_MAP: Record<keyof KanbanData, string> = {
    outreachSent: 'Outreach Sent',
    applied:      'Applied',
    interviewing: 'Interviewing',
    offer:        'Offer',
    rejected:     'Rejected',
  };

  const handleKanbanChange = useCallback((data: KanbanData) => {
    const prev = kanbanRef.current;

    // Diff each column — fire track-application for any newly placed entry
    (Object.keys(KANBAN_STATUS_MAP) as (keyof KanbanData)[]).forEach(col => {
      const prevIds = new Set(prev[col].map(e => e.jobId));
      data[col].forEach(entry => {
        if (!prevIds.has(entry.jobId)) {
          fetch('/api/track-application', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jobId:   entry.jobId,
              company: entry.company,
              title:   entry.title,
              url:     entry.jobUrl ?? '',
              status:  KANBAN_STATUS_MAP[col],
              score:   universeRef.current.find(j => j.id === entry.jobId)?.compositeScore,
            }),
          }).catch(() => {});
        }
      });
    });

    kanbanRef.current = data;
    setKanban(data);
    saveKanban(data);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefreshJob = useCallback(async (job: UniverseJob) => {
    setRefreshingJobId(job.id);
    try {
      await fetch(`/api/cache?jobId=${encodeURIComponent(job.id)}`, { method: 'DELETE' });
      const cv    = localStorage.getItem('jsa_cv') ?? '';
      const prefs = localStorage.getItem('jsa_preferences') ?? '';
      const res   = await fetch('/api/score-all-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobs: [job], cvText: cv, preferences: prefs }),
      });
      if (!res.ok) throw new Error('Refresh failed');
      const { scoredJobs } = await res.json();
      if (scoredJobs?.[0]) {
        setUniverse(prev => {
          const updated = prev.map(j => j.id === job.id ? { ...j, ...scoredJobs[0] } : j);
          saveUniverse(updated);
          return updated;
        });
      }
    } catch (e) { console.error('[dashboard] Refresh failed:', e); }
    finally { setRefreshingJobId(null); }
  }, []);

  if (!ready) return null;

  // Fix 7: compute set of tracked job IDs so we can hide them from universe display
  const trackedIds = new Set(
    Object.values(kanban).flat().map(e => e.jobId)
  );

  // Only show untracked jobs in the universe panel
  const visibleUniverse = universe.filter(j => !trackedIds.has(j.id));
  const topJobs = [...visibleUniverse]
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, 3);

  const estimatedMins = uncachedCount != null && uncachedCount > 0
    ? Math.ceil((uncachedCount * 15) / 60)
    : null;

  return (
    <div className="h-screen flex bg-[#0c0c0c] text-[#f0f0f0] overflow-hidden">

      {/* ── LEFT PANEL ──────────────────────────────────────────── */}
      <aside className="w-[280px] flex-shrink-0 flex flex-col border-r border-white/[0.06] overflow-hidden">
        <ProfilePanel />
        <KanbanBoard kanban={kanban} onChange={handleKanbanChange} />
      </aside>

      {/* ── CENTER PANEL ────────────────────────────────────────── */}
      <div
        className={`flex flex-col border-r border-white/[0.06] overflow-hidden transition-all duration-300 ${
          searchMode ? 'w-[240px] flex-shrink-0' : 'flex-1'
        }`}
      >
        <SearchCenter
          userName={userName}
          searchMode={searchMode}
          searchState={searchState}
          searchError={searchError}
          uncachedCount={uncachedCount}
          estimatedMins={estimatedMins}
          onSearch={handleSearch}
          onBack={handleBack}
        />
      </div>

      {/* ── RIGHT PANEL ─────────────────────────────────────────── */}
      <div
        className={`flex flex-col overflow-hidden transition-all duration-300 ${
          searchMode ? 'flex-1' : 'w-[400px] flex-shrink-0'
        }`}
      >
        <JobUniversePanel
          jobs={visibleUniverse}
          topJobs={topJobs}
          searchMode={searchMode}
          searchState={searchState}
          refreshingJobId={refreshingJobId}
          onCardClick={job     => handleOpenDrawer(job)}
          onOpenScore={job     => handleOpenPanel('score',     job)}
          onOpenOutreach={job  => handleOpenPanel('outreach',  job)}
          onOpenInterview={job => handleOpenPanel('interview', job)}
          onApply={handleApply}
          onRefresh={handleRefreshJob}
          onViewAll={() => setShowAllJobs(true)}
          onStatusChange={updateStatus}
        />
      </div>

      {/* ── SLIDE-OVER PANELS ───────────────────────────────────── */}
      {activePanel && (
        <>
          <div className="panel-overlay" onClick={() => setActivePanel(null)} />
          {activePanel.type === 'score' && (
            <ScorePanel job={activePanel.job} onClose={() => setActivePanel(null)} />
          )}
          {activePanel.type === 'outreach' && (
            <OutreachPanel job={activePanel.job} onClose={() => setActivePanel(null)} />
          )}
          {activePanel.type === 'interview' && (
            <InterviewPanel job={activePanel.job} onClose={() => setActivePanel(null)} />
          )}
          {activePanel.type === 'drawer' && (
            <JobDrawer
              job={activePanel.job}
              onClose={() => setActivePanel(null)}
              onApply={() => { setActivePanel(null); handleApply(activePanel.job); }}
              onOutreach={() => { setActivePanel(null); handleOpenPanel('outreach', activePanel.job); }}
              onInterview={() => { setActivePanel(null); handleOpenPanel('interview', activePanel.job); }}
            />
          )}
        </>
      )}

      {/* ── APPLY DECISION MODAL ────────────────────────────────── */}
      {applyDecisionJob && (
        <ApplyDecisionPanel
          job={applyDecisionJob}
          onDecide={decision => handleApplyDecision(decision, applyDecisionJob)}
          onClose={() => setApplyDecisionJob(null)}
        />
      )}

      {/* ── ALL JOBS OVERLAY ────────────────────────────────────── */}
      {showAllJobs && (
        <AllJobsOverlay
          jobs={visibleUniverse}
          refreshingJobId={refreshingJobId}
          onClose={() => setShowAllJobs(false)}
          onCardClick={job     => { setShowAllJobs(false); handleOpenDrawer(job); }}
          onOpenScore={job     => { setShowAllJobs(false); handleOpenPanel('score',     job); }}
          onOpenOutreach={job  => { setShowAllJobs(false); handleOpenPanel('outreach',  job); }}
          onOpenInterview={job => { setShowAllJobs(false); handleOpenPanel('interview', job); }}
          onApply={job         => { setShowAllJobs(false); handleApply(job); }}
          onRefresh={handleRefreshJob}
          onStatusChange={updateStatus}
        />
      )}
    </div>
  );
}
