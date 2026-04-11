import type { GitHubComment } from "@issuectl/core";
import styles from "./CommentList.module.css";

type Props = {
  comments: GitHubComment[];
};

// "3d ago" style formatting. GitHub comments use ISO strings.
function formatTime(updatedAt: string): string {
  const t = new Date(updatedAt).getTime();
  if (!Number.isFinite(t)) return "";
  const diffDays = Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
  if (diffDays < 1) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function initials(login: string | undefined): string {
  if (!login) return "??";
  return login.slice(0, 2).toLowerCase();
}

export function CommentList({ comments }: Props) {
  return (
    <>
      <div className={styles.section}>
        comments <span className={styles.count}>{comments.length}</span>
      </div>
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
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.user.avatarUrl} alt="" />
                ) : (
                  initials(c.user?.login)
                )}
              </div>
              <div className={styles.who}>{c.user?.login ?? "unknown"}</div>
              <div className={styles.time}>{formatTime(c.updatedAt)}</div>
            </div>
            <div className={styles.body}>{c.body}</div>
          </div>
        ))
      )}
    </>
  );
}
