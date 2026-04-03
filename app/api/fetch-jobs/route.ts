import { NextRequest, NextResponse } from 'next/server';
import { getCachedQuery, setCachedQuery } from '@/lib/jobs-cache';

// Re-export RawJob so existing imports from this path keep working
export type { RawJob } from '@/lib/types';
import type { RawJob } from '@/lib/types';

// ─── Query extraction ─────────────────────────────────────────────────────────
// Google Jobs needs short, focused job-title keywords — NOT a preference sentence.
// This function reads the free-text preferences and produces 1–3 clean search queries.

function extractSearchQueries(preferences: string): string[] {
  const text = preferences.toLowerCase();
  const queries: string[] = [];

  // Detect sector modifiers to append
  const isAI    = /\bai\b|artificial intelligence|\bml\b|machine learning/.test(text);
  const isSaaS  = /\bsaas\b|software.as.a.service/.test(text);
  const isStartup = /startup|series [abcde]|early.stage|growth.stage|venture/.test(text);
  const sector  = isAI ? 'AI' : isSaaS ? 'SaaS' : isStartup ? 'startup' : '';

  // EIR
  if (/\beir\b|entrepreneur.in.residence/.test(text)) {
    queries.push(['Entrepreneur in Residence', sector].filter(Boolean).join(' '));
  }
  // Chief of Staff / Founder's office
  if (/chief.of.staff/.test(text)) {
    queries.push(['Chief of Staff', sector || 'startup'].filter(Boolean).join(' '));
  }
  if (/founder.?s?.office|founder.office/.test(text)) {
    queries.push(['Founder office', isSaaS ? 'SaaS' : 'startup'].filter(Boolean).join(' '));
  }
  // Strategy / Operating roles
  if (/\bstrategy\b|\bstrategic\b|operating partner|vp strategy/.test(text)) {
    queries.push(['Strategy', sector || 'startup'].filter(Boolean).join(' '));
  }
  // Product
  if (/head of product|vp product|product manager|\bpm\b|product lead/.test(text)) {
    queries.push(['Head of Product', sector].filter(Boolean).join(' '));
  }
  // GTM / Growth / Marketing
  if (/\bgtm\b|go.to.market|\bgrowth\b|vp marketing|head of growth/.test(text)) {
    queries.push(['GTM', sector || 'startup'].filter(Boolean).join(' '));
  }
  // Sales / Revenue
  if (/\bsales\b|\brevenue\b|vp sales|commercial/.test(text)) {
    queries.push(['VP Sales', sector].filter(Boolean).join(' '));
  }
  // Engineering / CTO
  if (/\bcto\b|head of engineering|vp engineering/.test(text)) {
    queries.push(['CTO', sector || 'startup'].filter(Boolean).join(' '));
  }

  // Fallback: nothing matched — take first 3 meaningful words from preferences
  if (queries.length === 0) {
    const fallback = preferences.trim().split(/\s+/).slice(0, 5).join(' ');
    queries.push(fallback);
  }

  // Return max 3 unique queries
  return [...new Set(queries)].slice(0, 3);
}

// ─── Deduplication ────────────────────────────────────────────────────────────

