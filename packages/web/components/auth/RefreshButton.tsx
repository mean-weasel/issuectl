"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/paper";

export function RefreshButton() {
  const router = useRouter();
  return (
    <Button variant="ghost" onClick={() => router.refresh()}>
      Try again
    </Button>
  );
}
