import { revalidatePath } from "next/cache";

/**
 * Run `revalidatePath` for each path, retrying once on transient failure.
 * Returns `{ stale: true }` if any path still couldn't be revalidated — the
 * mutation itself has already succeeded, so we surface this as a soft warning
 * rather than failing the action. Callers should propagate `cacheStale` on
 * their success response so the UI can hint that a manual refresh may be
 * needed.
 *
 * `revalidatePath` occasionally throws in edge cases (misconfigured route,
 * runtime transition, internal Next.js errors), but the write has already
 * happened and the user's data is safe on the server — failing the whole
 * action would be worse than showing a stale view for one render.
 */
export function revalidateSafely(...paths: string[]): { stale: boolean } {
  let stale = false;
  for (const path of paths) {
    try {
      revalidatePath(path);
    } catch {
      try {
        revalidatePath(path);
      } catch (err) {
        console.warn(
          "[issuectl] Cache revalidation failed after retry",
          { path },
          err,
        );
        stale = true;
      }
    }
  }
  return { stale };
}
