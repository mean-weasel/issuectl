"use client";

import { useState, useRef, useEffect } from "react";
import type { GitHubComment } from "@issuectl/core";
import { CommentList } from "./CommentList";
import { CommentComposer } from "./CommentComposer";

type Props = {
  initialComments: GitHubComment[];
  currentUser: string | null;
  owner: string;
  repo: string;
  issueNumber: number;
};

export function CommentSection({ initialComments, currentUser, owner, repo, issueNumber }: Props) {
  const [pendingComments, setPendingComments] = useState<GitHubComment[]>([]);
  const prevCountRef = useRef(initialComments.length);

  // When server-rendered comments update (e.g. from router.refresh()),
  // remove only the specific confirmed optimistic comments — not all of them.
  // We match each server body to at most one pending comment so that rapid
  // double-posts of the same text don't lose the second optimistic entry.
  useEffect(() => {
    if (initialComments.length > prevCountRef.current) {
      const newServerBodies = initialComments
        .slice(prevCountRef.current)
        .map(c => c.body);
      setPendingComments(prev => {
        const remaining = [...prev];
        for (const body of newServerBodies) {
          const idx = remaining.findIndex(p => p.body === body);
          if (idx !== -1) remaining.splice(idx, 1);
        }
        return remaining;
      });
    }
    prevCountRef.current = initialComments.length;
  }, [initialComments]);

  const allComments = [...initialComments, ...pendingComments];

  const handleCommentPosted = (body: string) => {
    const optimistic: GitHubComment = {
      id: -Date.now(),
      body,
      user: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      htmlUrl: "",
    };
    setPendingComments((prev) => [...prev, optimistic]);
  };

  return (
    <>
      <CommentList
        comments={allComments}
        currentUser={currentUser}
        owner={owner}
        repo={repo}
        issueNumber={issueNumber}
      />
      <CommentComposer
        owner={owner}
        repo={repo}
        issueNumber={issueNumber}
        onCommentPosted={handleCommentPosted}
      />
    </>
  );
}
