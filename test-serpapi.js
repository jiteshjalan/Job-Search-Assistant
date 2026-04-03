import 'dotenv/config';

// Copy of extractSearchQueries from route.ts for local testing
function extractSearchQueries(preferences) {
  const text = preferences.toLowerCase();
  const queries = [];
  const isAI     = /\bai\b|artificial intelligence|\bml\b|machine learning/.test(text);
  const isSaaS   = /\bsaas\b|software.as.a.service/.test(text);
  const isStartup = /startup|series [abcde]|early.stage|growth.stage|venture/.test(text);
  const sector   = isAI ? 'AI' : isSaaS ? 'SaaS' : isStartup ? 'startup' : '';

  if (/\beir\b|entrepreneur.in.residence/.test(text))
    queries.push(['Entrepreneur in Residence', sector].filter(Boolean).join(' '));
  if (/chief.of.staff/.test(text))
    queries.push(['Chief of Staff', sector || 'startup'].filter(Boolean).join(' '));
  if (/founder.?s?.office|founder.office/.test(text))
    queries.push(['Founder office', isSaaS ? 'SaaS' : 'startup'].filter(Boolean).join(' '));
  if (/\bstrategy\b|\bstrategic\b|operating partner|vp strategy/.test(text))
    queries.push(['Strategy', sector || 'startup'].filter(Boolean).join(' '));
  if (/head of product|vp product|product manager|\bpm\b|product lead/.test(text))
    queries.push(['Head of Product', sector].filter(Boolean).join(' '));
  if (/\bgtm\b|go.to.market|\bgrowth\b|vp marketing|head of growth/.test(text))
    queries.push(['GTM', sector || 'startup'].filter(Boolean).join(' '));
  if (/\bsales\b|\brevenue\b|vp sales|commercial/.test(text))
    queries.push(['VP Sales', sector].filter(Boolean).join(' '));
  if (/\bcto\b|head of engineering|vp engineering/.test(text))
    queries.push(['CTO', sector || 'startup'].filter(Boolean).join(' '));
  if (queries.length === 0)
    queries.push(preferences.trim().split(/\s+/).slice(0, 5).join(' '));

  return [...new Set(queries)].slice(0, 3);
}

const KEY = process.env.SERPAPI_KEY;

async function search(q) {
  const params = new URLSearchParams({
    engine: 'google_jobs', q, gl: 'in',
    location: 'Bangalore Karnataka India', hl: 'en', api_key: KEY,
  });
  const res = await fetch(`https://serpapi.com/search?${params}`);
  const data = await res.json();
  const jobs = data.jobs_results ?? [];
  console.log(`  "${q}" → ${jobs.length} results`);
  jobs.slice(0, 3).forEach((j, i) =>
    console.log(`    ${i+1}. "${j.title}" @ ${j.company_name}`)
  );
}

const payload = "I want an EIR or Chief of Staff role at a Series B SaaS company, most likely in the Founder's office, where the company is in a rapid growth phase and I am closer to the founders. The company should be in the AI space.";

console.log('Preferences:', payload);
const queries = extractSearchQueries(payload);
console.log('\nExtracted queries:', queries);
console.log('\nLive SerpApi results:');
for (const q of queries) await search(q);