function deduplicateJobs(jobs: RawJob[]): RawJob[] {
  const seen = new Set<string>();
  return jobs.filter(job => {
    const key = `${job.title.toLowerCase().trim()}||${job.company.toLowerCase().trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── SerpApi (primary) ───────────────────────────────────────────────────────

async function fetchSerpApiJobs(query: string): Promise<RawJob[]> {
  const key = process.env.SERPAPI_KEY;
  if (!key) {
    console.warn('[fetch-jobs] SERPAPI_KEY not set — skipping SerpApi');
    return [];
  }

  const params = new URLSearchParams({
    engine: 'google_jobs',
    q: query,
    gl: 'in',
    location: 'Bangalore Karnataka India',
    hl: 'en',
    api_key: key,
  });

  try {
    const res = await fetch(`https://serpapi.com/search?${params.toString()}`);
    if (!res.ok) {
      console.error('[fetch-jobs] SerpApi error:', res.status);
      return [];
    }
    const data = await res.json();
    const results = data.jobs_results ?? [];
    if (results.length === 0) return [];

    return results.slice(0, 10).map(
      (j: {
        job_id?: string;
        title?: string;
        company_name?: string;
        location?: string;
        description?: string;
        share_link?: string;
        detected_extensions?: { posted_at?: string };
      }, idx: number) => ({
        id: j.job_id ?? `serp-${query.slice(0, 8)}-${idx}`,
        title: j.title ?? '',
        company: j.company_name ?? '',
        location: j.location ?? '',
        description: j.description ?? '',
        url: j.share_link ?? '',
        source: 'serpapi' as const,
        postedAt: j.detected_extensions?.posted_at,
      })
    );
  } catch (err) {
    console.error('[fetch-jobs] SerpApi fetch threw:', err);
    return [];
  }
}

// ─── Serper (fallback per-query) ──────────────────────────────────────────────

async function fetchSerperJobs(query: string): Promise<RawJob[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) {
    console.warn('[fetch-jobs] SERPER_API_KEY not set — skipping Serper fallback');
    return [];
  }

  try {
    const res = await fetch('https://google.serper.dev/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
      body: JSON.stringify({ q: query, gl: 'in' }),
    });
    if (!res.ok) {
      console.error('[fetch-jobs] Serper error:', res.status);
      return [];
    }
    const data = await res.json();
    return (data.jobs ?? []).slice(0, 10).map(
      (j: {
        jobId?: string;
        title?: string;
        companyName?: string;
        location?: string;
        description?: string;
        applyLink?: string;
        detectedExtensions?: { postedAt?: string };
      }, idx: number) => ({
        id: `serper-${j.jobId ?? idx}`,
        title: j.title ?? '',
        company: j.companyName ?? '',
        location: j.location ?? '',
        description: j.description ?? '',
        url: j.applyLink ?? '',
        source: 'serper' as const,
        postedAt: j.detectedExtensions?.postedAt,
      })
    );
  } catch (err) {
    console.error('[fetch-jobs] Serper fetch threw:', err);
    return [];
  }
}

// ─── Per-query fetch with SerpApi→Serper fallback ─────────────────────────────

async function fetchOneQuery(query: string): Promise<RawJob[]> {
  const serpResults = await fetchSerpApiJobs(query);
  if (serpResults.length > 0) {
    console.log(`[fetch-jobs] SerpApi "${query}" → ${serpResults.length} results`);
    return serpResults;
  }
  console.log(`[fetch-jobs] SerpApi "${query}" → 0, trying Serper`);
  const serperResults = await fetchSerperJobs(query);
  console.log(`[fetch-jobs] Serper "${query}" → ${serperResults.length} results`);
  return serperResults;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { preferences } = await req.json();
    if (!preferences) {
      return NextResponse.json({ error: 'preferences required' }, { status: 400 });
    }

    // ── Layer 1: Query cache check ────────────────────────────────────────────
    // Hardcoded jobs are always included fresh on top; only live results are cached.
    const cached = getCachedQuery(preferences);
    if (cached) {
      console.log(`[fetch-jobs] Query cache hit: ${cached.length} live jobs`);
      return NextResponse.json({
        jobs: cached,
        fromCache: true,
      });
    }

    // Extract 1–3 clean job-title queries from free-text preferences
    const queries = extractSearchQueries(preferences);
    console.log('[fetch-jobs] Extracted queries:', queries);

    // Run all queries in parallel
    const resultSets = await Promise.all(queries.map(q => fetchOneQuery(q)));
    const liveJobs = deduplicateJobs(resultSets.flat());

    console.log(`[fetch-jobs] Total unique live jobs: ${liveJobs.length}`);

    if (liveJobs.length > 0) {
      setCachedQuery(preferences, liveJobs);
    }

    return NextResponse.json({
      jobs: liveJobs,
      fromCache: false,
    });
  } catch (err) {
    console.error('[fetch-jobs] Fatal error:', err);
    return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
  }
}
