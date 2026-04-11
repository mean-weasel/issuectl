import { notFound } from "next/navigation";
import {
  getDb,
  getOctokit,
  getDeploymentById,
  getIssueDetail,
} from "@issuectl/core";
import { DetailTopBar } from "@/components/detail/DetailTopBar";
import { LaunchProgress } from "@/components/launch/LaunchProgress";

export const dynamic = "force-dynamic";

type Params = {
  owner: string;
  repo: string;
  number: string;
};

export default async function LaunchProgressPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ deploymentId?: string }>;
}) {
  const { owner, repo, number } = await params;
  const { deploymentId: idStr } = await searchParams;

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

  const octokit = await getOctokit();
  let commentCount = 0;
  let fileCount = 0;
  try {
    const detail = await getIssueDetail(
      db,
      octokit,
      owner,
      repo,
      issueNumber,
    );
    commentCount = detail.comments.length;
    fileCount = detail.referencedFiles.length;
  } catch {
    // Non-fatal — we can still show the progress without exact counts.
  }

  return (
    <div style={{ background: "var(--paper-bg)", minHeight: "100vh" }}>
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
        <LaunchProgress
          deployment={deployment}
          commentCount={commentCount}
          fileCount={fileCount}
        />
        <div style={{ marginTop: 30, textAlign: "center" }}>
          <a
            href={`/issues/${owner}/${repo}/${issueNumber}`}
            style={{
              fontFamily: "var(--paper-serif)",
              fontStyle: "italic",
              fontSize: 13,
              color: "var(--paper-ink-muted)",
              textDecoration: "none",
            }}
          >
            ‹ back to issue
          </a>
        </div>
      </div>
    </div>
  );
}
