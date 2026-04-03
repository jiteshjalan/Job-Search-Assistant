import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getCachedScore, setCachedScore } from '@/lib/jobs-cache';
import type { RawJob, ScoredJob } from '@/lib/types';

// Allow long-running sequential scoring (up to 5 minutes)
export const maxDuration = 300;

// Fallback chain — primary first, then fallbacks in order
const MODEL_CHAIN = ['gemma-3-4b-it', 'gemma-3-12b-it', 'gemini-2.0-flash-lite'];

const WEIGHTS = {
  roleProfileFit: 0.30,
  companyStageTrajectory: 0.25,
  networkProximity: 0.25,
  outreachROI: 0.20,
};

const EXCLUDED_FACTORS = {
  salary: 'Indian job postings rarely list accurate compensation; salary data would skew scoring without adding signal.',
  location: 'Candidate is open to Bangalore and remote; location is not a differentiating factor.',
  atsKeywords: 'ATS keyword matching rewards resume manipulation, not actual fit. Deliberately excluded.',
  titleMatching: 'Candidate background spans multiple titles (EIR, Chief of Staff, GTM Lead). Title filtering would remove relevant roles.',
};

// 15 seconds between consecutive Gemini API calls to stay inside free-tier limits
const DELAY_MS = 15_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractJSON(raw: string): string {
  const text = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1);
  return text;
}

