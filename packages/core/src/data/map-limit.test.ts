import { describe, it, expect } from "vitest";
import { mapLimit } from "./map-limit.js";

describe("mapLimit", () => {
  it("returns [] for an empty input", async () => {
    const result = await mapLimit([], 3, async (x) => x);
    expect(result).toEqual([]);
  });

  it("preserves input order in the result array", async () => {
    const items = [1, 2, 3, 4, 5];
    // Intentionally stagger so completion order is reversed relative
    // to input order; the result array must still match input order.
    const result = await mapLimit(items, 2, async (x) => {
      await new Promise((r) => setTimeout(r, (6 - x) * 5));
      return x * 10;
    });
    expect(result).toEqual([10, 20, 30, 40, 50]);
  });

  it("caps in-flight work at `limit` at any point in time", async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);

    await mapLimit(items, 4, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });

    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1); // actually parallel, not serialized
  });

  it("clamps limit to item count when limit > items.length", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapLimit([1, 2, 3], 100, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
    });
    expect(peak).toBe(3);
  });

  it("clamps limit to 1 when passed 0 or negative", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapLimit([1, 2, 3], 0, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
    });
    expect(peak).toBe(1);
  });

  it("rejects the overall promise when any worker throws", async () => {
    const items = [1, 2, 3, 4, 5];
    await expect(
      mapLimit(items, 2, async (x) => {
        if (x === 3) throw new Error("boom");
        return x;
      }),
    ).rejects.toThrow("boom");
  });

  it("passes the item index to the callback", async () => {
    const items = ["a", "b", "c"];
    const result = await mapLimit(items, 2, async (item, index) => ({
      item,
      index,
    }));
    expect(result).toEqual([
      { item: "a", index: 0 },
      { item: "b", index: 1 },
      { item: "c", index: 2 },
    ]);
  });
});
