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

// ─── SerpApi query construction ───────────────────────────────────────────────
// Transforms a query + detected company into a clean SerpApi-ready string.
// Three jobs:
//   1. Expand common abbreviations (EIR, PM, EM, VP, CTO …)
//   2. Strip filler words that confuse Google Jobs (roles, jobs, positions …)
//   3. When a specific company is targeted, drop the sector proxy word (AI / SaaS /
//      startup) that extractSearchQueries appended as a stand-in for the company,
//      then append the real company name instead.

const ABBR_MAP: Record<string, string> = {
  eir: 'Entrepreneur in Residence',
  pm:  'Product Manager',
  em:  'Engineering Manager',
  vp:  'Vice President',
  cto: 'Chief Technology Officer',
  coo: 'Chief Operating Officer',
  cpo: 'Chief Product Officer',
  cos: 'Chief of Staff',
  gtm: 'Go-to-Market Manager',
};

const FILLER_RE = /\b(roles?|jobs?|positions?|openings?|opportunities?|vacancies?|listings?)\b/gi;

// These are the sector proxy words extractSearchQueries appends when no company is known.
// Drop them from the query when we already have a real company name to append.
const SECTOR_PROXIES = new Set(['ai', 'saas', 'startup']);

function buildSerpQuery(query: string, company: string): string {
  // Expand abbreviations (whole-word matches only)
  const expanded = query.replace(/\b(\w+)\b/g, w => ABBR_MAP[w.toLowerCase()] ?? w);
  // Strip filler words and collapse whitespace
  const cleaned = expanded.replace(FILLER_RE, '').replace(/\s+/g, ' ').trim();

  if (!company) return cleaned;

  // Company is known: remove sector proxy words (they were stand-ins; company is now more specific)
  const roleWords = cleaned.split(/\s+/).filter(w => !SECTOR_PROXIES.has(w.toLowerCase()));
  const roleTitle = roleWords.join(' ').trim() || cleaned;
  return `${roleTitle} ${company}`;
}

// Detects "in [Company]" or "at [Company]" patterns in the raw preferences string.
// Returns the company name, or '' if none found or if the match is a known city/location.

const KNOWN_LOCATIONS_LC = new Set([
  'bangalore', 'bengaluru', 'gurgaon', 'gurugram', 'delhi', 'new delhi', 'ncr',
  'mumbai', 'bombay', 'pune', 'hyderabad', 'chennai', 'madras', 'noida',
  'kolkata', 'calcutta', 'ahmedabad', 'jaipur', 'india', 'remote',
]);

// Sector/descriptor words that must never be treated as a company name
const NOT_A_COMPANY = new Set([
  'saas', 'b2b', 'b2c', 'd2c', 'b2b2c', 'ai', 'ml', 'tech', 'fintech', 'edtech',
  'healthtech', 'insurtech', 'proptech', 'legaltech', 'hrtech', 'martech', 'deeptech',
  'startup', 'startups', 'unicorn', 'decacorn',
  'early', 'late', 'growth', 'pre', 'post', 'stage', 'series', 'round',
  'venture', 'funded', 'backed',
]);

function extractCompany(preferences: string): string {
  // Match "in/at [Uppercase-starting word(s)]" — stop before prepositions so we
  // don't eat "in Leena AI in Bangalore" into a single blob.
  const re = /\b(?:in|at)\s+([A-Z][A-Za-z0-9]*(?:\s+(?!in\b|at\b|for\b|with\b|on\b|of\b|the\b)[A-Za-z0-9]+)*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(preferences)) !== null) {
    const candidate = match[1].trim();
    const firstWord = candidate.split(/\s+/)[0].toLowerCase();
    // Skip cities / locations
    if (KNOWN_LOCATIONS_LC.has(firstWord)) continue;
    // Skip sector words and generic descriptors
    if (NOT_A_COMPANY.has(firstWord)) continue;
    if (NOT_A_COMPANY.has(candidate.toLowerCase())) continue;
    // Skip "Series A/B/C/D/E" and similar funding-stage patterns
    if (/^(series\s+[a-e]|early.stage|late.stage|growth.stage|pre.seed|pre-seed|seed.stage)/i.test(candidate)) continue;
    return candidate;
  }
  return '';
}

// ─── Location mapping ─────────────────────────────────────────────────────────

