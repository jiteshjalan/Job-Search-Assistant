import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { RawJob } from '../fetch-jobs/route';
import type { ScoredJob } from '../score-jobs/route';

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

export async function POST(req: NextRequest) {
  try {
    const { job, cvText, preferences } = await req.json();

    if (!job || !cvText || !preferences) {
      return NextResponse.json({ error: 'job, cvText, and preferences are required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemma-3-4b-it' });

    const rawJob = job as RawJob;

    const prompt = `You are a rigorous job-fit scorer. Score this job against the candidate's CV and preferences.

## Candidate CV
${cvText.slice(0, 3000)}

## Candidate Preferences
${preferences}

## Job
Company: ${rawJob.company}
Title: ${rawJob.title}
Location: ${rawJob.location}
Description: ${rawJob.description.slice(0, 1500)}

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
    const text = result.response.text().trim()
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    const parsed = JSON.parse(text);

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

    const scoredJob: ScoredJob = {
      ...rawJob,
      compositeScore,
      dimensions,
      topSignals: parsed.topSignals ?? [],
      topGaps: parsed.topGaps ?? [],
      warmPath: parsed.warmPath ?? 'cold',
      excludedFactors: EXCLUDED_FACTORS,
    };

    return NextResponse.json({ scoredJob });
  } catch (err) {
    console.error('score-job error:', err);
    return NextResponse.json({ error: 'Scoring failed' }, { status: 500 });
  }
}
