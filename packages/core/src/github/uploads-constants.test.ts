import { describe, it, expect } from "vitest";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE, sanitizeFilename } from "./uploads.js";

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
