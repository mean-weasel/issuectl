"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import styles from "./BodyText.module.css";

const REMARK_PLUGINS = [remarkGfm];

type Props = {
  body: string | null | undefined;
  className?: string;
  onImageClick?: (src: string) => void;
};

export function BodyText({ body, className, onImageClick }: Props) {
  const components: Components | undefined = useMemo(() => {
    if (!onImageClick) return undefined;
    return {
      img: ({ src, alt, ...rest }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          {...rest}
          src={src}
          alt={alt ?? ""}
          onClick={() => typeof src === "string" && onImageClick(src)}
          style={{ cursor: "pointer" }}
        />
      ),
    };
  }, [onImageClick]);

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
