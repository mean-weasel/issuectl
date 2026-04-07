"use client";

import { Modal } from "./Modal";
import { Button } from "./Button";
import styles from "./ConfirmDialog.module.css";

type Props = {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
  error?: string | null;
};

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
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
            className={styles.danger}
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
