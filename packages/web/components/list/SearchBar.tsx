"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSearch } from "./SearchContext";
import styles from "./SearchBar.module.css";

const DEBOUNCE_MS = 200;

export function SearchBar() {
  const { query, setQuery } = useSearch();
  const [localValue, setLocalValue] = useState(query);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);

  // Sync local value when external query changes (e.g. cleared elsewhere)
  useEffect(() => {
    setLocalValue(query);
  }, [query]);

  const handleChange = useCallback(
    (value: string) => {
      setLocalValue(value);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setQuery(value);
      }, DEBOUNCE_MS);
    },
    [setQuery],
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleClear = useCallback(() => {
    setLocalValue("");
    setQuery("");
    inputRef.current?.focus();
  }, [setQuery]);

  const handleMobileToggle = useCallback(() => {
    setExpanded(true);
    // Focus after the next paint so the input is visible
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  const handleBlur = useCallback(() => {
    // Collapse mobile search if empty
    if (localValue === "") {
      setExpanded(false);
    }
  }, [localValue]);

  return (
    <div
      className={`${styles.wrapper} ${expanded ? styles.expanded : ""}`}
    >
      {/* Mobile: icon-only trigger */}
      <button
        type="button"
        className={styles.mobileToggle}
        onClick={handleMobileToggle}
        aria-label="Open search"
      >
        <SearchIcon />
      </button>

      {/* Desktop: always visible / Mobile: visible when expanded */}
      <div className={styles.inputWrap}>
        <SearchIcon />
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          value={localValue}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          placeholder="search..."
          aria-label="Search issues, PRs, and drafts"
        />
        {localValue && (
          <button
            type="button"
            className={styles.clear}
            onClick={handleClear}
            aria-label="Clear search"
          >
            &times;
          </button>
        )}
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      className={styles.icon}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="5.5"
        cy="5.5"
        r="4"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M9 9l3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
