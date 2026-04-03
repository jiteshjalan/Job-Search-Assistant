'use client';

import { useEffect, useState } from 'react';
import type { ScoredJob } from '@/app/api/score-jobs/route';
import type { DimensionScore } from '@/app/api/score-jobs/route';
import CVBuilder from './CVBuilder';

interface Props {
  job:         ScoredJob;
  onClose:     () => void;
  onApply:     () => void;
  onOutreach:  () => void;
  onInterview: () => void;
}

const DIM_CFG: Record<string, { label: string; bar: string }> = {
  roleProfileFit:         { label: 'Role & Profile Fit',         bar: '#6366f1' },
  companyStageTrajectory: { label: 'Company Stage & Trajectory', bar: '#8b5cf6' },
  networkProximity:       { label: 'Network Proximity',          bar: '#3b82f6' },
  outreachROI:            { label: 'Outreach ROI',               bar: '#06b6d4' },
};

const SOURCE_LABELS: Record<string, string> = {
  serpapi:    'Google Jobs',
  serper:     'Google Jobs',
  hardcoded:  'Direct',
};

// ─── Parse sections out of a raw JD string ────────────────────────────────────
// Splits on common headings so requirements / qualifications are shown separately.

interface ParsedJD {
  intro:        string;
  requirements: string;
  rest:         string;
}

