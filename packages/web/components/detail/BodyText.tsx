import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import styles from "./BodyText.module.css";

const REMARK_PLUGINS = [remarkGfm];

type Props = {
  body: string | null | undefined;
  className?: string;
  components?: Components;
};

export function BodyText({ body, className, components }: Props) {
  if (!body || body.trim().length === 0) {
    return (
      <div className={styles.empty}>
        <em>no description</em>
      </div>
    );
  }
  return (
    <div className={`${styles.body}${className ? ` ${className}` : ""}`}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
        {body}
      </ReactMarkdown>
    </div>
  );
}
