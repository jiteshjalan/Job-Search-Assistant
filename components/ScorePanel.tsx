'use client';

import { useState } from 'react';
import type { ScoredJob, DimensionScore } from '@/app/api/score-jobs/route';

interface Props {
  job:             ScoredJob;
  onClose:         () => void;
  jobs?:           ScoredJob[];
  onSortToggle?:   (sortByScore: boolean) => void;
}

// Fix 1 — seven dimensions, weights embedded (dimensionBreakdown entries carry no weight field)
const DIM_CFG: Record<string, { label: string; bar: string; weight: number }> = {
  functionalFit:       { label: 'Functional Fit',       bar: '#6366f1', weight: 0.25 },
  capabilitySignals:   { label: 'Capability Signals',   bar: '#8b5cf6', weight: 0.20 },
  requirementMatch:    { label: 'Requirement Match',    bar: '#3b82f6', weight: 0.15 },
  archetypeFit:        { label: 'Archetype Fit',        bar: '#06b6d4', weight: 0.15 },
  environmentMatch:    { label: 'Environment Match',    bar: '#10b981', weight: 0.10 },
  trajectoryNarrative: { label: 'Trajectory Narrative', bar: '#f59e0b', weight: 0.10 },
  strategicAlignment:  { label: 'Strategic Alignment',  bar: '#f43f5e', weight: 0.05 },
};

function DimRow({ dimKey, dim }: { dimKey: string; dim: DimensionScore }) {
  const cfg = DIM_CFG[dimKey] ?? { label: dimKey, bar: '#6366f1', weight: 0 };
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-[#aaa]">{cfg.label}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#444]">w {Math.round(cfg.weight * 100)}%</span>
          <span className="text-sm font-bold text-[#e0e0e0]">{dim.score}</span>
        </div>
      </div>
      <div className="score-bar mb-2">
        <div className="score-bar-fill" style={{ width: `${dim.score}%`, background: cfg.bar }} />
      </div>
      <p className="text-[11px] text-[#555] mb-2 leading-relaxed">{dim.rationale}</p>
      {dim.improvements?.length > 0 && (
        <div className="bg-amber-500/[0.06] border border-amber-500/[0.12] rounded-lg p-3">
          <p className="text-[10px] font-semibold text-amber-500/80 uppercase tracking-wide mb-2">
            To increase this score
          </p>
          <ul className="space-y-1.5">
            {dim.improvements.map((imp, i) => (
              <li key={i} className="text-[11px] text-[#888] flex items-start gap-1.5">
                <span className="text-amber-500/60 mt-0.5 flex-shrink-0">→</span>
                {imp}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function ScorePanel({ job, onClose, onSortToggle }: Props) {
  // Fix 3 — sort toggle
  const [sortByScore, setSortByScore] = useState(false);

  const handleSortToggle = () => {
    const next = !sortByScore;
    setSortByScore(next);
    onSortToggle?.(next);
  };

  const scoreCol =
    job.compositeScore >= 75 ? '#22c55e' :
    job.compositeScore >= 55 ? '#f59e0b' :
    '#ef4444';

  // Fix 1 — prefer the 7-dim dimensionBreakdown; fall back to legacy 4-dim dimensions
  const breakdown = (job as unknown as Record<string, unknown>).dimensionBreakdown as Record<string, DimensionScore> | undefined
    ?? job.dimensions;

  // Fix 2 — dynamic gaps from API response
  const gaps: string[] = Array.isArray(job.topGaps) ? job.topGaps : [];

  return (
    <div className="panel-slide">
      {/* Header */}
      <div className="sticky top-0 bg-[#141414] border-b border-white/[0.08] px-5 py-4 z-10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-[#e0e0e0]">Why This Score</p>
            <p className="text-[11px] text-[#555] mt-0.5">{job.title} · {job.company}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Fix 3 — Sort by Score toggle */}
            <button
              onClick={handleSortToggle}
              className={`text-[10px] px-2.5 py-1 rounded-md font-medium border transition-colors cursor-pointer ${
                sortByScore
                  ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
                  : 'bg-white/[0.04] text-[#555] border-white/[0.06] hover:text-[#888]'
              }`}
            >
              Sort by Score
            </button>
            <button
              onClick={onClose}
              className="text-[#444] hover:text-[#888] text-lg leading-none cursor-pointer transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      <div className="px-5 py-5">
        {/* Composite score */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 mb-6 text-center">
          <div className="text-5xl font-bold mb-1" style={{ color: scoreCol }}>
            {job.compositeScore}
          </div>
          <div className="text-xs text-[#444]">composite score / 100</div>
        </div>

        {/* Fix 1 — Seven dimensions */}
        <p className="text-[10px] font-semibold text-[#333] uppercase tracking-widest mb-4">
          Dimensional Breakdown
        </p>
        {Object.entries(breakdown ?? {})
          .sort(sortByScore ? ([, a], [, b]) => (b as DimensionScore).score - (a as DimensionScore).score : () => 0)
          .map(([key, dim]) => (
            <DimRow key={key} dimKey={key} dim={dim as DimensionScore} />
          ))}

        {/* Fix 2 — Dynamic gaps from API */}
        {gaps.length > 0 && (
          <div className="mt-4 pt-5 border-t border-white/[0.06]">
            <p className="text-[10px] font-semibold text-[#333] uppercase tracking-widest mb-3">
              Top Gaps
            </p>
            <ul className="space-y-1.5">
              {gaps.map((g, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] text-[#666]">
                  <span className="text-amber-500/50 flex-shrink-0 mt-0.5">△</span>{g}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Excluded factors */}
        {Object.keys(job.excludedFactors ?? {}).length > 0 && (
          <div className="mt-4 pt-5 border-t border-white/[0.06]">
            <p className="text-[10px] font-semibold text-[#333] uppercase tracking-widest mb-3">
              Deliberately Excluded
            </p>
            <div className="space-y-2">
              {Object.entries(job.excludedFactors).map(([key, reason]) => (
                <div key={key} className="bg-white/[0.02] border border-white/[0.05] rounded-lg px-3.5 py-2.5">
                  <p className="text-[10px] font-semibold text-[#444] capitalize mb-0.5">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </p>
                  <p className="text-[11px] text-[#3a3a3a] leading-relaxed">{reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
