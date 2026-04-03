import 'dotenv/config';

const APOLLO_API_KEY = process.env.APOLLO_API_KEY;

if (!APOLLO_API_KEY) {
  console.error('ERROR: APOLLO_API_KEY is not set in .env.local');
  process.exit(1);
}

console.log('Apollo API Key found:', APOLLO_API_KEY.slice(0, 6) + '...' + APOLLO_API_KEY.slice(-4));
console.log('Making request to Apollo People Search...\n');

const body = {
  person_titles: ['CEO'],
  organization_domains: ['leena.ai'],
  page: 1,
  per_page: 3,
};

const res = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': APOLLO_API_KEY,
  },
  body: JSON.stringify(body),
});

console.log('Status:', res.status, res.statusText);
console.log('Headers:', Object.fromEntries(res.headers.entries()));
console.log('');

const text = await res.text();
let parsed;
try {
  parsed = JSON.parse(text);
  console.log('Response body (parsed JSON):');
  console.log(JSON.stringify(parsed, null, 2));
} catch {
  console.log('Response body (raw text):');
  console.log(text);
}
