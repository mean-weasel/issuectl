# iOS Preview Performance Baselines

Use `iPhone-preview` and `IssueCTLPreview-UISmoke` for physical-device performance timing. Capture new runs with:

```bash
pnpm ios:preview-perf:fast
```

## 2026-05-04 Main Baseline

- Git ref: `origin/main` at `b2cf867`
- Device: `iPhone-preview`
- Profile: `fast`
- Log: `/tmp/issuectl-preview-perf-20260504T170421Z.log`
- Xcode result bundle: `/tmp/issuectl-preview-perf-20260504T170421Z.xcresult`

| Metric | Time |
|---|---:|
| `app_launch_usable` | 734 ms |
| `today.load` | 271 ms |
| `issues.load_all` | 190 ms |
| `sessions.load` | 48 ms |
| Fast UI smoke test case | 36.298 s |
| Wrapper elapsed | 48 s |

Slowest API requests in the run:

| Request | Time | Status |
|---|---:|---:|
| `/api/v1/settings` | 137 ms | 200 |
| `/api/v1/repos` | 115 ms | 200 |
| `/api/v1/deployments/9001/ensure-ttyd` | 87 ms | 404 |
| `/api/v1/deployments` | 78 ms | 200 |
| `/api/v1/user` | 77 ms | 200 |
| `/api/v1/launch/org/alpha/101` | 70 ms | 200 |
| `/api/v1/issues/org/alpha/101/priorities` | 56 ms | 200 |
| `/api/v1/sessions/previews` | 49 ms | 200 |
| `/api/v1/deployments/9001/ensure-ttyd` | 45 ms | 404 |
| `/api/v1/worktrees/status?owner=org&repo=alpha&issueNumber=101` | 33 ms | 404 |

Use this baseline as a comparison point for local branch or merge queue tip runs. Prefer comparing two fresh captures from the same phone session when making a performance claim.

## 2026-05-04 Merged Main Baseline

- Git ref: `main` at `aabdc50`
- Device: `iPhone-preview`
- Profile: `fast`
- Capture mode: CoreDevice app-container trace fallback, with code coverage disabled
- Log: `/tmp/issuectl-preview-perf-20260504T200526Z.log`
- Xcode result bundle: `/tmp/issuectl-preview-perf-20260504T200526Z.xcresult`

| Metric | Time |
|---|---:|
| `app_launch_usable` | 347 ms |
| `today.load` | 116 ms |
| `issues.load_all` | 38 ms |
| `sessions.load` | 38 ms |
| Fast UI smoke test case | 35.410 s |
| Wrapper elapsed | 47 s |

Slowest API requests in the run:

| Request | Time | Status |
|---|---:|---:|
| `/api/v1/settings` | 120 ms | 200 |
| `/api/v1/deployments/9001/ensure-ttyd` | 67 ms | 404 |
| `/api/v1/repos` | 36 ms | 200 |
| `/api/v1/deployments/9001/ensure-ttyd` | 31 ms | 404 |
| `/api/v1/user` | 27 ms | 200 |
| `/api/v1/deployments` | 26 ms | 200 |
| `/api/v1/launch/org/alpha/101` | 24 ms | 200 |
| `/api/v1/worktrees/status?owner=org&repo=alpha&issueNumber=101` | 21 ms | 404 |
| `/api/v1/sessions/previews` | 8 ms | 200 |
| `/api/v1/issues/org/alpha/101/priority` | 6 ms | 200 |
