"use client";

import { useState, useCallback } from "react";
import styles from "./FileSelector.module.css";

type Props = {
  referencedFiles: string[];
  selectedFiles: string[];
  onToggleFile: (path: string) => void;
  onAddFile: (path: string) => void;
};

export function FileSelector({
  referencedFiles,
  selectedFiles,
  onToggleFile,
  onAddFile,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAdd = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    if (trimmed.startsWith("/") || trimmed.includes("..")) {
      setError("Path must be relative (no leading / or ..)");
      return;
    }
    if (selectedFiles.includes(trimmed) || referencedFiles.includes(trimmed)) {
      setError("File already in list");
      return;
    }
    onAddFile(trimmed);
    setInputValue("");
    setError(null);
    setAdding(false);
  }, [inputValue, selectedFiles, referencedFiles, onAddFile]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAdd();
      }
      if (e.key === "Escape") {
        setAdding(false);
        setInputValue("");
        setError(null);
      }
    },
    [handleAdd],
  );

  return (
    <div className={styles.container}>
      {referencedFiles.map((file) => (
        <label key={file} className={styles.item}>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={selectedFiles.includes(file)}
            onChange={() => onToggleFile(file)}
          />
          <span className={styles.filePath}>{file}</span>
        </label>
      ))}

      {/* User-added files that aren't in referencedFiles */}
      {selectedFiles
        .filter((f) => !referencedFiles.includes(f))
        .map((file) => (
          <label key={file} className={styles.item}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked
              onChange={() => onToggleFile(file)}
            />
            <span className={styles.filePath}>{file}</span>
            <span className={styles.addedTag}>added</span>
          </label>
        ))}

      {adding ? (
        <div className={styles.addRow}>
          <input
            className={styles.addInput}
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="path/to/file.ts"
            autoFocus
            spellCheck={false}
          />
          <button
            type="button"
            className={styles.addConfirm}
            onClick={handleAdd}
            disabled={!inputValue.trim()}
          >
            Add
          </button>
          <button
            type="button"
            className={styles.addCancel}
            onClick={() => {
              setAdding(false);
              setInputValue("");
              setError(null);
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => setAdding(true)}
        >
          + add file path
        </button>
      )}
      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
}
