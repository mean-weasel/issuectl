import styles from "./LabelChip.module.css";

type Props = {
  name: string;
  /** Hex color from GitHub (without leading #). */
  color: string;
};

/**
 * Determines whether to use dark or light text on a colored background
 * using the W3C relative luminance formula. Returns true when the
 * background is light enough to need dark text.
 */
function needsDarkText(hex: string): boolean {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  // sRGB → linear
  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

  const luminance =
    0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

  // Threshold chosen so that e.g. GitHub's yellow (#fbca04) gets dark
  // text while darker colors like #0e8a16 get white.
  return luminance > 0.179;
}

export function LabelChip({ name, color }: Props) {
  const hex = color.replace(/^#/, "");
  const bg = `#${hex}`;
  const textColor = needsDarkText(hex) ? "#1a1712" : "#fff";

  return (
    <span
      className={styles.label}
      style={{ backgroundColor: bg, color: textColor }}
    >
      {name}
    </span>
  );
}
