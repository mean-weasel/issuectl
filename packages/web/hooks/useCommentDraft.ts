"use client";

import { useState, useEffect, useCallback } from "react";

function storageKey(owner: string, repo: string, issueNumber: number): string {
  return `comment-draft:${owner}/${repo}#${issueNumber}`;
}

export function useCommentDraft(
  owner: string,
  repo: string,
  issueNumber: number,
) {
  const key = storageKey(owner, repo, issueNumber);

  const [body, setBody] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    try {
      if (body) {
        localStorage.setItem(key, body);
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      // localStorage may be full or unavailable — silently ignore
    }
  }, [body, key]);

  const clear = useCallback(() => {
    setBody("");
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore
    }
  }, [key]);

  return { body, setBody, clear };
}
