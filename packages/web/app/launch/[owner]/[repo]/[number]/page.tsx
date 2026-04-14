import { notFound } from "next/navigation";
import { getDb, getDeploymentById } from "@issuectl/core";
import { DetailTopBar } from "@/components/detail/DetailTopBar";
import { LaunchProgress } from "@/components/launch/LaunchProgress";
import { LaunchProgressPoller } from "@/components/launch/LaunchProgressPoller";
import { parseCount } from "@/lib/parse-count";

export const dynamic = "force-dynamic";

type Params = {
  owner: string;
  repo: string;
  number: string;
};

type SearchParams = {
  deploymentId?: string;
  c?: string;
  f?: string;
};

export default async function LaunchProgressPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const { owner, repo, number } = await params;
  const { deploymentId: idStr, c, f } = await searchParams;

  const issueNumber = Number(number);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    notFound();
  }

  const deploymentId = idStr ? Number(idStr) : null;
  if (!deploymentId || !Number.isInteger(deploymentId) || deploymentId <= 0) {
    notFound();
  }

  const db = getDb();
  const deployment = getDeploymentById(db, deploymentId);
  if (!deployment) {
    notFound();
  }

  const commentCount = parseCount(c);
  const fileCount = parseCount(f);
  const counts =
    commentCount !== null && fileCount !== null
      ? { commentCount, fileCount }
      : undefined;

  return (
    <div style={{ background: "var(--paper-bg)", minHeight: "100dvh" }}>
      <DetailTopBar
        backHref={`/issues/${owner}/${repo}/${issueNumber}`}
        crumb={
          <>
            {owner}/<b>{repo}</b> · #{issueNumber}
          </>
        }
      />
      <div
        style={{
          maxWidth: 820,
          margin: "0 auto",
          padding: "22px 24px 60px",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--paper-serif)",
            fontWeight: 500,
            fontSize: 22,
            fontStyle: "italic",
            color: "var(--paper-ink)",
            marginBottom: 4,
          }}
        >
          {deployment.endedAt ? "launched" : "launching…"}
        </h1>
        <p
          style={{
            fontFamily: "var(--paper-serif)",
            fontSize: 13,
            color: "var(--paper-ink-muted)",
            marginBottom: 24,
          }}
        >
          {owner}/{repo} · #{issueNumber}
        </p>
        <LaunchProgress deployment={deployment} counts={counts} />
        <LaunchProgressPoller active={deployment.endedAt === null} />
      </div>
    </div>
  );
}
