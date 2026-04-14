#!/usr/bin/env node
// Verify the poller short-circuits on idle (ended) deployments.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const SESSION = 'pfpi';
const DATA_DIR = '/Users/neonwatty/Desktop/issuectl/qa-reports/perf-audit-r1-prod-data';
mkdirSync(DATA_DIR, { recursive: true });

const DUMP_FN = `() => { const res = performance.getEntriesByType('resource'); const rsc = res.filter(r => (r.name || '').includes('_rsc=') || (r.name || '').includes('?_rsc')).map(r => ({ start: Math.round(r.startTime), dur: Math.round(r.duration), size: r.transferSize || 0 })); return { now: Math.round(performance.now()), rscCount: rsc.length, rsc, memoryMB: performance.memory ? { used: Math.round(performance.memory.usedJSHeapSize / 1048576) } : null, domNodes: document.querySelectorAll('*').length }; }`;

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

const url = 'http://localhost:3847/launch/mean-weasel/issuectl-test-repo/1?deploymentId=9';

console.error(`=== fresh session, loading idle ${url}`);
tryRun(`-s=${SESSION}`, 'close');
await wait(300);
tryRun(`-s=${SESSION}`, 'open');
await wait(500);
tryRun(`-s=${SESSION}`, 'goto', url);
await wait(3000);

const pre = parseResult(run(`-s=${SESSION}`, 'eval', DUMP_FN));
console.error('pre:', JSON.stringify({ rsc: pre.rscCount, dom: pre.domNodes }));

console.error('=== waiting 30s for any poll ticks...');
await wait(30000);

const post = parseResult(run(`-s=${SESSION}`, 'eval', DUMP_FN));
const newTicks = post.rscCount - pre.rscCount;
const summary = {
  url,
  windowMs: post.now,
  rscBefore: pre.rscCount,
  rscAfter: post.rscCount,
  newRscInWindow: newTicks,
  memoryStart: pre.memoryMB,
  memoryEnd: post.memoryMB,
  domNodesStart: pre.domNodes,
  domNodesEnd: post.domNodes,
};
console.error(JSON.stringify(summary, null, 2));

tryRun(`-s=${SESSION}`, 'close');
writeFileSync(DATA_DIR + '/poller-idle.json', JSON.stringify({ pre, post, summary }, null, 2));
console.error('=== WRITTEN ' + DATA_DIR + '/poller-idle.json');
