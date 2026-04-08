"use client";

import { createContext, useContext, useCallback, useRef, useState, type ReactNode } from "react";
import { Toast, type ToastType, type ToastData } from "./Toast";

type ToastContextValue = {
  showToast: (message: string, type: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null);
  const nextIdRef = useRef(0);

  const showToast = useCallback((message: string, type: ToastType) => {
    setToast({ message, type, id: ++nextIdRef.current });
  }, []);

  const dismiss = useCallback(() => setToast(null), []);

  return (
    <ToastContext value={{ showToast }}>
      {children}
      {toast && <Toast toast={toast} onDismiss={dismiss} />}
    </ToastContext>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
