import { describe, it, expect } from "vitest";
import { parseCount } from "./parse-count";

describe("parseCount", () => {
  it("returns null for undefined", () => {
    expect(parseCount(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseCount("")).toBeNull();
  });

  it("parses a positive integer", () => {
    expect(parseCount("3")).toBe(3);
  });

  it("parses zero", () => {
    expect(parseCount("0")).toBe(0);
  });

  it("returns null for negative values", () => {
    expect(parseCount("-1")).toBeNull();
  });

  it("returns null for non-integer floats", () => {
    expect(parseCount("1.5")).toBeNull();
  });

  it("returns null for non-numeric strings", () => {
    expect(parseCount("abc")).toBeNull();
  });

  it("returns null for scientific notation", () => {
    expect(parseCount("1e2")).toBeNull();
  });

  it("returns null for leading whitespace", () => {
    expect(parseCount(" 3")).toBeNull();
  });

  it("returns null for trailing whitespace", () => {
    expect(parseCount("3 ")).toBeNull();
  });

  it("returns null for integer beyond Number.MAX_SAFE_INTEGER", () => {
    expect(parseCount("9007199254740993")).toBeNull();
  });

  it("parses Number.MAX_SAFE_INTEGER itself", () => {
    expect(parseCount(String(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
  });
});
