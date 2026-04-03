import { NextRequest, NextResponse } from 'next/server';

// STUB: Google Sheets integration
// To activate: add GOOGLE_SHEET_ID and GOOGLE_SERVICE_ACCOUNT_KEY to .env.local
// and implement the googleapis write below.

export async function POST(req: NextRequest) {
  try {
    const { jobId, company, title, url, status, notes } = await req.json();

    if (!company || !title) {
      return NextResponse.json({ error: 'company and title are required' }, { status: 400 });
    }

    const row = {
      jobId,
      company,
      title,
      url,
      status: status ?? 'Applied',
      notes: notes ?? '',
      trackedAt: new Date().toISOString(),
    };

    // TODO: Replace console.log with actual Google Sheets write
    // const auth = new google.auth.GoogleAuth({ ... });
    // const sheets = google.sheets({ version: 'v4', auth });
    // await sheets.spreadsheets.values.append({ ... });
    console.log('[track-application STUB] Would write to Google Sheet:', row);

    return NextResponse.json({ success: true, row });
  } catch (err) {
    console.error('track-application error:', err);
    return NextResponse.json({ error: 'Failed to track application' }, { status: 500 });
  }
}
