"use client";

import { Modal } from "./Modal";
import { Button } from "./Button";
import styles from "./ConfirmDialog.module.css";

type Props = {
  title: string;
  message: string;
  confirmLabel?: string;
  /** Use "danger" (default) for destructive actions, "default" for neutral. */
  confirmVariant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
  error?: string;
};

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  confirmVariant = "danger",
  onConfirm,
  onCancel,
  isPending,
  error,
}: Props) {
  return (
    <Modal
      title={title}
      width={440}
      onClose={onCancel}
      disabled={isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            disabled={isPending}
            className={confirmVariant === "danger" ? styles.danger : undefined}
          >
            {isPending ? `${confirmLabel}...` : confirmLabel}
          </Button>
        </>
      }
    >
      <p className={styles.message}>{message}</p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
