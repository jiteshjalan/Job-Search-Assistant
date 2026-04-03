import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Token store (shared with send-email route)
// ---------------------------------------------------------------------------

const TOKENS_PATH = path.join(process.cwd(), 'gmail_tokens.json');

function loadTokens(): Record<string, string> | null {
  try {
    return JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function saveTokens(tokens: Record<string, string>): void {
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// OAuth2
// ---------------------------------------------------------------------------

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/spreadsheets',
];

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

function buildAuthUrl(): string {
  return getOAuth2Client().generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

// ---------------------------------------------------------------------------
// Sheet constants
// Column order: A=Job ID  B=Company  C=Role  D=URL  E=Status  F=Score
//               G=Notes   H=Tracked At  I=Outreach Date  J=Applied Date
// ---------------------------------------------------------------------------

const SHEET   = 'Sheet1';
const RANGE   = `${SHEET}!A:J`;
const HEADERS = [
  'Job ID', 'Company', 'Role', 'URL', 'Status', 'Score',
  'Notes', 'Tracked At', 'Outreach Date', 'Applied Date',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDate(d: Date = new Date()): string {
  const dd  = String(d.getDate()).padStart(2, '0');
  const mon = MONTHS[d.getMonth()];
  return `${dd} ${mon} ${d.getFullYear()}`;
}

function slugify(company: string, title: string): string {
  return `${company} ${title}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function buildRow(
  id: string, company: string, title: string, url: string,
  status: string, score: string, notes: string, trackedAt: string,
  outreachDate: string, appliedDate: string,
): string[] {
  return [id, company, title, url, status, score, notes, trackedAt, outreachDate, appliedDate];
}

// ---------------------------------------------------------------------------
// POST — upsert a row in Sheet1
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const { jobId, company, title, url, status, score, notes } = (await req.json()) as {
      jobId?: string;
      company: string;
      title: string;
      url?: string;
      status?: string;
      score?: number | string;
      notes?: string;
    };

    if (!company || !title) {
      return NextResponse.json({ error: 'company and title are required' }, { status: 400 });
    }

    const tokens = loadTokens();
    if (!tokens?.refresh_token) {
      return NextResponse.json(
        { error: 'Google not connected', needsAuth: true, authUrl: buildAuthUrl() },
        { status: 401 },
      );
    }

    const oauth2 = getOAuth2Client();
    oauth2.setCredentials(tokens);
    oauth2.on('tokens', (refreshed) => {
      saveTokens({ ...tokens, ...refreshed } as Record<string, string>);
    });

    const sheets        = google.sheets({ version: 'v4', auth: oauth2 });
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
    const resolvedStatus = status ?? 'New';
    const scoreStr       = score != null && score !== '' ? String(score) : '';
    const trackedAt      = formatDate();
    const baseSlug       = slugify(company, title);

    const newOutreachDate = resolvedStatus === 'Outreach Sent' ? formatDate() : '';
    const newAppliedDate  = resolvedStatus === 'Applied'       ? formatDate() : '';

    // ------------------------------------------------------------------
    // Fetch column A once — used for header check + row lookup
    // ------------------------------------------------------------------
    const colAResp   = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SHEET}!A:A` });
    const colAValues = colAResp.data.values ?? [];

    // ------------------------------------------------------------------
    // Fix 1: Write header row if row 1 is empty
    // ------------------------------------------------------------------
    const row1 = colAValues[0]?.[0];
    if (!row1) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET}!A1:J1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADERS] },
      });
    }

    // ------------------------------------------------------------------
    // Fix 2: Look for existing row by slug (new format) or raw jobId
    //        (backward compat for rows written before this fix).
    //        Skip row 0 = header.
    // ------------------------------------------------------------------
    const existingRowIdx = colAValues.findIndex((r, i) => {
      if (i === 0) return false;
      return r[0] === baseSlug || (jobId && r[0] === jobId);
    });

    if (existingRowIdx >= 0) {
      // ----------------------------------------------------------------
      // Row exists — fetch current values to preserve date columns
      // ----------------------------------------------------------------
      const rowNum        = existingRowIdx + 1;
      const existingRange = `${SHEET}!A${rowNum}:J${rowNum}`;

      const existingResp = await sheets.spreadsheets.values.get({ spreadsheetId, range: existingRange });
      const existing     = existingResp.data.values?.[0] ?? [];

      const finalScore        = scoreStr        || (existing[5] as string | undefined) || '';
      const finalNotes        = notes           ?? (existing[6] as string | undefined) ?? '';
      const finalOutreachDate = newOutreachDate || (existing[8] as string | undefined) || '';
      const finalAppliedDate  = newAppliedDate  || (existing[9] as string | undefined) || '';

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: existingRange,
        valueInputOption: 'RAW',
        requestBody: {
          values: [buildRow(
            baseSlug, company, title, url ?? '', resolvedStatus,
            finalScore, finalNotes, trackedAt, finalOutreachDate, finalAppliedDate,
          )],
        },
      });

    } else {
      // ----------------------------------------------------------------
      // New row — find a unique slug (append -2, -3 if collision)
      // ----------------------------------------------------------------
      const existingSlugs = new Set(colAValues.slice(1).map(r => r[0] as string));
      let finalSlug = baseSlug;
      let n = 2;
      while (existingSlugs.has(finalSlug)) {
        finalSlug = `${baseSlug}-${n++}`;
      }

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: RANGE,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [buildRow(
            finalSlug, company, title, url ?? '', resolvedStatus,
            scoreStr, notes ?? '', trackedAt, newOutreachDate, newAppliedDate,
          )],
        },
      });
    }

    return NextResponse.json({ success: true, slug: baseSlug });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    if (
      msg.includes('insufficientPermissions') ||
      msg.includes('insufficient authentication scopes') ||
      msg.includes('Request had insufficient')
    ) {
      return NextResponse.json(
        { error: 'Google Sheets not authorised. Re-connect Google.', needsAuth: true, authUrl: buildAuthUrl() },
        { status: 401 },
      );
    }

    console.error('[track-application]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
