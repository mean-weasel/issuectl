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
    } catch (err) {
      console.warn("[issuectl] Failed to read comment draft from localStorage:", err);
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
    } catch (err) {
      console.warn("[issuectl] Failed to persist comment draft:", err);
    }
  }, [body, key]);

  const clear = useCallback(() => {
    setBody("");
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.warn("[issuectl] Failed to remove comment draft from localStorage:", err);
    }
  }, [key]);

  return { body, setBody, clear };
}
