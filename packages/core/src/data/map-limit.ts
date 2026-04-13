/**
 * Run `fn` over each item with bounded concurrency and return results
 * in input order. Semantics match `Promise.all`: any reject short-
 * circuits the overall promise. Callers that want per-item failure
 * isolation should wrap `fn` in a try/catch inside the closure.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const effectiveLimit = Math.max(1, Math.min(limit, items.length));
  const results = new Array<R>(items.length);
  // Workers race on a shared counter rather than receiving pre-sliced
  // ranges so a slow worker cannot delay items its neighbors could pick
  // up. Safe under JS's single-threaded increment.
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
 * Default concurrency for repo-level GitHub fan-out. Kept conservative
 * to stay well under GitHub's secondary rate limit (~80-100 req/window)
 * given each worker may issue several inner requests per repo.
 */
export const DEFAULT_REPO_FANOUT = 6;
