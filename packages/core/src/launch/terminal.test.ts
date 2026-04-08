import { describe, it, expect } from "vitest";
import { getTerminalLauncher, type TerminalSettings } from "./terminal.js";

const defaultSettings: TerminalSettings = {
  terminal: "ghostty",
  windowTitle: "issuectl",
  tabTitlePattern: "#{number} — {title}",
};

describe("getTerminalLauncher", () => {
  it("returns a launcher with name 'Ghostty' for 'ghostty'", () => {
    const launcher = getTerminalLauncher(defaultSettings);
    expect(launcher.name).toBe("Ghostty");
  });

  it("throws for unknown terminal", () => {
    const bad = { ...defaultSettings, terminal: "kitty" };
    expect(() => getTerminalLauncher(bad)).toThrow("Unsupported terminal: kitty");
  });
});
