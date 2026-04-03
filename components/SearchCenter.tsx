'use client';

import { useState, useRef, useEffect } from 'react';
import type { SearchState } from '@/app/dashboard/page';

interface Props {
  userName:     string;
  searchMode:   boolean;
  searchState:  SearchState;
  searchError:  string;
  uncachedCount: number | null;
  estimatedMins: number | null;
  onSearch: (query: string, filters: Record<string, string>) => void;
  onBack:   () => void;
}

const ROLE_OPTIONS     = ['EIR', 'Chief of Staff', 'Head of Growth', 'VP Strategy', 'Product Manager', 'Head of Product', 'GTM Lead'];
const LOCATION_OPTIONS = ['Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Remote', 'Hybrid'];
const STAGE_OPTIONS    = ['Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C', 'Growth'];
const INDUSTRY_OPTIONS = ['AI / ML', 'SaaS', 'Fintech', 'Edtech', 'Consumer', 'Deep Tech'];

// ─── Dropdown ───────────────────────────────────────────────────────────────

function Dropdown({ label, options, value, onChange }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer whitespace-nowrap ${
          value
            ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300'
            : 'border-white/[0.08] bg-white/[0.02] text-[#555] hover:text-[#888] hover:border-white/[0.14]'
        }`}
      >
        {value || label}
        <span className="text-[#3a3a3a] text-[9px]">▾</span>
      </button>

      {open && (
        <div className="absolute top-full mt-1.5 left-0 bg-[#1c1c1c] border border-white/[0.10] rounded-xl py-1.5 z-30 min-w-[140px] shadow-2xl shadow-black/60 animate-fade-in">
          {value && (
            <button
              onClick={() => { onChange(''); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-[11px] text-[#555] hover:text-[#888] hover:bg-white/[0.03] transition-colors cursor-pointer"
            >
              Clear
            </button>
          )}
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors cursor-pointer ${
                value === opt
                  ? 'text-indigo-300 bg-indigo-500/10'
                  : 'text-[#aaa] hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SearchCenter({
  userName, searchMode, searchState, searchError,
  uncachedCount, estimatedMins, onSearch, onBack,
}: Props) {
  const [query,   setQuery]   = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({
    roleType: '', location: '', stage: '', industry: '',
  });
  const inputRef = useRef<HTMLInputElement>(null);

  const setFilter = (k: string, v: string) =>
    setFilters(prev => ({ ...prev, [k]: v }));

  const submit = () => {
    if (searchState === 'fetching' || searchState === 'scoring') return;
    onSearch(query, filters);
  };

  const firstName = userName.split(' ')[0];
  const isLoading = searchState === 'fetching' || searchState === 'scoring';

  // ── Collapsed (searching) view ──────────────────────────────────────────
  if (searchMode) {
    return (
      <div className="flex flex-col h-full p-3 gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[11px] text-[#444] hover:text-[#777] transition-colors cursor-pointer"
        >
          ← Back
        </button>

        {/* Mini search */}
        <div className="flex gap-1.5">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            className="flex-1 min-w-0 bg-white/[0.03] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[11px] text-[#ddd] placeholder:text-[#333] focus:outline-none focus:border-indigo-500/40"
            placeholder="Search…"
          />
          <button
            onClick={submit}
            disabled={isLoading}
            className="px-2.5 py-1.5 bg-indigo-600/80 hover:bg-indigo-500 text-white rounded-lg text-[11px] transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-default"
          >
            ↵
          </button>
        </div>

        {/* Active filter pills */}
        <div className="flex flex-wrap gap-1">
          {Object.entries(filters).filter(([, v]) => v).map(([k, v]) => (
            <span key={k} className="text-[10px] bg-indigo-500/10 text-indigo-400 rounded-full px-2 py-0.5">
              {v}
            </span>
          ))}
        </div>

        {/* Status */}
        <div className="flex-1 flex flex-col justify-center items-center gap-2">
          {isLoading && (
            <>
              <div className="score-bar w-full mx-1">
                <div className="score-bar-fill bg-indigo-500" style={{ width: '100%', animation: 'indeterminate 1.8s ease-in-out infinite' }} />
              </div>
              <p className="text-[10px] text-[#444]">
                {searchState === 'fetching' ? 'Fetching jobs…' : 'Scoring…'}
              </p>
              {estimatedMins && <p className="text-[10px] text-[#333]">~{estimatedMins} min</p>}
            </>
          )}
          {searchState === 'done' && (
            <p className="text-[10px] text-[#444]">
              {uncachedCount === 0 ? '↯ From cache' : '✓ Done'}
            </p>
          )}
          {searchState === 'error' && (
            <p className="text-[10px] text-red-400/60 text-center px-2">{searchError}</p>
          )}
        </div>
      </div>
    );
  }

  // ── Expanded (default) view ─────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        {/* Date */}
        <p className="text-[11px] text-[#333] mb-7">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>

        {/* Greeting */}
        <h2 className="text-[22px] font-medium text-[#c0c0c0] mb-7 text-center leading-snug tracking-tight">
          Hey {firstName}, what are<br />we hunting for today?
        </h2>

        {/* Input */}
        <div className="w-full max-w-xs">
          <div className="flex gap-2 mb-3">
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-[#ddd] placeholder:text-[#2e2e2e] focus:outline-none focus:border-indigo-500/40 focus:bg-white/[0.05] transition-all"
              placeholder="EIR, Chief of Staff, Head of Growth…"
            />
            <button
              onClick={submit}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors cursor-pointer"
            >
              →
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-1.5">
            <Dropdown label="Role"     options={ROLE_OPTIONS}     value={filters.roleType}  onChange={v => setFilter('roleType',  v)} />
            <Dropdown label="Location" options={LOCATION_OPTIONS} value={filters.location}  onChange={v => setFilter('location',  v)} />
            <Dropdown label="Stage"    options={STAGE_OPTIONS}    value={filters.stage}     onChange={v => setFilter('stage',     v)} />
            <Dropdown label="Industry" options={INDUSTRY_OPTIONS} value={filters.industry}  onChange={v => setFilter('industry',  v)} />
          </div>
        </div>
      </div>

      {/* Hint */}
      <div className="pb-5 text-center">
        <p className="text-[10px] text-[#272727]">
          New results merge into your universe — nothing is overwritten
        </p>
      </div>
    </div>
  );
}
