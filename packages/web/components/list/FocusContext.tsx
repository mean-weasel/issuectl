"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type FocusContextValue = {
  focusedIndex: number;
  setFocusedIndex: (index: number) => void;
};

const FocusContext = createContext<FocusContextValue | null>(null);

export function FocusProvider({ children }: { children: ReactNode }) {
  const [focusedIndex, setFocusedIndex] = useState(-1);
  return (
    <FocusContext.Provider value={{ focusedIndex, setFocusedIndex }}>
      {children}
    </FocusContext.Provider>
  );
}

export function useFocusContext(): FocusContextValue {
  const ctx = useContext(FocusContext);
  if (!ctx) {
    throw new Error("useFocusContext must be used within a FocusProvider");
  }
  return ctx;
}
