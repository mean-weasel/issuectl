import Image from "next/image";
import type { GitHubComment } from "@issuectl/core";
import { MarkdownBody } from "@/components/ui/MarkdownBody";
import { daysSince } from "@/lib/format";
import styles from "./CommentCard.module.css";

type Props = {
  comment: GitHubComment;
};

function initials(login: string): string {
  return login.slice(0, 2).toUpperCase();
}

export function CommentCard({ comment }: Props) {
  const login = comment.user?.login ?? "unknown";

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        {comment.user?.avatarUrl ? (
          <Image
            src={comment.user.avatarUrl}
            alt={login}
            width={24}
            height={24}
            className={styles.avatar}
          />
        ) : (
          <span className={styles.avatarFallback}>{initials(login)}</span>
        )}
        <span className={styles.author}>{login}</span>
        <span className={styles.date}>&middot; {daysSince(comment.createdAt)} ago</span>
      </div>
      {comment.body && (
        <MarkdownBody content={comment.body} className={styles.body} />
      )}
    </div>
  );
}
