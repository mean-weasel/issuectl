"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createDraftAction,
  assignDraftAction,
  getDefaultRepoIdAction,
} from "@/lib/actions/drafts";
import { useToast } from "@/components/ui/ToastProvider";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import styles from "./QuickCreateInline.module.css";

type Props = {
  onCreated: () => void;
};

export function QuickCreateInline({ onCreated }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    const trimmed = title.trim();
    if (!trimmed) return;

    startTransition(async () => {
      try {
        const draftResult = await createDraftAction({ title: trimmed });
        if (!draftResult.success) {
          showToast(draftResult.error, "error");
          return;
        }

        const defaultRepoId = await getDefaultRepoIdAction();
        if (defaultRepoId) {
          const key = newIdempotencyKey();
          const assignResult = await assignDraftAction(
            draftResult.id,
            defaultRepoId,
            key,
          );
          if (!assignResult.success) {
            showToast("Draft saved but assignment failed \u2014 assign it manually", "warning");
            setTitle("");
            router.refresh();
            onCreated();
            return;
          }
          const msg = assignResult.cleanupWarning
            ?? `Issue #${assignResult.issueNumber} created`;
          showToast(msg, assignResult.cleanupWarning ? "warning" : "success");
          setTitle("");
          router.refresh();
          onCreated();
          return;
        }

        showToast("Draft saved", "success");
        setTitle("");
        router.refresh();
        onCreated();
      } catch (err) {
        console.error("[issuectl] Quick create failed:", err);
        showToast("Failed to create", "error");
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !isPending && title.trim()) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.inputRow}>
        <input
          className={styles.input}
          type="text"
          placeholder="Quick create issue..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isPending}
          maxLength={256}
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="done"
          aria-label="Issue title"
        />
        <button
          type="button"
          className={styles.createBtn}
          onClick={handleSubmit}
          disabled={isPending || !title.trim()}
          aria-label={isPending ? "Creating\u2026" : "Create issue"}
        >
          {isPending ? "\u2026" : "+"}
        </button>
      </div>
    </div>
  );
}
