#!/usr/bin/env node
// Take a clean screenshot of each route in its own fresh session.
import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SESSION = 'pfps';
const SHOT_DIR = '/Users/neonwatty/Desktop/issuectl/qa-reports/screenshots';
mkdirSync(SHOT_DIR, { recursive: true });

const ROUTES = [
  { name: 'dashboard', path: '/', shot: 'perf-r1-prod-dashboard.png' },
  { name: 'settings', path: '/settings', shot: 'perf-r1-prod-settings.png' },
  { name: 'parse', path: '/parse', shot: 'perf-r1-prod-parse.png' },
  { name: 'issue-detail', path: '/issues/mean-weasel/issuectl-test-repo/11', shot: 'perf-r1-prod-issue-detail.png' },
  { name: 'launch-active', path: '/launch/mean-weasel/issuectl-test-repo/11?deploymentId=11', shot: 'perf-r1-prod-launch-active.png' },
  { name: 'launch-active-cf', path: '/launch/mean-weasel/issuectl-test-repo/11?deploymentId=11&c=3&f=2', shot: 'perf-r1-prod-launch-active-cf.png' },
];

function run(...args) {
  return execFileSync('playwright-cli', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}
function tryRun(...args) { try { return run(...args); } catch { return null; } }
function findScreenshotInOutput(out) {
  if (!out) return null;
  const m = out.match(/([\/\w\.\-]+\.(?:png|jpe?g))/i);
  return m ? m[1] : null;
}
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

for (const route of ROUTES) {
  const url = 'http://localhost:3847' + route.path;
  console.error('shot', route.name);
  tryRun(`-s=${SESSION}`, 'close');
  await wait(300);
  tryRun(`-s=${SESSION}`, 'open');
  await wait(400);
  tryRun(`-s=${SESSION}`, 'goto', url);
  await wait(2200);
  const out = tryRun(`-s=${SESSION}`, 'screenshot');
  const tmp = findScreenshotInOutput(out);
  if (tmp && existsSync(tmp)) {
    copyFileSync(tmp, join(SHOT_DIR, route.shot));
    console.error('  ->', route.shot);
  }
}
tryRun(`-s=${SESSION}`, 'close');
console.error('done');
