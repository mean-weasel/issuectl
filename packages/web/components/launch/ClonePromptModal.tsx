"use client";

import { Button } from "@/components/ui/Button";
import styles from "./ClonePromptModal.module.css";

type Props = {
  owner: string;
  repo: string;
  onConfirm: () => void;
  onClose: () => void;
};

export function ClonePromptModal({ owner, repo, onConfirm, onClose }: Props) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Repository not cloned</span>
          <button className={styles.close} onClick={onClose}>
            &times;
          </button>
        </div>

        <div className={styles.body}>
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
        </div>

        <div className={styles.footer}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            Clone &amp; Launch
          </Button>
        </div>
      </div>
    </div>
  );
}
