import type { GitHubComment } from "@issuectl/core";
import { CommentCard } from "./CommentCard";
import { CommentForm } from "./CommentForm";
import styles from "./CommentThread.module.css";

type Props = {
  comments: GitHubComment[];
  owner: string;
  repo: string;
  issueNumber: number;
};

export function CommentThread({ comments, owner, repo, issueNumber }: Props) {
  return (
    <div className={styles.container}>
      <span className={styles.title}>
        {comments.length} Comment{comments.length !== 1 ? "s" : ""}
      </span>
      {comments.map((comment) => (
        <CommentCard key={comment.id} comment={comment} />
      ))}
      <CommentForm owner={owner} repo={repo} issueNumber={issueNumber} />
    </div>
  );
}
