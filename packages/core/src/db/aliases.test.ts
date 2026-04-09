import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "./test-helpers.js";
import {
  listAliases,
  getDefaultAlias,
  addAlias,
  removeAlias,
  setDefaultAlias,
  clearDefaultAlias,
} from "./aliases.js";

describe("aliases", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("listAliases returns empty array initially", () => {
    expect(listAliases(db)).toEqual([]);
  });

  it("addAlias creates an alias and returns it", () => {
    const alias = addAlias(db, "yolo", "Skip permissions");
    expect(alias.command).toBe("yolo");
    expect(alias.description).toBe("Skip permissions");
    expect(alias.isDefault).toBe(false);
    expect(alias.id).toBeGreaterThan(0);
  });

  it("listAliases returns added aliases ordered by command", () => {
    addAlias(db, "zz", "second");
    addAlias(db, "aa", "first");
    const list = listAliases(db);
    expect(list).toHaveLength(2);
    expect(list[0].command).toBe("aa");
    expect(list[1].command).toBe("zz");
  });

  it("addAlias rejects duplicate commands", () => {
    addAlias(db, "yolo", "first");
    expect(() => addAlias(db, "yolo", "duplicate")).toThrow();
  });

  it("removeAlias deletes an alias", () => {
    const alias = addAlias(db, "yolo", "desc");
    removeAlias(db, alias.id);
    expect(listAliases(db)).toEqual([]);
  });

  it("getDefaultAlias returns undefined when none set", () => {
    addAlias(db, "yolo", "desc");
    expect(getDefaultAlias(db)).toBeUndefined();
  });

  it("setDefaultAlias marks one alias as default", () => {
    const a1 = addAlias(db, "yolo", "first");
    addAlias(db, "safe", "second");
    setDefaultAlias(db, a1.id);

    const def = getDefaultAlias(db);
    expect(def).toBeDefined();
    expect(def!.command).toBe("yolo");
  });

  it("setDefaultAlias clears previous default", () => {
    const a1 = addAlias(db, "yolo", "first");
    const a2 = addAlias(db, "safe", "second");

    setDefaultAlias(db, a1.id);
    setDefaultAlias(db, a2.id);

    const def = getDefaultAlias(db);
    expect(def!.command).toBe("safe");

    const list = listAliases(db);
    expect(list.filter((a) => a.isDefault)).toHaveLength(1);
  });

  it("clearDefaultAlias removes the default", () => {
    const a1 = addAlias(db, "yolo", "desc");
    setDefaultAlias(db, a1.id);
    clearDefaultAlias(db);
    expect(getDefaultAlias(db)).toBeUndefined();
  });

  it("removing the default alias leaves no default", () => {
    const a1 = addAlias(db, "yolo", "desc");
    setDefaultAlias(db, a1.id);
    removeAlias(db, a1.id);
    expect(getDefaultAlias(db)).toBeUndefined();
  });

  it("addAlias rejects empty command", () => {
    expect(() => addAlias(db, "", "desc")).toThrow("must not be empty");
  });

  it("addAlias rejects whitespace-only command", () => {
    expect(() => addAlias(db, "   ", "desc")).toThrow("must not be empty");
  });

  it("addAlias rejects command with shell metacharacters", () => {
    expect(() => addAlias(db, "claude; rm -rf /", "bad")).toThrow("simple executable name");
    expect(() => addAlias(db, "$(evil)", "bad")).toThrow("simple executable name");
    expect(() => addAlias(db, "cmd | other", "bad")).toThrow("simple executable name");
  });

  it("addAlias accepts commands with hyphens, underscores, dots, slashes", () => {
    const a = addAlias(db, "my-cli_tool.v2", "desc");
    expect(a.command).toBe("my-cli_tool.v2");
    const b = addAlias(db, "/usr/local/bin/claude", "full path");
    expect(b.command).toBe("/usr/local/bin/claude");
  });

  it("removeAlias throws on nonexistent id", () => {
    expect(() => removeAlias(db, 99999)).toThrow("not found");
  });

  it("setDefaultAlias throws on nonexistent id and preserves existing default", () => {
    const a1 = addAlias(db, "yolo", "desc");
    setDefaultAlias(db, a1.id);
    expect(() => setDefaultAlias(db, 99999)).toThrow("not found");
    // Existing default should be preserved (transaction rolled back)
    const def = getDefaultAlias(db);
    expect(def).toBeDefined();
    expect(def!.command).toBe("yolo");
  });
});
