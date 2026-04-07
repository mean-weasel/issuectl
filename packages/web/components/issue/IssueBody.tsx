import { MarkdownBody } from "@/components/ui/MarkdownBody";
import styles from "./IssueBody.module.css";

type Props = {
  body: string | null;
};

export function IssueBody({ body }: Props) {
  if (!body) {
    return <div className={styles.empty}>No description provided.</div>;
  }

  return <MarkdownBody content={body} className={styles.body} />;
}
