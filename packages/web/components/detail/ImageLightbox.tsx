"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import styles from "./ImageLightbox.module.css";

type LightboxState = {
  images: string[];
  index: number;
} | null;

type LightboxContextValue = {
  open: (src: string, allImages: string[]) => void;
};

const LightboxContext = createContext<LightboxContextValue | null>(null);

export function useLightbox(): LightboxContextValue | null {
  return useContext(LightboxContext);
}

export function LightboxProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LightboxState>(null);

  const open = useCallback((src: string, allImages: string[]) => {
    if (allImages.length === 0) return;
    const index = allImages.indexOf(src);
    setState({ images: allImages, index: index >= 0 ? index : 0 });
  }, []);

  const close = useCallback(() => setState(null), []);

  const prev = useCallback(() => {
    setState((s) => {
      if (!s) return s;
      return { ...s, index: s.index === 0 ? s.images.length - 1 : s.index - 1 };
    });
  }, []);

  const next = useCallback(() => {
    setState((s) => {
      if (!s) return s;
      return { ...s, index: (s.index + 1) % s.images.length };
    });
  }, []);

  return (
    <LightboxContext.Provider value={{ open }}>
      {children}
      {state && (
        <ImageLightbox
          images={state.images}
          index={state.index}
          onClose={close}
          onPrev={prev}
          onNext={next}
        />
      )}
    </LightboxContext.Provider>
  );
}

type LightboxProps = {
  images: string[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
};

function ImageLightbox({ images, index, onClose, onPrev, onNext }: LightboxProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    };
    const prevOverflow = document.body.style.overflow;
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, onPrev, onNext]);

  const src = images[index];
  const total = images.length;

  return createPortal(
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label="Image viewer">
      <button className={styles.close} onClick={onClose} aria-label="Close">
        &times;
      </button>

      {total > 1 && (
        <button
          className={styles.navPrev}
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          aria-label="Previous image"
        >
          &lsaquo;
        </button>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.image}
        src={src}
        alt=""
        onClick={(e) => e.stopPropagation()}
      />

      {total > 1 && (
        <button
          className={styles.navNext}
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          aria-label="Next image"
        >
          &rsaquo;
        </button>
      )}

      {total > 1 && (
        <div className={styles.counter}>
          {index + 1} of {total}
        </div>
      )}
    </div>,
    document.body,
  );
}
