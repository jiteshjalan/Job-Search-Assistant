export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

type CacheShape = {
  scoreVersion?: number;
  queryCache?: Record<string, unknown>;
  jobCache?: Record<string, Record<string, unknown>>;
};

const CACHE_PATH = path.join(process.cwd(), 'jobs_cache.json');

function readCache(): CacheShape {
  try {
    const raw = fs.readFileSync(CACHE_PATH, 'utf-8');
    return JSON.parse(raw) as CacheShape;
  } catch {
    return {};
  }
}

function writeCache(cache: CacheShape): void {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Gemini helpers
// ---------------------------------------------------------------------------

const MODEL_CHAIN = ['gemini-2.0-flash-lite', 'gemma-3-12b-it', 'gemma-3-4b-it'] as const;

function extractJSON(raw: string): unknown {
  // Strip ```json fences
  let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in response');
  cleaned = cleaned.slice(start, end + 1);
  return JSON.parse(cleaned);
}

async function callGemini(
  genAI: GoogleGenerativeAI,
  prompt: string
): Promise<string> {
  let lastError: unknown;
  for (const modelName of MODEL_CHAIN) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        return result.response.text();
      } catch (err: unknown) {
        const status =
          (err as { status?: number })?.status ??
          (err as { statusCode?: number })?.statusCode;
        if (status === 429 || status === 503) {
          // Back-off: 1s, 2s, 4s
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
          lastError = err;
          continue;
        }
        // Non-retryable for this model — try next
        lastError = err;
        break;
      }
    }
  }
  throw lastError ?? new Error('All Gemini models failed');
}

// ---------------------------------------------------------------------------
// Case study helpers
// ---------------------------------------------------------------------------

type CaseStudyFile = {
  name: string;
  content: string | null;
};

function caseStudiesFromBody(
  raw: { name: string; b64: string }[] | undefined
): CaseStudyFile[] {
  if (!raw || raw.length === 0) return [];
  // PDFs from client: we have the filename but no text content
  return raw.map((cs) => ({ name: cs.name, content: null }));
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ error: 'jobId query param required' }, { status: 400 });
  }
  const cache = readCache();
  if (cache.jobCache?.[jobId]) {
    delete cache.jobCache[jobId].cvBuild;
    writeCache(cache);
  }
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as {
      jobId: string;
      jobTitle: string;
      company: string;
      jobDescription: string;
      cvText: string;
      caseStudies?: { name: string; b64: string }[];
      force?: boolean;
    };

    const { jobId, jobTitle, company, jobDescription, cvText, caseStudies: rawCaseStudies, force } = body;

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
    }

    // ------------------------------------------------------------------
    // Cache check
    // ------------------------------------------------------------------
    const cache = readCache();
    const existing = cache.jobCache?.[jobId]?.cvBuild;
    if (existing && force !== true) {
      return NextResponse.json({ ...(existing as object), fromCache: true });
    }

    // ------------------------------------------------------------------
    // Setup Gemini
    // ------------------------------------------------------------------
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }
    const genAI = new GoogleGenerativeAI(apiKey);

    // ------------------------------------------------------------------
    // Stage 1 — Gap analysis
    // ------------------------------------------------------------------
    const FORMAT_RULES = `IMPORTANT FORMATTING RULES: Use plain text only. Do not use asterisks (*), bold (**text**), italic (*text*), hash symbols (#) for headings, dashes as bullet points, or any other markdown formatting. Write in clean prose. Preserve all dates exactly as they appear in the original. Preserve section headers exactly as they appear.`;

    const gapPrompt = `You are an expert career coach doing a gap analysis between a job description and a candidate's CV.

## Job Description (first 2000 chars)
${jobDescription.slice(0, 2000)}

## Candidate CV (first 3000 chars)
${cvText.slice(0, 3000)}

Identify the key gaps and strengths. ${FORMAT_RULES}

Respond ONLY with valid JSON (no markdown fences):
{ "gapSummary": "Two sentence summary of the main gaps and how the candidate's strengths partially address them." }`;

    const gapRaw = await callGemini(genAI, gapPrompt);
    const gapParsed = extractJSON(gapRaw) as { gapSummary: string };
    const gapSummary: string = gapParsed.gapSummary ?? '';

    // ------------------------------------------------------------------
    // Stage 2 — Case study retrieval
    // ------------------------------------------------------------------
    const caseStudyFiles = caseStudiesFromBody(rawCaseStudies);

    let caseStudy: { name: string; reason: string };

    if (caseStudyFiles.length === 0) {
      caseStudy = { name: '', reason: 'No case studies uploaded. Go to My Profile to upload them.' };
    } else {
      const fileListText = caseStudyFiles
        .map((f) => `--- FILE: ${f.name} (PDF — filename only) ---`)
        .join('\n\n');

      const csPrompt = `You are helping select the best case study from a candidate's portfolio to address a specific job gap.

## Job Gap Summary
${gapSummary}

## Role
${jobTitle} at ${company}

## Available Case Studies
${fileListText}

Choose the single best case study file that most directly addresses the gap above. ${FORMAT_RULES}

Respond ONLY with valid JSON (no markdown fences):
{ "name": "exact filename", "reason": "One sentence explaining why this case study best addresses the gap." }`;

      const csRaw = await callGemini(genAI, csPrompt);
      const csParsed = extractJSON(csRaw) as { name: string; reason: string };
      caseStudy = {
        name: csParsed.name ?? '',
        reason: csParsed.reason ?? '',
      };
    }

    // No text content available for PDFs from client
    const caseStudyContent = '';

    // ------------------------------------------------------------------
    // Stage 3 — CV diff
    // ------------------------------------------------------------------
    const cvDiffPrompt = `You are an expert CV optimiser. Your task is to parse a candidate's CV into its natural sections and return an optimised version of each section.

## Role
${jobTitle} at ${company}

## Gap Analysis
${gapSummary}

## Matched Case Study Content (for inspiration, first 1500 chars)
${caseStudyContent || '(none available)'}

## Full CV (first 4000 chars)
${cvText.slice(0, 4000)}

Instructions:
- Parse the CV into its natural sections (e.g. Summary/Profile, Experience, Skills, Education, Projects, etc.)
- For each section, provide the original text and an optimised version
- Only change sections where the case study or gap analysis genuinely adds value
- Keep the same structure and voice — stay authentic, do not fabricate experience
- Make targeted improvements: stronger framing, relevant keywords from the job description, better quantification
- ${FORMAT_RULES}

Respond ONLY with valid JSON (no markdown fences):
{
  "sections": [
    {
      "id": "section_slug_unique",
      "title": "Section Title",
      "original": "Original section text verbatim",
      "optimised": "Optimised version of the section text"
    }
  ]
}`;

    const diffRaw = await callGemini(genAI, cvDiffPrompt);
    const diffParsed = extractJSON(diffRaw) as {
      sections: Array<{ id: string; title: string; original: string; optimised: string }>;
    };

    const sections = Array.isArray(diffParsed.sections) ? diffParsed.sections : [];

    // ------------------------------------------------------------------
    // Assemble and cache result
    // ------------------------------------------------------------------
    const builtAt = new Date().toISOString();
    const cvBuild = { gapSummary, caseStudy, sections, builtAt };

    // Write to cache — preserve all existing fields
    if (!cache.jobCache) cache.jobCache = {};
    if (!cache.jobCache[jobId]) cache.jobCache[jobId] = {};
    cache.jobCache[jobId].cvBuild = cvBuild;
    writeCache(cache);

    return NextResponse.json({ ...cvBuild, fromCache: false });
  } catch (err: unknown) {
    console.error('[build-cv] error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
