"use client";

import { ErrorState } from "@/components/ui/ErrorState";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: Props) {
  return <ErrorState error={error} reset={reset} />;
}
