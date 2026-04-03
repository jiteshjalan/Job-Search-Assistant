'use client';

import { useState, useRef, useEffect } from 'react';

function toTitleCase(s: string): string {
  return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function extractName(cv: string): string {
  const lines = cv.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 12)) {
    if (/^[A-Z][a-zA-Z'-]+(?:\s[A-Z][a-zA-Z'-]+){1,3}$/i.test(line) && line.length <= 50)
      return toTitleCase(line);
  }
  return '';
}

function extractHeadline(cv: string, name: string): string {
  const lines = cv.split('\n').map(l => l.trim()).filter(Boolean);
  let past = !name;
  for (const line of lines.slice(0, 20)) {
    if (!past && line === name) { past = true; continue; }
    if (past && line.length > 8 && line.length < 120 && !/^[+\d(]/.test(line) && !/@/.test(line))
      return line.slice(0, 80);
  }
  return '';
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

export default function ProfilePanel() {
  const [name,     setName]     = useState('');
  const [headline, setHeadline] = useState('');
  const [filename, setFilename] = useState('');
  const [editing,  setEditing]  = useState(false);
  const [upStatus, setUpStatus] = useState<'idle' | 'parsing' | 'done' | 'error'>('idle');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const cv  = localStorage.getItem('jsa_cv') ?? '';
    const raw = localStorage.getItem('jsa_user_name') || extractName(cv);
    const n   = raw ? toTitleCase(raw) : '';
    setName(n || 'You');
    setHeadline(extractHeadline(cv, n));
    setFilename(localStorage.getItem('jsa_cv_filename') ?? 'CV uploaded');
  }, []);

  const handleReUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUpStatus('parsing');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res  = await fetch('/api/parse-cv', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error();
      const n = extractName(data.text);
      localStorage.setItem('jsa_cv',          data.text);
      localStorage.setItem('jsa_cv_filename', file.name);
      if (n) localStorage.setItem('jsa_user_name', n);
      setName(n || name);
      setHeadline(extractHeadline(data.text, n || name));
      setFilename(file.name);
      setUpStatus('done');
    } catch { setUpStatus('error'); }
  };

  const handleReset = () => {
    if (!confirm('Reset profile? This clears your CV, case studies, and job universe.')) return;
    ['jsa_profile_complete','jsa_cv','jsa_cv_filename','jsa_user_name',
     'jsa_case_studies','jsa_job_universe','jsa_kanban','jsa_preferences']
      .forEach(k => localStorage.removeItem(k));
    window.location.href = '/';
  };

  return (
    <div className="px-4 pt-4 pb-3 border-b border-white/[0.06] flex-shrink-0">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold text-[#3a3a3a] uppercase tracking-widest">
          My Profile
        </span>
        <button
          onClick={() => { setEditing(e => !e); setUpStatus('idle'); }}
          className="text-[10px] text-[#444] hover:text-[#777] transition-colors cursor-pointer"
        >
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>

      {!editing ? (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/[0.15] flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-indigo-300">{initials(name)}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[#e0e0e0] leading-tight truncate">{name}</p>
            <p className="text-[11px] text-[#4a4a4a] truncate mt-0.5">{headline}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2 animate-fade-in">
          <div
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-white/[0.07] p-3 text-center cursor-pointer hover:border-white/[0.14] transition-colors"
          >
            <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleReUpload} />
            {upStatus === 'parsing' && <p className="text-[11px] text-[#666] animate-pulse">Parsing…</p>}
            {upStatus === 'done'    && <p className="text-[11px] text-green-400">Updated ✓</p>}
            {upStatus === 'error'   && <p className="text-[11px] text-red-400">Failed — retry</p>}
            {upStatus === 'idle'    && (
              <>
                <p className="text-[11px] text-[#666]">Re-upload CV</p>
                <p className="text-[10px] text-[#3a3a3a] mt-0.5 truncate">{filename}</p>
              </>
            )}
          </div>
          <button
            onClick={handleReset}
            className="w-full text-[10px] text-red-500/50 hover:text-red-400/80 transition-colors py-1 cursor-pointer"
          >
            Reset Profile
          </button>
        </div>
      )}
    </div>
  );
}
