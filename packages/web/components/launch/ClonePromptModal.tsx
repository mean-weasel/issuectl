"use client";

import { Button } from "@/components/paper";
import { Modal } from "@/components/ui/Modal";
import styles from "./ClonePromptModal.module.css";

type Props = {
  owner: string;
  repo: string;
  onConfirm: () => void;
  onClose: () => void;
};

export function ClonePromptModal({ owner, repo, onConfirm, onClose }: Props) {
  return (
    <Modal
      title="Repository not cloned"
      width={500}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            Clone &amp; Launch
          </Button>
        </>
      }
    >
      <div className={styles.warning}>
        <span className={styles.warningIcon}>!</span>
        <div className={styles.warningText}>
          <strong>
            {owner}/{repo}
          </strong>{" "}
          has no local path configured. To launch Claude Code, the repo
          will be cloned automatically.
        </div>
      </div>

      <div className={styles.hint}>
        A shallow clone will be created in your configured worktree
        directory. You can change the local path later in Settings.
      </div>
    </Modal>
  );
}
