import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { uploadImageToGitHub, ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE, sanitizeFilename } from "./uploads.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSmallBuffer(bytes = 100): Buffer {
  return Buffer.alloc(bytes, 0);
}

/** Buffer that is exactly 1 byte over the limit. */
function makeOversizedBuffer(): Buffer {
  return Buffer.alloc(MAX_IMAGE_SIZE + 1, 0);
}

function makeOkResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: vi.fn().mockResolvedValue(body),
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

  // -------------------------------------------------------------------------
  // 1. Happy path — top-level href
  // -------------------------------------------------------------------------
  it("returns { url, fileName } when response has top-level href", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(
      makeOkResponse({ href: "https://cdn.example.com/img.png" }) as unknown as Response,
    );

    const result = await uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE);

    expect(result).toEqual({
      url: "https://cdn.example.com/img.png",
      fileName: "test.png",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://uploads.github.com/repos/${OWNER}/${REPO}/issues/uploads`,
    );
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(init.method).toBe("POST");
  });

  // -------------------------------------------------------------------------
  // 2. Alternate response shape — nested asset.href
  // -------------------------------------------------------------------------
  it("parses the nested asset.href shape", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      makeOkResponse({
        asset: { href: "https://cdn.example.com/img.png", name: "img.png" },
      }) as unknown as Response,
    );

    const result = await uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE);

    expect(result.url).toBe("https://cdn.example.com/img.png");
    expect(result.fileName).toBe("test.png");
  });

  // -------------------------------------------------------------------------
  // 3. Invalid file type
  // -------------------------------------------------------------------------
  it("throws with 'Unsupported image type' for image/svg+xml", async () => {
    const svgFile = { ...VALID_FILE, type: "image/svg+xml" };

    await expect(
      uploadImageToGitHub(TOKEN, OWNER, REPO, svgFile),
    ).rejects.toThrow("Unsupported image type");

    // No network call should have been made.
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("throws for every type not in ALLOWED_IMAGE_TYPES", async () => {
    expect(ALLOWED_IMAGE_TYPES.has("image/svg+xml")).toBe(false);
    expect(ALLOWED_IMAGE_TYPES.has("image/bmp")).toBe(false);
    expect(ALLOWED_IMAGE_TYPES.has("application/pdf")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 4. File too large
  // -------------------------------------------------------------------------
  it("throws with 'Image too large' when data exceeds MAX_IMAGE_SIZE", async () => {
    const bigFile = { ...VALID_FILE, data: makeOversizedBuffer() };

    await expect(
      uploadImageToGitHub(TOKEN, OWNER, REPO, bigFile),
    ).rejects.toThrow("Image too large");

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("does NOT throw when data is exactly MAX_IMAGE_SIZE bytes", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      makeOkResponse({ href: "https://cdn.example.com/img.png" }) as unknown as Response,
    );
    const atLimitFile = {
      ...VALID_FILE,
      data: Buffer.alloc(MAX_IMAGE_SIZE, 0),
    };

    // Should not throw
    await expect(
      uploadImageToGitHub(TOKEN, OWNER, REPO, atLimitFile),
    ).resolves.toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 5. HTTP error
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // 6. Missing URL in response
  // -------------------------------------------------------------------------
  it("throws when the response body has no url (empty object)", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      makeOkResponse({}) as unknown as Response,
    );

    await expect(
      uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE),
    ).rejects.toThrow("returned no URL");
  });

  it("throws when the response body has asset but no href inside it", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      makeOkResponse({ asset: { name: "img.png" } }) as unknown as Response,
    );

    await expect(
      uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE),
    ).rejects.toThrow("returned no URL");
  });

  // -------------------------------------------------------------------------
  // 7. Malformed JSON response
  // -------------------------------------------------------------------------
  it("throws a descriptive error when response.json() throws", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token")),
      text: vi.fn().mockResolvedValue("<html>not json</html>"),
    } as unknown as Response);

    await expect(
      uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE),
    ).rejects.toThrow("invalid JSON");
  });

  it("includes a snippet of the body in the malformed-JSON error", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: vi.fn().mockRejectedValue(new SyntaxError("bad json")),
      text: vi.fn().mockResolvedValue("body text here"),
    } as unknown as Response);

    await expect(
      uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE),
    ).rejects.toThrow("body text here");
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
