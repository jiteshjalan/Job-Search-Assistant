# Job Search Assistant

A job search platform that automates finding, scoring, and reaching out to relevant opportunities. Instead of spending 2-3 hours per company on manual work, I built a system that does it in minutes.

---

## The Problem

Job search is broken. For every opportunity I consider, I spend:
- 30-40 minutes manually finding and vetting opportunities
- 20 minutes drafting personalized outreach
- 15 minutes optimizing my CV for the role
- 10 minutes researching who to reach out to
- Days waiting for responses from cold applications

The real issue? Most people just apply and hope. They don't reach out. They don't find the actual decision-makers. They spray and pray.

**Here's what I learned**: Applying without warm outreach to the right person is a waste of time. Cold emailing someone random doesn't work. You need to:
1. Find the exact role that matches your product thinking and requirements
2. Identify the real person to reach out to
3. Send personalized outreach before (or instead of) applying
4. Have a tailored CV ready to send when they ask

This system solves that entire pipeline.

---

## What It Does

### On Day 1: Upload Once, System Understands You

1. Upload my CV (PDF or paste text)
2. Upload case studies (optional, up to 15 work samples)
3. System learns who I am: skills, experience, achievements, patterns
4. This becomes my "brain" — everything after this uses this context

### Then: Search, Score, Act

1. Enter what I'm looking for: "EIR or Chief of Staff at Series B SaaS in Bangalore with direct founder access"
2. System finds real job listings (40+ opportunities)
3. System scores each one against me (7 dimensions, tailored)
4. For each top role:
   - Builds a tailored CV in <1 minute (no manual changes needed)
   - Finds real people to reach out to (LinkedIn search)
   - Drafts personalized emails + LinkedIn messages
   - Sends emails via Gmail in one click
   - Tracks everything in a board

**What used to take 2-3 hours per company now takes 5 minutes.**

---

## Real Proof: How I Got This Assignment

This system isn't theoretical. I tested the approach on Leena AI EIR and got the assignment. Here's exactly what I did manually:

### The Manual Process (2-3 hours)

**Step 1: Research (30 min)**
- Found the role on LinkedIn
- Went to Leena AI website
- Figured out the reporting structure (reports to Chief Strategy Officer)

**Step 2: LinkedIn Outreach (1 hour)**
- Used Apollo.io to find relevant people at Leena AI
- Sent LinkedIn connection requests to 5+ employees
- Waited for acceptance (couple of days for responses)

**Step 3: Email Research (30 min)**
- Used Apollo.io extension to find email IDs
- Found the CSO's email
- Built a list of people to contact

**Step 4: CV Optimization (1.5 hours)**
- Spent 30-40 minutes in Claude optimizing my CV for the EIR role
- Made multiple passes to get it right
- Tailored sections specifically for this role

**Step 5: Cold Email (30 min)**
- Drafted personalized cold email to CSO in Claude
- Iterated on messaging
- Sent email

**Total time: 2-3 hours**
**Result: Got the assignment**

### What This Proves

I didn't get this by applying on LinkedIn. I got it because I:
1. **Found the right person** (CSO, not HR)
2. **Did personal research** (website, reporting structure)
3. **Optimized my CV** for the specific role
4. **Reached out directly** with a personalized cold email

The entire job search industry tells you to apply and wait. **That doesn't work.** Personal outreach to the right decision-maker does.

### Now Automated

This system does all of that manual work in 5 minutes:

| Manual Process | System |
|---|---|
| 30 min research | Automatic company analysis |
| 1 hour LinkedIn hunting | Finds 3 real contacts instantly |
| 30 min email research | Predicts email patterns |
| 1.5 hours CV optimization | <1 minute CV building |
| 30 min email drafting | Auto-drafts personalized email |
| Send manually | One-click Gmail send |
| **2-3 hours total** | **5 minutes total** |

---

## Why This Works: Not ATS Gaming

This system is NOT about gaming ATS with keywords. I'm not trying to "magically add the right words so I show up in search results." That's broken thinking.

Instead, I'm solving a different problem: **finding roles that genuinely match my requirements, my product thinking, my growth stage.**

Most job search tools try to optimize the job seeker to fit more roles. I'm doing the opposite — helping me find the exact roles I actually want, then making sure I reach out to the right person instead of hoping an application gets noticed.

---


## 5 Live External Systems

