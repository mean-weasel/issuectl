#!/usr/bin/env node
// Verify /pulls bundle transfer directly.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const SESSION = 'pfpu';
const DATA_DIR = '/Users/neonwatty/Desktop/issuectl/qa-reports/perf-audit-r1-prod-data';
mkdirSync(DATA_DIR, { recursive: true });

const METRICS_FN = `() => { const nav = performance.getEntriesByType('navigation')[0]; const res = performance.getEntriesByType('resource'); let totalTransfer = 0, jsBytes = 0, jsDecoded = 0, cssBytes = 0; res.forEach(r => { const n = r.name || ''; const t = r.initiatorType || 'other'; totalTransfer += r.transferSize || 0; if (n.endsWith('.js') || t === 'script' || n.includes('/_next/static/chunks/')) { jsBytes += (r.transferSize || 0); jsDecoded += (r.decodedBodySize || 0); } if (n.endsWith('.css') || n.includes('/_next/static/css/')) cssBytes += (r.transferSize || 0); }); return { url: location.pathname + location.search, ttfb: nav ? Math.round(nav.responseStart - nav.requestStart) : null, fcp: (performance.getEntriesByType('paint').find(p => p.name === 'first-contentful-paint') || {}).startTime, resourceCount: res.length, totalTransferKB: Math.round(totalTransfer / 1024), jsKB: Math.round(jsBytes / 1024), jsDecodedKB: Math.round(jsDecoded / 1024), cssKB: Math.round(cssBytes / 1024), statusOk: !!nav && nav.responseStatus >= 200 && nav.responseStatus < 400, status: nav && nav.responseStatus, domNodes: document.querySelectorAll('*').length }; }`;

function run(...args) {
  return execFileSync('playwright-cli', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}
function tryRun(...args) { try { return run(...args); } catch { return null; } }
function parseResult(out) {
  if (!out) return null;
  const m = out.match(/### Result\n([\s\S]*?)\n### Ran Playwright code/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return m[1]; }
}
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// Try a few PR numbers — even if they 404/500, the bundles still download.
const urls = [
  'http://localhost:3847/pulls/mean-weasel/issuectl-test-repo/1',
  'http://localhost:3847/pulls/mean-weasel/issuectl-test-repo/79',
];

const out = [];
for (const url of urls) {
  console.error('=== ', url);
  tryRun(`-s=${SESSION}`, 'close');
  await wait(300);
  tryRun(`-s=${SESSION}`, 'open');
  await wait(500);
  tryRun(`-s=${SESSION}`, 'goto', url);
  await wait(3500);
  try {
    const res = parseResult(run(`-s=${SESSION}`, 'eval', METRICS_FN));
    out.push({ url, metrics: res });
    console.error(JSON.stringify(res, null, 2));
  } catch (e) {
    out.push({ url, error: e.message });
  }
}
tryRun(`-s=${SESSION}`, 'close');
writeFileSync(DATA_DIR + '/pulls-transfer.json', JSON.stringify(out, null, 2));
console.error('=== WRITTEN');
