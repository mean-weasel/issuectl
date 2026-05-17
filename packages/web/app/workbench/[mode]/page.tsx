import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { WorkbenchShell } from "@/components/workbench/WorkbenchShell";
import type { WorkbenchMode } from "@/components/workbench/workbench-state";
import { getWorkbenchPayload } from "@/lib/workbench-data";
import { refreshWorkbenchPayload } from "../actions";
import styles from "../WorkbenchPage.module.css";

export const metadata: Metadata = {
  title: "Workbench - issuectl",
};
export const dynamic = "force-dynamic";

const WORKBENCH_SUBPATHS = new Set([
  "issues",
  "board",
  "prs",
  "quick-create",
  "settings",
]);

type Props = {
  params: Promise<{ mode: string }>;
};

export default async function WorkbenchSubpathPage({ params }: Props) {
  const { mode } = await params;
  if (!WORKBENCH_SUBPATHS.has(mode)) {
    notFound();
  }

  return (
    <div className={styles.page}>
      <WorkbenchShell
        initialPayload={await getWorkbenchPayload()}
        onRefreshPayload={refreshWorkbenchPayload}
        initialMode={modeToWorkbenchMode(mode)}
      />
    </div>
  );
}

function modeToWorkbenchMode(mode: string): WorkbenchMode {
  switch (mode) {
    case "issues":
      return "globalIssues";
    case "board":
      return "board";
    case "prs":
      return "pullRequests";
    case "quick-create":
      return "quickCreate";
    case "settings":
      return "settings";
    default:
      return "workbench";
  }
}
