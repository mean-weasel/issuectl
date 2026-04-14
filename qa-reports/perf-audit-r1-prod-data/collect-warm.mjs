#!/usr/bin/env node
// R1-prod warm-pass collection — next start prod build.
// 6 routes (adds the `&c=3&f=2` comparison variant of /launch).
// Each route navigated twice; the 2nd measured nav is the warm pass.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SESSION = 'perfaudit-r1-prod';
const DATA_DIR = '/Users/neonwatty/Desktop/issuectl/qa-reports/perf-audit-r1-prod-data';
const SHOT_DIR = '/Users/neonwatty/Desktop/issuectl/qa-reports/screenshots';
mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(SHOT_DIR, { recursive: true });

const ROUTES = [
  { name: 'dashboard', path: '/', shot: 'perf-r1-prod-dashboard.png' },
  { name: 'settings', path: '/settings', shot: 'perf-r1-prod-settings.png' },
  { name: 'parse', path: '/parse', shot: 'perf-r1-prod-parse.png' },
  { name: 'issue-detail', path: '/issues/mean-weasel/issuectl-test-repo/11', shot: 'perf-r1-prod-issue-detail.png' },
  { name: 'launch-active', path: '/launch/mean-weasel/issuectl-test-repo/11?deploymentId=11', shot: 'perf-r1-prod-launch-active.png' },
  { name: 'launch-active-cf', path: '/launch/mean-weasel/issuectl-test-repo/11?deploymentId=11&c=3&f=2', shot: 'perf-r1-prod-launch-active-cf.png' },
];

const METRICS_FN = `() => { const nav = performance.getEntriesByType('navigation')[0]; const paints = performance.getEntriesByType('paint'); const fcp = paints.find(p => p.name === 'first-contentful-paint'); let lcp = null; try { const le = performance.getEntriesByType('largest-contentful-paint'); if (le && le.length) lcp = le[le.length - 1].startTime; } catch (e) {} let longTaskCount = 0, longTaskTotal = 0; try { const lts = performance.getEntriesByType('longtask'); longTaskCount = lts.length; lts.forEach(lt => { longTaskTotal += Math.max(0, lt.duration - 50); }); } catch (e) {} const res = performance.getEntriesByType('resource'); const byType = {}; let totalTransfer = 0, jsBytes = 0, cssBytes = 0, imgBytes = 0, fontBytes = 0, rscBytes = 0, rscCount = 0; let slowest = null; res.forEach(r => { const t = r.initiatorType || 'other'; byType[t] = (byType[t] || 0) + 1; totalTransfer += r.transferSize || 0; const n = r.name || ''; if (n.endsWith('.js') || t === 'script') jsBytes += (r.transferSize || 0); else if (n.endsWith('.css') || t === 'link') cssBytes += (r.transferSize || 0); else if (/\\\\.(png|jpe?g|gif|webp|avif|svg)/.test(n) || t === 'img') imgBytes += (r.transferSize || 0); else if (/\\\\.(woff2?|ttf|otf)/.test(n)) fontBytes += (r.transferSize || 0); if (n.includes('_rsc=') || n.includes('?_rsc')) { rscCount++; rscBytes += (r.transferSize || 0); } if (!slowest || r.duration > slowest.duration) slowest = { name: n.split('?')[0].slice(-80), duration: Math.round(r.duration), size: r.transferSize || 0 }; }); const all = document.querySelectorAll('*'); let maxDepth = 0; const walk = (el, d) => { if (d > maxDepth) maxDepth = d; for (const c of el.children) walk(c, d + 1); }; walk(document.documentElement, 1); const mem = performance.memory ? { used: Math.round(performance.memory.usedJSHeapSize / 1048576), total: Math.round(performance.memory.totalJSHeapSize / 1048576) } : null; let cls = 0; try { const entries = performance.getEntriesByType('layout-shift'); entries.forEach(e => { if (!e.hadRecentInput) cls += e.value; }); } catch (e) {} return { url: location.pathname + location.search, ttfb: nav ? Math.round(nav.responseStart - nav.requestStart) : null, responseEnd: nav ? Math.round(nav.responseEnd) : null, domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null, loadEvent: nav ? Math.round(nav.loadEventEnd) : null, fcp: fcp ? Math.round(fcp.startTime) : null, lcp: lcp !== null ? Math.round(lcp) : null, cls: Math.round(cls * 10000) / 10000, longTaskCount, tbtApprox: Math.round(longTaskTotal), resourceCount: res.length, resourceByType: byType, totalTransferKB: Math.round(totalTransfer / 1024), jsKB: Math.round(jsBytes / 1024), cssKB: Math.round(cssBytes / 1024), imgKB: Math.round(imgBytes / 1024), fontKB: Math.round(fontBytes / 1024), rscCount, rscKB: Math.round(rscBytes / 1024), slowestResource: slowest, domNodes: all.length, maxDomDepth: maxDepth, memoryMB: mem }; }`;

function run(...args) {
  return execFileSync('playwright-cli', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}
function parseResult(out) {
  const m = out.match(/### Result\n([\s\S]*?)\n### Ran Playwright code/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return m[1]; }
}
function findScreenshotInOutput(out) {
  const m = out.match(/([\/\w\.\-]+\.(?:png|jpe?g))/i);
  return m ? m[1] : null;
}
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

const results = [];
for (const route of ROUTES) {
  const url = 'http://localhost:3847' + route.path;
  console.error(`\n=== ${route.name}: ${url}`);

  // Force a cache-invalidating nav between routes
  run(`-s=${SESSION}`, 'goto', 'about:blank');
  await wait(200);

  // Warm-up pass (prod: mostly just to fill resource cache; no compile)
  try { run(`-s=${SESSION}`, 'goto', url); } catch {}
  await wait(1200);
  run(`-s=${SESSION}`, 'goto', 'about:blank');
  await wait(200);

  // Measured pass
  try {
    run(`-s=${SESSION}`, 'goto', url);
  } catch (e) {
    results.push({ name: route.name, path: route.path, error: 'goto failed' });
    continue;
  }
  await wait(2500);

  let metrics;
  try {
    const out = run(`-s=${SESSION}`, 'eval', METRICS_FN);
    metrics = parseResult(out);
  } catch (e) {
    results.push({ name: route.name, path: route.path, error: 'eval failed' });
    continue;
  }

  // Screenshot
  try {
    const out = run(`-s=${SESSION}`, 'screenshot');
    const tmpPath = findScreenshotInOutput(out);
    if (tmpPath && existsSync(tmpPath)) {
      copyFileSync(tmpPath, join(SHOT_DIR, route.shot));
    }
  } catch {}

  results.push({ name: route.name, path: route.path, metrics });
  console.error(JSON.stringify(metrics, null, 2));
}

writeFileSync(DATA_DIR + '/runtime-metrics-warm.json', JSON.stringify(results, null, 2));
console.error('\n=== WRITTEN ' + DATA_DIR + '/runtime-metrics-warm.json');
