'use client';

import type { ScoredJob, DimensionScore } from '@/app/api/score-jobs/route';

interface Props { job: ScoredJob; onClose: () => void }

const DIM_CFG: Record<string, { label: string; bar: string }> = {
  roleProfileFit:        { label: 'Role & Profile Fit',          bar: '#6366f1' },
  companyStageTrajectory:{ label: 'Company Stage & Trajectory',  bar: '#8b5cf6' },
  networkProximity:      { label: 'Network Proximity',           bar: '#3b82f6' },
  outreachROI:           { label: 'Outreach ROI',                bar: '#06b6d4' },
};

function DimRow({ dimKey, dim }: { dimKey: string; dim: DimensionScore }) {
  const cfg = DIM_CFG[dimKey] ?? { label: dimKey, bar: '#6366f1' };
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-[#aaa]">{cfg.label}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#444]">w {Math.round(dim.weight * 100)}%</span>
          <span className="text-sm font-bold text-[#e0e0e0]">{dim.score}</span>
        </div>
      </div>
      <div className="score-bar mb-2">
        <div className="score-bar-fill" style={{ width: `${dim.score}%`, background: cfg.bar }} />
      </div>
      <p className="text-[11px] text-[#555] mb-2 leading-relaxed">{dim.rationale}</p>
      {dim.improvements.length > 0 && (
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

export default function ScorePanel({ job, onClose }: Props) {
  const scoreCol =
    job.compositeScore >= 75 ? '#22c55e' :
    job.compositeScore >= 55 ? '#f59e0b' :
    '#ef4444';

  return (
    <div className="panel-slide">
      {/* Header */}
      <div className="sticky top-0 bg-[#141414] border-b border-white/[0.08] px-5 py-4 flex items-center justify-between z-10">
        <div>
          <p className="text-sm font-semibold text-[#e0e0e0]">Why This Score</p>
          <p className="text-[11px] text-[#555] mt-0.5">{job.title} · {job.company}</p>
        </div>
        <button
          onClick={onClose}
          className="text-[#444] hover:text-[#888] text-lg leading-none cursor-pointer transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="px-5 py-5">
        {/* Composite score */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 mb-6 text-center">
          <div className="text-5xl font-bold mb-1" style={{ color: scoreCol }}>
            {job.compositeScore}
          </div>
          <div className="text-xs text-[#444]">composite score / 100</div>
        </div>

        {/* Dimensions */}
        <p className="text-[10px] font-semibold text-[#333] uppercase tracking-widest mb-4">
          Dimensional Breakdown
        </p>
        {Object.entries(job.dimensions).map(([key, dim]) => (
          <DimRow key={key} dimKey={key} dim={dim} />
        ))}

        {/* Excluded factors */}
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
      </div>
    </div>
  );
}
