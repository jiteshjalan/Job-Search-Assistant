import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getCachedContacts, setCachedContacts } from '@/lib/jobs-cache';

// Re-export Contact so existing imports from this path keep working
export type { Contact } from '@/lib/types';
import type { Contact } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchResult {
  title: string;
  link: string;
  snippet?: string;
}

interface RawPerson {
  name: string;
  inferredTitle: string;
  linkedinUrl: string;
}

// ─── Search queries ───────────────────────────────────────────────────────────
// Each query uses site:linkedin.com/in so SerpApi returns LinkedIn profile pages.
// LinkedIn page titles are always "Firstname Lastname - Title at Company | LinkedIn"
// which gives us reliable real-name extraction.

function getSearchQueries(jobTitle: string, company: string): string[] {
  const t = jobTitle.toLowerCase();
  const isEirStrategy =
    /eir|entrepreneur.in.residence|chief.of.staff|strategy|strategic|founder.?s?.office|operating/.test(t);
  const isProduct =
    /head.of.product|vp.product|product.manager|\bpm\b|program.manager/.test(t);

  const q = (role: string) => `site:linkedin.com/in "${role}" "${company}"`;

  if (isEirStrategy) {
    return [
      q('Chief of Staff'),
      q('VP Strategy'),
      q('talent acquisition'),
    ];
  }
  if (isProduct) {
    return [
      q('Head of Product'),
      q('Product Manager'),
      q('talent acquisition'),
    ];
  }
  // GTM / growth / marketing default
  return [
    q('Head of Growth'),
    q('VP Marketing'),
    q('talent acquisition'),
  ];
}

// Role labels shown in the UI per search slot
const ROLE_LABELS = ['Strategy / Leadership', 'Senior Leadership', 'HR / Recruiter'];

// ─── Name extraction from LinkedIn page titles ────────────────────────────────

