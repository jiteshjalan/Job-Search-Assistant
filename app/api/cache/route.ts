import { NextRequest, NextResponse } from 'next/server';
import { invalidateJob, getCacheSummary } from '@/lib/jobs-cache';

/** GET /api/cache — returns a human-readable cache summary (for debugging). */
export async function GET() {
  return NextResponse.json(getCacheSummary());
}

/**
 * DELETE /api/cache?jobId=xxx
 * Wipes the score and contacts for a single job.
 * Called by the "Refresh" button on a job card.
 */
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json({ error: 'jobId query param is required' }, { status: 400 });
  }

  invalidateJob(jobId);
  return NextResponse.json({ ok: true, jobId });
}
