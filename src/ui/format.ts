/** Tiny display-formatting helpers shared across the UI. */

export const num = (n: number): string => Math.round(n).toLocaleString("en-US");

export const money = (n: number): string => `$${num(n)}`;

export const signed = (n: number): string => (n >= 0 ? `+${num(n)}` : num(n));

export const pct = (frac: number, digits = 0): string => `${(frac * 100).toFixed(digits)}%`;

/** Compact large numbers: 12,340 -> "12.3k", 4,500,000 -> "4.5M". */
export const compact = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(n / 1000).toFixed(0)}k`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return num(n);
};
