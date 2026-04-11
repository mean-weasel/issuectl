import type { Draft } from "@issuectl/core";
import { Chip } from "@/components/paper";
import { DetailTopBar } from "./DetailTopBar";
import { DetailMeta, MetaSeparator } from "./DetailMeta";
import { BodyText } from "./BodyText";
import styles from "./DraftDetail.module.css";

type Props = {
  draft: Draft;
};

function formatUnix(updatedAt: number): string {
  const t = updatedAt * 1000;
  const diffDays = Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
  if (diffDays < 1) return "today";
  if (diffDays === 1) return "1d old";
  return `${diffDays}d old`;
}

export function DraftDetail({ draft }: Props) {
  return (
    <div className={styles.container}>
      <DetailTopBar backHref="/" crumb={<em>draft</em>} />
      <div className={styles.body}>
        <h1 className={styles.title}>{draft.title}</h1>
        <DetailMeta>
          <Chip variant="dashed">no repo</Chip>
          <MetaSeparator />
          <span>priority: {draft.priority}</span>
          <MetaSeparator />
          <span>{formatUnix(draft.updatedAt)}</span>
        </DetailMeta>
        <div className={styles.hint}>
          this is a local draft — it lives only on your machine until you
          assign it to a repo.
        </div>
        <BodyText body={draft.body} />
      </div>
    </div>
  );
}
