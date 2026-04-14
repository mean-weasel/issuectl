#!/usr/bin/env node
// Launch poller (PR #75) cost measurement.
// Loads /launch/... with an ACTIVE deployment, then snapshots resource+perf
// entries at t=0, t=6s, t=12s, t=18s, t=24s, t=30s so we can count how many
// RSC refreshes fire, how big they are, and how long each takes.
// Also runs the same thing against an IDLE deployment (endedAt set) as
// a control — the poller should not fire.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const SESSION = 'perfaudit-r1';
const DATA_DIR = '/Users/neonwatty/Desktop/issuectl/qa-reports/perf-audit-r1-data';
mkdirSync(DATA_DIR, { recursive: true });

const CASES = [
  {
    name: 'active',
    url: 'http://localhost:3847/launch/mean-weasel/issuectl-test-repo/11?deploymentId=11',
  },
  {
    name: 'idle',
    url: 'http://localhost:3847/launch/mean-weasel/issuectl-test-repo/1?deploymentId=9',
  },
];

// Snapshot new RSC + fetch resources since time=mark, return deltas.
const SNAPSHOT_FN = `(mark) => { const res = performance.getEntriesByType('resource'); const recent = res.filter(r => r.startTime >= (mark || 0)); const rsc = recent.filter(r => (r.name || '').includes('_rsc=') || (r.name || '').includes('?_rsc')); let rscBytes = 0, rscDur = 0; rsc.forEach(r => { rscBytes += (r.transferSize || 0); rscDur += r.duration; }); let longTaskCount = 0, longTaskTotal = 0; try { const lts = performance.getEntriesByType('longtask').filter(lt => lt.startTime >= (mark || 0)); longTaskCount = lts.length; lts.forEach(lt => { longTaskTotal += lt.duration; }); } catch (e) {} const mem = performance.memory ? { used: Math.round(performance.memory.usedJSHeapSize / 1048576), total: Math.round(performance.memory.totalJSHeapSize / 1048576) } : null; return { now: Math.round(performance.now()), rscCount: rsc.length, rscBytes, rscDurTotal: Math.round(rscDur), rscSamples: rsc.slice(-3).map(r => ({ name: (r.name || '').split('?')[0].slice(-50) + '?…', start: Math.round(r.startTime), dur: Math.round(r.duration), size: r.transferSize || 0, type: r.initiatorType })), longTaskCount, longTaskMs: Math.round(longTaskTotal), memoryMB: mem, totalRes: res.length }; }`;

function run(...args) {
  return execFileSync('playwright-cli', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}
function parseResult(out) {
  const m = out.match(/### Result\n([\s\S]*?)\n### Ran Playwright code/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return m[1]; }
}
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

const report = {};
for (const c of CASES) {
  console.error(`\n=== ${c.name}: ${c.url}`);
  run(`-s=${SESSION}`, 'goto', 'about:blank');
  await wait(300);
  run(`-s=${SESSION}`, 'goto', c.url);
  await wait(2500); // settle

  // Baseline snapshot (mark now)
  const baseOut = run(`-s=${SESSION}`, 'eval', SNAPSHOT_FN.replace('(mark)', '()').replace('mark || 0', '0'));
  const baseline = parseResult(baseOut);
  console.error('baseline:', JSON.stringify(baseline));
  const t0 = baseline.now;

  const samples = [{ tag: 't=0', ...baseline }];
  for (const sec of [6, 12, 18, 24, 30]) {
    await wait(6000);
    const out = run(`-s=${SESSION}`, 'eval', SNAPSHOT_FN.replace('(mark)', `()`).replace('mark || 0', String(t0)));
    const s = parseResult(out);
    samples.push({ tag: `t=${sec}`, ...s });
    console.error(`${c.name} ${samples[samples.length-1].tag}:`, JSON.stringify({ rscCount: s.rscCount, rscKB: Math.round(s.rscBytes/1024), memory: s.memoryMB?.used, longTaskCount: s.longTaskCount }));
  }

  report[c.name] = {
    url: c.url,
    baseline,
    samples,
  };
}

writeFileSync(DATA_DIR + '/poller-cost.json', JSON.stringify(report, null, 2));
console.error('\n=== WRITTEN ' + DATA_DIR + '/poller-cost.json');
