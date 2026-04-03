'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { ScoredJob } from '@/app/api/score-jobs/route';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CVSection = {
  id: string;
  title: string;
  original: string;
  optimised: string;
};

type CVBuildResult = {
  gapSummary: string;
  caseStudy: { name: string; reason: string };
  sections: CVSection[];
  builtAt: string;
  fromCache: boolean;
};

type Phase = 'idle' | 'loading' | 'revealing' | 'done' | 'error';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  job: ScoredJob;
  onClose: () => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function AnimatedDots() {
  const [count, setCount] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setCount((c) => (c % 3) + 1), 400);
    return () => clearInterval(id);
  }, []);
  return <span>{'.'.repeat(count)}</span>;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/\*(.+?)\*/gs, '$1')
    .replace(/__(.+?)__/gs, '$1')
    .replace(/_(.+?)_/gs, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CVBuilder({ job, onClose }: Props) {
  const cvTextRef = useRef<string>('');

  const [phase,       setPhase]       = useState<Phase>('idle');
  const [result,      setResult]      = useState<CVBuildResult | null>(null);
  const [stageActive, setStageActive] = useState<1 | 2 | 3>(1);
  const [stageReveal, setStageReveal] = useState<0 | 1 | 2 | 3>(0);
  const [edits,       setEdits]       = useState<Record<string, string>>({});
  const [error,       setError]       = useState('');
  const [fullscreen,  setFullscreen]  = useState(false);

  // Read CV from localStorage once on mount
  useEffect(() => {
    cvTextRef.current = localStorage.getItem('jsa_cv') ?? '';
  }, []);

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  const buildCV = useCallback(
    async (force = false) => {
      setPhase('loading');
      setStageActive(1);
      setStageReveal(0);
      setError('');
      setResult(null);

      // Stage timer: 1→2 at 5s, 2→3 at 15s
      const t1 = setTimeout(() => setStageActive(2), 5000);
      const t2 = setTimeout(() => setStageActive(3), 15000);

      try {
        let caseStudies: { name: string; b64: string }[] = [];
        try {
          const stored = localStorage.getItem('jsa_case_studies');
          if (stored) caseStudies = JSON.parse(stored);
        } catch {}

        const res = await fetch('/api/build-cv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: job.id,
            jobTitle: job.title,
            company: job.company,
            jobDescription: job.description,
            cvText: cvTextRef.current,
            caseStudies,
            force,
          }),
        });

        clearTimeout(t1);
        clearTimeout(t2);

        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }

        const data = (await res.json()) as CVBuildResult;
        setResult(data);

        // Seed edits with markdown stripped
        const initialEdits: Record<string, string> = {};
        for (const s of data.sections ?? []) {
          initialEdits[s.id] = stripMarkdown(s.optimised);
        }
        setEdits(initialEdits);

        // Sequential reveal
        setPhase('revealing');
        setStageReveal(1);
        setTimeout(() => setStageReveal(2), 600);
        setTimeout(() => setStageReveal(3), 1200);
        setTimeout(() => setPhase('done'), 1800);
      } catch (err: unknown) {
        clearTimeout(t1);
        clearTimeout(t2);
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setPhase('error');
      }
    },
    [job]
  );

  // Auto-build on mount
  useEffect(() => {
    buildCV(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  function handleDownloadPDF() {
    const sections = result?.sections ?? [];
    const bodyHTML = sections
      .map(
        (s) => `
        <h2 style="font-size:16px;font-weight:600;margin:24px 0 6px;color:#111;">${s.title}</h2>
        <p style="white-space:pre-wrap;font-size:14px;line-height:1.6;color:#222;">${edits[s.id] ?? stripMarkdown(s.optimised)}</p>
      `
      )
      .join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>CV – ${job.title} at ${job.company}</title>
  <style>
    body { font-family: Georgia, serif; background: #fff; color: #111; margin: 48px; max-width: 720px; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .sub { font-size: 14px; color: #555; margin-bottom: 32px; }
    h2 { border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    @media print { body { margin: 24px; } }
  </style>
</head>
<body>
  <h1>${job.title}</h1>
  <p class="sub">${job.company}</p>
  ${bodyHTML}
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.print();
    }
  }

  // ---------------------------------------------------------------------------
  // Sub-renders
  // ---------------------------------------------------------------------------

  const stagesMeta = [
    { num: 1, label: 'Gap Analysis',     desc: 'Comparing CV to job description'    },
    { num: 2, label: 'Case Study Match', desc: 'Finding your best supporting story' },
    { num: 3, label: 'CV Optimisation',  desc: 'Rewriting sections with context'    },
  ] as const;

  function stageStatus(n: 1 | 2 | 3): 'pending' | 'active' | 'done' {
    if (stageReveal >= n) return 'done';
    if (phase === 'loading' || phase === 'revealing') {
      if (stageActive === n) return 'active';
      if (stageActive > n) return 'done';
    }
    return 'pending';
  }

  function renderStageResult(n: 1 | 2 | 3) {
    if (!result || stageReveal < n) return null;

    if (n === 1) {
      return (
        <div className="mt-2 ml-9 rounded-lg bg-white/[0.04] border border-white/[0.07] px-3 py-2 text-[13px] text-[#b0b0b0] leading-relaxed">
          {result.gapSummary}
        </div>
      );
    }
    if (n === 2) {
      return (
        <div className="mt-2 ml-9 rounded-lg bg-white/[0.04] border border-white/[0.07] px-3 py-2 text-[13px] text-[#b0b0b0] leading-relaxed">
          {result.caseStudy.name ? (
            <>
              <span className="text-indigo-400 font-medium">{result.caseStudy.name}</span>
              <span className="text-[#555]"> — </span>
              {result.caseStudy.reason}
            </>
          ) : (
            <span className="text-[#555]">{result.caseStudy.reason}</span>
          )}
        </div>
      );
    }
    if (n === 3) {
      return (
        <div className="mt-2 ml-9">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
            <span>✓</span> Optimisation ready
          </span>
        </div>
      );
    }
    return null;
  }

  function renderStageStepper() {
    return (
      <div className="flex-shrink-0 px-5 py-4 border-b border-white/[0.06] space-y-3">
        {stagesMeta.map(({ num, label, desc }) => {
          const status = stageStatus(num);
          return (
            <div key={num}>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {status === 'done' ? (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-[12px] font-bold">
                      ✓
                    </span>
                  ) : status === 'active' ? (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-indigo-500 animate-pulse text-indigo-400 text-[12px] font-bold">
                      {num}
                    </span>
                  ) : (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/[0.12] text-[#555] text-[12px] font-bold">
                      {num}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-[13px] font-medium ${
                      status === 'active'
                        ? 'text-indigo-300'
                        : status === 'done'
                        ? 'text-[#e0e0e0]'
                        : 'text-[#555]'
                    }`}
                  >
                    {label}
                    {status === 'active' && (
                      <span className="text-indigo-400 ml-1">
                        <AnimatedDots />
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#444] mt-0.5">{desc}</div>
                </div>
              </div>
              {renderStageResult(num)}
            </div>
          );
        })}
      </div>
    );
  }

  function renderDiffView() {
    if (!result || phase !== 'done') return null;
    const sections = result.sections ?? [];
    const rawCV = localStorage.getItem('jsa_cv') ?? cvTextRef.current;

    return (
      <div className="flex-1 min-h-0 flex">
        {/* Left: raw CV */}
        <div className="flex-1 flex flex-col min-h-0 border-r border-white/[0.06]">
          <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-white/[0.05] bg-[#141414]">
            <span className="text-[12px] font-medium text-[#888]">Original CV</span>
            <span className="text-[10px] text-[#444] bg-white/[0.04] border border-white/[0.08] px-1.5 py-0.5 rounded">
              read-only
            </span>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <p className="text-[12px] text-[#666] leading-relaxed whitespace-pre-wrap">
              {stripMarkdown(rawCV)}
            </p>
          </div>
        </div>

        {/* Right: optimised sections */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-white/[0.05] bg-[#141414]">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-medium text-indigo-400">Optimised</span>
              <span className="text-[10px] text-indigo-400/60 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded">
                editable
              </span>
            </div>
            <button
              onClick={() => setFullscreen(true)}
              title="Expand fullscreen"
              className="cursor-pointer text-[#555] hover:text-indigo-400 transition-colors text-[14px] leading-none"
              aria-label="Expand fullscreen"
            >
              ⤢
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {sections.map((section) => {
              const currentEdit = edits[section.id] ?? stripMarkdown(section.optimised);
              return (
                <div key={section.id} className="space-y-1">
                  <span className="text-[11px] font-semibold text-[#888] uppercase tracking-wider">
                    {section.title}
                  </span>
                  <textarea
                    value={currentEdit}
                    onChange={(e) =>
                      setEdits((prev) => ({ ...prev, [section.id]: e.target.value }))
                    }
                    className="rounded-lg bg-white/[0.025] border border-indigo-500/20 focus:border-indigo-500/40 focus:outline-none px-3 py-2.5 text-[12px] text-[#c0c0c0] leading-relaxed whitespace-pre-wrap resize-none w-full"
                    rows={Math.max(3, currentEdit.split('\n').length + 1)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  async function handleAcceptChanges() {
    if (result) {
      const fullText = (result.sections ?? [])
        .map((s) => `${s.title}\n${edits[s.id] ?? stripMarkdown(s.optimised)}`)
        .join('\n\n');
      try {
        await fetch('/api/send-email', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: job.id, optimisedCV: fullText }),
        });
      } catch {
        // Non-critical — still close
      }
    }
    onClose();
  }

  function renderBottomBar() {
    if (phase !== 'done') return null;
    return (
      <div className="flex-shrink-0 border-t border-white/[0.06] px-5 py-3 grid grid-cols-2 gap-2">
        <button
          onClick={handleAcceptChanges}
          className="cursor-pointer px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[13px] font-medium transition-colors"
        >
          Accept Changes
        </button>
        <button
          onClick={handleDownloadPDF}
          className="cursor-pointer px-3 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] text-[#c0c0c0] text-[13px] font-medium transition-colors border border-white/[0.08]"
        >
          Download PDF
        </button>
      </div>
    );
  }

  function renderFullscreenModal() {
    if (!fullscreen || !result) return null;
    const sections = result.sections ?? [];
    return (
      <div className="fixed inset-0 z-[70] flex flex-col bg-[#0f0f0f]">
        {/* Fullscreen header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
          <div>
            <p className="text-[13px] font-semibold text-indigo-400">Optimised CV — Fullscreen</p>
            <p className="text-[11px] text-[#555] mt-0.5">{job.title} · {job.company}</p>
          </div>
          <button
            onClick={() => setFullscreen(false)}
            className="cursor-pointer text-[#555] hover:text-[#aaa] transition-colors text-[18px] leading-none"
            aria-label="Close fullscreen"
          >
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          {sections.map((section) => {
            const currentEdit = edits[section.id] ?? stripMarkdown(section.optimised);
            return (
              <div key={section.id} className="space-y-2">
                <p className="text-[11px] font-semibold text-[#888] uppercase tracking-wider">
                  {section.title}
                </p>
                <textarea
                  value={currentEdit}
                  onChange={(e) =>
                    setEdits((prev) => ({ ...prev, [section.id]: e.target.value }))
                  }
                  className="rounded-lg bg-white/[0.025] border border-indigo-500/20 focus:border-indigo-500/40 focus:outline-none px-4 py-3 text-[13px] text-[#c0c0c0] leading-relaxed whitespace-pre-wrap resize-none w-full"
                  rows={Math.max(4, currentEdit.split('\n').length + 1)}
                />
              </div>
            );
          })}
        </div>

        {/* Fullscreen bottom bar */}
        <div className="flex-shrink-0 border-t border-white/[0.08] px-6 py-3 grid grid-cols-2 gap-3">
          <button
            onClick={handleAcceptChanges}
            className="cursor-pointer px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[13px] font-medium transition-colors"
          >
            Accept Changes
          </button>
          <button
            onClick={handleDownloadPDF}
            className="cursor-pointer px-4 py-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] text-[#c0c0c0] text-[13px] font-medium transition-colors border border-white/[0.08]"
          >
            Download PDF
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  if (phase === 'idle') return null;

  return (
    <>
    <div className="fixed inset-y-0 right-0 w-[680px] max-w-full z-50 flex flex-col bg-[#141414] border-l border-white/[0.08] shadow-2xl">
      {/* Header */}
      <div className="flex-shrink-0 flex items-start justify-between px-5 py-4 border-b border-white/[0.08]">
        <div className="flex-1 min-w-0 mr-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-medium text-[#e0e0e0] uppercase tracking-wide">
              Build CV
            </span>
            {result?.fromCache && (
              <span className="text-[10px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded-full">
                from cache
              </span>
            )}
            {phase === 'done' && (
              <button
                onClick={() => buildCV(true)}
                title="Rebuild (force refresh)"
                className="cursor-pointer text-[#555] hover:text-[#aaa] transition-colors text-[14px] ml-1"
              >
                ↺
              </button>
            )}
          </div>
          <div className="mt-0.5">
            <span className="text-[15px] font-semibold text-[#e0e0e0] truncate block">
              {job.title}
            </span>
            <span className="text-[12px] text-[#555]">{job.company}</span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="cursor-pointer flex-shrink-0 text-[#555] hover:text-[#aaa] transition-colors text-[18px] mt-0.5"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Stage stepper (loading / revealing / done) */}
      {(phase === 'loading' || phase === 'revealing' || phase === 'done') &&
        renderStageStepper()}

      {/* Diff view */}
      {renderDiffView()}

      {/* Error state */}
      {phase === 'error' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-4">
          <div className="text-[13px] text-red-400 text-center leading-relaxed bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 w-full">
            {error || 'Something went wrong.'}
          </div>
          <button
            onClick={() => buildCV(false)}
            className="cursor-pointer px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading spinner (when no stepper content yet to show) */}
      {phase === 'loading' && stageReveal === 0 && result === null && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-[13px] text-[#555] animate-pulse">
            Analysing…
          </div>
        </div>
      )}

      {/* Bottom action bar */}
      {renderBottomBar()}
    </div>

    {/* Fullscreen modal */}
    {renderFullscreenModal()}
    </>
  );
}
