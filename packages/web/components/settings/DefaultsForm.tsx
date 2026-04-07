"use client";

import { useState, useTransition, useRef, useCallback, useEffect } from "react";
import { updateSetting } from "@/lib/actions/settings";
import type { SettingKey } from "@issuectl/core";
import styles from "./DefaultsForm.module.css";

type DefaultKey = Extract<SettingKey, "branch_pattern" | "cache_ttl">;

type Props = {
  branchPattern: string;
  cacheTTL: string;
};

export function DefaultsForm({ branchPattern, cacheTTL }: Props) {
  const [values, setValues] = useState({
    branch_pattern: branchPattern,
    cache_ttl: cacheTTL,
  });
  const [savedKey, setSavedKey] = useState<DefaultKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const save = useCallback(
    (key: DefaultKey, value: string) => {
      setError(null);
      setSavedKey(null);
      startTransition(async () => {
        const result = await updateSetting(key, value);
        if (result.success) {
          setSavedKey(key);
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => setSavedKey(null), 2000);
        } else {
          setError(result.error ?? "Failed to save");
        }
      });
    },
    [startTransition],
  );

  function handleBlur(key: DefaultKey) {
    const original = key === "branch_pattern" ? branchPattern : cacheTTL;
    if (values[key] !== original) {
      save(key, values[key]);
    }
  }

  return (
    <>
      <div className={styles.row}>
        <div className={styles.field}>
          <div className={styles.label}>Branch Pattern</div>
          <input
            className={styles.input}
            value={values.branch_pattern}
            onChange={(e) =>
              setValues((v) => ({ ...v, branch_pattern: e.target.value }))
            }
            onBlur={() => handleBlur("branch_pattern")}
            disabled={isPending}
          />
        </div>
        <div className={styles.field}>
          <div className={styles.label}>Cache TTL (seconds)</div>
          <input
            className={styles.input}
            value={values.cache_ttl}
            onChange={(e) =>
              setValues((v) => ({ ...v, cache_ttl: e.target.value }))
            }
            onBlur={() => handleBlur("cache_ttl")}
            disabled={isPending}
          />
        </div>
      </div>
      {savedKey && <div className={styles.saved}>Saved</div>}
      {error && <div className={styles.error} role="alert">{error}</div>}
    </>
  );
}
