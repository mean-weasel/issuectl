import type { CSSProperties } from "react";

export const panelStyle = {
  display: "grid",
  gap: "16px",
  maxWidth: "980px",
} satisfies CSSProperties;

export const rowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  flexWrap: "wrap",
} satisfies CSSProperties;

export const cardStyle = {
  display: "grid",
  gap: "12px",
  padding: "14px",
  border: "1px solid var(--paper-line)",
  borderRadius: "var(--paper-radius-md)",
  background: "rgba(255, 255, 255, 0.22)",
} satisfies CSSProperties;

export const fieldStyle = {
  display: "grid",
  gap: "7px",
  color: "var(--paper-ink-muted)",
  font: "700 10px var(--paper-mono)",
  textTransform: "uppercase",
} satisfies CSSProperties;

export const textareaStyle = {
  minHeight: "82px",
  padding: "8px 10px",
  border: "1px solid var(--paper-line)",
  borderRadius: "var(--paper-radius-sm)",
  background: "rgba(255, 255, 255, 0.28)",
  color: "var(--paper-ink)",
  font: "14px var(--paper-serif)",
  textTransform: "none",
  resize: "vertical",
} satisfies CSSProperties;
