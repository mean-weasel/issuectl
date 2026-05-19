import { vi } from "vitest";

export function makeSmallBuffer(bytes = 100): Buffer {
  return Buffer.alloc(bytes, 0);
}

export function makeContentsApiOkResponse(downloadUrl: string): Response {
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
  } as unknown as Response;
}

export function makeErrorResponse(status: number, text = ""): Response {
  return {
    ok: false,
    status,
    statusText: "Error",
    json: vi.fn().mockResolvedValue({}),
    text: vi.fn().mockResolvedValue(text),
  } as unknown as Response;
}

export const TOKEN = "ghp_test_token";
export const OWNER = "test-owner";
export const REPO = "test-repo";

export const VALID_FILE = {
  name: "test.png",
  type: "image/png",
  data: makeSmallBuffer(),
};
