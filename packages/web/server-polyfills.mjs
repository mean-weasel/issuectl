import { AsyncLocalStorage } from "node:async_hooks";

if (!globalThis.AsyncLocalStorage) {
  Object.defineProperty(globalThis, "AsyncLocalStorage", {
    configurable: true,
    enumerable: false,
    value: AsyncLocalStorage,
    writable: true,
  });
}
