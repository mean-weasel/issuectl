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

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `chore(issuectl): upload image ${sanitized}`,
        content,
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `GitHub image upload failed (${response.status}): ${text || response.statusText}`,
    );
  }

  let result: { content?: { download_url?: string } };
  try {
    result = (await response.json()) as typeof result;
  } catch {
    const text = await response.text().catch(() => "");
    throw new Error(
      `GitHub returned invalid JSON after upload (status ${response.status}). Body: ${text.slice(0, 200)}`,
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
