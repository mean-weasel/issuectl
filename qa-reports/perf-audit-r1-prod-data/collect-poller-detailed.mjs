#!/usr/bin/env node
// R1-prod detailed 60s poller cost measurement.
// Loads the active launch page, waits 60s, then dumps per-tick RSC resources.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const SESSION = 'pfpp';
const DATA_DIR = '/Users/neonwatty/Desktop/issuectl/qa-reports/perf-audit-r1-prod-data';
mkdirSync(DATA_DIR, { recursive: true });

const DUMP_FN = `() => { const res = performance.getEntriesByType('resource'); const rsc = res.filter(r => (r.name || '').includes('_rsc=') || (r.name || '').includes('?_rsc')).map(r => ({ start: Math.round(r.startTime), dur: Math.round(r.duration), size: r.transferSize || 0, encoded: r.encodedBodySize || 0, decoded: r.decodedBodySize || 0, name: (r.name || '').split('?')[0].slice(-40) })); let lts = []; try { lts = performance.getEntriesByType('longtask').map(lt => ({ start: Math.round(lt.startTime), dur: Math.round(lt.duration) })); } catch (e) {} const mem = performance.memory ? { used: Math.round(performance.memory.usedJSHeapSize / 1048576), total: Math.round(performance.memory.totalJSHeapSize / 1048576) } : null; return { now: Math.round(performance.now()), rsc, longTasks: lts, memoryMB: mem, domNodes: document.querySelectorAll('*').length }; }`;

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

const url = 'http://localhost:3847/launch/mean-weasel/issuectl-test-repo/11?deploymentId=11&c=3&f=2';

console.error(`=== fresh session, loading ${url}`);
tryRun(`-s=${SESSION}`, 'close');
await wait(400);
tryRun(`-s=${SESSION}`, 'open');
await wait(500);
tryRun(`-s=${SESSION}`, 'goto', url);
await wait(3000);

// Capture memory BEFORE the 60s window
const pre = parseResult(run(`-s=${SESSION}`, 'eval', DUMP_FN));
console.error('=== pre:', JSON.stringify({ rscCount: pre.rsc.length, memoryMB: pre.memoryMB, domNodes: pre.domNodes }));

console.error('=== waiting 60s for poll ticks...');
await wait(60000);

const out = run(`-s=${SESSION}`, 'eval', DUMP_FN);
const data = parseResult(out);

// Keep only ticks that happened AFTER the pre-snapshot (i.e. in the 60 s window)
const preCount = pre.rsc.length;
const windowRsc = data.rsc.slice(preCount);

const totalBytes = windowRsc.reduce((s, r) => s + r.size, 0);
const totalDecoded = windowRsc.reduce((s, r) => s + r.decoded, 0);
const totalDur = windowRsc.reduce((s, r) => s + r.dur, 0);
const avgSize = windowRsc.length ? Math.round(totalBytes / windowRsc.length) : 0;
const avgDecoded = windowRsc.length ? Math.round(totalDecoded / windowRsc.length) : 0;
const avgDur = windowRsc.length ? Math.round(totalDur / windowRsc.length) : 0;
const tickGaps = [];
for (let i = 1; i < windowRsc.length; i++) {
  tickGaps.push(windowRsc[i].start - windowRsc[i-1].start);
}
const avgGap = tickGaps.length ? Math.round(tickGaps.reduce((a,b)=>a+b,0) / tickGaps.length) : 0;

const summary = {
  windowMs: data.now,
  preTickCount: preCount,
  windowTickCount: windowRsc.length,
  avgGapMs: avgGap,
  tickGaps,
  totalTransferBytes: totalBytes,
  totalDecodedBytes: totalDecoded,
  totalDurationMs: totalDur,
  perTickTransferBytes: avgSize,
  perTickDecodedBytes: avgDecoded,
  perTickDurationMs: avgDur,
  longTaskCountTotal: data.longTasks.length,
  longTaskTotalMs: data.longTasks.reduce((s,l)=>s+l.dur, 0),
  memoryMBStart: pre.memoryMB,
  memoryMBEnd: data.memoryMB,
  memoryDeltaMB: data.memoryMB && pre.memoryMB ? data.memoryMB.used - pre.memoryMB.used : null,
  domNodesStart: pre.domNodes,
  domNodesEnd: data.domNodes,
  samples: windowRsc.slice(0, 5),
};
console.error('\n=== SUMMARY ===');
console.error(JSON.stringify(summary, null, 2));

tryRun(`-s=${SESSION}`, 'close');

writeFileSync(DATA_DIR + '/poller-detailed.json', JSON.stringify({ url, pre, post: data, summary }, null, 2));
console.error('\n=== WRITTEN ' + DATA_DIR + '/poller-detailed.json');
