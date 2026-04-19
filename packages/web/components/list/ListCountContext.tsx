"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import type { Section } from "@issuectl/core";

type Counts = {
  sectionCounts: Record<Section, number>;
  totalIssueCount: number;
  prCount: number;
};

type CountContextValue = {
  counts: Counts | null;
  setCounts: (c: Counts) => void;
};

const ListCountContext = createContext<CountContextValue | null>(null);

export function ListCountProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<Counts | null>(null);
  return (
    <ListCountContext.Provider value={{ counts, setCounts }}>
      {children}
    </ListCountContext.Provider>
  );
}

export function useListCounts(): Counts | null {
  const ctx = useContext(ListCountContext);
  return ctx?.counts ?? null;
}

export function ListCountUpdater({
  sectionCounts,
  totalIssueCount,
  prCount,
  children,
}: Counts & { children: ReactNode }) {
  const ctx = useContext(ListCountContext);
  const setCounts = ctx?.setCounts;
  const { unassigned, in_focus, in_flight, shipped } = sectionCounts;
  useEffect(() => {
    setCounts?.({
      sectionCounts: { unassigned, in_focus, in_flight, shipped },
      totalIssueCount,
      prCount,
    });
  }, [setCounts, unassigned, in_focus, in_flight, shipped, totalIssueCount, prCount]);
  return <>{children}</>;
}
