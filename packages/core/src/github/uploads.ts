const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export type UploadResult = {
  url: string;
  fileName: string;
};

/**
 * Upload an image to GitHub's CDN via the issue-uploads endpoint.
 *
 * This uses the same undocumented (but stable) endpoint that GitHub.com uses
 * when you paste or drag an image into an issue textarea. The endpoint has
 * been stable for years and is relied on by GitHub CLI, GitHub Desktop, and
 * many extensions.
 */
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
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error(
      `Unsupported image type: ${file.type}. Allowed: PNG, JPG, GIF, WEBP.`,
    );
  }

  if (file.data.byteLength > MAX_SIZE) {
    const sizeMB = (file.data.byteLength / 1024 / 1024).toFixed(1);
    throw new Error(
      `Image too large: ${sizeMB} MB. Maximum is 10 MB.`,
    );
  }

  const formData = new FormData();
  formData.append(
    "file",
    new Blob([file.data], { type: file.type }),
    file.name,
  );

  const response = await fetch(
    `https://uploads.github.com/repos/${owner}/${repo}/issues/uploads`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      body: formData,
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `GitHub image upload failed (${response.status}): ${text || response.statusText}`,
    );
  }

  const result = (await response.json()) as {
    href?: string;
    asset?: { href?: string; name?: string };
  };

  const url = result.href ?? result.asset?.href;
  if (!url) {
    throw new Error(
      "GitHub image upload succeeded but returned no URL. Response: " +
        JSON.stringify(result).slice(0, 200),
    );
  }

  return { url, fileName: file.name };
}
