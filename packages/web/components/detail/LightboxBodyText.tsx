"use client";

import { useCallback, useRef } from "react";
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
      if (!lightbox || !containerRef.current) return;
      const page = containerRef.current.closest("[data-lightbox-root]");
      const root = page ?? document;
      const imgs = Array.from(root.querySelectorAll("img"))
        .map((el) => el.src)
        .filter((s) => s && !s.includes("avatarUrl") && !s.includes("githubusercontent.com/u/"));
      lightbox.open(src, imgs.length > 0 ? imgs : [src]);
    },
    [lightbox],
  );

  return (
    <div ref={containerRef}>
      <BodyText body={body} className={className} onImageClick={handleImageClick} />
    </div>
  );
}