const LOCATION_MAP: { pattern: RegExp; serpLocation: string }[] = [
  { pattern: /\bgurgaon\b|\bgurugram\b/i,          serpLocation: 'Gurgaon, Haryana, India' },
  { pattern: /\bnoida\b/i,                          serpLocation: 'Noida, Uttar Pradesh, India' },
  { pattern: /\bdelhi\b|\bnew delhi\b|\bncr\b/i,   serpLocation: 'Delhi, India' },
  { pattern: /\bmumbai\b|\bbombay\b/i,              serpLocation: 'Mumbai, Maharashtra, India' },
  { pattern: /\bpune\b/i,                           serpLocation: 'Pune, Maharashtra, India' },
  { pattern: /\bhyderabad\b/i,                      serpLocation: 'Hyderabad, Telangana, India' },
  { pattern: /\bchennai\b|\bmadras\b/i,             serpLocation: 'Chennai, Tamil Nadu, India' },
  { pattern: /\bbangalore\b|\bbengaluru\b/i,        serpLocation: 'Bangalore, Karnataka, India' },
];

const DEFAULT_LOCATION = 'Bangalore, Karnataka, India';

function resolveLocation(preferences: string): string {
  for (const { pattern, serpLocation } of LOCATION_MAP) {
    if (pattern.test(preferences)) return serpLocation;
  }
  return DEFAULT_LOCATION;
}

// ─── JSearch on RapidAPI (primary) ───────────────────────────────────────────

async function fetchJSearchJobs(query: string, company: string, location: string): Promise<RawJob[]> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) {
    console.warn('[fetch-jobs] RAPIDAPI_KEY not set — skipping JSearch');
    return [];
  }

  const params = new URLSearchParams({
    query:     buildSerpQuery(query, company),
    country:   'in',
    location,
    num_pages: '2',
  });

  try {
    const res = await fetch(`https://jsearch.p.rapidapi.com/search?${params.toString()}`, {
      headers: {
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
        'X-RapidAPI-Key':  key,
      },
    });
    if (!res.ok) {
      console.error('[fetch-jobs] JSearch error:', res.status);
      return [];
    }
    const data = await res.json();
    const results: {
      job_id?:                    string;
      job_title?:                 string;
      employer_name?:             string;
      job_city?:                  string;
      job_state?:                 string;
      job_country?:               string;
      job_description?:           string;
      job_apply_link?:            string;
      job_posted_at_datetime_utc?: string;
    }[] = data.data ?? [];
    if (results.length === 0) return [];

    return results.slice(0, 20).map((j, idx) => {
      const locationParts = [j.job_city, j.job_state, j.job_country].filter(Boolean);
      return {
        id:          j.job_id ?? `jsearch-${query.slice(0, 8)}-${idx}`,
        title:       j.job_title       ?? '',
        company:     j.employer_name   ?? '',
        location:    locationParts.join(', '),
        description: j.job_description ?? '',
        url:         j.job_apply_link  ?? '',
        source:      'jsearch' as const,
        postedAt:    j.job_posted_at_datetime_utc,
      };
    });
  } catch (err) {
    console.error('[fetch-jobs] JSearch fetch threw:', err);
    return [];
  }
}

// ─── Per-query fetch ──────────────────────────────────────────────────────────

async function fetchOneQuery(query: string, company: string): Promise<RawJob[]> {
  const built = buildSerpQuery(query, company);
  const [primaryResults, gurugramResults] = await Promise.all([
    fetchJSearchJobs(query, company, 'Bangalore, Karnataka, India'),
    fetchJSearchJobs(query, company, 'Gurugram, Haryana, India'),
  ]);
  const combined = [...primaryResults, ...gurugramResults];
  console.log(`[fetch-jobs] JSearch "${built}" → ${primaryResults.length} (Bangalore) + ${gurugramResults.length} (Gurugram) = ${combined.length} results`);
  return combined;
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
    const company = extractCompany(preferences);
    console.log('[fetch-jobs] Extracted queries:', queries);
    console.log('[fetch-jobs] Detected company:', company || '(none)');

    // Run queries sequentially with a 1 s gap to avoid JSearch 429s
    const resultSets: RawJob[][] = [];
    for (let i = 0; i < queries.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 1000));
      resultSets.push(await fetchOneQuery(queries[i], company));
    }
    const liveJobs = deduplicateJobs(resultSets.flat());

    console.log(`[fetch-jobs] Total unique live jobs: ${liveJobs.length}`);

    if (liveJobs.length > 0) {
      setCachedQuery(preferences, liveJobs);

      // Upsert every fetched job into Google Sheets with status "New" (fire-and-forget)
      const origin = new URL(req.url).origin;
      void (async () => {
        for (const job of liveJobs) {
          await fetch(`${origin}/api/track-application`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jobId:   job.id,
              company: job.company,
              title:   job.title,
              url:     job.url,
              status:  'New',
            }),
          }).catch(() => {});
        }
      })();
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
