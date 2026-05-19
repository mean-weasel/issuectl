import { vi } from "vitest";

export async function withConsoleErrorSilenced<T>(fn: () => Promise<T>): Promise<T> {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    return await fn();
  } finally {
    spy.mockRestore();
  }
}

export async function withConsoleWarnSilenced<T>(fn: () => Promise<T>): Promise<T> {
  const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    return await fn();
  } finally {
    spy.mockRestore();
  }
}
