#!/usr/bin/env node
// Fail the build when rules.js and manifest.json drift apart.
//   - every rule site needs `*://<site>/*` and `*://*.<site>/*` in the
//     rules content script's matches (or a parent's wildcard), or the rule
//     never runs
//   - every matched domain needs a rule, or content.js is injected for nothing
//
// Usage: node check-rules.js   (package.sh runs this before building)

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const sandbox = {};
vm.runInNewContext(
  fs.readFileSync(path.join(dir, 'rules.js'), 'utf8') + '\nthis.AOC_RULES = AOC_RULES;',
  sandbox,
);
const rules = sandbox.AOC_RULES;

const block = manifest.content_scripts.find((cs) => cs.js.includes('content.js'));
const matches = new Set(block.matches);
const sites = new Set(rules.map((r) => r.site));
const errors = [];

// A parent's wildcard covers its subdomains, e.g. *.vic.gov.au runs slv.vic.gov.au.
const coveredByParent = (site) => site.split('.').some(
  (_, i, parts) => i > 0 && matches.has(`*://*.${parts.slice(i).join('.')}/*`),
);

for (const site of sites) {
  if (coveredByParent(site)) continue;
  for (const pattern of [`*://${site}/*`, `*://*.${site}/*`]) {
    if (!matches.has(pattern)) errors.push(`rule for ${site} has no manifest match ${pattern}`);
  }
}

for (const pattern of matches) {
  const domain = pattern.replace(/^\*:\/\/(\*\.)?/, '').replace(/\/\*$/, '');
  if (!sites.has(domain)) errors.push(`manifest match ${pattern} has no rule in rules.js`);
}

if (errors.length > 0) {
  for (const e of errors) console.error(e);
  process.exit(1);
}
console.log(`rules ok: ${sites.size} sites, ${matches.size} matches`);
