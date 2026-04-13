/**
 * Run `fn` over each item with bounded concurrency and return results in
 * input order.
 *
 * A4: the dashboard and unified-list queries fan out over every tracked
 * repo via `Promise.all(repos.map(…))`. With ~50 tracked repos × (issues
 * + pulls) per load, that hits ~100 concurrent Octokit requests — right
 * at GitHub's secondary rate limit. A hand-rolled worker pool caps
 * concurrency with no new dependency.
 *
 * Semantics match `Promise.all` on the happy path (ordered results,
 * short-circuit reject on any failure). Callers that want per-item
 * failure isolation should wrap `fn` in a try/catch inside the closure,
 * as the existing getDashboardData / getUnifiedList callers already do.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const effectiveLimit = Math.max(1, Math.min(limit, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(
    Array.from({ length: effectiveLimit }, () => worker()),
  );
  return results;
}

/**
 * Default concurrency for repo-level GitHub fan-out. Each worker may
 * issue multiple inner requests (e.g. getDashboardData does issues +
 * pulls per repo) so steady-state concurrency is `DEFAULT_REPO_FANOUT *
 * inner`. Keep this conservative to stay well under GitHub's secondary
 * rate limit (~80-100 req/window).
 */
export const DEFAULT_REPO_FANOUT = 6;
