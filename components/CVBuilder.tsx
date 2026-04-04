'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
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
// Word-level diff (LCS-based)
// ---------------------------------------------------------------------------

// Split CV text into a header block (name / contact details) and the body.
// The header is defined as everything ABOVE the first section heading line —
// an all-caps line such as SUMMARY, PROFESSIONAL EXPERIENCE, EDUCATION, etc.
// The header is excluded from the diff so name/contact words are never flagged
// as deleted text.
const SECTION_HEADING_RE = /^[A-Z][A-Z\s&\/\-]{2,}$/;

function splitHeader(text: string): { header: string; body: string } {
  const lines = text.split('\n');
  const firstHeading = lines.findIndex(
    (l) => SECTION_HEADING_RE.test(l.trim()) && l.trim().length >= 3,
  );
  if (firstHeading > 0) {
    return {
      header: lines.slice(0, firstHeading).join('\n').trimEnd(),
      body:   lines.slice(firstHeading).join('\n'),
    };
  }
  // Fallback: split at first blank line
  const blankIdx = text.indexOf('\n\n');
  if (blankIdx !== -1) return { header: text.slice(0, blankIdx), body: text.slice(blankIdx + 2) };
  return { header: '', body: text };
}

// Words in the CV header that should become clickable links in the fullscreen view.
const HEADER_LABEL_LINKS: Record<string, string> = {
  LinkedIn:  'https://www.linkedin.com/in/jitesh-jalan/',
  Portfolio: 'https://www.notion.so/Jitesh-Jalan-Product-Growth-317fb6b69748801c9ea6fbc70e574fe6',
};

