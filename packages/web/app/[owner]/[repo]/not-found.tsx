import { NotFoundState } from "@/components/ui/NotFoundState";

export default function RepoNotFound() {
  return (
    <NotFoundState
      title="Repository not found"
      message="This repository isn't tracked by issuectl, or it may have been removed."
      links={[
        { href: "/settings", label: "Check Settings" },
        { href: "/", label: "Back to Dashboard" },
      ]}
    />
  );
}
