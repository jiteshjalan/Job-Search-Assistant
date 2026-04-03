'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface CaseStudy { name: string; text: string }

function extractName(cvText: string): string {
  const lines = cvText.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 12)) {
    if (/^[A-Z][a-zA-Z'-]+(?:\s[A-Z][a-zA-Z'-]+){1,3}$/.test(line) && line.length <= 50) {
      return line;
    }
  }
  return '';
}

export default function SetupPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  const [cvText, setCvText]       = useState('');
  const [cvFilename, setCvFilename] = useState('');
  const [cvStatus, setCvStatus]   = useState<'idle' | 'parsing' | 'done' | 'error'>('idle');

  const [caseStudies, setCaseStudies] = useState<CaseStudy[]>([]);
  const [csUploading, setCsUploading] = useState(false);

  const cvRef = useRef<HTMLInputElement>(null);
  const csRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (localStorage.getItem('jsa_profile_complete')) {
      router.replace('/dashboard');
    } else {
      setChecked(true);
    }
  }, [router]);

  const handleCvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCvStatus('parsing');
    setCvFilename(file.name);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res  = await fetch('/api/parse-cv', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCvText(data.text);
      setCvStatus('done');
    } catch {
      setCvStatus('error');
    }
  };

  const handleCsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 15 - caseStudies.length);
    if (!files.length) return;
    setCsUploading(true);
    const results: CaseStudy[] = [];
    for (const file of files) {
      const fd = new FormData();
      fd.append('file', file);
      try {
        const res  = await fetch('/api/parse-cv', { method: 'POST', body: fd });
        const data = await res.json();
        if (res.ok) results.push({ name: file.name, text: data.text });
      } catch { /* skip */ }
    }
    setCaseStudies(prev => [...prev, ...results]);
    setCsUploading(false);
    if (csRef.current) csRef.current.value = '';
  };

  const handleComplete = () => {
    const name = extractName(cvText);
    localStorage.setItem('jsa_cv',              cvText);
    localStorage.setItem('jsa_cv_filename',     cvFilename);
    localStorage.setItem('jsa_user_name',       name || 'you');
    localStorage.setItem('jsa_case_studies',    JSON.stringify(caseStudies));
    localStorage.setItem('jsa_profile_complete','true');
    router.push('/dashboard');
  };

  if (!checked) return null;

  return (
    <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center p-6">
      <div className="w-full max-w-md animate-slide-up">

        {/* Logo mark */}
        <div className="flex items-center gap-2.5 mb-10">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center">
            <div className="w-3.5 h-3.5 rounded bg-indigo-400" />
          </div>
          <span className="text-sm font-semibold text-[#666] tracking-tight">Job Search Assistant</span>
        </div>

        {/* Step heading */}
        <h1 className="text-2xl font-semibold text-[#f0f0f0] tracking-tight mb-1.5">
          {step === 1 ? 'Upload your CV' : 'Add case studies'}
        </h1>
        <p className="text-sm text-[#555] mb-8">
          {step === 1
            ? 'Required. Used to score roles, draft outreach, and personalise interview prep.'
            : 'Optional. Up to 15 PDFs — work samples, portfolios, or project write-ups.'}
        </p>

        {/* Step dots */}
        <div className="flex gap-1.5 mb-8">
          <div className="h-[3px] w-8 rounded-full bg-indigo-500" />
          <div className={`h-[3px] w-8 rounded-full transition-colors ${step === 2 ? 'bg-indigo-500' : 'bg-white/[0.08]'}`} />
        </div>

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Drop zone */}
            <div
              onClick={() => cvStatus !== 'parsing' && cvRef.current?.click()}
              className={`relative rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-all ${
                cvStatus === 'done'
                  ? 'border-green-500/30 bg-green-500/[0.04]'
                  : cvStatus === 'error'
                  ? 'border-red-500/30 bg-red-500/[0.04]'
                  : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.04]'
              }`}
            >
              <input ref={cvRef} type="file" accept=".pdf" className="hidden" onChange={handleCvUpload} />

              {cvStatus === 'parsing' && (
                <div className="space-y-2">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.05] mx-auto flex items-center justify-center">
                    <span className="animate-spin text-[#888]">⟳</span>
                  </div>
                  <p className="text-sm text-[#666]">Parsing PDF…</p>
                </div>
              )}
              {cvStatus === 'done' && (
                <div className="space-y-2">
                  <div className="w-8 h-8 rounded-lg bg-green-500/10 mx-auto flex items-center justify-center">
                    <span className="text-green-400 text-sm font-bold">✓</span>
                  </div>
                  <p className="text-sm font-medium text-green-400 truncate px-4">{cvFilename}</p>
                  <p className="text-xs text-[#555]">Click to replace</p>
                </div>
              )}
              {cvStatus === 'error' && (
                <div className="space-y-2">
                  <p className="text-sm text-red-400">Parse failed — try a different file</p>
                  <p className="text-xs text-[#555]">Click to retry</p>
                </div>
              )}
              {cvStatus === 'idle' && (
                <div className="space-y-2">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.05] mx-auto flex items-center justify-center">
                    <span className="text-[#444] text-lg">↑</span>
                  </div>
                  <p className="text-sm font-medium text-[#bbb]">Click to upload PDF</p>
                  <p className="text-xs text-[#444]">Your CV in PDF format</p>
                </div>
              )}
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={cvStatus !== 'done'}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
            >
              Continue →
            </button>
          </div>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Add files zone */}
            {caseStudies.length < 15 && (
              <div
                onClick={() => !csUploading && csRef.current?.click()}
                className="rounded-xl border border-dashed border-white/[0.08] p-6 text-center cursor-pointer hover:border-white/[0.16] hover:bg-white/[0.02] transition-all"
              >
                <input
                  ref={csRef}
                  type="file"
                  accept=".pdf"
                  multiple
                  className="hidden"
                  onChange={handleCsUpload}
                />
                {csUploading ? (
                  <p className="text-sm text-[#666] animate-pulse">Uploading…</p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-[#bbb]">Add PDFs</p>
                    <p className="text-xs text-[#444] mt-1">
                      {15 - caseStudies.length} of 15 slots remaining
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Uploaded file chips */}
            {caseStudies.length > 0 && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {caseStudies.map((cs, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 bg-white/[0.03] border border-white/[0.07] rounded-lg px-3 py-2"
                  >
                    <span className="text-[#444] text-xs flex-shrink-0">📄</span>
                    <span className="text-xs text-[#bbb] flex-1 truncate">{cs.name}</span>
                    <button
                      onClick={() => setCaseStudies(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-[#444] hover:text-red-400 transition-colors text-base leading-none cursor-pointer flex-shrink-0"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2.5 pt-1">
              <button
                onClick={handleComplete}
                className="flex-1 py-2.5 bg-white/[0.05] hover:bg-white/[0.08] text-[#888] text-sm font-medium rounded-xl transition-colors cursor-pointer"
              >
                Skip
              </button>
              <button
                onClick={handleComplete}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors cursor-pointer"
              >
                Start Hunting →
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
