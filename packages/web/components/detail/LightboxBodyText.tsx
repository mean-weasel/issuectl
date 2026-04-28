"use client";

import { useCallback, useMemo, useRef } from "react";
import type { Components } from "react-markdown";
import { BodyText } from "./BodyText";
import { useLightbox } from "./ImageLightbox";

const AVATAR_URL_PATTERN = /avatars\.githubusercontent\.com/;
const AVATAR_MAX_SIZE = 100; // pixels — GitHub avatars are typically 20–46px

/** Detect avatar images by data attribute, URL pattern, or rendered size. */
function isAvatarImage(el: HTMLImageElement): boolean {
  if (el.hasAttribute("data-avatar")) return true;
  if (AVATAR_URL_PATTERN.test(el.src)) return true;
  // Check natural dimensions for already-loaded small images
  if (
    el.naturalWidth > 0 &&
    el.naturalWidth <= AVATAR_MAX_SIZE &&
    el.naturalHeight > 0 &&
    el.naturalHeight <= AVATAR_MAX_SIZE
  ) {
    return true;
  }
  return false;
}

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
        .filter((el) => !isAvatarImage(el))
        .map((el) => el.src)
        .filter((s) => s);
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
