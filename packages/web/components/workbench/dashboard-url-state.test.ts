import { describe, expect, it } from "vitest";
import {
  dashboardUrlSearch,
  parseBoardUrlState,
  parseGlobalIssueUrlState,
} from "./dashboard-url-state";
import {
  boardPresetState,
  boardPresetIdForState,
  globalIssuePresetState,
  globalIssuePresetIdForState,
} from "./dashboard-presets";

describe("dashboard URL state", () => {
  it("parses shareable global issue dashboard controls from URLs", () => {
    expect(parseGlobalIssueUrlState("?view=cached&status=running&sort=priority&q=paper-owl%20web"))
      .toEqual({
        view: "cached",
        status: "running",
        sort: "priority",
        query: "paper-owl web",
      });
    expect(parseGlobalIssueUrlState("?view=unknown&status=nope&sort=nope"))
      .toEqual({
        view: "all",
        status: "all",
        sort: "updated",
        query: "",
      });
  });

  it("parses shareable board controls from URLs", () => {
    expect(parseBoardUrlState("?view=attention&sort=priority&running=1&q=%23512"))
      .toEqual({
        view: "attention",
        sort: "priority",
        runningOnly: true,
        query: "#512",
      });
    expect(parseBoardUrlState("?view=errors&sort=payload&running=0"))
      .toEqual({
        view: "errors",
        sort: "payload",
        runningOnly: false,
        query: "",
      });
  });

  it("writes dashboard URL state while preserving unrelated query params", () => {
    expect(dashboardUrlSearch("globalIssues", "?repo=mean-weasel%2Fissuectl", {
      view: "cached",
      status: "all",
      sort: "updated",
      query: "paper-owl web",
    })).toBe("?repo=mean-weasel%2Fissuectl&view=cached&q=paper-owl+web");

    expect(dashboardUrlSearch("board", "?repo=mean-weasel%2Fissuectl&view=cached&q=old", {
      view: "all",
      sort: "payload",
      runningOnly: true,
      query: "",
    })).toBe("?repo=mean-weasel%2Fissuectl&running=1");
  });

  it("maps global issue triage presets to complete dashboard states", () => {
    expect(globalIssuePresetState("attention")).toEqual({
      view: "attention",
      status: "all",
      sort: "priority",
      query: "",
    });
    expect(globalIssuePresetState("active")).toEqual({
      view: "running",
      status: "running",
      sort: "updated",
      query: "",
    });
    expect(globalIssuePresetState("errors")).toEqual({
      view: "errors",
      status: "all",
      sort: "updated",
      query: "",
    });
  });

  it("maps board triage presets to complete dashboard states", () => {
    expect(boardPresetState("attention")).toEqual({
      view: "attention",
      sort: "priority",
      runningOnly: false,
      query: "",
    });
    expect(boardPresetState("active")).toEqual({
      view: "running",
      sort: "payload",
      runningOnly: true,
      query: "",
    });
    expect(boardPresetState("cached")).toEqual({
      view: "cached",
      sort: "payload",
      runningOnly: false,
      query: "",
    });
  });

  it("recognizes the active triage preset from dashboard state", () => {
    expect(globalIssuePresetIdForState(globalIssuePresetState("active"))).toBe("active");
    expect(boardPresetIdForState(boardPresetState("attention"))).toBe("attention");
    expect(globalIssuePresetIdForState({
      view: "running",
      status: "all",
      sort: "updated",
      query: "",
    })).toBeNull();
  });
});
