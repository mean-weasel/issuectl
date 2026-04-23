import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { uploadImageToGitHub, ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE, sanitizeFilename } from "./uploads.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSmallBuffer(bytes = 100): Buffer {
  return Buffer.alloc(bytes, 0);
}

function makeContentsApiOkResponse(downloadUrl: string) {
  return {
    ok: true,
    status: 201,
    statusText: "Created",
    json: vi.fn().mockResolvedValue({
      content: {
        name: "test.png",
        path: ".github/issuectl/uploads/test.png",
        download_url: downloadUrl,
      },
      commit: { sha: "abc123def456" },
    }),
    text: vi.fn().mockResolvedValue(""),
  };
}

function makeErrorResponse(status: number, text = "") {
  return {
    ok: false,
    status,
    statusText: "Error",
    json: vi.fn().mockResolvedValue({}),
    text: vi.fn().mockResolvedValue(text),
  };
}

const TOKEN = "ghp_test_token";
const OWNER = "test-owner";
const REPO = "test-repo";

const VALID_FILE = {
  name: "test.png",
  type: "image/png",
  data: makeSmallBuffer(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("uploadImageToGitHub", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // 1. Happy path — Contents API
  it("returns { url, fileName } from Contents API download_url", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(
      makeContentsApiOkResponse("https://raw.githubusercontent.com/test-owner/test-repo/main/.github/issuectl/uploads/test.png") as unknown as Response,
    );

    const result = await uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE);

    expect(result.url).toBe(
      "https://raw.githubusercontent.com/test-owner/test-repo/main/.github/issuectl/uploads/test.png",
    );
    expect(result.fileName).toBe("test.png");
  });

  it("sends a PUT to the Contents API with base64-encoded content", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(
      makeContentsApiOkResponse("https://raw.githubusercontent.com/o/r/main/f.png") as unknown as Response,
    );

    await uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(
      /^https:\/\/api\.github\.com\/repos\/test-owner\/test-repo\/contents\/\.github\/issuectl\/uploads\/\d+-[a-z0-9]+-test\.png$/,
    );
    expect(init.method).toBe("PUT");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${TOKEN}`,
    );
    expect((init.headers as Record<string, string>)["Accept"]).toBe(
      "application/vnd.github+json",
    );

    const body = JSON.parse(init.body as string) as { message: string; content: string };
    expect(body.message).toMatch(/^chore\(issuectl\): upload image test\.png$/);
    expect(body.content).toBe(Buffer.from(VALID_FILE.data).toString("base64"));
  });

  // 2. Invalid file type
  it("throws with 'Unsupported image type' for image/svg+xml", async () => {
    const svgFile = { ...VALID_FILE, type: "image/svg+xml" };

    await expect(
      uploadImageToGitHub(TOKEN, OWNER, REPO, svgFile),
    ).rejects.toThrow("Unsupported image type");

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  // 3. File too large
  it("throws with 'Image too large' when data exceeds MAX_IMAGE_SIZE", async () => {
    const bigFile = { ...VALID_FILE, data: Buffer.alloc(MAX_IMAGE_SIZE + 1, 0) };

    await expect(
      uploadImageToGitHub(TOKEN, OWNER, REPO, bigFile),
    ).rejects.toThrow("Image too large");

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("does NOT throw when data is exactly MAX_IMAGE_SIZE bytes", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      makeContentsApiOkResponse("https://raw.githubusercontent.com/o/r/main/f.png") as unknown as Response,
    );
    const atLimitFile = {
      ...VALID_FILE,
      data: Buffer.alloc(MAX_IMAGE_SIZE, 0),
    };

    await expect(
      uploadImageToGitHub(TOKEN, OWNER, REPO, atLimitFile),
    ).resolves.toBeDefined();
  });

  // 4. HTTP errors
  it("throws with the HTTP status when response is not ok (403)", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      makeErrorResponse(403, "Forbidden") as unknown as Response,
    );

    await expect(
      uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE),
    ).rejects.toThrow("403");
  });

  it("throws when response status is 500", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      makeErrorResponse(500, "Internal Server Error") as unknown as Response,
    );

    await expect(
      uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE),
    ).rejects.toThrow("GitHub image upload failed");
  });

  // 5. Missing download_url in response
  it("throws when response has no content.download_url", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 201,
      statusText: "Created",
      json: vi.fn().mockResolvedValue({ content: {} }),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);

    await expect(
      uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE),
    ).rejects.toThrow("returned no URL");
  });

  it("throws when response has no content field at all", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 201,
      statusText: "Created",
      json: vi.fn().mockResolvedValue({}),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);

    await expect(
      uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE),
    ).rejects.toThrow("returned no URL");
  });

  // 6. Malformed JSON response
  it("throws a descriptive error when response.json() throws", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 201,
      statusText: "Created",
      json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token")),
      text: vi.fn().mockResolvedValue("<html>not json</html>"),
    } as unknown as Response);

    await expect(
      uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE),
    ).rejects.toThrow("invalid JSON");
  });

  // 7. Filename sanitization in the request URL
  it("sanitizes the filename in the upload path", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(
      makeContentsApiOkResponse("https://raw.githubusercontent.com/o/r/main/f.png") as unknown as Response,
    );

    const fileWithSpaces = { ...VALID_FILE, name: "my photo (1).png" };
    await uploadImageToGitHub(TOKEN, OWNER, REPO, fileWithSpaces);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("my-photo-1.png");
    expect(url).not.toContain(" ");
    expect(url).not.toContain("(");
  });
});

// ---------------------------------------------------------------------------
// Constants sanity checks
// ---------------------------------------------------------------------------

describe("ALLOWED_IMAGE_TYPES", () => {
  it("contains exactly PNG, JPEG, GIF, WEBP", () => {
    expect(ALLOWED_IMAGE_TYPES.has("image/png")).toBe(true);
    expect(ALLOWED_IMAGE_TYPES.has("image/jpeg")).toBe(true);
    expect(ALLOWED_IMAGE_TYPES.has("image/gif")).toBe(true);
    expect(ALLOWED_IMAGE_TYPES.has("image/webp")).toBe(true);
    expect(ALLOWED_IMAGE_TYPES.size).toBe(4);
  });
});

describe("MAX_IMAGE_SIZE", () => {
  it("is exactly 10 MB", () => {
    expect(MAX_IMAGE_SIZE).toBe(10 * 1024 * 1024);
  });
});

describe("sanitizeFilename", () => {
  it("passes through simple alphanumeric names", () => {
    expect(sanitizeFilename("photo.png")).toBe("photo.png");
  });

  it("replaces spaces with hyphens", () => {
    expect(sanitizeFilename("my photo.png")).toBe("my-photo.png");
  });

  it("strips characters that are not alphanumeric, hyphens, dots, or underscores", () => {
    expect(sanitizeFilename("image (1).png")).toBe("image-1.png");
  });

  it("handles filenames with unicode characters", () => {
    expect(sanitizeFilename("café_résumé.jpg")).toBe("caf_rsum.jpg");
  });

  it("returns 'image' when all characters are stripped", () => {
    expect(sanitizeFilename("///")).toBe("image");
  });

  it("collapses multiple consecutive hyphens", () => {
    expect(sanitizeFilename("a   b---c.png")).toBe("a-b-c.png");
  });
});
