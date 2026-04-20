import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./BodyText.module.css";

const REMARK_PLUGINS = [remarkGfm];

type Props = {
  body: string | null | undefined;
};

export function BodyText({ body }: Props) {
  if (!body || body.trim().length === 0) {
    return (
      <div className={styles.empty}>
        <em>no description</em>
      </div>
    );
  }
  return (
    <div className={styles.body}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{body}</ReactMarkdown>
    </div>
  );
}
