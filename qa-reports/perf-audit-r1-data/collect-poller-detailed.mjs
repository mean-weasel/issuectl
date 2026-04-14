#!/usr/bin/env node
// Detailed per-tick poller measurement.
// Loads the active launch page, then samples every 5.5s for 60s so we
// capture ALL RSC entries and can compute per-tick cost precisely.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const SESSION = 'perfaudit-r1';
const DATA_DIR = '/Users/neonwatty/Desktop/issuectl/qa-reports/perf-audit-r1-data';
mkdirSync(DATA_DIR, { recursive: true });

// Dump every RSC entry + long task entry so we can compute per-tick values offline.
const DUMP_FN = `() => { const res = performance.getEntriesByType('resource'); const rsc = res.filter(r => (r.name || '').includes('_rsc=') || (r.name || '').includes('?_rsc')).map(r => ({ start: Math.round(r.startTime), dur: Math.round(r.duration), size: r.transferSize || 0, encoded: r.encodedBodySize || 0, decoded: r.decodedBodySize || 0, name: (r.name || '').split('?')[0].slice(-40) })); let lts = []; try { lts = performance.getEntriesByType('longtask').map(lt => ({ start: Math.round(lt.startTime), dur: Math.round(lt.duration) })); } catch (e) {} const mem = performance.memory ? { used: Math.round(performance.memory.usedJSHeapSize / 1048576), total: Math.round(performance.memory.totalJSHeapSize / 1048576) } : null; return { now: Math.round(performance.now()), rsc, longTasks: lts, memoryMB: mem, domNodes: document.querySelectorAll('*').length }; }`;

function run(...args) {
  return execFileSync('playwright-cli', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}
function parseResult(out) {
  const m = out.match(/### Result\n([\s\S]*?)\n### Ran Playwright code/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return m[1]; }
}
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

const url = 'http://localhost:3847/launch/mean-weasel/issuectl-test-repo/11?deploymentId=11';

console.error(`=== loading ${url}`);
run(`-s=${SESSION}`, 'goto', 'about:blank');
await wait(300);
run(`-s=${SESSION}`, 'goto', url);
await wait(3000);

// Let 60 seconds pass — that's ~12 poll ticks worth.
console.error('=== waiting 60s for poll ticks...');
await wait(60000);

const out = run(`-s=${SESSION}`, 'eval', DUMP_FN);
const data = parseResult(out);

// Compute derived stats
const rsc = data.rsc;
const totalBytes = rsc.reduce((s, r) => s + r.size, 0);
const totalDecoded = rsc.reduce((s, r) => s + r.decoded, 0);
const totalDur = rsc.reduce((s, r) => s + r.dur, 0);
const avgSize = rsc.length ? Math.round(totalBytes / rsc.length) : 0;
const avgDecoded = rsc.length ? Math.round(totalDecoded / rsc.length) : 0;
const avgDur = rsc.length ? Math.round(totalDur / rsc.length) : 0;
const tickGaps = [];
for (let i = 1; i < rsc.length; i++) {
  tickGaps.push(rsc[i].start - rsc[i-1].start);
}
const avgGap = tickGaps.length ? Math.round(tickGaps.reduce((a,b)=>a+b,0) / tickGaps.length) : 0;

const summary = {
  windowMs: data.now,
  totalTicks: rsc.length,
  avgGapMs: avgGap,
  totalTransferBytes: totalBytes,
  totalDecodedBytes: totalDecoded,
  totalDurationMs: totalDur,
  perTickTransferBytes: avgSize,
  perTickDecodedBytes: avgDecoded,
  perTickDurationMs: avgDur,
  longTaskCount: data.longTasks.length,
  longTaskTotalMs: data.longTasks.reduce((s,l)=>s+l.dur, 0),
  memoryMB: data.memoryMB,
  domNodes: data.domNodes,
  samples: rsc.slice(0, 5),
  tickGaps,
};
console.error('\n=== SUMMARY ===');
console.error(JSON.stringify(summary, null, 2));

writeFileSync(DATA_DIR + '/poller-detailed.json', JSON.stringify({ url, data, summary }, null, 2));
console.error('\n=== WRITTEN ' + DATA_DIR + '/poller-detailed.json');
