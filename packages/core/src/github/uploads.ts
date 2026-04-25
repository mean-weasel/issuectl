export const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Sanitize a filename for use in a GitHub repo path.
 * Keeps alphanumeric, hyphens, dots, and underscores.
 */
export function sanitizeFilename(name: string): string {
  const sanitized = name
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/-{2,}/g, "-");
  return sanitized || "image";
}

export type UploadResult = {
  url: string;
  fileName: string;
};

/** Dedicated branch for image uploads — writes to the default branch would fail under branch protection rules. */
const UPLOAD_BRANCH = "issuectl-assets";

const SHA_RE = /^[0-9a-f]{40}$/;

/** Extract and validate the `sha` field from a GitHub Git Data API response. */
function extractSha(json: unknown, context: string): string {
  const obj = json as Record<string, unknown>;
  if (typeof obj?.sha !== "string" || !SHA_RE.test(obj.sha)) {
    throw new Error(`${context}: response missing or malformed 'sha' field`);
  }
  return obj.sha;
}

/** Build and throw a descriptive error for a failed GitHub API call. */
async function throwApiError(res: Response, context: string): Promise<never> {
  const body = await res.text().catch((e) => {
    console.error(`[uploads] failed to read ${context} error body:`, e);
    return "";
  });
  const err = new Error(`${context} (${res.status}): ${body || res.statusText}`);
  Object.assign(err, { status: res.status });
  throw err;
}

/**
 * Create the issuectl-assets orphan branch via the Git Data API.
 * An orphan branch keeps uploaded assets out of the default branch history.
 * The branch includes a single README because GitHub requires at least one
 * file in the tree for the ref to be valid.
 *
 * On partial failure, earlier steps may leave orphan Git objects (blobs,
 * trees, commits) — these are garbage-collected by Git automatically.
 */
async function createUploadBranch(
  token: string,
  owner: string,
  repo: string,
): Promise<void> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
  const api = `https://api.github.com/repos/${owner}/${repo}/git`;

  // 1. Create a blob with a small README
  const blobRes = await fetch(`${api}/blobs`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      content: Buffer.from(
        "# issuectl assets\n\nImages uploaded by [issuectl](https://github.com/mean-weasel/issuectl).\n",
      ).toString("base64"),
      encoding: "base64",
    }),
  });
  if (!blobRes.ok) {
    await throwApiError(blobRes, "Failed to create upload branch blob");
  }
  const blobSha = extractSha(await blobRes.json(), "Blob creation");

  // 2. Create a tree containing the README
  const treeRes = await fetch(`${api}/trees`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      tree: [{ path: "README.md", mode: "100644", type: "blob", sha: blobSha }],
    }),
  });
  if (!treeRes.ok) {
    await throwApiError(treeRes, "Failed to create upload branch tree");
  }
  const treeSha = extractSha(await treeRes.json(), "Tree creation");

  // 3. Create an orphan commit (no parents)
  const commitRes = await fetch(`${api}/commits`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message: "chore: initialize issuectl-assets branch",
      tree: treeSha,
      parents: [],
    }),
  });
  if (!commitRes.ok) {
    await throwApiError(commitRes, "Failed to create upload branch commit");
  }
  const commitSha = extractSha(await commitRes.json(), "Commit creation");

  // 4. Create the branch ref
  const refRes = await fetch(`${api}/refs`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ref: `refs/heads/${UPLOAD_BRANCH}`,
      sha: commitSha,
    }),
  });
  if (!refRes.ok) {
    if (refRes.status === 422) {
      const refBody = await refRes.text().catch((e) => {
        console.error("[uploads] failed to read ref error body:", e);
        return "";
      });
      // 422 with "Reference already exists" means a concurrent upload already created the branch — safe to ignore
      if (!refBody.includes("Reference already exists")) {
        const err = new Error(`Failed to create upload branch ref (422): ${refBody || refRes.statusText}`);
        Object.assign(err, { status: 422 });
        throw err;
      }
    } else {
      await throwApiError(refRes, "Failed to create upload branch ref");
    }
  }
}

export async function uploadImageToGitHub(
  token: string,
  owner: string,
  repo: string,
  file: {
    name: string;
    type: string;
    data: Buffer | Uint8Array;
  },
): Promise<UploadResult> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error(
      `Unsupported image type: ${file.type}. Allowed: PNG, JPG, GIF, WEBP.`,
    );
  }

  if (file.data.byteLength > MAX_IMAGE_SIZE) {
    const sizeMB = (file.data.byteLength / 1024 / 1024).toFixed(1);
    throw new Error(
      `Image too large: ${sizeMB} MB. Maximum is 10 MB.`,
    );
  }

  const sanitized = sanitizeFilename(file.name);
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const path = `.github/issuectl/uploads/${timestamp}-${random}-${sanitized}`;
  const content = Buffer.from(file.data).toString("base64");

  const putBody = JSON.stringify({
    message: `chore(issuectl): upload image ${sanitized}`,
    content,
    branch: UPLOAD_BRANCH,
  });
  const putHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
  const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  let response = await fetch(putUrl, {
    method: "PUT",
    headers: putHeaders,
    body: putBody,
  });

  // 404 or 422 may indicate the upload branch doesn't exist — check response body and create if needed
  if (response.status === 404 || response.status === 422) {
    const text = await response.text().catch((e) => {
      console.error("[uploads] failed to read upload error body:", e);
      return "";
    });
    const branchMissing =
      response.status === 404 ||
      text.includes("Branch not found") ||
      text.includes("No commit found");
    if (branchMissing) {
      await createUploadBranch(token, owner, repo);
      response = await fetch(putUrl, {
        method: "PUT",
        headers: putHeaders,
        body: putBody,
      });
    } else {
      // 422 for a non-branch reason — throw immediately with the text we already consumed
      throw new Error(
        `GitHub image upload failed (${response.status}): ${text || response.statusText}`,
      );
    }
  }

  if (!response.ok) {
    const text = await response.text().catch((e) => {
      console.error("[uploads] failed to read upload error body:", e);
      return "";
    });
    throw new Error(
      `GitHub image upload failed (${response.status}): ${text || response.statusText}`,
    );
  }

  let result: { content?: { download_url?: string } };
  try {
    result = (await response.json()) as typeof result;
  } catch (err) {
    throw new Error(
      `GitHub returned invalid JSON after upload (status ${response.status}): ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  const url = result.content?.download_url;
  if (!url) {
    throw new Error(
      "GitHub image upload succeeded but returned no URL. Response: " +
        JSON.stringify(result).slice(0, 200),
    );
  }

  return { url, fileName: file.name };
}
