import fs from 'fs';
import path from 'path';
import type { RawJob, ScoredJob, Contact } from './types';

// ─── Scoring version ──────────────────────────────────────────────────────────
// Bump this number to invalidate all cached scores.
// Contacts, predicted emails, and drafted messages are NEVER invalidated by a
// version bump — they are permanent until the user clicks "Refresh" on a card.
export const SCORE_VERSION = 1;

const CACHE_FILE = path.join(process.cwd(), 'jobs_cache.json');

// ─── Cache file structure ─────────────────────────────────────────────────────

interface QueryCacheEntry {
  /** The raw jobs returned for this preferences query (minus hardcoded jobs). */
  jobs: RawJob[];
  cachedAt: string;
  /** Original preferences string (for display / debugging). */
  preferences: string;
}

interface JobCacheEntry {
  /** Raw job data — preserved so the refresh flow can re-score without re-fetching. */
  rawJob: RawJob;
  /** Null if never scored, or if invalidated. */
  score: ScoredJob | null;
  /** The SCORE_VERSION active when this score was computed. */
  scoreVersion: number | null;
  scoreCachedAt: string | null;
  /** Contacts are permanent — a scoring-version bump never wipes them. */
  contacts: Contact[] | null;
  contactsCachedAt: string | null;
}

interface CacheFile {
  scoreVersion: number;
  queryCache: Record<string, QueryCacheEntry>;
  jobCache: Record<string, JobCacheEntry>;
}

// ─── File I/O ─────────────────────────────────────────────────────────────────

function readCache(): CacheFile {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
      return JSON.parse(raw) as CacheFile;
    }
  } catch {
    console.warn('[jobs-cache] Cache file unreadable — starting fresh');
  }
  return { scoreVersion: SCORE_VERSION, queryCache: {}, jobCache: {} };
}

function writeCache(cache: CacheFile): void {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (err) {
    console.error('[jobs-cache] Write failed:', err);
  }
}

// ─── Query key ────────────────────────────────────────────────────────────────

/** Normalise a preferences string into a stable, lowercase cache key. */
export function queryKey(preferences: string): string {
  return preferences.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ─── Layer 1: Query cache ─────────────────────────────────────────────────────

export function getCachedQuery(preferences: string): RawJob[] | null {
  const cache = readCache();
  const entry = cache.queryCache[queryKey(preferences)];
  return entry?.jobs ?? null;
}

export function setCachedQuery(preferences: string, jobs: RawJob[]): void {
  const cache = readCache();
  cache.queryCache[queryKey(preferences)] = {
    jobs,
    cachedAt: new Date().toISOString(),
    preferences: preferences.trim(),
  };
  writeCache(cache);
  console.log(`[jobs-cache] Query cached: ${jobs.length} jobs`);
}

// ─── Layer 2a: Job score cache ────────────────────────────────────────────────

/**
 * Returns a cached ScoredJob only if it exists AND its scoreVersion matches the
 * current SCORE_VERSION. Returns null when absent or version-stale.
 */
export function getCachedScore(jobId: string): ScoredJob | null {
  const cache = readCache();
  const entry = cache.jobCache[jobId];
  if (!entry?.score) return null;
  if (entry.scoreVersion !== SCORE_VERSION) {
    console.log(
      `[jobs-cache] Score version mismatch for ${jobId} ` +
      `(cached v${entry.scoreVersion} ≠ current v${SCORE_VERSION}) — will re-score`
    );
    return null;
  }
  return entry.score;
}

export function setCachedScore(jobId: string, rawJob: RawJob, score: ScoredJob): void {
  const cache = readCache();
  const existing = cache.jobCache[jobId];
  cache.jobCache[jobId] = {
    rawJob,
    score,
    scoreVersion: SCORE_VERSION,
    scoreCachedAt: new Date().toISOString(),
    // Preserve contacts — score version changes must never wipe them
    contacts: existing?.contacts ?? null,
    contactsCachedAt: existing?.contactsCachedAt ?? null,
  };
  writeCache(cache);
}

// ─── Layer 2b: Contacts cache ─────────────────────────────────────────────────

export function getCachedContacts(jobId: string): Contact[] | null {
  const cache = readCache();
  return cache.jobCache[jobId]?.contacts ?? null;
}

export function setCachedContacts(jobId: string, contacts: Contact[]): void {
  const cache = readCache();
  const existing = cache.jobCache[jobId];
  cache.jobCache[jobId] = {
    rawJob: existing?.rawJob ?? {
      id: jobId, title: '', company: '', location: '',
      description: '', url: '', source: 'serpapi' as const,
    },
    score: existing?.score ?? null,
    scoreVersion: existing?.scoreVersion ?? null,
    scoreCachedAt: existing?.scoreCachedAt ?? null,
    contacts,
    contactsCachedAt: new Date().toISOString(),
  };
  writeCache(cache);
  console.log(`[jobs-cache] Contacts cached for job ${jobId}: ${contacts.length} contacts`);
}

// ─── Invalidation ─────────────────────────────────────────────────────────────

/**
 * Wipes score AND contacts for a job.
 * This is the only way to force a re-fetch — called when the user clicks Refresh.
 */
export function invalidateJob(jobId: string): void {
  const cache = readCache();
  const existing = cache.jobCache[jobId];
  if (!existing) return;
  cache.jobCache[jobId] = {
    ...existing,
    score: null,
    scoreVersion: null,
    scoreCachedAt: null,
    contacts: null,
    contactsCachedAt: null,
  };
  writeCache(cache);
  console.log(`[jobs-cache] Invalidated score + contacts for job ${jobId}`);
}

/** Returns the stored rawJob — used by the per-card refresh flow. */
export function getCachedRawJob(jobId: string): RawJob | null {
  const cache = readCache();
  return cache.jobCache[jobId]?.rawJob ?? null;
}

/** Returns a human-readable summary of the cache (for /api/cache GET). */
export function getCacheSummary() {
  const cache = readCache();
  const queries = Object.entries(cache.queryCache).map(([key, v]) => ({
    key,
    jobCount: v.jobs.length,
    cachedAt: v.cachedAt,
    preferences: v.preferences.slice(0, 80),
  }));
  const jobs = Object.values(cache.jobCache);
  return {
    scoreVersion: SCORE_VERSION,
    queryCount: queries.length,
    queries,
    jobCount: jobs.length,
    scoredCount: jobs.filter(e => e.score && e.scoreVersion === SCORE_VERSION).length,
    staleScoreCount: jobs.filter(e => e.score && e.scoreVersion !== SCORE_VERSION).length,
    contactsCount: jobs.filter(e => e.contacts).length,
  };
}
