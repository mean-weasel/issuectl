import type { ReactNode } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";

type Props = {
  owner: string;
  repo: string;
  actions?: ReactNode;
};

export function RepoHeader({ owner, repo, actions }: Props) {
  return (
    <PageHeader
      title={repo}
      breadcrumb={
        <>
          <Link href="/">Dashboard</Link>
          <span>/</span>
          <span>
            {owner}/{repo}
          </span>
        </>
      }
      actions={actions}
    />
  );
}
