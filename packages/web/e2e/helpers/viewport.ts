import { expect, type Page } from "@playwright/test";

/**
 * Asserts that the page has no horizontal overflow.
 * Fails if document.documentElement.scrollWidth > document.documentElement.clientWidth.
 */
export async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    scrollWidth,
    `Horizontal overflow: scrollWidth ${scrollWidth}px > clientWidth ${clientWidth}px`,
  ).toBeLessThanOrEqual(clientWidth);
}

/**
 * Asserts that no visible elements bleed outside the viewport boundaries.
 * Samples up to maxElements from main, dialogs, and header children.
 */
export async function assertNoElementBleed(
  page: Page,
  maxElements = 50,
): Promise<void> {
  const bleeds = await page.evaluate((max: number) => {
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const candidates = Array.from(
      document.querySelectorAll<Element>(
        "main *, [role='dialog'] *, header *",
      ),
    ).slice(0, max);

    const offenders: Array<{
      tag: string;
      id: string;
      className: string;
      right: number;
      bottom: number;
    }> = [];

    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (rect.right > vw + 1 || rect.bottom > vh + 200) {
        offenders.push({
          tag: el.tagName.toLowerCase(),
          id: (el as HTMLElement).id ?? "",
          className:
            typeof (el as HTMLElement).className === "string"
              ? (el as HTMLElement).className
              : "",
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
        });
      }
    }

    return offenders;
  }, maxElements);

  const detail = bleeds
    .map(
      (b) =>
        `<${b.tag}${b.id ? ` id="${b.id}"` : ""}${b.className ? ` class="${b.className}"` : ""}> right=${b.right} bottom=${b.bottom}`,
    )
    .join("\n  ");

  expect(
    bleeds,
    `${bleeds.length} element(s) bleed outside viewport:\n  ${detail}`,
  ).toHaveLength(0);
}

/**
 * Asserts that a scroll container is properly scrollable when its content
 * overflows vertically.
 */
export async function assertScrollContainerScrollable(
  page: Page,
  selector: string,
  label: string,
): Promise<void> {
  const result = await page.evaluate((sel: string) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return { found: false, overflows: false, overflowY: "" };
    const style = getComputedStyle(el);
    return {
      found: true,
      overflows: el.scrollHeight > el.clientHeight,
      overflowY: style.overflowY,
    };
  }, selector);

  if (!result.found) {
    expect(false, `${label}: selector "${selector}" not found`).toBe(true);
    return;
  }

  if (result.overflows) {
    expect(
      result.overflowY,
      `${label}: content overflows (scrollHeight > clientHeight) but overflowY is "${result.overflowY}" — expected "auto" or "scroll"`,
    ).toMatch(/^(auto|scroll)$/);
  }
}

/**
 * Asserts that there is no excessive dead whitespace below the main content.
 * Fails if the gap between the bottom of main content and the viewport bottom
 * exceeds tolerancePx.
 */
export async function assertNoDeadWhitespace(
  page: Page,
  tolerancePx = 80,
): Promise<void> {
  const { gap, viewportHeight, contentBottom } = await page.evaluate(() => {
    const main = document.querySelector("main");
    const el = main ?? document.body;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight;
    return {
      viewportHeight: vh,
      contentBottom: rect.bottom,
      gap: vh - rect.bottom,
    };
  });

  expect(
    gap,
    `Dead whitespace: ${gap}px gap below content (contentBottom=${contentBottom}, viewportHeight=${viewportHeight}, tolerance=${tolerancePx}px)`,
  ).toBeLessThanOrEqual(tolerancePx);
}
