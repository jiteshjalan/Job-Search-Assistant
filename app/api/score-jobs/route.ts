import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { RawJob } from '@/lib/types';

// Re-export types so existing imports from this path keep working
export type { DimensionScore, ScoredJob } from '@/lib/types';
import type { ScoredJob } from '@/lib/types';

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

async function scoreJob(
  job: RawJob,
  cvText: string,
  preferences: string,
  genAI: GoogleGenerativeAI
): Promise<ScoredJob> {
  const model = genAI.getGenerativeModel({ model: 'gemma-3-4b-it' });

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

## What would improve the score:
For each dimension, list 1–2 specific things the candidate could do to increase their score (e.g., specific resume additions, skills to acquire, people to connect with).

## Output — respond ONLY with valid JSON, no markdown, no explanation:
{
  "roleProfileFit": { "score": 0-100, "rationale": "...", "improvements": ["...", "..."] },
  "companyStageTrajectory": { "score": 0-100, "rationale": "...", "improvements": ["...", "..."] },
  "networkProximity": { "score": 0-100, "rationale": "...", "improvements": ["...", "..."] },
  "outreachROI": { "score": 0-100, "rationale": "...", "improvements": ["...", "..."] },
  "topSignals": ["top matching signal 1", "top matching signal 2"],
  "topGaps": ["top gap 1", "top gap 2"],
  "warmPath": "strong" | "moderate" | "cold"
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  // Strip markdown code fences if present
  const jsonText = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
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

  return {
    ...job,
    compositeScore,
    dimensions,
    topSignals: parsed.topSignals ?? [],
    topGaps: parsed.topGaps ?? [],
    warmPath: parsed.warmPath ?? 'cold',
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
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // Score in parallel, with a fallback for any individual failure
    const scoringPromises = (jobs as RawJob[]).map(async (job) => {
      try {
        return await scoreJob(job, cvText, preferences, genAI);
      } catch (err) {
        console.error(`Failed to score job ${job.id}:`, err);
        return {
          ...job,
          compositeScore: 0,
          dimensions: {
            roleProfileFit: { score: 0, weight: 0.30, rationale: 'Scoring failed', improvements: [] },
            companyStageTrajectory: { score: 0, weight: 0.25, rationale: 'Scoring failed', improvements: [] },
            networkProximity: { score: 0, weight: 0.25, rationale: 'Scoring failed', improvements: [] },
            outreachROI: { score: 0, weight: 0.20, rationale: 'Scoring failed', improvements: [] },
          },
          topSignals: [],
          topGaps: ['Scoring unavailable'],
          warmPath: 'cold' as const,
          excludedFactors: EXCLUDED_FACTORS,
        } as ScoredJob;
      }
    });

    const scoredJobs = await Promise.all(scoringPromises);
    scoredJobs.sort((a, b) => b.compositeScore - a.compositeScore);

    return NextResponse.json({ scoredJobs });
  } catch (err) {
    console.error('score-jobs error:', err);
    return NextResponse.json({ error: 'Failed to score jobs' }, { status: 500 });
  }
}
