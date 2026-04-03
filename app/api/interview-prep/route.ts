import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface InterviewQuestion {
  question: string;
  type: 'behavioural' | 'situational' | 'technical' | 'strategic';
  starAngle: string; // Which CV experience to anchor the STAR answer to
  starHints: {
    situation: string;
    task: string;
    action: string;
    result: string;
  };
}

export async function POST(req: NextRequest) {
  try {
    const { jobTitle, company, jobDescription, cvText } = await req.json();

    if (!jobTitle || !company || !cvText) {
      return NextResponse.json({ error: 'jobTitle, company, and cvText are required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemma-3-4b-it' });

    const prompt = `You are an expert interview coach. Generate interview preparation for this job and candidate.

## Candidate CV
${cvText.slice(0, 3000)}

## Role
${jobTitle} at ${company}
${jobDescription ? `\nJob Description:\n${jobDescription.slice(0, 1000)}` : ''}

## Task
Generate 9 likely interview questions. Mix types: behavioural, situational, technical/domain, and strategic. For each:
- Write the question as it would be asked
- Identify which specific CV experience is the best anchor for the STAR answer
- Give brief STAR hints grounded in the candidate's actual background (don't invent experiences)

Output ONLY valid JSON array, no markdown:
[
  {
    "question": "...",
    "type": "behavioural" | "situational" | "technical" | "strategic",
    "starAngle": "Which CV experience to anchor to (1 sentence)",
    "starHints": {
      "situation": "Brief hint for Situation",
      "task": "Brief hint for Task",
      "action": "Brief hint for Action (most important — what you specifically did)",
      "result": "Brief hint for Result (quantify if possible)"
    }
  }
]`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim()
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    const questions: InterviewQuestion[] = JSON.parse(text);

    return NextResponse.json({ questions });
  } catch (err) {
    console.error('interview-prep error:', err);
    return NextResponse.json({ error: 'Failed to generate interview prep' }, { status: 500 });
  }
}
