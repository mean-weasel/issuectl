import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";

type Props = {
  owner: string;
  repo: string;
};

export function RepoHeader({ owner, repo }: Props) {
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
    />
  );
}
