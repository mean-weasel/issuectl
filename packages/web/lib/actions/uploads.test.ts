import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock @issuectl/core before importing the action under test.
// vi.hoisted() lets us reference the spy instances inside the factory.
// ---------------------------------------------------------------------------

const uploadImageToGitHubMock = vi.hoisted(() => vi.fn());
const getGhTokenMock = vi.hoisted(() => vi.fn());

vi.mock("@issuectl/core", () => ({
  uploadImageToGitHub: (...args: unknown[]) => uploadImageToGitHubMock(...args),
  getGhToken: (...args: unknown[]) => getGhTokenMock(...args),
  // Constants are used in the action — provide real values so the validation
  // logic behaves identically to production.
  ALLOWED_IMAGE_TYPES: new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]),
  MAX_IMAGE_SIZE: 10 * 1024 * 1024,
  formatErrorForUser: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
}));

// Import AFTER mocks are in place.
const { uploadImage } = await import("./uploads.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OWNER = "acme";
const REPO = "web";
const SMALL_SIZE = 100;
const MAX_SIZE = 10 * 1024 * 1024;

/** Create a minimal File-like object that satisfies the action's checks. */
function makeFile(opts: {
  name?: string;
  type?: string;
  size?: number;
  arrayBuffer?: () => Promise<ArrayBuffer>;
}): File {
  const {
    name = "photo.png",
    type = "image/png",
    size = SMALL_SIZE,
  } = opts;
  const ab = opts.arrayBuffer ?? (() => Promise.resolve(new ArrayBuffer(size)));
  // Use a real File constructed from a tiny blob so instanceof checks pass.
  const blob = new Blob([new Uint8Array(size)], { type });
  const file = new File([blob], name, { type });
  // Override arrayBuffer() if a custom one was supplied.
  if (opts.arrayBuffer) {
    Object.defineProperty(file, "arrayBuffer", { value: ab });
  }
  return file;
}

function makeFormData(opts: {
  file?: File | null;
  owner?: string | null;
  repo?: string | null;
}): FormData {
  const fd = new FormData();
  if (opts.file !== undefined && opts.file !== null) {
    fd.set("file", opts.file);
  }
  if (opts.owner !== undefined && opts.owner !== null) {
    fd.set("owner", opts.owner);
  }
  if (opts.repo !== undefined && opts.repo !== null) {
    fd.set("repo", opts.repo);
  }
  return fd;
}

function validFormData(overrides: Partial<Parameters<typeof makeFormData>[0]> = {}): FormData {
  return makeFormData({
    file: makeFile({}),
    owner: OWNER,
    repo: REPO,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  uploadImageToGitHubMock.mockReset();
  getGhTokenMock.mockReset();
  getGhTokenMock.mockResolvedValue("ghp_test_token");
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("uploadImage server action", () => {
  // -------------------------------------------------------------------------
  // 1. Missing file
  // -------------------------------------------------------------------------
  it("returns { success: false } with 'No file provided' when FormData has no file", async () => {
    const fd = makeFormData({ owner: OWNER, repo: REPO });
    // No "file" field appended.
    const result = await uploadImage(fd);
    expect(result).toEqual({ success: false, error: "No file provided" });
    expect(uploadImageToGitHubMock).not.toHaveBeenCalled();
  });

  it("returns { success: false } when the file field is a plain string, not a File", async () => {
    const fd = new FormData();
    fd.set("file", "not-a-file");
    fd.set("owner", OWNER);
    fd.set("repo", REPO);
    const result = await uploadImage(fd);
    expect(result).toEqual({ success: false, error: "No file provided" });
  });

  // -------------------------------------------------------------------------
  // 2. Missing owner / repo
  // -------------------------------------------------------------------------
  it("returns 'Missing repository context' when owner is absent", async () => {
    const fd = makeFormData({ file: makeFile({}), repo: REPO });
    const result = await uploadImage(fd);
    expect(result).toEqual({ success: false, error: "Missing repository context" });
    expect(uploadImageToGitHubMock).not.toHaveBeenCalled();
  });

  it("returns 'Missing repository context' when repo is absent", async () => {
    const fd = makeFormData({ file: makeFile({}), owner: OWNER });
    const result = await uploadImage(fd);
    expect(result).toEqual({ success: false, error: "Missing repository context" });
  });

  it("returns 'Missing repository context' when both owner and repo are absent", async () => {
    const fd = new FormData();
    fd.set("file", makeFile({}));
    const result = await uploadImage(fd);
    expect(result).toEqual({ success: false, error: "Missing repository context" });
  });

  // -------------------------------------------------------------------------
  // 3. Invalid owner / repo format (path traversal and special chars)
  // -------------------------------------------------------------------------
  it("rejects owner containing path traversal characters", async () => {
    const fd = validFormData({ owner: "../etc/passwd" });
    const result = await uploadImage(fd);
    expect(result).toEqual({ success: false, error: "Missing repository context" });
  });

  it("rejects owner containing forward slash", async () => {
    const fd = validFormData({ owner: "owner/evil" });
    const result = await uploadImage(fd);
    expect(result).toEqual({ success: false, error: "Missing repository context" });
  });

  it("rejects repo containing shell special characters", async () => {
    const fd = validFormData({ repo: "repo;rm -rf /" });
    const result = await uploadImage(fd);
    expect(result).toEqual({ success: false, error: "Missing repository context" });
  });

  it("accepts owner/repo with hyphens, dots, and underscores", async () => {
    uploadImageToGitHubMock.mockResolvedValue({ url: "https://cdn.example.com/img.png", fileName: "photo.png" });
    const fd = validFormData({ owner: "my-org.2", repo: "my_repo.v2" });
    const result = await uploadImage(fd);
    expect(result).toMatchObject({ success: true });
  });

  // -------------------------------------------------------------------------
  // 4. File too large
  // -------------------------------------------------------------------------
  it("returns { success: false } when file exceeds 10 MB", async () => {
    const oversizedFile = makeFile({ size: MAX_SIZE + 1 });
    const fd = validFormData({ file: oversizedFile });
    const result = await uploadImage(fd);
    expect(result).toMatchObject({ success: false });
    expect(uploadImageToGitHubMock).not.toHaveBeenCalled();
  });

  it("does NOT reject a file that is exactly MAX_SIZE bytes", async () => {
    uploadImageToGitHubMock.mockResolvedValue({ url: "https://cdn.example.com/img.png", fileName: "photo.png" });
    const atLimitFile = makeFile({ size: MAX_SIZE });
    const fd = validFormData({ file: atLimitFile });
    const result = await uploadImage(fd);
    // Should not be a size-rejection — may succeed or fail for other reasons.
    const error = (result as { error?: string }).error;
    if (error !== undefined) {
      expect(error).not.toMatch(/10 MB/);
    }
  });

  // -------------------------------------------------------------------------
  // 5. Invalid file type
  // -------------------------------------------------------------------------
  it("returns { success: false } for image/svg+xml", async () => {
    const svgFile = makeFile({ name: "evil.svg", type: "image/svg+xml" });
    const fd = validFormData({ file: svgFile });
    const result = await uploadImage(fd);
    expect(result).toMatchObject({ success: false });
    expect(uploadImageToGitHubMock).not.toHaveBeenCalled();
  });

  it("returns { success: false } for application/pdf", async () => {
    const pdfFile = makeFile({ name: "doc.pdf", type: "application/pdf" });
    const fd = validFormData({ file: pdfFile });
    const result = await uploadImage(fd);
    expect(result).toMatchObject({ success: false });
    expect(uploadImageToGitHubMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 6. Happy path
  // -------------------------------------------------------------------------
  it("returns { success: true, url } on successful upload", async () => {
    uploadImageToGitHubMock.mockResolvedValue({
      url: "https://cdn.example.com/photo.png",
      fileName: "photo.png",
    });

    const result = await uploadImage(validFormData());

    expect(result).toEqual({ success: true, url: "https://cdn.example.com/photo.png" });
    expect(getGhTokenMock).toHaveBeenCalledTimes(1);
    expect(uploadImageToGitHubMock).toHaveBeenCalledTimes(1);

    const [token, owner, repo, file] = uploadImageToGitHubMock.mock.calls[0] as [
      string,
      string,
      string,
      { name: string; type: string; data: Buffer },
    ];
    expect(token).toBe("ghp_test_token");
    expect(owner).toBe(OWNER);
    expect(repo).toBe(REPO);
    expect(file.name).toBe("photo.png");
    expect(file.type).toBe("image/png");
    expect(Buffer.isBuffer(file.data)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 7. Core function throws
  // -------------------------------------------------------------------------
  it("returns { success: false } with formatted error when core throws", async () => {
    uploadImageToGitHubMock.mockRejectedValue(
      new Error("GitHub image upload failed (403): Forbidden"),
    );

    const result = await uploadImage(validFormData());

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("GitHub image upload failed"),
    });
  });

  it("returns { success: false } when getGhToken throws", async () => {
    getGhTokenMock.mockRejectedValue(new Error("gh auth: not logged in"));

    const result = await uploadImage(validFormData());

    expect(result).toMatchObject({ success: false });
    expect((result as { error: string }).error).toBeTruthy();
    expect(uploadImageToGitHubMock).not.toHaveBeenCalled();
  });
});
