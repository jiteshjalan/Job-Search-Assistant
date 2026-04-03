import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Token persistence
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
// Cache helpers (jobs_cache.json — shared with other routes)
// ---------------------------------------------------------------------------

type CacheShape = {
  jobCache?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
};

const CACHE_PATH = path.join(process.cwd(), 'jobs_cache.json');

function readCache(): CacheShape {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function writeCache(cache: CacheShape): void {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// OAuth2 client factory
// ---------------------------------------------------------------------------

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
    scope: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/spreadsheets'],
    prompt: 'consent',
  });
}

// ---------------------------------------------------------------------------
// Email encoding — plain text or multipart/mixed with attachment
// ---------------------------------------------------------------------------

type Attachment = { filename: string; base64: string; mimeType: string };

function makeRawEmail(
  to: string,
  subject: string,
  body: string,
  attachment?: Attachment,
): string {
  let message: string;

  if (attachment) {
    const boundary = `jsa_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    message = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      body,
      '',
      `--${boundary}`,
      `Content-Type: ${attachment.mimeType}`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      '',
      // Split base64 into 76-char lines per RFC 2045
      (attachment.base64.match(/.{1,76}/g) ?? []).join('\r\n'),
      '',
      `--${boundary}--`,
    ].join('\r\n');
  } else {
    message = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
    ].join('\r\n');
  }

  return Buffer.from(message).toString('base64url');
}

// ---------------------------------------------------------------------------
// GET — OAuth initiation / callback  OR  read optimisedCV for a job
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get('code');
  const jobId = searchParams.get('jobId');

  // OAuth callback
  if (code) {
    const oauth2 = getOAuth2Client();
    const { tokens } = await oauth2.getToken(code);
    saveTokens(tokens as Record<string, string>);
    const appUrl = new URL('/', req.url);
    appUrl.searchParams.set('gmail', 'connected');
    return NextResponse.redirect(appUrl);
  }

  // Read cached optimisedCV for a specific job
  if (jobId) {
    const cache = readCache();
    const optimisedCV = (cache.jobCache?.[jobId]?.optimisedCV as string) ?? null;
    return NextResponse.json({ optimisedCV });
  }

  // Default: return auth URL
  return NextResponse.json({ authUrl: buildAuthUrl() });
}

// ---------------------------------------------------------------------------
// PATCH — save optimisedCV text to jobs_cache.json for a job
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest) {
  const { jobId, optimisedCV } = (await req.json()) as {
    jobId: string;
    optimisedCV: string;
  };

  if (!jobId || !optimisedCV) {
    return NextResponse.json(
      { error: 'Missing jobId or optimisedCV' },
      { status: 400 },
    );
  }

  const cache = readCache();
  if (!cache.jobCache) cache.jobCache = {};
  if (!cache.jobCache[jobId]) cache.jobCache[jobId] = {};
  cache.jobCache[jobId].optimisedCV = optimisedCV;
  writeCache(cache);

  return NextResponse.json({ success: true });
}

// ---------------------------------------------------------------------------
// POST — send email to multiple recipients with optional attachment
// ---------------------------------------------------------------------------

type SendResult = { address: string; success: boolean; error?: string };

export async function POST(req: NextRequest) {
  const { to, subject, body, attachment } = (await req.json()) as {
    to: string[];
    subject: string;
    body: string;
    attachment?: Attachment;
  };

  if (!to?.length || !subject || !body) {
    return NextResponse.json(
      { error: 'Missing required fields: to (array), subject, body' },
      { status: 400 },
    );
  }

  const tokens = loadTokens();
  if (!tokens?.refresh_token) {
    return NextResponse.json(
      { error: 'Gmail not connected', needsAuth: true, authUrl: buildAuthUrl() },
      { status: 401 },
    );
  }

  const oauth2 = getOAuth2Client();
  oauth2.setCredentials(tokens);
  oauth2.on('tokens', (refreshed) => {
    saveTokens({ ...tokens, ...refreshed } as Record<string, string>);
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2 });

  // Send to each address individually so we can report per-address results
  const settled = await Promise.allSettled(
    to.map(async (address) => {
      await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: makeRawEmail(address, subject, body, attachment) },
      });
      return address;
    }),
  );

  const results: SendResult[] = settled.map((r, i) => ({
    address: to[i],
    success: r.status === 'fulfilled',
    error:
      r.status === 'rejected'
        ? r.reason instanceof Error
          ? r.reason.message
          : String(r.reason)
        : undefined,
  }));

  const anySuccess = results.some((r) => r.success);
  const status = anySuccess ? 200 : 502;

  return NextResponse.json({ results }, { status });
}
