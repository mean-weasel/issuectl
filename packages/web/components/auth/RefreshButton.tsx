"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function RefreshButton() {
  const router = useRouter();
  return (
    <Button variant="secondary" onClick={() => router.refresh()}>
      Try again
    </Button>
  );
}