function extractNameFromLinkedIn(title: string, url: string): string {
  // LinkedIn title format: "Firstname Lastname - Title at Company | LinkedIn"
  // or "Firstname Lastname - Title | LinkedIn"
  const cleaned = title
    .replace(/\s*\|\s*LinkedIn\s*$/i, '')  // strip trailing "| LinkedIn"
    .trim();

  // Everything before the first  –  -  —  |
  const beforeDash = cleaned.match(/^(.+?)\s*[-–—|]/);
  if (beforeDash) {
    const candidate = beforeDash[1].trim();
    // Must look like a name: 2-4 words, letters only (allow unicode for Indian names)
    if (/^[\p{L}]+(?: [\p{L}]+){1,3}$/u.test(candidate) && candidate.length >= 4) {
      return candidate;
    }
  }

  // Fallback: derive from LinkedIn URL slug
  // Format: linkedin.com/in/firstname-lastname-optionalid
  const slug = url.match(/linkedin\.com\/in\/([^/?#]+)/)?.[1];
  if (slug) {
    const parts = slug
      .split('-')
      .filter(p => p.length >= 2 && p.length <= 15 && /^[a-z]+$/i.test(p))
      .slice(0, 2);
    if (parts.length >= 2) {
      return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    }
  }

  return '';
}

function extractTitleFromLinkedIn(title: string, snippet: string): string {
  // After the name dash: "Name - THIS PART at Company | LinkedIn"
  const cleaned = title.replace(/\s*\|\s*LinkedIn\s*$/i, '').trim();
  const afterDash = cleaned.match(/[-–—]\s*(.+?)(?:\s+at\s+|\s*$)/i);
  if (afterDash?.[1]) return afterDash[1].trim().slice(0, 80);

  // Fall back to first line of snippet
  if (snippet) {
    const firstLine = snippet.split(/[.\n]/)[0].trim();
    if (firstLine.length > 5 && firstLine.length < 100) return firstLine;
  }
  return '';
}

// ─── SerpApi web search (primary) ────────────────────────────────────────────

async function serpSearch(query: string): Promise<SearchResult[]> {
  const key = process.env.SERPAPI_KEY;
  if (!key) return [];
  const params = new URLSearchParams({
    engine: 'google',
    q: query,
    gl: 'in',
    hl: 'en',
    num: '5',
    api_key: key,
  });
  try {
    const res = await fetch(`https://serpapi.com/search?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.organic_results ?? []).slice(0, 5).map(
      (r: { title?: string; link?: string; snippet?: string }) => ({
        title: r.title ?? '',
        link: r.link ?? '',
        snippet: r.snippet ?? '',
      })
    );
  } catch {
    return [];
  }
}

// ─── Serper web search (fallback) ────────────────────────────────────────────

async function serperSearch(query: string): Promise<SearchResult[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
      body: JSON.stringify({ q: query, gl: 'in', num: 5 }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.organic ?? []).slice(0, 5).map(
      (r: { title?: string; link?: string; snippet?: string }) => ({
        title: r.title ?? '',
        link: r.link ?? '',
        snippet: r.snippet ?? '',
      })
    );
  } catch {
    return [];
  }
}

async function searchWithFallback(query: string): Promise<SearchResult[]> {
  const primary = await serpSearch(query);
  if (primary.length > 0) return primary;
  console.log(`[find-contacts] SerpApi 0 results for "${query}" — trying Serper`);
  return serperSearch(query);
}

// ─── Extract best person from a result set ───────────────────────────────────

function extractPerson(results: SearchResult[], roleLabel: string, idx: number): RawPerson {
  // Only consider LinkedIn profile pages
  const liResults = results.filter(r => r.link?.includes('linkedin.com/in/'));

  for (const r of liResults) {
    const name = extractNameFromLinkedIn(r.title ?? '', r.link ?? '');
    if (name && name !== 'Unknown') {
      const inferredTitle = extractTitleFromLinkedIn(r.title ?? '', r.snippet ?? '') || roleLabel;
      console.log(`[find-contacts] Found: "${name}" (${inferredTitle}) @ ${r.link}`);
      return { name, inferredTitle, linkedinUrl: r.link };
    }
  }

  console.warn(`[find-contacts] No named LinkedIn result for slot ${idx} ("${roleLabel}")`);
  return { name: '', inferredTitle: roleLabel, linkedinUrl: '' };
}

// ─── Gemma helpers ────────────────────────────────────────────────────────────

const MODEL_CHAIN = ['gemma-3-4b-it', 'gemma-3-12b-it', 'gemini-2.0-flash-lite'];

function extractJSON(raw: string): string {
  const cleaned = raw
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) return cleaned.slice(start, end + 1);
  return cleaned;
}

async function callWithFallback(genAI: GoogleGenerativeAI, prompt: string): Promise<string> {
  for (const modelName of MODEL_CHAIN) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      console.log(`[find-contacts] Used model: ${modelName}`);
      return result.response.text();
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 429 || status === 404 || status === 503) {
        console.warn(`[find-contacts] ${modelName} failed (${status}), trying next`);
        continue;
      }
      throw err;
    }
  }
  throw new Error('All models failed');
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { company, jobTitle, cvText, jobId } = await req.json();

    // ── Contacts cache check — must be first, before any other work ──────────
    if (jobId) {
      const cached = getCachedContacts(jobId);
      if (cached) {
        console.log(`[find-contacts] Cache hit: ${cached.length} contacts for job ${jobId}`);
        return NextResponse.json({ contacts: cached, fromCache: true });
      }
    }

    if (!company || !jobTitle || !cvText) {
      return NextResponse.json({ error: 'company, jobTitle, and cvText are required' }, { status: 400 });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });

    const genAI = new GoogleGenerativeAI(geminiKey);

    // ── Step 1: LinkedIn profile search via SerpApi ───────────────────────────
    const queries = getSearchQueries(jobTitle, company);
    console.log('[find-contacts] Queries:', queries);

    const resultSets = await Promise.all(queries.map(q => searchWithFallback(q)));

    // ── Step 2: Extract real person per search slot ───────────────────────────
    const people: RawPerson[] = queries.map((_, i) =>
      extractPerson(resultSets[i], ROLE_LABELS[i] ?? `Contact ${i + 1}`, i)
    );

    // Filter out slots where we found no name
    const validPeople = people.filter(p => p.name !== '');
    console.log('[find-contacts] Valid people:', validPeople.map(p => p.name));

    if (validPeople.length === 0) {
      return NextResponse.json({
        contacts: [],
        message: 'No contacts found via LinkedIn search for this company. Try a more well-known company name.',
      });
    }

    // ── Step 3: Gemma — predict domain + draft all outreach ──────────────────
    const peopleList = validPeople
      .map((p, i) => `Person ${i + 1}: ${p.name} — ${p.inferredTitle}`)
      .join('\n');

    const prompt = `You are a professional outreach assistant helping a job applicant send personalised outreach.

Company they are applying to: ${company}
Job role: ${jobTitle}

Applicant CV summary (first 1000 chars):
${cvText.slice(0, 1000)}

Real people found at ${company} via LinkedIn:
${peopleList}

Your tasks:

1. Predict the most likely email domain for ${company}. Return just the domain string (e.g. "upgrad.com" or "leena.ai"). Look at the company name carefully — AI companies often use .ai domains.

2. For each person, generate exactly 3 email address predictions using their real first and last name:
   - firstname@domain (just first name)
   - firstname.lastname@domain (full name with dot)
   - f.lastname@domain (first initial + dot + last name)
   Use only their actual first and last name — do NOT use their job title or role name.

3. For each person, write:
   a) A cold email under 100 words. Subject line + body. Be specific to their role at ${company} and the applicant's background. End with one clear ask.
   b) A LinkedIn connection request under 300 characters. Must NOT start with "I saw your profile". Reference their specific role and why you want to connect.
   c) A 2-sentence follow-up message for Day 6 if no reply.

Output ONLY valid JSON, starting with { and ending with }. No text before or after.

{
  "domain": "company.com",
  "contacts": [
    {
      "predictedEmails": ["firstname@domain", "firstname.lastname@domain", "f.lastname@domain"],
      "emailSubject": "...",
      "emailBody": "...",
      "linkedinConnectionRequest": "...",
      "linkedinFollowUp": "..."
    }
  ]
}`;

    const raw = await callWithFallback(genAI, prompt);
    const parsed = JSON.parse(extractJSON(raw));
    const domain: string = parsed.domain ?? `${company.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;

    // ── Step 4: Assemble Contact objects ──────────────────────────────────────
    const contacts: Contact[] = validPeople.map((person, idx) => {
      const draft = parsed.contacts?.[idx] ?? {};

      // Validate predicted emails — reject any that contain the role title instead of a real name
      const rawEmails: string[] = Array.isArray(draft.predictedEmails) ? draft.predictedEmails : [];
      const nameWords = person.name.toLowerCase().split(/\s+/);
      const validEmails = rawEmails.filter(email => {
        const local = email.split('@')[0]?.toLowerCase() ?? '';
        // Email must contain at least part of the person's actual name
        return nameWords.some(word => word.length > 2 && local.includes(word));
      });

      // If Gemma's emails failed validation, derive them ourselves from the real name
      const firstName = nameWords[0] ?? '';
      const lastName = nameWords[nameWords.length - 1] ?? '';
      const firstInitial = firstName[0] ?? '';
      const fallbackEmails = [
        `${firstName}@${domain}`,
        `${firstName}.${lastName}@${domain}`,
        `${firstInitial}.${lastName}@${domain}`,
      ];

      const finalEmails = validEmails.length >= 2 ? validEmails : fallbackEmails;

      let linkedinRequest = draft.linkedinConnectionRequest ?? '';
      if (linkedinRequest.length > 300) linkedinRequest = linkedinRequest.slice(0, 297) + '...';

      return {
        id: `contact-${idx}`,
        name: person.name,
        title: person.inferredTitle,
        linkedinUrl: person.linkedinUrl,
        predictedEmails: finalEmails,
        emailNote: 'Email predicted from common patterns — verify before sending',
        draftEmail: {
          subject: draft.emailSubject ?? `${jobTitle} at ${company}`,
          body: draft.emailBody ?? '',
        },
        linkedinConnectionRequest: linkedinRequest,
        linkedinFollowUp1: draft.linkedinFollowUp ?? '',
        linkedinFollowUp2: `Hi ${person.name.split(' ')[0]}, following up on my earlier message about the ${jobTitle} role at ${company}. Would love to connect if you have a moment.`,
      };
    });

    // ── Step 5: Persist to cache ──────────────────────────────────────────────
    if (jobId && contacts.length > 0) {
      setCachedContacts(jobId, contacts);
    }

    return NextResponse.json({ contacts, fromCache: false });
  } catch (err) {
    console.error('[find-contacts] Error:', err);
    return NextResponse.json({ error: 'Failed to find contacts' }, { status: 500 });
  }
}
