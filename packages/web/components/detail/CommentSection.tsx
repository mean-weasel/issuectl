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
  // clear pending optimistic comments — the server data is authoritative.
  useEffect(() => {
    if (initialComments.length > prevCountRef.current) {
      const serverBodies = new Set(initialComments.map(c => c.body));
      setPendingComments(prev => prev.filter(p => !serverBodies.has(p.body)));
    }
    prevCountRef.current = initialComments.length;
  }, [initialComments.length]);

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
