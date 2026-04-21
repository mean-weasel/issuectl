import Image from "next/image";
import type { GitHubComment } from "@issuectl/core";
import { timeAgo } from "@/lib/format";
import { BodyText } from "./BodyText";
import styles from "./CommentList.module.css";

type Props = {
  comments: GitHubComment[];
};

function initials(login: string | undefined): string {
  if (!login) return "??";
  return login.slice(0, 2).toLowerCase();
}

export function CommentList({ comments }: Props) {
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
          <div key={c.id} className={styles.comment}>
            <div className={styles.head}>
              <div className={styles.avi}>
                {c.user?.avatarUrl ? (
                  <Image src={c.user.avatarUrl} alt="" width={26} height={26} />
                ) : (
                  initials(c.user?.login)
                )}
              </div>
              <div className={styles.who}>{c.user?.login ?? "unknown"}</div>
              <div className={styles.time}>{timeAgo(c.updatedAt)}</div>
            </div>
            <BodyText body={c.body} className={styles.commentBody} />
          </div>
        ))
      )}
    </>
  );
}
