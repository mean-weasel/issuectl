import type { Metadata } from "next";
import { generateApiToken, getDb } from "@issuectl/core";
import { WorkbenchShell } from "@/components/workbench/WorkbenchShell";
import { getWorkbenchPayload } from "@/lib/workbench-data";
import { refreshWorkbenchPayload } from "./actions";
import styles from "./WorkbenchPage.module.css";

export const metadata: Metadata = {
  title: "Workbench - issuectl",
};
export const dynamic = "force-dynamic";

export default async function WorkbenchPage() {
  const apiToken = generateApiToken(getDb());

  return (
    <div className={styles.page}>
      <WorkbenchShell
        initialPayload={await getWorkbenchPayload()}
        onRefreshPayload={refreshWorkbenchPayload}
        initialMode="workbench"
        apiToken={apiToken}
      />
    </div>
  );
}