function parseDescription(raw: string): ParsedJD {
  if (!raw) return { intro: '', requirements: '', rest: '' };

  // Headings that typically introduce requirements/qualifications
  const reqHeadings = [
    'requirements', 'qualifications', 'what you\'ll need', 'what we\'re looking for',
    'who you are', 'ideal candidate', 'skills', 'experience required',
    'minimum qualifications', 'preferred qualifications',
  ];
  const pattern = new RegExp(
    `(${reqHeadings.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'i',
  );

  const match = raw.search(pattern);
  if (match === -1) return { intro: raw.trim(), requirements: '', rest: '' };

  const intro = raw.slice(0, match).trim();
  const remainder = raw.slice(match).trim();

  // Find where requirements section ends (next major heading)
  const nextHeadings = [
    'responsibilities', 'what you\'ll do', 'the role', 'about the role',
    'why join', 'benefits', 'compensation', 'what we offer', 'perks',
    'growth trajectory', 'about us', 'about the company',
  ];
  const nextPattern = new RegExp(
    `\n(${nextHeadings.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'i',
  );
  const nextMatch = remainder.search(nextPattern);

  if (nextMatch === -1) return { intro, requirements: remainder, rest: '' };
  return {
    intro,
    requirements: remainder.slice(0, nextMatch).trim(),
    rest:         remainder.slice(nextMatch).trim(),
  };
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-[#333] uppercase tracking-widest mb-3">{title}</p>
      {children}
    </div>
  );
}

export default function JobDrawer({ job, onClose, onApply, onOutreach, onInterview }: Props) {
  const [showCVBuilder, setShowCVBuilder] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const scoreCol =
    job.compositeScore >= 75 ? '#22c55e' :
    job.compositeScore >= 55 ? '#f59e0b' : '#ef4444';

  const { intro, requirements, rest } = parseDescription(job.description ?? '');

  return (
  <>
    <div className="fixed inset-y-0 right-0 w-[480px] max-w-full z-50 flex flex-col bg-[#141414] border-l border-white/[0.08] shadow-2xl shadow-black/60">

      {/* ── Sticky header ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-[#141414] border-b border-white/[0.08] px-5 py-4 z-10">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0 pr-3">
            <p className="text-sm font-semibold text-[#e0e0e0] leading-snug">{job.title}</p>
            <p className="text-[11px] text-[#555] mt-0.5">{job.company} · {job.location}</p>
          </div>
          <button
            onClick={onClose}
            className="text-[#444] hover:text-[#888] text-lg leading-none cursor-pointer transition-colors flex-shrink-0"
          >✕</button>
        </div>

        {/* Action bar */}
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={onApply}
            className="text-[11px] px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors cursor-pointer"
          >Apply</button>
          <button
            onClick={onOutreach}
            className="text-[11px] px-3 py-1.5 rounded-lg bg-violet-500/15 hover:bg-violet-500/25 text-violet-400 transition-colors cursor-pointer"
          >Outreach</button>
          <button
            onClick={onInterview}
            className="text-[11px] px-3 py-1.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 transition-colors cursor-pointer"
          >Interview Prep</button>
          <button
            onClick={() => setShowCVBuilder(true)}
            className="text-[11px] px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 transition-colors cursor-pointer"
          >Build CV</button>
          {job.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-[11px] px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[#666] hover:text-[#999] transition-colors cursor-pointer"
            >View JD ↗</a>
          )}
        </div>
      </div>

      {/* ── Scrollable body ───────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-7">

        {/* ── Company details ─────────────────────────── */}
        <Section title="Company Details">
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#444]">Company</span>
              <span className="text-[11px] text-[#888] font-medium">{job.company}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#444]">Location</span>
              <span className="text-[11px] text-[#888]">{job.location || '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#444]">Source</span>
              <span className="text-[11px] text-[#888]">{SOURCE_LABELS[job.source] ?? job.source}</span>
            </div>
            {job.postedAt && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[#444]">Posted</span>
                <span className="text-[11px] text-[#888]">{job.postedAt}</span>
              </div>
            )}
          </div>
        </Section>

        {/* ── Fit score ───────────────────────────────── */}
        <Section title="Fit Score">
          <div className="flex items-center gap-4 bg-white/[0.02] border border-white/[0.05] rounded-xl p-4">
            <div className="text-4xl font-bold flex-shrink-0" style={{ color: scoreCol }}>
              {job.compositeScore}
            </div>
            <div className="flex-1 min-w-0">
              <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden mb-1.5">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${job.compositeScore}%`, background: scoreCol }}
                />
              </div>
              <p className="text-[10px] text-[#444]">
                composite / 100 ·{' '}
                {job.compositeScore >= 75 ? 'Strong fit' :
                 job.compositeScore >= 55 ? 'Moderate fit' : 'Stretch role'}
              </p>
            </div>
          </div>
        </Section>

        {/* ── Score breakdown ──────────────────────────── */}
        <Section title="Score Breakdown">
          <div className="space-y-4">
            {Object.entries(job.dimensions ?? {}).map(([key, dim]) => {
              const cfg = DIM_CFG[key] ?? { label: key, bar: '#6366f1' };
              const d = dim as DimensionScore;
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[#888]">{cfg.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[#444]">w {Math.round(d.weight * 100)}%</span>
                      <span className="text-sm font-bold text-[#e0e0e0]">{d.score}</span>
                    </div>
                  </div>
                  <div className="h-1 rounded-full bg-white/[0.04] overflow-hidden mb-1.5">
                    <div className="h-full rounded-full" style={{ width: `${d.score}%`, background: cfg.bar }} />
                  </div>
                  <p className="text-[11px] text-[#444] leading-relaxed">{d.rationale}</p>
                  {d.improvements?.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {d.improvements.map((imp, i) => (
                        <li key={i} className="text-[10px] text-[#444] flex items-start gap-1.5">
                          <span className="text-amber-500/50 flex-shrink-0 mt-0.5">→</span>{imp}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {/* ── Why you fit ─────────────────────────────── */}
        {job.topSignals?.length > 0 && (
          <Section title="Why You Fit">
            <ul className="space-y-1.5">
              {job.topSignals.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] text-[#666]">
                  <span className="text-green-500/60 flex-shrink-0 mt-0.5">✓</span>{s}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* ── Top gaps ────────────────────────────────── */}
        {job.topGaps?.length > 0 && (
          <Section title="Top Gaps">
            <ul className="space-y-1.5">
              {job.topGaps.map((g, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] text-[#666]">
                  <span className="text-amber-500/50 flex-shrink-0 mt-0.5">△</span>{g}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* ── Job intro / overview ─────────────────────── */}
        {intro && (
          <Section title="Role Overview">
            <p className="text-[12px] text-[#555] leading-relaxed whitespace-pre-line">{intro}</p>
          </Section>
        )}

        {/* ── Key requirements ────────────────────────── */}
        {requirements && (
          <Section title="Key Requirements">
            <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-3">
              <p className="text-[12px] text-[#555] leading-relaxed whitespace-pre-line">{requirements}</p>
            </div>
          </Section>
        )}

        {/* ── Rest of description ──────────────────────── */}
        {rest && (
          <Section title="Full Job Description">
            <p className="text-[12px] text-[#555] leading-relaxed whitespace-pre-line">{rest}</p>
          </Section>
        )}

        {/* Fallback: no parsing happened — show full description */}
        {!intro && !requirements && !rest && job.description && (
          <Section title="Job Description">
            <p className="text-[12px] text-[#555] leading-relaxed whitespace-pre-line">{job.description}</p>
          </Section>
        )}

        {/* ── Deliberately excluded ────────────────────── */}
        {Object.keys(job.excludedFactors ?? {}).length > 0 && (
          <Section title="Deliberately Excluded">
            <div className="space-y-2">
              {Object.entries(job.excludedFactors).map(([key, reason]) => (
                <div key={key} className="bg-white/[0.02] border border-white/[0.05] rounded-lg px-3.5 py-2.5">
                  <p className="text-[10px] font-semibold text-[#444] capitalize mb-0.5">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </p>
                  <p className="text-[11px] text-[#3a3a3a] leading-relaxed">{reason as string}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Bottom padding so last section isn't flush against the edge */}
        <div className="h-4" />
      </div>
    </div>

    {showCVBuilder && (
      <CVBuilder job={job} onClose={() => setShowCVBuilder(false)} />
    )}
  </>
  );
}