This system connects 5 external services, each with real read/write operations:

### System 1: Job Fetching (RapidAPI JSearch + SerpApi)
**What I do**: Search jobs across India
- Primary: RapidAPI JSearch API (fetches 20 jobs per query)
- Fallback: SerpApi Google Jobs (if RapidAPI is down)
- Searches 2 locations: Bangalore + Gurugram for coverage
- Deduplicates & caches results (24 hours)
- Handles failures gracefully (if one API fails, other takes over)

### System 2: AI Scoring & Content Generation (Google Gemini)
**What I do**: Everything AI-related happens here
- **Scores jobs**: 7 dimensions (functional fit, capability signals, requirement match, archetype fit, environment match, trajectory narrative, strategic alignment)
- **Builds tailored CVs**:
  - Gap analysis (what's missing?)
  - Case study selection (which of my work samples best address the gaps?)
  - Section-by-section optimization (original vs optimized for this role)
  - All done in <1 minute (manually this would take 40-50 minutes with two different AI prompts)
  - Cached per job (never regenerated unless you force refresh)
- **Finds contacts**: Predicts email domains + email patterns
- **Drafts outreach**: Email templates, LinkedIn connection requests, follow-ups
- **Interview prep**:
  - Tailored interview questions (10-15 per role based on scoring gaps)
  - STAR method talking points for your key experiences
  - Addresses how to handle gaps they'll likely ask about
  - Real product case studies for practice (phase 2)
- **Model fallback**: Uses Gemma 4b → Gemma 12b → Gemini Flash (if one fails, tries next)

### System 3: Email Sending (Gmail API)
**What I do**: Send personalized outreach emails
- OAuth2 authentication (token persisted + auto-refreshed)
- Send emails directly from my Gmail inbox
- Track sent emails (timestamp, recipient, subject)
- One-click sending from the Outreach panel
- No manual email client needed

### System 4: Application Tracking (Google Sheets + OAuth2)
**What I do**: Persist application pipeline
- Columns: Job ID | Company | Role | URL | Status | Score | Notes | Tracked At | Outreach Date | Applied Date
- Updates automatically when I:
  - Search for jobs
  - Send outreach
  - Move jobs in the Kanban board
- Survives browser refresh (no data loss)
- Real audit trail of everything I've done

### System 5: LinkedIn Contact Search (SerpApi Web Search)
**What I do**: Find real people to reach out to
- Searches LinkedIn profiles (site:linkedin.com/in filtering)
- Extracts real names from LinkedIn page titles
- Predicts email addresses (firstname@domain, firstname.lastname@domain, f.lastname@domain)
- Finds 3 people per job (Strategy/Leadership + HR/Recruiter role-based search)

---

## How I Built It: Architecture Walkthrough

### The Flow (Visual)

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER SETUP (Day 1)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Upload CV (PDF/text) + Case Studies (optional 1-15 PDFs)       │
│              ↓                                                    │
│  System learns: Your skills, experience, patterns               │
│  (This becomes the "context" for everything after)              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     SEARCH & DISCOVERY                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Enter search: "EIR or Chief of Staff at Series B SaaS"         │
│              ↓                                                    │
│  Extract search queries + detect company/location               │
│              ↓                                                    │
│  Fetch jobs from RapidAPI JSearch (primary)                     │
│              ↓ (if fails)                                        │
│  Fallback to SerpApi Google Jobs                                │
│              ↓                                                    │
│  Deduplicate + Cache (40+ jobs)                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    SCORING (Gemini Powered)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  For each job, send to Gemini:                                  │
│  - Your CV + context                                            │
│  - Your preferences                                             │
│  - Job description                                              │
│              ↓                                                    │
│  Gemini scores 7 dimensions (0-100 each)                        │
│  + applies penalties (age, education, requirements)             │
│              ↓                                                    │
│  Composite score calculated                                     │
│  Cache result (versioned, never changes unless you bump)        │
│              ↓                                                    │
│  Results sorted by score → Top 3 visible                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│               CV OPTIMIZATION (Per Role)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Click "CV" on a job card                                       │
│              ↓                                                    │
│  If cached: Show instantly                                      │
│  If not cached:                                                 │
│    1. Gemini does gap analysis                                  │
│    2. Selects best case study                                   │
│    3. Optimizes each CV section                                 │
│    4. Cache result                                              │
│              ↓                                                    │
│  See original vs optimized (side-by-side)                       │
│  Copy optimized version to send                                 │
│  Time: <1 minute (40-50 minutes if manual)                      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              CONTACT FINDING & OUTREACH                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Click "Outreach" on a job card                                 │
│              ↓                                                    │
│  SerpApi finds 3 real LinkedIn profiles:                        │
│  - Strategy/Leadership person                                   │
│  - Senior Leadership person                                     │
│  - HR/Recruiter                                                 │
│              ↓                                                    │
│  For each person:                                               │
│    - Extract real name from LinkedIn                            │
│    - Predict 3 email patterns (firstname@, firstname.lastname@) │
│    - Gemini drafts personalized email                           │
│    - Gemini drafts LinkedIn connection request                  │
│              ↓                                                    │
│  You choose template (warm, cold hiring manager, cold peer)     │
│  Edit email if needed                                           │
│  Click "Send"                                                   │
│              ↓                                                    │
│  Gmail API sends email                                          │
│  Google Sheets auto-updates status                              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   TRACKING & FOLLOW-UP                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Drag job to "Outreach Sent" column in Kanban                  │
│              ↓                                                    │
│  Auto-synced to Google Sheets                                   │
│  Tracks: timestamp, score, status, company, role               │
│              ↓                                                    │
│  Persists in browser (localStorage)                             │
│  Shows up next time you open dashboard                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Why This Matters: The Outreach Problem

Here's what I realized while building this:

**Applying alone doesn't work.** Recruiters get 200+ applications per role. Your application gets lost.

**But reaching out to the right person changes the game.**

The problem is: How do I find the right person to reach out to? Most people either:
1. Don't reach out at all (just apply)
2. Reach out to random people (spray and pray, 0% success rate)
3. Spend hours researching LinkedIn to find one person (not scalable)

This system automates finding the right people + drafting personalized outreach + sending it.

The difference? Instead of hoping my application gets noticed, I'm directly in conversations with hiring managers, founders, PMs before the formal process.

---

## What's Built (Features)

### Dashboard
- **Left panel**: Kanban board (Outreach Sent → Applied → Interviewing → Offer → Rejected)
- **Center panel**: Search input + real-time progress
- **Right panel**: Top 3 highest-scoring roles + full job universe

### Per Job: 4 Views
1. **Score Breakdown**: All 7 dimensions, penalties, confidence levels, improvements
2. **Optimized CV**: Gap analysis → section-by-section optimization
3. **Outreach**: Find contacts → edit email → send + follow-ups
4. **Interview Prep**: Tailored interview questions + STAR method talking points
   - Role-specific questions they'll likely ask
   - Your gaps identified in scoring → how to address them
   - STAR method answers for your key experiences
   - Preparation materials ready to study

### Application Tracking
- Kanban board (local + Google Sheets synced)
- Timestamps for each action (outreach sent, applied, interviewing, offer, rejected)
- Score persisted for each application
- Survives browser refresh

---

## 7-Dimension Scoring Model

Each job scored on these dimensions (0-100 each):

| Dimension | Weight | What I Measure |
|-----------|--------|-----------------|
| Functional Fit | 25% | Can I actually do this job? |
| Capability Signals | 20% | Do I have real execution experience? |
| Requirement Match | 15% | Do my skills match the stated requirements? |
| Archetype Fit | 15% | Is my profile type right for this? |
| Environment Match | 10% | Is the company stage/complexity suited to me? |
| Trajectory Narrative | 10% | Does this role make sense in my career? |
| Strategic Alignment | 5% | Is this strategically aligned with my goals? |

**Penalties applied**:
- Experience penalty: -0 to -20 (if underqualified)
- Mandatory requirements: -0 to -20 (non-negotiable blockers)
- Aging penalty: -5 (if posting >30 days old)
- Education penalty: -0 to -10 (only for required credentials, not preferred)

**Hard disqualifiers** (score = 0):
- Requires government security clearance
- Explicitly junior/entry-level (0-2 years)
- Non-negotiable professional credential requirement

---

## Example: Why Leena AI EIR Scores ~78/100

Composite score: 78/100 (typically top 3-5 roles)

- Functional Fit (70/100): Direct GTM execution, pricing strategy, growth operations
- Capability Signals (65/100): Scaled from $3M to $15M ARR, PQL frameworks, forecasting
- Requirement Match (60/100): Few specific requirements listed (typical for EIR roles)
- Archetype Fit (75/100): Direct founder team access (strong signal)
- Environment Match (80/100): Series B, post-PMF, enterprise B2B, growth-stage
- Trajectory Narrative (70/100): Natural career progression
- Strategic Alignment (60/100): Aligned with my growth goals

---

## Tech Stack

**Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS, dnd-kit (drag-and-drop)

**Backend**: Next.js API Routes, file system caching

**External APIs**:
- RapidAPI (JSearch job listings)
- SerpApi (Google Jobs + LinkedIn search)
- Google Gemini (scoring, CV building, outreach generation)
- Gmail API (send emails)
- Google Sheets API (application tracking)

**Storage**: localStorage (dashboard state) + file system (jobs cache + tokens)

---

## Getting Started

### Prerequisites
- Node.js 18+
- Gmail account + Gmail API credentials (OAuth2)
- Google Sheets (for tracking)
- Google Gemini API key
- RapidAPI key + JSearch
- SerpApi key

### Setup

1. Clone repo
```bash
git clone <your-repo>
cd job-search-assistant
npm install
```

2. Create `.env.local`
```env
RAPIDAPI_KEY=your_key
SERPAPI_KEY=your_key
GEMINI_API_KEY=your_key
GOOGLE_CLIENT_ID=your_oauth_id
GOOGLE_CLIENT_SECRET=your_oauth_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback
GOOGLE_SHEETS_ID=your_sheet_id
```

3. Start dev server
```bash
npm run dev
```

4. Open http://localhost:3000

---

## How to Use

### Walkthrough (10 minutes)

**Step 1**: Upload CV + case studies (1 min)
- System learns who I am

**Step 2**: Search (30 sec)
- "EIR role at Series B SaaS in Bangalore"
- Fetches 40+ jobs, scores all

**Step 3**: Review top 3 roles (2 min)
- See scores + signals
- Click "View All" for full universe

**Step 4**: Personalize & outreach (3 min)
- Click "Outreach" on a job
- Finds 3 real people to contact
- Edit email, click send
- Gmail + Google Sheets auto-updated

**Step 5**: Optimize CV (1 min)
- Click "CV" on job card
- See gap analysis + optimized sections
- Copy to send with application

**Step 6**: Interview prep (1 min)
- Tailored interview questions (what they'll likely ask)
- STAR method talking points for your experiences
- How to address identified gaps from scoring
- Practice with real product case studies
- Ready to prepare before your call

**Step 7**: Track (ongoing)
- Drag jobs in Kanban as status changes
- Auto-syncs everything

---

## API Endpoints (What Powers It)

```
POST /api/fetch-jobs
  Input: { preferences: "search query" }
  Output: 40+ jobs from RapidAPI/SerpApi

POST /api/score-all-jobs
  Input: { jobs, cvText, preferences }
  Output: Scored jobs ranked by composite score

POST /api/build-cv
  Input: { jobId, jobTitle, company, jobDescription, cvText }
  Output: Gap analysis + optimized CV sections

POST /api/find-contacts
  Input: { company, jobTitle, cvText }
  Output: 3 contacts + predicted emails + draft outreach

POST /api/send-email
  Input: { to, subject, body }
  Output: Email sent via Gmail API

POST /api/track-application
  Input: { jobId, company, title, status, score }
  Output: Row added/updated in Google Sheets

POST /api/interview-prep
  Input: { company, jobTitle, cvText }
  Output: STAR method talking points
```

---

## Performance & Caching

- **Query cache**: 24 hours (job listings per search)
- **Score cache**: Versioned (bump version to invalidate all)
- **Contact cache**: Per job (never invalidates)
- **CV cache**: Per job (never invalidates)
- **Rate limiting**: 15 seconds between Gemini calls
- **Model fallback**: Tries 3 models (Gemma 4b → Gemma 12b → Gemini Flash)
- **Retry logic**: 3 attempts per model with exponential backoff

CV optimization: <1 minute (vs 40-50 minutes manual prompting)

---

## Project Structure

```
job-search-assistant/
├── app/
│   ├── api/
│   │   ├── fetch-jobs/              # RapidAPI + SerpApi
│   │   ├── score-all-jobs/          # Gemini scoring
│   │   ├── build-cv/                # CV optimization
│   │   ├── find-contacts/           # LinkedIn search
│   │   ├── send-email/              # Gmail API
│   │   ├── track-application/       # Google Sheets
│   │   └── interview-prep/          # STAR method
│   ├── page.tsx                     # Setup screen
│   ├── dashboard/page.tsx           # Main dashboard
│   └── layout.tsx
├── components/
│   ├── ProfilePanel.tsx
│   ├── SearchCenter.tsx
│   ├── JobUniversePanel.tsx
│   ├── OutreachPanel.tsx
│   ├── JobDrawer.tsx
│   ├── KanbanBoard.tsx
│   └── ...
├── lib/
│   ├── types.ts
│   ├── jobs-cache.ts
│   └── rate-limiter.ts
└── .env.local
```

---

## Key Metrics

- 5 external systems (RapidAPI, SerpApi, Gemini, Gmail, Google Sheets)
- 3+ actions per job (score, build CV, find contacts, send email, track)
- 7 scoring dimensions + penalties system
- <1 minute CV optimization (40-50 mins manual)
- 3 real contacts found per job
- 3 email patterns per contact
- 24+ hour cache layers
- 3-model fallback chain

---

## What's Next

- LinkedIn automation (auto-send connection requests)
- Email campaign tracking (opens, clicks, replies)
- Salary negotiation toolkit
- Company research automation
- Interview transcript analysis
- Cover letter generation

---

## Roadmap: What's Next

### Phase 1: Smarter Outreach via LinkedIn Network

**LinkedIn Network Integration**
- Upload my LinkedIn connections list (contacts.csv)
- For each job scored, system shows:
  - How many mutual connections I have
  - Warm path priority (direct connections to key people)
  - Auto-calculate "warmth score" alongside job fit score
- This means jobs with high fit + high warmth get top priority
- Speed up cold outreach by leveraging warm paths first

**Impact**: Instead of guessing who to contact, I reach out through people I already know first.

---

### Phase 2: AI-Powered Interview Preparation

**Personalized Interview Questions**
- Gemini analyzes the 7-dimension scoring to predict:
  - What questions they'll ask about my gaps
  - How to position my strengths
  - Role-specific scenarios they care about
- Generates 10-15 likely interview questions per role
- Not generic questions — tailored to this exact job

**Drag-and-Drop Interview Prep**
- Visual interface to customize prep materials
- Drag gaps → see suggested talking points
- Link experiences to questions
- See what to study before the call

**Real Interview Case Studies**
- Fetch 2-3 real product case studies relevant to the role
- Product sense questions? See examples from the industry
- Strategy scenarios? Study real case studies from similar companies
- Practice with real-world problems instead of generic examples

**Impact**: Go into interviews overprepared, knowing exactly what they'll ask and how your experience addresses it.

---

### Phase 3: Smart Application Workflow

**Multi-Channel Campaign**
- One job can trigger multiple actions:
  - Warm connection request (LinkedIn)
  - Cold email (Gmail)
  - Referral through mutual connection (if available)
  - Direct application (LinkedIn)
- Track all channels in one place
- Measure which channel converts best

**Follow-Up Automation**
- Schedule follow-ups automatically:
  - Day 3: If no LinkedIn connection accepted, send email
  - Day 6: LinkedIn message follow-up
  - Day 8: Email follow-up
- Manual trigger for quick follow-ups
- Track response rates per channel

**Impact**: Systematic follow-up instead of hoping people respond.

---

### Phase 4: Closing the Loop

**Offer Tracking**
- From "Offer" column → track offer details:
  - Compensation (base, equity, bonus)
  - Title offered vs. position
  - Team structure
  - Growth opportunities
- Compare offers side-by-side
- Quick pro/con analysis per offer

**Negotiation Toolkit**
- Show market data for similar roles
- Suggest counter-offer ranges
- Track accepted vs. negotiated terms
- Learn what worked for similar roles

---

## Why This Approach

I'm not optimizing my CV to game ATS systems. I'm not trying to magically add keywords so algorithms pick me.

I'm solving a real problem: **Finding roles that genuinely match what I want, then reaching out to the right person instead of hoping.**

Most job search tools optimize the job seeker to fit more roles. I'm doing the opposite — helping me find the exact roles I actually want, then making sure I reach out personally.
