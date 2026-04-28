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

export function useFocusContext(): FocusContextValue | null {
  return useContext(FocusContext);
}
