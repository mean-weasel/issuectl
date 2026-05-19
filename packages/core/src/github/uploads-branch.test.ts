import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { uploadImageToGitHub } from "./uploads.js";
import { makeContentsApiOkResponse, TOKEN, OWNER, REPO, VALID_FILE } from "./uploads-test-helpers.js";

describe("uploadImageToGitHub branch setup", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  // 8c. Malformed SHA from Git Data API is rejected
  it("throws when Git Data API returns a malformed SHA", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: false, status: 404, statusText: "Not Found",
        json: vi.fn().mockResolvedValue({}),
        text: vi.fn().mockResolvedValue(""),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true, status: 201, statusText: "Created",
        json: vi.fn().mockResolvedValue({ sha: "short" }),
        text: vi.fn().mockResolvedValue(""),
      } as unknown as Response);

    await expect(
      uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE),
    ).rejects.toThrow("missing or malformed 'sha' field");
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
