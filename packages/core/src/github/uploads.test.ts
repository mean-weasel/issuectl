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
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );

    const body = JSON.parse(init.body as string) as { message: string; content: string; branch: string };
    expect(body.message).toMatch(/^chore\(issuectl\): upload image test\.png$/);
    expect(body.content).toBe(Buffer.from(VALID_FILE.data).toString("base64"));
    expect(body.branch).toBe("issuectl-assets");
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

  // 7. Branch creation retry on 404
  it("creates the upload branch and retries when branch does not exist", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    // First PUT returns 404 (branch doesn't exist)
    const notFoundResponse = {
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: vi.fn().mockResolvedValue({}),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response;
    // Git Data API calls for branch creation (blob, tree, commit, ref)
    const gitOkResponse = (sha: string) => ({
      ok: true,
      status: 201,
      statusText: "Created",
      json: vi.fn().mockResolvedValue({ sha }),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);
    // Retry PUT succeeds
    const successResponse = makeContentsApiOkResponse(
      "https://raw.githubusercontent.com/test-owner/test-repo/issuectl-assets/.github/issuectl/uploads/test.png",
    ) as unknown as Response;

    fetchMock
      .mockResolvedValueOnce(notFoundResponse)       // 1st PUT → 404
      .mockResolvedValueOnce(gitOkResponse("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"))  // create blob
      .mockResolvedValueOnce(gitOkResponse("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"))  // create tree
      .mockResolvedValueOnce(gitOkResponse("cccccccccccccccccccccccccccccccccccccccc"))   // create commit
      .mockResolvedValueOnce(gitOkResponse("dddddddddddddddddddddddddddddddddddddddd"))   // create ref
      .mockResolvedValueOnce(successResponse);         // 2nd PUT → 201

    const result = await uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE);

    expect(result.url).toBe(
      "https://raw.githubusercontent.com/test-owner/test-repo/issuectl-assets/.github/issuectl/uploads/test.png",
    );
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  // 8. 422 with "Branch not found" triggers retry
  it("retries when 422 body contains 'Branch not found'", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const branchNotFoundResponse = {
      ok: false,
      status: 422,
      statusText: "Unprocessable Entity",
      json: vi.fn().mockResolvedValue({}),
      text: vi.fn().mockResolvedValue('{"message":"Branch not found"}'),
    } as unknown as Response;
    const gitOkResponse = (sha: string) => ({
      ok: true,
      status: 201,
      statusText: "Created",
      json: vi.fn().mockResolvedValue({ sha }),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);
    const successResponse = makeContentsApiOkResponse(
      "https://raw.githubusercontent.com/o/r/issuectl-assets/f.png",
    ) as unknown as Response;

    fetchMock
      .mockResolvedValueOnce(branchNotFoundResponse)   // 1st PUT → 422 "Branch not found"
      .mockResolvedValueOnce(gitOkResponse("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"))
      .mockResolvedValueOnce(gitOkResponse("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"))
      .mockResolvedValueOnce(gitOkResponse("cccccccccccccccccccccccccccccccccccccccc"))
      .mockResolvedValueOnce(gitOkResponse("dddddddddddddddddddddddddddddddddddddddd"))
      .mockResolvedValueOnce(successResponse);

    const result = await uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE);
    expect(result.url).toContain("issuectl-assets");
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  // 8b. 422 with "No commit found" triggers retry
  it("retries when 422 body contains 'No commit found'", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const noCommitResponse = {
      ok: false,
      status: 422,
      statusText: "Unprocessable Entity",
      json: vi.fn().mockResolvedValue({}),
      text: vi.fn().mockResolvedValue('{"message":"No commit found for the ref issuectl-assets"}'),
    } as unknown as Response;
    const gitOkResponse = (sha: string) => ({
      ok: true,
      status: 201,
      statusText: "Created",
      json: vi.fn().mockResolvedValue({ sha }),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);
    const successResponse = makeContentsApiOkResponse(
      "https://raw.githubusercontent.com/o/r/issuectl-assets/f.png",
    ) as unknown as Response;

    fetchMock
      .mockResolvedValueOnce(noCommitResponse)            // 1st PUT → 422 "No commit found"
      .mockResolvedValueOnce(gitOkResponse("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"))
      .mockResolvedValueOnce(gitOkResponse("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"))
      .mockResolvedValueOnce(gitOkResponse("cccccccccccccccccccccccccccccccccccccccc"))
      .mockResolvedValueOnce(gitOkResponse("dddddddddddddddddddddddddddddddddddddddd"))
      .mockResolvedValueOnce(successResponse);

    const result = await uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE);
    expect(result.url).toContain("issuectl-assets");
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  // 9. 422 for non-branch reasons does NOT retry
  it("throws immediately on 422 unrelated to missing branch", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 422,
      statusText: "Unprocessable Entity",
      json: vi.fn().mockResolvedValue({}),
      text: vi.fn().mockResolvedValue('{"message":"path already exists"}'),
    } as unknown as Response);

    await expect(
      uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE),
    ).rejects.toThrow("path already exists");
  });

  // 10. createUploadBranch step failure propagates
  it("throws when blob creation fails during branch setup", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: false, status: 404, statusText: "Not Found",
        json: vi.fn().mockResolvedValue({}),
        text: vi.fn().mockResolvedValue(""),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: false, status: 403, statusText: "Forbidden",
        json: vi.fn().mockResolvedValue({}),
        text: vi.fn().mockResolvedValue("Resource not accessible"),
      } as unknown as Response);

    await expect(
      uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE),
    ).rejects.toThrow("Failed to create upload branch blob (403)");
  });

  // 11. 422 on ref creation (race condition) is tolerated
  it("tolerates 422 'Reference already exists' on ref creation", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const gitOkResponse = (sha: string) => ({
      ok: true, status: 201, statusText: "Created",
      json: vi.fn().mockResolvedValue({ sha }),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);
    const successResponse = makeContentsApiOkResponse(
      "https://raw.githubusercontent.com/o/r/issuectl-assets/f.png",
    ) as unknown as Response;

    fetchMock
      .mockResolvedValueOnce({
        ok: false, status: 404, statusText: "Not Found",
        json: vi.fn().mockResolvedValue({}),
        text: vi.fn().mockResolvedValue(""),
      } as unknown as Response)                          // 1st PUT → 404
      .mockResolvedValueOnce(gitOkResponse("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"))
      .mockResolvedValueOnce(gitOkResponse("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"))
      .mockResolvedValueOnce(gitOkResponse("cccccccccccccccccccccccccccccccccccccccc"))
      .mockResolvedValueOnce({
        ok: false, status: 422, statusText: "Unprocessable Entity",
        json: vi.fn().mockResolvedValue({}),
        text: vi.fn().mockResolvedValue('{"message":"Reference already exists"}'),
      } as unknown as Response)                          // ref → 422 race condition
      .mockResolvedValueOnce(successResponse);           // retry PUT → 201

    const result = await uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE);
    expect(result.url).toContain("issuectl-assets");
  });

  // 12. 422 on ref creation for non-race reasons throws
  it("throws when ref creation returns 422 for non-race reasons", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const gitOkResponse = (sha: string) => ({
      ok: true, status: 201, statusText: "Created",
      json: vi.fn().mockResolvedValue({ sha }),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);

    fetchMock
      .mockResolvedValueOnce({
        ok: false, status: 404, statusText: "Not Found",
        json: vi.fn().mockResolvedValue({}),
        text: vi.fn().mockResolvedValue(""),
      } as unknown as Response)
      .mockResolvedValueOnce(gitOkResponse("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"))
      .mockResolvedValueOnce(gitOkResponse("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"))
      .mockResolvedValueOnce(gitOkResponse("cccccccccccccccccccccccccccccccccccccccc"))
      .mockResolvedValueOnce({
        ok: false, status: 422, statusText: "Unprocessable Entity",
        json: vi.fn().mockResolvedValue({}),
        text: vi.fn().mockResolvedValue('{"message":"Invalid SHA"}'),
      } as unknown as Response);

    await expect(
      uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE),
    ).rejects.toThrow("Failed to create upload branch ref (422)");
  });

  // 13. Filename sanitization in the request URL
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
