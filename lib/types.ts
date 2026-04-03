// ─── Shared type definitions ──────────────────────────────────────────────────
// Single source of truth for types used across API routes and the cache layer.
// Route files re-export from here for backward-compat with existing imports.

export interface RawJob {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  source: 'serpapi' | 'serper' | 'hardcoded';
  postedAt?: string;
}

export interface DimensionScore {
  score: number; // 0–100
  weight: number;
  rationale: string;
  improvements: string[];
}

export interface ScoredJob extends RawJob {
  compositeScore: number;
  dimensions: {
    roleProfileFit: DimensionScore;
    companyStageTrajectory: DimensionScore;
    networkProximity: DimensionScore;
    outreachROI: DimensionScore;
  };
  topSignals: string[];
  topGaps: string[];
  warmPath: 'strong' | 'moderate' | 'cold';
  excludedFactors: {
    salary: string;
    location: string;
    atsKeywords: string;
    titleMatching: string;
  };
}

export interface Contact {
  id: string;
  name: string;
  title: string;
  linkedinUrl: string;
  predictedEmails: string[];
  emailNote: string;
  draftEmail: { subject: string; body: string };
  linkedinConnectionRequest: string;
  linkedinFollowUp1: string;
  linkedinFollowUp2: string;
}
