import type { GitHubComment } from "@issuectl/core";
import { CommentItem } from "./CommentItem";
import styles from "./CommentList.module.css";

type Props = {
  comments: GitHubComment[];
  currentUser: string | null;
  owner: string;
  repo: string;
  issueNumber: number;
};

export function CommentList({ comments, currentUser, owner, repo, issueNumber }: Props) {
  return (
    <>
      <h2 className={styles.section}>
        comments <span className={styles.count}>{comments.length}</span>
      </h2>
      {comments.length === 0 ? (
        <div className={styles.empty}>
          <em>no comments yet</em>
        </div>
      ) : (
        comments.map((c) => (
          <CommentItem
            key={c.id}
            comment={c}
            currentUser={currentUser}
            owner={owner}
            repo={repo}
            issueNumber={issueNumber}
          />
        ))
      )}
    </>
  );
}
