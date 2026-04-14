#!/usr/bin/env node
// Repeat cold-per-route 3 times to get median TTFB/FCP.
// Each route gets a fresh session on each iteration.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const SESSION = 'pfpc';
const DATA_DIR = '/Users/neonwatty/Desktop/issuectl/qa-reports/perf-audit-r1-prod-data';
mkdirSync(DATA_DIR, { recursive: true });

const ROUTES = [
  { name: 'dashboard', path: '/' },
  { name: 'settings', path: '/settings' },
  { name: 'parse', path: '/parse' },
  { name: 'issue-detail', path: '/issues/mean-weasel/issuectl-test-repo/11' },
  { name: 'launch-active', path: '/launch/mean-weasel/issuectl-test-repo/11?deploymentId=11' },
  { name: 'launch-active-cf', path: '/launch/mean-weasel/issuectl-test-repo/11?deploymentId=11&c=3&f=2' },
];

const METRICS_FN = `() => { const nav = performance.getEntriesByType('navigation')[0]; const paints = performance.getEntriesByType('paint'); const fcp = paints.find(p => p.name === 'first-contentful-paint'); const res = performance.getEntriesByType('resource'); let totalTransfer = 0, jsBytes = 0, jsDecoded = 0; res.forEach(r => { const n = r.name || ''; const t = r.initiatorType || 'other'; totalTransfer += r.transferSize || 0; if (n.endsWith('.js') || t === 'script' || n.includes('/_next/static/chunks/')) { jsBytes += (r.transferSize || 0); jsDecoded += (r.decodedBodySize || 0); } }); return { ttfb: nav ? Math.round(nav.responseStart - nav.requestStart) : null, responseEnd: nav ? Math.round(nav.responseEnd) : null, fcp: fcp ? Math.round(fcp.startTime) : null, totalTransferKB: Math.round(totalTransfer / 1024), jsKB: Math.round(jsBytes / 1024), jsDecodedKB: Math.round(jsDecoded / 1024), resourceCount: res.length }; }`;

function run(...args) {
  return execFileSync('playwright-cli', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}
function tryRun(...args) {
  try { return run(...args); } catch { return null; }
}
function parseResult(out) {
  if (!out) return null;
  const m = out.match(/### Result\n([\s\S]*?)\n### Ran Playwright code/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return m[1]; }
}
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

const RUNS = 3;
const out = {};
for (const route of ROUTES) out[route.name] = { path: route.path, runs: [] };

for (let i = 0; i < RUNS; i++) {
  for (const route of ROUTES) {
    const url = 'http://localhost:3847' + route.path;
    console.error(`run ${i+1}/${RUNS} ${route.name}`);
    tryRun(`-s=${SESSION}`, 'close');
    await wait(300);
    tryRun(`-s=${SESSION}`, 'open');
    await wait(500);
    tryRun(`-s=${SESSION}`, 'goto', url);
    await wait(2200);
    try {
      const res = parseResult(run(`-s=${SESSION}`, 'eval', METRICS_FN));
      out[route.name].runs.push(res);
    } catch (e) {
      out[route.name].runs.push({ error: e.message });
    }
  }
}
tryRun(`-s=${SESSION}`, 'close');

// Compute medians
function median(arr) {
  const a = [...arr].filter(x => typeof x === 'number').sort((a,b)=>a-b);
  if (a.length === 0) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m-1] + a[m]) / 2);
}
const summary = {};
for (const name in out) {
  const rs = out[name].runs;
  summary[name] = {
    path: out[name].path,
    ttfb: { values: rs.map(r => r.ttfb), median: median(rs.map(r => r.ttfb)) },
    fcp: { values: rs.map(r => r.fcp), median: median(rs.map(r => r.fcp)) },
    totalTransferKB: { values: rs.map(r => r.totalTransferKB), median: median(rs.map(r => r.totalTransferKB)) },
    jsKB: { values: rs.map(r => r.jsKB), median: median(rs.map(r => r.jsKB)) },
    jsDecodedKB: { values: rs.map(r => r.jsDecodedKB), median: median(rs.map(r => r.jsDecodedKB)) },
    resourceCount: { values: rs.map(r => r.resourceCount), median: median(rs.map(r => r.resourceCount)) },
  };
}
console.error(JSON.stringify(summary, null, 2));
writeFileSync(DATA_DIR + '/runtime-metrics-x3.json', JSON.stringify({ summary, raw: out }, null, 2));
console.error('=== WRITTEN ' + DATA_DIR + '/runtime-metrics-x3.json');