// Render plain text turning URLs and known label words into clickable anchors.
function renderPlainWithLinks(text: string): React.ReactNode[] {
  const labelPattern = Object.keys(HEADER_LABEL_LINKS).join('|');
  const combinedRe = new RegExp(`https?:\\/\\/\\S+|www\\.\\S+|\\b(${labelPattern})\\b`, 'g');
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let idx = 0;
  let match: RegExpExecArray | null;
  while ((match = combinedRe.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(<span key={idx++} style={{ whiteSpace: 'pre' }}>{text.slice(last, match.index)}</span>);
    }
    const token = match[0];
    const href  = HEADER_LABEL_LINKS[token]
      ?? (token.startsWith('www.') ? `https://${token}` : token);
    nodes.push(<a key={idx++} href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8', textDecoration: 'underline' }}>{token}</a>);
    last = match.index + token.length;
  }
  if (last < text.length) {
    nodes.push(<span key={idx++} style={{ whiteSpace: 'pre' }}>{text.slice(last)}</span>);
  }
  return nodes;
}

type WordToken = { text: string; isWord: boolean; marked: boolean };

function computeWordDiff(
  origText: string,
  optText: string,
): { origTokens: WordToken[]; optTokens: WordToken[] } {
  const tokenize = (s: string): { text: string; isWord: boolean }[] =>
    s.split(/(\s+)/).filter((p) => p.length > 0).map((p) => ({ text: p, isWord: /\S/.test(p) }));

  const origParts = tokenize(origText);
  const optParts  = tokenize(optText);
  const origWords = origParts.filter((t) => t.isWord).map((t) => t.text);
  const optWords  = optParts.filter((t) => t.isWord).map((t) => t.text);
  const m = origWords.length;
  const n = optWords.length;

  // LCS DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        origWords[i - 1] === optWords[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack
  const origInLCS = new Array(m).fill(false);
  const optInLCS  = new Array(n).fill(false);
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (origWords[i - 1] === optWords[j - 1]) {
      origInLCS[i - 1] = true;
      optInLCS[j - 1]  = true;
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  // Annotate
  let wi = 0;
  const origTokens: WordToken[] = origParts.map((t) => {
    if (!t.isWord) return { ...t, marked: false };
    return { ...t, marked: !origInLCS[wi++] };
  });

  wi = 0;
  const optTokens: WordToken[] = optParts.map((t) => {
    if (!t.isWord) return { ...t, marked: false };
    return { ...t, marked: !optInLCS[wi++] };
  });

  return { origTokens, optTokens };
}

function renderDiffTokens(tokens: WordToken[], side: 'orig' | 'opt'): React.ReactNode[] {
  return tokens.map((t, idx) => {
    if (!t.isWord) {
      return <span key={idx} style={{ whiteSpace: 'pre' }}>{t.text}</span>;
    }
    // URLs stay clickable regardless of diff status
    if (/^https?:\/\/\S+|^www\.\S+/i.test(t.text)) {
      const href = t.text.startsWith('www.') ? `https://${t.text}` : t.text;
      return <a key={idx} href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8', textDecoration: 'underline' }}>{t.text}</a>;
    }
    if (t.marked && side === 'orig') {
      return (
        <span
          key={idx}
          style={{
            background: 'rgba(200, 60, 60, 0.13)',
            textDecoration: 'line-through',
            textDecorationColor: 'rgba(200, 60, 60, 0.45)',
            color: '#906060',
          }}
        >
          {t.text}
        </span>
      );
    }
    if (t.marked && side === 'opt') {
      return (
        <span
          key={idx}
          style={{
            background: 'rgba(190, 155, 35, 0.17)',
            borderRadius: '2px',
          }}
        >
          {t.text}
        </span>
      );
    }
    return <span key={idx}>{t.text}</span>;
  });
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

  const PDF_LINK_MAP: Record<string, string> = {
    LinkedIn:  'https://www.linkedin.com/in/jitesh-jalan/',
    Portfolio: 'https://www.notion.so/Jitesh-Jalan-Product-Growth-317fb6b69748801c9ea6fbc70e574fe6',
    Uniqode:   'https://www.uniqode.com/',
  };

  function injectPdfLinks(text: string): string {
    return Object.entries(PDF_LINK_MAP).reduce(
      (t, [word, href]) =>
        t.replace(
          new RegExp(`\\b${word}\\b`, 'g'),
          `<a href="${href}" target="_blank" style="color:#1a0dab;">${word}</a>`,
        ),
      text,
    );
  }

  function handleDownloadPDF() {
    const sections = result?.sections ?? [];

    // HTML-escape raw text before injecting any markup
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Date pattern used in company / role line detection
    const DATE_PAT =
      '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|' +
      'January|February|March|April|May|June|July|August|September|October|November|December' +
      ')\\s+\\d{4}|Present|Current';
    const COMPANY_RE = new RegExp(
      `^(.+?)\\s*\\|\\s*(${DATE_PAT})\\s*[–\\-]\\s*(${DATE_PAT})\\s*$`,
    );
    const ROLE_RE = new RegExp(
      `^(.+?)\\s+(${DATE_PAT})\\s*[–\\-]\\s*(${DATE_PAT})\\s*$`,
    );

    function formatLines(text: string): string {
      return text
        .split('\n')
        .map((rawLine) => {
          const line = rawLine.trim();
          if (!line) return '<div style="height:5px;"></div>';

          // Bullet point
          if (/^[•\-\*]/.test(line)) {
            const content = line.replace(/^[•\-\*]\s*/, '');
            const bm = content.match(/^([^:]{1,50}):\s*([\s\S]*)$/);
            const inner = bm
              ? `<strong>${esc(bm[1])}:</strong> ${injectPdfLinks(esc(bm[2]))}`
              : injectPdfLinks(esc(content));
            return (
              `<div style="display:flex;padding-left:16px;margin:2px 0;` +
              `font-size:13px;line-height:1.6;">` +
              `<span style="flex-shrink:0;margin-right:6px;">•</span>` +
              `<span>${inner}</span></div>`
            );
          }

          // Company line: "Name | Month YYYY – Month YYYY"
          const cm = COMPANY_RE.exec(line);
          if (cm) {
            return (
              `<div style="display:flex;justify-content:space-between;` +
              `align-items:baseline;margin-top:12px;font-size:13px;line-height:1.5;">` +
              `<strong>${injectPdfLinks(esc(cm[1].trim()))}</strong>` +
              `<span style="font-size:12px;color:#333;white-space:nowrap;margin-left:12px;">` +
              `${esc(cm[2])} – ${esc(cm[3])}</span></div>`
            );
          }

          // Role / title line: "Title Month YYYY – Month YYYY"
          const rm = ROLE_RE.exec(line);
          if (rm) {
            return (
              `<div style="display:flex;justify-content:space-between;` +
              `align-items:baseline;font-size:13px;line-height:1.5;margin-bottom:5px;">` +
              `<span>${esc(rm[1].trim())}</span>` +
              `<span style="font-size:12px;color:#333;white-space:nowrap;margin-left:12px;">` +
              `${esc(rm[2])} – ${esc(rm[3])}</span></div>`
            );
          }

          // Label: value line (Skills category, Education field, etc.)
          const lm = line.match(/^([A-Za-z][^:]{1,40}):\s+(.+)$/);
          if (lm) {
            return (
              `<div style="font-size:13px;line-height:1.6;margin:2px 0;">` +
              `<strong>${esc(lm[1])}:</strong> ${injectPdfLinks(esc(lm[2]))}</div>`
            );
          }

          // Plain line
          return (
            `<div style="font-size:13px;line-height:1.6;margin:2px 0;">` +
            `${injectPdfLinks(esc(line))}</div>`
          );
        })
        .join('');
    }

    const bodyHTML = sections
      .map((s) => {
        const text = edits[s.id] ?? stripMarkdown(s.optimised);

        // Header section — verbatim three-line block, no section label
        if (s.id === 'header' || s.title === '') {
          const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
          const nameLine    = lines[0] ?? '';
          const titleLine   = lines[1] ?? '';
          const contactLine = lines[2] ?? '';
          return (
            `<div style="margin-bottom:28px;">` +
            `<div style="font-size:18px;font-weight:700;text-transform:uppercase;` +
            `letter-spacing:0.5px;line-height:1.3;">${esc(nameLine)}</div>` +
            `<div style="font-size:13px;font-weight:400;margin-top:3px;"> ${esc(titleLine)}</div>` +
            `<div style="font-size:12px;margin-top:3px;">${injectPdfLinks(esc(contactLine))}</div>` +
            `</div>`
          );
        }

        // Regular section: bold uppercase heading + full-width rule
        return (
          `<div style="margin-top:20px;">` +
          `<div style="font-size:13px;font-weight:700;text-transform:uppercase;` +
          `letter-spacing:0.5px;border-bottom:1.5px solid #222;` +
          `padding-bottom:3px;margin-bottom:8px;">${esc(s.title)}</div>` +
          `${formatLines(text)}` +
          `</div>`
        );
      })
      .join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>CV – ${job.title} at ${job.company}</title>
  <style>
    @page { margin: 48px; }
    body { font-family: Arial, Helvetica, sans-serif; background: #fff; color: #111;
           margin: 0; padding: 0; max-width: 680px; }
    * { box-sizing: border-box; }
    a { color: #1a0dab; }
  </style>
</head>
<body>
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
      <div className="flex-shrink-0 overflow-y-auto max-h-[220px] px-5 py-4 border-b border-white/[0.06] space-y-3">
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

    const rawCV = stripMarkdown(cvTextRef.current || localStorage.getItem('jsa_cv') || '');
    const optimisedText = sections
      .map((s) => `${s.title}\n${edits[s.id] ?? stripMarkdown(s.optimised)}`)
      .join('\n\n');

    // Peel off the header block (name / contact lines) so it is excluded from
    // the LCS diff and never incorrectly flagged as deleted text.
    const { header: cvHeader, body: cvBody } = splitHeader(rawCV);
    const { origTokens, optTokens } = computeWordDiff(cvBody, optimisedText);

    return (
      <div className="fixed inset-0 z-[10000] flex flex-col bg-[#0f0f0f]">
        {/* Fullscreen header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
          <div>
            <p className="text-[13px] font-semibold text-indigo-400">CV Comparison — Fullscreen</p>
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

        {/* Side-by-side panels */}
        <div className="flex-1 min-h-0 flex">
          {/* Left: Original */}
          <div className="w-1/2 flex flex-col border-r border-white/[0.08]">
            <div className="flex-shrink-0 px-6 py-2.5 border-b border-white/[0.06] bg-[#0f0f0f]">
              <span className="text-[11px] font-semibold text-[#555] uppercase tracking-widest">
                Original
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <p className="text-[12px] text-[#777] leading-relaxed" style={{ fontFamily: 'inherit' }}>
                {/* Header block rendered as plain text — no diff highlighting */}
                {cvHeader && <span style={{ whiteSpace: 'pre-wrap' }}>{renderPlainWithLinks(cvHeader)}{'\n\n'}</span>}
                {renderDiffTokens(origTokens, 'orig')}
              </p>
            </div>
          </div>

          {/* Right: Optimised */}
          <div className="w-1/2 flex flex-col">
            <div className="flex-shrink-0 px-6 py-2.5 border-b border-white/[0.06] bg-[#0f0f0f]">
              <span className="text-[11px] font-semibold text-indigo-400/70 uppercase tracking-widest">
                Optimised
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <p className="text-[12px] text-[#c0c0c0] leading-relaxed" style={{ fontFamily: 'inherit' }}>
                {/* Same header shown unchanged on both sides */}
                {cvHeader && <span style={{ whiteSpace: 'pre-wrap' }}>{renderPlainWithLinks(cvHeader)}{'\n\n'}</span>}
                {renderDiffTokens(optTokens, 'opt')}
              </p>
            </div>
          </div>
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

  const drawerContent = (
    <>
    {/* Dark backdrop */}
    <div className="fixed inset-0 z-[9998] bg-black/80" />
    <div className="fixed inset-y-0 right-0 w-[680px] max-w-full z-[9999] flex flex-col bg-[#141414] border-l border-white/[0.08] shadow-2xl">
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

      {/* Middle: stepper + CV panels — bounded, fills all space between header and footer */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Stage stepper — capped height so it never crowds the panels */}
        {(phase === 'loading' || phase === 'revealing' || phase === 'done') &&
          renderStageStepper()}

        {/* CV diff panels — fills remaining height, panels scroll internally */}
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
      </div>

      {/* Bottom action bar — always pinned to foot of drawer */}
      {renderBottomBar()}
    </div>

    {/* Fullscreen modal */}
    {renderFullscreenModal()}
    </>
  );

  return ReactDOM.createPortal(drawerContent, document.body);
}
