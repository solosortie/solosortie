#!/usr/bin/env node
// Writes your Supabase details into both config files.
//   node configure.mjs <supabase-url> <anon-key> [public-site-url]
// Example:
//   node configure.mjs https://abcd1234.supabase.co eyJhbGciOi... https://solosortie.com
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const [url, key, site = ''] = process.argv.slice(2);
if (!/^https?:\/\/.+/.test(url || '') || !key || key.length < 20) {
  console.error('Usage: node configure.mjs <supabase-url> <anon-key> [public-site-url]');
  process.exit(1);
}
const root = dirname(fileURLToPath(import.meta.url));
const q = (s) => JSON.stringify(String(s).replace(/\/$/, ''));

writeFileSync(join(root, 'site/js/config.js'),
`/* Supabase project URL and anon key (Project Settings → API).
   The anon key is public by design; the database rules are what protect your data. */
window.SS_CONFIG = {
  SUPABASE_URL: ${q(url)},
  SUPABASE_ANON_KEY: ${q(key)}
};
`);
writeFileSync(join(root, 'dashboard/js/config.js'),
`/* Supabase project URL and anon key (Project Settings → API).
   SITE_URL is your public site's address, used for "View" links. No trailing slash. */
window.SS_CONFIG = {
  SUPABASE_URL: ${q(url)},
  SUPABASE_ANON_KEY: ${q(key)},
  SITE_URL: ${q(site)}
};
`);
console.log('Wrote site/js/config.js and dashboard/js/config.js');
