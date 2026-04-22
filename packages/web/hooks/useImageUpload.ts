"use client";

import { useCallback, useRef, useState } from "react";
import { uploadImage } from "@/lib/actions/uploads";

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

type UseImageUploadOptions = {
  /** Setter for the textarea value */
  setBody: (value: string | ((prev: string) => string)) => void;
  /** Repo context for upload endpoint */
  owner: string;
  repo: string;
  /** Called on validation or upload error */
  onError: (message: string) => void;
};

type UseImageUploadReturn = {
  /** Whether an upload is in progress */
  uploading: boolean;
  /** Whether the user is dragging a file over the textarea */
  dragging: boolean;
  /** Ref to the hidden file input */
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  /** Attach to the textarea's onDragEnter */
  handleDragEnter: (e: React.DragEvent) => void;
  /** Attach to the textarea's onDragOver */
  handleDragOver: (e: React.DragEvent) => void;
  /** Attach to the textarea's onDragLeave */
  handleDragLeave: (e: React.DragEvent) => void;
  /** Attach to the textarea's onDrop */
  handleDrop: (e: React.DragEvent) => void;
  /** Attach to the textarea's onPaste */
  handlePaste: (e: React.ClipboardEvent) => void;
  /** Call from the attach button's onClick */
  openFilePicker: () => void;
  /** Attach to the hidden file input's onChange */
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export function useImageUpload({
  setBody,
  owner,
  repo,
  onError,
}: UseImageUploadOptions): UseImageUploadReturn {
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragCountRef = useRef(0);

  const processFiles = useCallback(
    async (files: File[]) => {
      const imageFiles = files.filter((f) => ALLOWED_TYPES.has(f.type));
      if (imageFiles.length === 0) {
        onError("Only PNG, JPG, GIF, and WEBP images are supported.");
        return;
      }

      setUploading(true);
      try {
        for (const file of imageFiles) {
          if (file.size > MAX_SIZE) {
            const failureMark = `![Too large: ${file.name}]()`;
            setBody((prev) => {
              const needsNewline = prev.length > 0 && !prev.endsWith("\n");
              return prev + (needsNewline ? "\n" : "") + failureMark;
            });
            onError(`${file.name} is too large (max 10 MB).`);
            continue;
          }

          const id = Math.random().toString(36).slice(2, 8);
          const placeholder = `![Uploading ${file.name} (${id})…]()`;
          setBody((prev) => {
            const needsNewline = prev.length > 0 && !prev.endsWith("\n");
            return prev + (needsNewline ? "\n" : "") + placeholder;
          });

          try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("owner", owner);
            formData.append("repo", repo);

            const result = await uploadImage(formData);

            if (result.success) {
              const markdown = `![${file.name}](${result.url})`;
              setBody((prev) => prev.replace(placeholder, markdown));
            } else {
              const failureMark = `![Upload failed: ${file.name}]()`;
              setBody((prev) => prev.replace(placeholder, failureMark));
              onError(result.error);
            }
          } catch (err) {
            const failureMark = `![Upload failed: ${file.name}]()`;
            setBody((prev) => prev.replace(placeholder, failureMark));
            onError(
              err instanceof Error ? err.message : "Upload failed",
            );
          }
        }
      } finally {
        setUploading(false);
      }
    },
    [owner, repo, setBody, onError],
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current++;
    setDragging(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current--;
    if (dragCountRef.current <= 0) {
      dragCountRef.current = 0;
      setDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCountRef.current = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        void processFiles(files);
      }
    },
    [processFiles],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData.items)
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((f): f is File => f !== null);
      if (files.length > 0) {
        e.preventDefault();
        void processFiles(files);
      }
    },
    [processFiles],
  );

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) {
        void processFiles(files);
      }
      e.target.value = "";
    },
    [processFiles],
  );

  return {
    uploading,
    dragging,
    fileInputRef,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePaste,
    openFilePicker,
    handleFileSelect,
  };
}
