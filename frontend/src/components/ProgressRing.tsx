interface ProgressRingProps {
  size: number;
  radius: number;
  strokeWidth: number;
  progress: number; // 0..1
  color: string;
  trackColor?: string;
  glow?: string;
  children?: React.ReactNode;
}

export function ProgressRing({
  size,
  radius,
  strokeWidth,
  progress,
  color,
  trackColor = "rgba(255,255,255,.07)",
  glow,
  children,
}: ProgressRingProps) {
  const clamped = Math.min(1, Math.max(0, progress));
  const center = size / 2;
  // SVG strokes are centred on their path. Keep the full stroke inside the
  // viewBox even when callers request a radius as large as size / 2.
  const safeRadius = Math.min(radius, Math.max(0, (size - strokeWidth) / 2));
  const circumference = 2 * Math.PI * safeRadius;
  const dashOffset = circumference * (1 - clamped);

  return (
    <div
      style={{ position: "relative", display: "grid", placeItems: "center", width: size, height: size, flex: "none" }}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped * 100)}
        style={{ width: size, height: size, transform: "rotate(-90deg)", overflow: "visible" }}
      >
        <circle cx={center} cy={center} r={safeRadius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        <circle
          className="fn-progress-ring"
          cx={center}
          cy={center}
          r={safeRadius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{
            filter: glow ? `drop-shadow(0 0 9px ${glow})` : undefined,
            "--ring-circumference": circumference,
            "--ring-offset": dashOffset,
          } as React.CSSProperties}
        />
      </svg>
      {children && (
        <div style={{ position: "absolute", textAlign: "center" }}>{children}</div>
      )}
    </div>
  );
}
