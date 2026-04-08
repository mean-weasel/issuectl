"use client";

import { ErrorState } from "@/components/ui/ErrorState";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function RepoErrorPage({ error, reset }: Props) {
  return <ErrorState error={error} reset={reset} />;
}
