import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getCachedScore, setCachedScore } from '@/lib/jobs-cache';
import type { RawJob, ScoredJob } from '@/lib/types';
import fs from 'fs';
import path from 'path';

export const maxDuration = 300;

// ---------------------------------------------------------------------------
// Score version — bump this constant to invalidate cached scores.
// Contact data, outreach drafts, and CV builds are stored under separate keys
// and are NEVER touched by a version change.
// ---------------------------------------------------------------------------

const TARGET_SCORE_VERSION = 2;
const CACHE_PATH = path.join(process.cwd(), 'jobs_cache.json');

function bumpScoreVersion(): void {
  try {
    const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    if ((cache.scoreVersion ?? 0) < TARGET_SCORE_VERSION) {
      cache.scoreVersion = TARGET_SCORE_VERSION;
      fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
      console.log(`[score-all-jobs] scoreVersion → ${TARGET_SCORE_VERSION} (old scores invalidated)`);
    }
  } catch {
    // Cache file doesn't exist yet — no-op
  }
}

// ---------------------------------------------------------------------------
// Model chain + utilities
// ---------------------------------------------------------------------------

const MODEL_CHAIN = ['gemma-3-4b-it', 'gemma-3-12b-it', 'gemini-2.0-flash-lite'];
const DELAY_MS = 15_000;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function extractJSON(raw: string): string {
  const text = raw
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = text.indexOf('{');
  const end   = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1);
  return text;
}

async function callWithFallback(genAI: GoogleGenerativeAI, prompt: string): Promise<string> {
  let lastError: Error = new Error('All models in fallback chain failed');
  for (const modelName of MODEL_CHAIN) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      console.log(`[score-all-jobs] model: ${modelName}`);
      return result.response.text();
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      const retryable = e?.status === 429 || e?.status === 404 || e?.status === 503;
      console.warn(`[score-all-jobs] ${modelName} failed (${e?.status}): ${e?.message}`);
      lastError = err instanceof Error ? err : new Error(String(err));
      if (retryable) { await sleep(2000); continue; }
      throw err;
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Static candidate profile (embedded in every scoring prompt)
// ---------------------------------------------------------------------------

const STATIC_PROFILE = `Candidate: Jitesh Jalan
Experience: 3 years, Founders Office at Uniqode — high-growth B2B SaaS ($3M → $15M ARR). \
Worked in close proximity to founders and senior leadership with direct exposure to company-level \
strategy and decision-making.
Core skills: GTM strategy, pricing and packaging, product analytics, product management and roadmap \
ownership, growth management, cross-functional execution across product/sales/marketing.
Archetype: High-agency generalist, 0-to-1 operator, systems thinker, product and growth leader, \
comfortable with ambiguity. Proven ability to work directly with founders and C-suite.
Target environment: Series B and above, 50+ employees, post-PMF, enterprise and B2B-oriented, \
high-growth trajectory.
Notable work: PQL framework, forecasting models, pricing strategy, growth operations.
Known gaps: No enterprise sales team management experience, no global events experience.`;

// ---------------------------------------------------------------------------
// Excluded factors (both formats — list for spec, object for legacy frontend)
// ---------------------------------------------------------------------------

const EXCLUDED_FACTORS_LIST = [
  'Salary: not listed in Indian JDs — excluded to avoid skewing scores',
  'Location: candidate is open to Bangalore and remote — not a differentiating factor',
  'ATS keyword matching: rewards manipulation not fit — deliberately excluded',
  'Title matching: candidate has held multiple titles — title filtering removes relevant roles',
  'Education beyond soft penalty: experience overrides credentials in this model',
  'Company brand or prestige: irrelevant to role fit',
  'Gender or diversity requirements: irrelevant to fit',
  'Notice period: logistics not fit',
];

const EXCLUDED_FACTORS = {
  salary: 'Indian JDs rarely list accurate compensation — excluded to avoid skewing scores.',
  location: 'Candidate is open to Bangalore and remote — not a differentiating factor.',
  atsKeywords: 'ATS keyword matching rewards manipulation not fit — deliberately excluded.',
  titleMatching: 'Candidate has held multiple titles; title filtering removes relevant roles.',
  education: 'Treated as soft signal only; experience overrides credentials in this model.',
  companyPrestige: 'Brand/prestige irrelevant to role fit.',
  diversityRequirements: 'Irrelevant to fit.',
  noticePeriod: 'Logistics, not fit.',
};

// ---------------------------------------------------------------------------
// RAG — chunk CV + case studies by topic, retrieve top-N for each JD
// ---------------------------------------------------------------------------

const TOPICS = [
  { name: 'pricing',          keywords: ['pric', 'packag', 'monetiz', 'revenue model', 'arr', 'mrr', 'ltv', 'arpu', 'tier', 'subscription'] },
  { name: 'gtm',              keywords: ['gtm', 'go-to-market', 'sales', 'growth', 'acquisition', 'pipeline', 'funnel', 'demand gen'] },
  { name: 'analytics',        keywords: ['analytic', 'data', 'metric', 'kpi', 'dashboard', 'forecast', 'model', 'sql', 'insight'] },
  { name: 'product',          keywords: ['product', 'roadmap', 'feature', 'launch', 'prd', 'sprint', 'backlog', 'user story'] },
  { name: 'cross-functional', keywords: ['cross-functional', 'stakeholder', 'exec', 'founder', 'c-suite', 'strategy', 'ops', 'initiative'] },
];

function chunkCVByTopic(cvText: string): { topic: string; text: string }[] {
  const paragraphs = cvText.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 60);
  const tagged: { topic: string; text: string }[] = [];
  const untagged: string[] = [];
  for (const para of paragraphs) {
    const lower = para.toLowerCase();
    let matched = false;
    for (const t of TOPICS) {
      if (t.keywords.some(kw => lower.includes(kw))) {
        tagged.push({ topic: t.name, text: para });
        matched = true;
        break;
      }
    }
    if (!matched && para.length > 120) untagged.push(para);
  }
  untagged.forEach(p => tagged.push({ topic: 'general', text: p }));
  return tagged;
}

