"use client";

import { useCallback, useMemo, useRef } from "react";
import type { Components } from "react-markdown";
import { BodyText } from "./BodyText";
import { useLightbox } from "./ImageLightbox";

type Props = {
  body: string | null | undefined;
  className?: string;
};

export function LightboxBodyText({ body, className }: Props) {
  const lightbox = useLightbox();
  const containerRef = useRef<HTMLDivElement>(null);

  const handleImageClick = useCallback(
    (src: string) => {
      if (!lightbox) {
        if (process.env.NODE_ENV === "development") {
          console.warn(
            "[LightboxBodyText] No LightboxProvider found. Image click will not open lightbox.",
          );
        }
        return;
      }
      if (!containerRef.current) return;
      const page = containerRef.current.closest("[data-lightbox-root]");
      const root = page ?? document;
      const imgs = Array.from(root.querySelectorAll("img"))
        .map((el) => el.src)
        .filter((s) => s && !s.includes("avatarUrl") && !s.includes("githubusercontent.com/u/"));
      lightbox.open(src, imgs.length > 0 ? imgs : [src]);
    },
    [lightbox],
  );

  const components: Components | undefined = useMemo(() => {
    if (!lightbox) return undefined;
    return {
      img: ({ src, alt, ...rest }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          {...rest}
          src={src}
          alt={alt ?? ""}
          onClick={() => typeof src === "string" && handleImageClick(src)}
          style={{ cursor: "pointer" }}
        />
      ),
    };
  }, [lightbox, handleImageClick]);

  return (
    <div ref={containerRef}>
      <BodyText body={body} className={className} components={components} />
    </div>
  );
}
