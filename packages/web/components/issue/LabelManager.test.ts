import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { LabelManager } from "./LabelManager";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/actions/issues", () => ({
  toggleLabel: vi.fn(),
  togglePullLabel: vi.fn(),
}));

vi.mock("@/lib/tryOrQueue", () => ({
  tryOrQueue: vi.fn(),
}));

const labels = [
  { name: "bug", color: "d73a4a", description: null },
  { name: "issuectl:auto-launch", color: "0e8a16", description: null },
];

describe("LabelManager", () => {
  it("surfaces webhook delivery preflight before automation labels", () => {
    const html = renderToStaticMarkup(
      createElement(
        ToastProvider,
        null,
        createElement(LabelManager, {
          owner: "mean-weasel",
          repo: "issuectl",
          issueNumber: 534,
          currentLabels: [],
          availableLabels: labels,
          webhookHealth: {
            state: "error",
            summary: "Webhook delivery infrastructure failed with 502",
            detail: "GitHub reached the configured hook but the latest delivery failed before issuectl could rely on it.",
            recovery: "Start a fresh tunnel and run issuectl webhook rotate mean-weasel/issuectl --yes.",
            expectedUrl: "https://current.example.test/api/webhook/github/1",
            hookId: 123,
            githubUrl: "https://old.example.test/api/webhook/github/1",
            latestDelivery: {
              event: "issues",
              action: "labeled",
              status: null,
              statusCode: 502,
              deliveredAt: "2026-06-02T20:00:00Z",
            },
          },
        }),
      ),
    );

    expect(html).toContain("Webhook delivery infrastructure failed with 502");
    expect(html).toContain("auto-launch labels rely on the GitHub webhook reaching this machine");
    expect(html).toContain("latest: issues.labeled");
    expect(html).toContain("Check delivery");
    expect(html).toContain("issuectl webhook rotate mean-weasel/issuectl --yes");
  });
});
