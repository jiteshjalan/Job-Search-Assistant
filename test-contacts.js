import 'dotenv/config';

const KEY = process.env.SERPAPI_KEY;

async function search(label, q) {
  const params = new URLSearchParams({
    engine: 'google',
    q,
    gl: 'in',
    hl: 'en',
    num: '5',
    api_key: KEY,
  });
  const res = await fetch(`https://serpapi.com/search?${params}`);
  const data = await res.json();
  const results = data.organic_results ?? [];
  console.log(`\n[${label}]`);
  console.log(`  query: "${q}" → ${results.length} results`);
  results.slice(0, 5).forEach((r, i) => {
    console.log(`  ${i+1}. title: "${r.title}"`);
    console.log(`     link:  ${r.link}`);
    console.log(`     snippet: ${(r.snippet ?? '').slice(0, 100)}`);
  });
}

const company = 'Upgrad';

// Current approach (broken — no real names)
await search('CURRENT: generic role search', `"VP Strategy" "${company}"`);
await search('CURRENT: Chief of Staff', `"Chief of Staff" "${company}"`);

// Fixed approach — search LinkedIn via Google
await search('FIXED: LinkedIn site search VP Strategy', `site:linkedin.com/in "VP" "Strategy" "${company}"`);
await search('FIXED: LinkedIn site search Chief of Staff', `site:linkedin.com/in "Chief of Staff" "${company}"`);
await search('FIXED: LinkedIn site search HR recruiter', `site:linkedin.com/in "recruiter" OR "talent" "${company}"`);

// Even simpler LinkedIn search
await search('FIXED: Simple LinkedIn search', `site:linkedin.com/in "${company}" strategy OR "chief of staff"`);
