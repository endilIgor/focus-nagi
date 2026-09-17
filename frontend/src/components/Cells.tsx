interface CellsProps {
  pct: number; // 0..100
  count: number;
  color: string;
  highlightColor?: string;
  height?: number;
}

/** Segmented progress bar (a row of little blocks) used across Today/Goals/Projects/Analytics. */
export function Cells({ pct, count, color, highlightColor, height = 8 }: CellsProps) {
  const on = Math.round((Math.min(100, Math.max(0, pct)) / 100) * count);
  return (
    <div style={{ display: "flex", gap: 2, height }}>
      {Array.from({ length: count }, (_, i) => {
        const lit = i < on;
        const isTail = highlightColor && i > count - 3 && pct >= 100;
        return (
          <span
            key={i}
            style={{
              flex: 1,
              background: lit ? (isTail ? highlightColor : color) : "rgba(255,255,255,.07)",
            }}
          />
        );
      })}
    </div>
  );
}
