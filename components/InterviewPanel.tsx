'use client';

import { useState } from 'react';
import type { ScoredJob } from '@/app/api/score-jobs/route';
import type { InterviewQuestion } from '@/app/api/interview-prep/route';

interface Props { job: ScoredJob; onClose: () => void }

const TYPE_STYLE: Record<string, string> = {
  behavioural: 'bg-indigo-500/10 text-indigo-400',
  situational:  'bg-violet-500/10 text-violet-400',
  technical:    'bg-blue-500/10  text-blue-400',
  strategic:    'bg-cyan-500/10  text-cyan-400',
};

const STAR_STEPS = [
  { key: 'situation', label: 'S — Situation', bar: '#6366f1' },
  { key: 'task',      label: 'T — Task',      bar: '#8b5cf6' },
  { key: 'action',    label: 'A — Action',    bar: '#3b82f6' },
  { key: 'result',    label: 'R — Result',    bar: '#22c55e' },
] as const;

export default function InterviewPanel({ job, onClose }: Props) {
  const [questions,   setQuestions]   = useState<InterviewQuestion[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const generate = async () => {
    setLoading(true);
    setError('');
    const cvText = localStorage.getItem('jsa_cv') ?? '';
    try {
      const res  = await fetch('/api/interview-prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: job.title, company: job.company,
          jobDescription: job.description, cvText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setQuestions(data.questions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate questions');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel-slide">
      {/* Header */}
      <div className="sticky top-0 bg-[#141414] border-b border-white/[0.08] px-5 py-4 flex items-center justify-between z-10">
        <div>
          <p className="text-sm font-semibold text-[#e0e0e0]">Interview Prep</p>
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
        {/* CTA state */}
        {questions.length === 0 && !loading && (
          <div className="text-center py-12">
            <p className="text-sm text-[#555] mb-1">
              Gemma generates 9 likely interview questions with STAR angles based on your CV.
            </p>
            <p className="text-[11px] text-[#3a3a3a] mb-6">Tailored to this role and company.</p>
            <button
              onClick={generate}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl cursor-pointer transition-colors"
            >
              Generate Interview Prep
            </button>
            {error && <p className="text-red-400/80 text-xs mt-3">{error}</p>}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-12">
            <div className="score-bar max-w-xs mx-auto mb-3">
              <div className="score-bar-fill bg-indigo-500" style={{ width: '100%', animation: 'indeterminate 2s ease-in-out infinite' }} />
            </div>
            <p className="text-sm text-[#555]">Generating STAR-method questions…</p>
          </div>
        )}

        {/* Questions */}
        {questions.length > 0 && (
          <div className="space-y-2 animate-fade-in">
            <p className="text-[11px] text-[#3a3a3a] mb-4">
              Click a question to expand the STAR framework hints.
            </p>
            {questions.map((q, idx) => (
              <div
                key={idx}
                className="border border-white/[0.07] rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                  className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-white/[0.03] cursor-pointer transition-colors"
                >
                  <span className="text-[#333] font-mono text-xs mt-0.5 min-w-[18px]">{idx + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${TYPE_STYLE[q.type] ?? 'bg-white/[0.06] text-[#666]'}`}>
                        {q.type}
                      </span>
                    </div>
                    <p className="text-sm text-[#d0d0d0] font-medium leading-snug">{q.question}</p>
                    <p className="text-[11px] text-[#444] mt-1 italic">Anchor: {q.starAngle}</p>
                  </div>
                  <span className="text-[#333] text-xs ml-2 flex-shrink-0 mt-0.5">
                    {expandedIdx === idx ? '▲' : '▼'}
                  </span>
                </button>

                {expandedIdx === idx && (
                  <div className="border-t border-white/[0.06] px-4 py-4 bg-white/[0.02]">
                    <p className="text-[10px] font-semibold text-[#333] uppercase tracking-widest mb-3">
                      STAR Framework
                    </p>
                    <div className="space-y-3">
                      {STAR_STEPS.map(({ key, label, bar }) => (
                        <div key={key} className="flex gap-3">
                          <div className="w-0.5 rounded-full flex-shrink-0 mt-0.5" style={{ background: bar + '60' }} />
                          <div>
                            <p className="text-[10px] font-semibold text-[#555] mb-0.5">{label}</p>
                            <p className="text-[11px] text-[#444] leading-relaxed">
                              {q.starHints[key]}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