async function callWithFallback(genAI: GoogleGenerativeAI, prompt: string): Promise<string> {
  let lastError: Error = new Error('All models in fallback chain failed');

  for (const modelName of MODEL_CHAIN) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      console.log(`[score-all-jobs] Used model: ${modelName}`);
      return text;
    } catch (err: unknown) {
      const anyErr = err as { status?: number; message?: string };
      const status = anyErr?.status;
      const isRetryable = status === 429 || status === 404 || status === 503;

      console.warn(`[score-all-jobs] Model ${modelName} failed (status=${status}): ${anyErr?.message ?? err}`);
      lastError = err instanceof Error ? err : new Error(String(err));

      if (isRetryable) {
        await sleep(2000);
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

async function scoreOneJob(
  job: RawJob,
  cvText: string,
  preferences: string,
  genAI: GoogleGenerativeAI
): Promise<ScoredJob> {
  const prompt = `You are a rigorous job-fit scorer. Score this job against the candidate's CV and preferences.

## Candidate CV
${cvText.slice(0, 3000)}

## Candidate Preferences
${preferences}

## Job
Company: ${job.company}
Title: ${job.title}
Location: ${job.location}
Description: ${job.description.slice(0, 1500)}

## Scoring dimensions (score each 0-100):
1. roleProfileFit (weight 30%): How well does the role match the candidate's actual experience, skills, and stated preferences?
2. companyStageTrajectory (weight 25%): Is the company stage, growth trajectory, and type a strong match for what the candidate wants?
3. networkProximity (weight 25%): How likely is it the candidate has a warm path in (mutual connections, same industry, shared investors, alumni networks)?
4. outreachROI (weight 20%): How likely is a cold outreach to get a response given the company size, role urgency, and hiring signals?

For each dimension, list 1-2 specific improvements the candidate could make to increase their score.

IMPORTANT: Respond with ONLY a valid JSON object. No explanation, no markdown, no text before or after the JSON. Start your response with { and end with }.

{
  "roleProfileFit": { "score": 75, "rationale": "...", "improvements": ["...", "..."] },
  "companyStageTrajectory": { "score": 80, "rationale": "...", "improvements": ["...", "..."] },
  "networkProximity": { "score": 60, "rationale": "...", "improvements": ["...", "..."] },
  "outreachROI": { "score": 70, "rationale": "...", "improvements": ["...", "..."] },
  "topSignals": ["signal 1", "signal 2"],
  "topGaps": ["gap 1", "gap 2"],
  "warmPath": "moderate"
}`;

  const raw = await callWithFallback(genAI, prompt);
  const jsonText = extractJSON(raw);
  const parsed = JSON.parse(jsonText);

  const dimensions = {
    roleProfileFit: { ...parsed.roleProfileFit, weight: WEIGHTS.roleProfileFit },
    companyStageTrajectory: { ...parsed.companyStageTrajectory, weight: WEIGHTS.companyStageTrajectory },
    networkProximity: { ...parsed.networkProximity, weight: WEIGHTS.networkProximity },
    outreachROI: { ...parsed.outreachROI, weight: WEIGHTS.outreachROI },
  };

  const compositeScore = Math.round(
    dimensions.roleProfileFit.score * WEIGHTS.roleProfileFit +
    dimensions.companyStageTrajectory.score * WEIGHTS.companyStageTrajectory +
    dimensions.networkProximity.score * WEIGHTS.networkProximity +
    dimensions.outreachROI.score * WEIGHTS.outreachROI
  );

  const warmPath = (['strong', 'moderate', 'cold'] as const).includes(parsed.warmPath)
    ? parsed.warmPath as 'strong' | 'moderate' | 'cold'
    : 'cold';

  return {
    ...job,
    compositeScore,
    dimensions,
    topSignals: Array.isArray(parsed.topSignals) ? parsed.topSignals.slice(0, 2) : [],
    topGaps: Array.isArray(parsed.topGaps) ? parsed.topGaps.slice(0, 2) : [],
    warmPath,
    excludedFactors: EXCLUDED_FACTORS,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { jobs, cvText, preferences } = await req.json();

    if (!jobs || !cvText || !preferences) {
      return NextResponse.json({ error: 'jobs, cvText, and preferences are required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });

    const genAI = new GoogleGenerativeAI(apiKey);
    const rawJobs = jobs as RawJob[];
    const scoredJobs: ScoredJob[] = [];

    // Track when the last actual Gemini API call was made so we only delay
    // between real API calls, not between cache hits.
    let lastApiCallAt = 0;
    let uncachedCount = 0;

    for (const job of rawJobs) {
      // ── Cache check ────────────────────────────────────────────────────────
      const cachedScore = getCachedScore(job.id);
      if (cachedScore) {
        console.log(`[score-all-jobs] Cache hit: ${job.company} — ${job.title}`);
        scoredJobs.push(cachedScore);
        continue;
      }

      // ── Rate-limit throttle ────────────────────────────────────────────────
      // Only wait if a real API call was made recently.
      const elapsed = Date.now() - lastApiCallAt;
      if (lastApiCallAt > 0 && elapsed < DELAY_MS) {
        const wait = DELAY_MS - elapsed;
        console.log(`[score-all-jobs] Throttling — waiting ${Math.round(wait / 1000)}s before next call`);
        await sleep(wait);
      }

      console.log(`[score-all-jobs] Scoring: ${job.company} — ${job.title}`);

      try {
        const scored = await scoreOneJob(job, cvText, preferences, genAI);
        setCachedScore(job.id, job, scored);
        scoredJobs.push(scored);
      } catch (err) {
        console.error(`[score-all-jobs] Failed to score ${job.id}:`, err);
        const fallback: ScoredJob = {
          ...job,
          compositeScore: 0,
          dimensions: {
            roleProfileFit:        { score: 0, weight: 0.30, rationale: 'Scoring failed', improvements: [] },
            companyStageTrajectory: { score: 0, weight: 0.25, rationale: 'Scoring failed', improvements: [] },
            networkProximity:      { score: 0, weight: 0.25, rationale: 'Scoring failed', improvements: [] },
            outreachROI:           { score: 0, weight: 0.20, rationale: 'Scoring failed', improvements: [] },
          },
          topSignals: [],
          topGaps: ['Scoring unavailable — click Refresh to retry'],
          warmPath: 'cold',
          excludedFactors: EXCLUDED_FACTORS,
        };
        scoredJobs.push(fallback);
      }

      lastApiCallAt = Date.now();
      uncachedCount++;
    }

    scoredJobs.sort((a, b) => b.compositeScore - a.compositeScore);

    console.log(
      `[score-all-jobs] Done — ${uncachedCount} scored via API, ` +
      `${rawJobs.length - uncachedCount} served from cache`
    );

    return NextResponse.json({
      scoredJobs,
      total: scoredJobs.length,
      uncachedCount,
    });
  } catch (err) {
    console.error('[score-all-jobs] Fatal error:', err);
    return NextResponse.json({ error: 'Failed to score jobs' }, { status: 500 });
  }
}