function retrieveRelevantChunks(
  chunks: { topic: string; text: string }[],
  jdText: string,
  n = 3,
): string[] {
  const jdLower = jdText.toLowerCase();
  const scored = chunks.map(chunk => {
    const words  = chunk.text.toLowerCase().split(/\W+/).filter(w => w.length > 4);
    const overlap = words.filter(w => jdLower.includes(w)).length;
    const topicBonus = jdLower.includes(chunk.topic) ? 3 : 0;
    return { chunk, score: overlap + topicBonus };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, n).map(s => `[${s.chunk.topic.toUpperCase()}] ${s.chunk.text}`);
}

function loadCaseStudyChunks(): { topic: string; text: string }[] {
  const dir = path.join(process.cwd(), 'case-studies');
  if (!fs.existsSync(dir)) return [];
  const chunks: { topic: string; text: string }[] = [];
  try {
    for (const entry of fs.readdirSync(dir)) {
      const ext = path.extname(entry).toLowerCase();
      if (ext !== '.txt' && ext !== '.md') continue;
      const content = fs.readFileSync(path.join(dir, entry), 'utf-8');
      const lower   = content.toLowerCase();
      let topic = 'case-study';
      for (const t of TOPICS) {
        if (t.keywords.some(kw => lower.includes(kw))) { topic = t.name; break; }
      }
      chunks.push({ topic, text: content.slice(0, 600) });
    }
  } catch { /* non-critical */ }
  return chunks;
}

// ---------------------------------------------------------------------------
// Scoring types
// ---------------------------------------------------------------------------

interface DimScore {
  score: number;
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
  improvements: string[];
}

interface GemmaResponse {
  hardDisqualified: boolean;
  dimensions: {
    functionalFit:       DimScore;
    capabilitySignals:   DimScore;
    requirementMatch:    DimScore;
    archetypeFit:        DimScore;
    environmentMatch:    DimScore;
    trajectoryNarrative: DimScore;
    strategicAlignment:  DimScore;
  };
  penalties: {
    experiencePenalty:             number;
    mandatoryRequirementsPenalty:  number;
    agingPenalty:                  number;
    educationPenalty:              number;
  };
  topSignals: string[];
  topGaps:    string[];
  warmPath:   'strong' | 'moderate' | 'cold';
}

function computeFinalScore(parsed: GemmaResponse) {
  if (parsed.hardDisqualified) {
    return {
      compositeScore: 0, autoFlag: 'Skip', baseScore: 0, totalPenalty: 0,
      penalties: { experiencePenalty: 0, mandatoryRequirementsPenalty: 0, agingPenalty: 0, educationPenalty: 0 },
    };
  }

  const d = parsed.dimensions;
  const base = Math.round(
    (d.functionalFit.score       / 100) * 25 +
    (d.capabilitySignals.score   / 100) * 20 +
    (d.requirementMatch.score    / 100) * 15 +
    (d.archetypeFit.score        / 100) * 15 +
    (d.environmentMatch.score    / 100) * 10 +
    (d.trajectoryNarrative.score / 100) * 10 +
    (d.strategicAlignment.score  / 100) * 5,
  );

  const p = parsed.penalties;
  const expPenalty  = Math.max(-20, Math.min(0, p.experiencePenalty            ?? 0));
  const mandPenalty = Math.max(-20, Math.min(0, p.mandatoryRequirementsPenalty ?? 0));
  const agePenalty  = p.agingPenalty === -5 ? -5 : 0;
  const eduPenalty  = Math.max(-10, Math.min(0, p.educationPenalty             ?? 0));
  const totalPenalty = expPenalty + mandPenalty + agePenalty + eduPenalty;
  const finalScore   = Math.max(0, base + totalPenalty);

  return {
    compositeScore: finalScore,
    autoFlag:       finalScore < 40 ? 'Skip' : null,
    baseScore:      base,
    totalPenalty,
    penalties: {
      experiencePenalty:            expPenalty,
      mandatoryRequirementsPenalty: mandPenalty,
      agingPenalty:                 agePenalty,
      educationPenalty:             eduPenalty,
    },
  };
}

// ---------------------------------------------------------------------------
// Build prompt + score one job
// ---------------------------------------------------------------------------

async function scoreOneJob(
  job: RawJob,
  cvText: string,
  preferences: string,
  genAI: GoogleGenerativeAI,
): Promise<ScoredJob> {
  // RAG enrichment
  const cvChunks    = chunkCVByTopic(cvText);
  const csChunks    = loadCaseStudyChunks();
  const ragChunks   = retrieveRelevantChunks([...cvChunks, ...csChunks], job.description ?? '', 3);
  const ragContext   = ragChunks.length > 0
    ? ragChunks.join('\n\n---\n\n')
    : '(No specific CV evidence retrieved — rely on static profile)';

  const prompt = `You are a rigorous job-fit scorer. Score this job for the specific candidate below \
using the two-layer model. Return ONLY valid JSON — no markdown, no text outside the JSON object.

## STATIC CANDIDATE PROFILE
${STATIC_PROFILE}

## RELEVANT CV EVIDENCE (top 3 chunks, RAG-retrieved by relevance to this JD)
${ragContext}

## CANDIDATE PREFERENCES
${preferences.slice(0, 400)}

## JOB TO SCORE
Company: ${job.company}
Title: ${job.title}
Location: ${job.location ?? ''}
Description: ${(job.description ?? '').slice(0, 2000)}

## LAYER 1 — ELIGIBILITY PENALTIES

Output these four penalty values. Apply them strictly:

experiencePenalty (0 to -20):
  Deduct if the candidate is fundamentally underqualified in years or domain for this specific role.

mandatoryRequirementsPenalty (0 to -20):
  Deduct for hard blockers the candidate cannot meet (non-negotiable credentials, unavailable location).

agingPenalty:
  -5 if any evidence the posting is older than 30 days. 0 otherwise.

educationPenalty (cap at -10, never go below):
  "MBA/IIT preferred" or similar soft language → 0 (ignore entirely)
  "MBA required" → -3 (experience overrides education in this model)
  Specific professional degree directly required for core function (CA, LLB, MBBS, etc.) → -10
  Generic "must have a degree" filter → -3

HARD DISQUALIFIERS — if ANY of these apply, set hardDisqualified:true and all dimension scores to 0:
  • Role requires government security clearance
  • Role is explicitly junior, entry-level, intern, associate, or fresher (0-2 years required)
  • Role requires a non-negotiable professional credential to perform the core function \
(e.g., CA for accounting head, LLB for legal counsel)

## LAYER 2 — POSITIVE DIMENSIONS (score each 0–100)

functionalFit (max 25 pts):
  Can the candidate actually do this job based on real experience? Look at their GTM, product, \
pricing, analytics, and cross-functional execution work.

capabilitySignals (max 20 pts):
  Evidence of real ownership, measurable impact, and execution in a high-growth B2B environment. \
PQL frameworks, forecasting models, pricing strategy, and ARR growth are strong signals.

requirementMatch (max 15 pts):
  How well do stated role requirements map to the candidate's actual background? \
This is NOT keyword matching — it is evidence-based mapping.

archetypeFit (max 15 pts):
  Does the candidate's profile type fit this role? \
STRONG POSITIVE SIGNAL if the role reports directly to a founder, CEO, or C-suite executive.

environmentMatch (max 10 pts):
  Enterprise and B2B roles with complex stakeholder environments and high-growth trajectory = high. \
Pure SMB, self-serve, or low-complexity roles = low.

trajectoryNarrative (max 10 pts):
  Does this role make sense in the candidate's career story? Does it represent a coherent next step?

strategicAlignment (max 5 pts):
  Deliberately low weight to avoid confirmation bias.

For every dimension provide confidence: "high" (JD is specific), "medium" (partial signal), \
"low" (vague JD — less confident).

## REQUIRED OUTPUT FORMAT

{
  "hardDisqualified": false,
  "dimensions": {
    "functionalFit":       { "score": 70, "confidence": "high",   "rationale": "...", "improvements": ["..."] },
    "capabilitySignals":   { "score": 65, "confidence": "medium", "rationale": "...", "improvements": ["..."] },
    "requirementMatch":    { "score": 60, "confidence": "medium", "rationale": "...", "improvements": ["..."] },
    "archetypeFit":        { "score": 75, "confidence": "high",   "rationale": "...", "improvements": ["..."] },
    "environmentMatch":    { "score": 80, "confidence": "high",   "rationale": "...", "improvements": ["..."] },
    "trajectoryNarrative": { "score": 70, "confidence": "medium", "rationale": "...", "improvements": ["..."] },
    "strategicAlignment":  { "score": 60, "confidence": "low",    "rationale": "...", "improvements": ["..."] }
  },
  "penalties": {
    "experiencePenalty":            0,
    "mandatoryRequirementsPenalty": 0,
    "agingPenalty":                 0,
    "educationPenalty":             0
  },
  "topSignals": ["specific positive signal 1", "specific positive signal 2"],
  "topGaps":    ["specific gap 1", "specific gap 2"],
  "warmPath":   "strong"
}`;

  const raw      = await callWithFallback(genAI, prompt);
  const jsonText = extractJSON(raw);
  const parsed   = JSON.parse(jsonText) as GemmaResponse;

  const { compositeScore, autoFlag, baseScore, totalPenalty, penalties } = computeFinalScore(parsed);
  const d = parsed.dimensions;

  // Legacy 4-key dimensions — required for frontend backward compat.
  // Maps the 7 new dimensions to the 4 existing display slots.
  const dimensions = {
    roleProfileFit: {
      score:        d.functionalFit?.score ?? 0,
      weight:       0.25,
      confidence:   d.functionalFit?.confidence ?? 'medium',
      rationale:    d.functionalFit?.rationale ?? '',
      improvements: d.functionalFit?.improvements ?? [],
    },
    companyStageTrajectory: {
      score:        Math.round(((d.environmentMatch?.score ?? 0) + (d.trajectoryNarrative?.score ?? 0)) / 2),
      weight:       0.20,
      confidence:   d.environmentMatch?.confidence ?? 'medium',
      rationale:    d.environmentMatch?.rationale ?? '',
      improvements: [...(d.environmentMatch?.improvements ?? []), ...(d.trajectoryNarrative?.improvements ?? [])],
    },
    networkProximity: {
      score:        d.archetypeFit?.score ?? 0,
      weight:       0.15,
      confidence:   d.archetypeFit?.confidence ?? 'medium',
      rationale:    d.archetypeFit?.rationale ?? '',
      improvements: d.archetypeFit?.improvements ?? [],
    },
    outreachROI: {
      score:        Math.round(((d.requirementMatch?.score ?? 0) + (d.strategicAlignment?.score ?? 0)) / 2),
      weight:       0.15,
      confidence:   d.requirementMatch?.confidence ?? 'medium',
      rationale:    d.requirementMatch?.rationale ?? '',
      improvements: [...(d.requirementMatch?.improvements ?? []), ...(d.strategicAlignment?.improvements ?? [])],
    },
  };

  const warmPath = (['strong', 'moderate', 'cold'] as const).includes(parsed.warmPath)
    ? parsed.warmPath : 'cold';

  return {
    ...job,
    compositeScore,
    dimensions,
    // Extended scoring data — stored in cache, available for future UI use
    dimensionBreakdown: parsed.dimensions,
    penalties,
    baseScore,
    totalPenalty,
    autoFlag,
    excludedFactorsList: EXCLUDED_FACTORS_LIST,
    topSignals:      Array.isArray(parsed.topSignals) ? parsed.topSignals.slice(0, 3) : [],
    topGaps:         Array.isArray(parsed.topGaps)    ? parsed.topGaps.slice(0, 3)    : [],
    warmPath,
    excludedFactors: EXCLUDED_FACTORS,
  } as unknown as ScoredJob;
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    // Idempotently bump scoreVersion — first call invalidates old scores,
    // subsequent calls are a no-op. All non-score data (contacts, outreach,
    // CV builds) lives under separate cache keys and is never touched.
    bumpScoreVersion();

    const { jobs, cvText, preferences } = await req.json();
    if (!jobs || !cvText || !preferences) {
      return NextResponse.json({ error: 'jobs, cvText, and preferences are required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });

    const genAI      = new GoogleGenerativeAI(apiKey);
    const rawJobs    = jobs as RawJob[];
    const scoredJobs: ScoredJob[] = [];
    let lastApiCallAt = 0;
    let uncachedCount = 0;

    for (const job of rawJobs) {
      const cachedScore = getCachedScore(job.id);
      if (cachedScore) {
        console.log(`[score-all-jobs] Cache hit: ${job.company} — ${job.title}`);
        scoredJobs.push(cachedScore);
        continue;
      }

      const elapsed = Date.now() - lastApiCallAt;
      if (lastApiCallAt > 0 && elapsed < DELAY_MS) {
        const wait = DELAY_MS - elapsed;
        console.log(`[score-all-jobs] Throttling ${Math.round(wait / 1000)}s`);
        await sleep(wait);
      }

      console.log(`[score-all-jobs] Scoring: ${job.company} — ${job.title}`);

      try {
        const scored = await scoreOneJob(job, cvText, preferences, genAI);
        setCachedScore(job.id, job, scored);
        scoredJobs.push(scored);
      } catch (err) {
        console.error(`[score-all-jobs] Failed ${job.id}:`, err);
        const fallback = {
          ...job,
          compositeScore: 0,
          autoFlag: null,
          dimensions: {
            roleProfileFit:         { score: 0, weight: 0.25, rationale: 'Scoring failed', improvements: [] },
            companyStageTrajectory: { score: 0, weight: 0.20, rationale: 'Scoring failed', improvements: [] },
            networkProximity:       { score: 0, weight: 0.15, rationale: 'Scoring failed', improvements: [] },
            outreachROI:            { score: 0, weight: 0.15, rationale: 'Scoring failed', improvements: [] },
          },
          penalties: { experiencePenalty: 0, mandatoryRequirementsPenalty: 0, agingPenalty: 0, educationPenalty: 0 },
          topSignals: [],
          topGaps: ['Scoring unavailable — click Refresh to retry'],
          warmPath: 'cold' as const,
          excludedFactors: EXCLUDED_FACTORS,
          excludedFactorsList: EXCLUDED_FACTORS_LIST,
        } as unknown as ScoredJob;
        scoredJobs.push(fallback);
      }

      lastApiCallAt = Date.now();
      uncachedCount++;
    }

    scoredJobs.sort((a, b) => b.compositeScore - a.compositeScore);
    console.log(`[score-all-jobs] Complete — ${uncachedCount} scored via API, ${rawJobs.length - uncachedCount} from cache`);

    return NextResponse.json({ scoredJobs, total: scoredJobs.length, uncachedCount });
  } catch (err) {
    console.error('[score-all-jobs] Fatal:', err);
    return NextResponse.json({ error: 'Failed to score jobs' }, { status: 500 });
  }
}
