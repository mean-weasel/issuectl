import { vi } from "vitest";
import type { Octokit } from "@octokit/rest";

type MockFn = ReturnType<typeof vi.fn<(...args: unknown[]) => unknown>>;

type OctokitMocks = {
  octokit: Octokit;
  paginate: MockFn;
  get: MockFn;
  create: MockFn;
  update: MockFn;
  listComments: MockFn;
  createComment: MockFn;
  updateComment: MockFn;
  deleteComment: MockFn;
  listForRepo: MockFn;
};

export const RAW_ISSUE = {
  number: 1,
  title: "Bug report",
  body: "Something is broken",
  state: "open",
  labels: [{ name: "bug", color: "d73a4a", description: "Bug label" }],
  user: { login: "alice", avatar_url: "https://avatar.test/alice" },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
  closed_at: null,
  html_url: "https://github.com/owner/repo/issues/1",
};

export const RAW_COMMENT = {
  id: 100,
  body: "A comment",
  user: { login: "bob", avatar_url: "https://avatar.test/bob" },
  created_at: "2026-01-03T00:00:00Z",
  updated_at: "2026-01-03T00:00:00Z",
  html_url: "https://github.com/owner/repo/issues/1#issuecomment-100",
};


export function makeOctokit(): OctokitMocks {
  const paginate = vi.fn() as MockFn;
  const get = vi.fn() as MockFn;
  const create = vi.fn() as MockFn;
  const update = vi.fn() as MockFn;
  const listComments = vi.fn() as MockFn;
  const createComment = vi.fn() as MockFn;
  const updateComment = vi.fn() as MockFn;
  const deleteComment = vi.fn() as MockFn;
  const listForRepo = vi.fn() as MockFn;

  const octokit = {
    paginate,
    rest: {
      issues: { listForRepo, get, create, update, listComments, createComment, updateComment, deleteComment },
    },
  } as unknown as Octokit;

  return { octokit, paginate, get, create, update, listComments, createComment, updateComment, deleteComment, listForRepo };
}
